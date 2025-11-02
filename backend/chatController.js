const Chat = require("./Chat.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { v4: uuidv4 } = require('uuid'); // To generate unique filenames

// Initialize Google Generative AI client
if (!process.env.GOOGLE_API_KEY) {
  console.warn(
    "GOOGLE_API_KEY is not set. Generative AI calls will fail until you provide a valid key in your environment."
  );
}
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

/**
 * Converts a file buffer from multer into a format for Google's API.
 * @param {Buffer} buffer The file buffer.
 * @param {string} mimeType The MIME type of the file.
 * @returns {object} The part object for the generative AI API.
 */
function fileToGenerativePart(buffer, mimeType) {
  return { inlineData: { data: buffer.toString("base64"), mimeType } };
}

/**
 * POST /api/new-chat
 * Creates a new chat session for a user.
 */
async function createNewChat(req, res) {
  const userId = req.user.id;
  const { title } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: "User ID and title are required." });
  }

  try {
    const chat = await Chat.create({
      userId,
      title,
      messages: [],
    });
    res.status(201).json({ chatId: chat._id, title: chat.title });
  } catch (error) {
    console.error("Error creating new chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * POST /api/chat
 * Handles a new message in an existing chat session.
 */
async function handleChat(req, res) {
  const userId = req.user && req.user.id;
  const { chatId, userMessage = "" } = req.body;

  if (!userId) {
    console.warn("handleChat: missing req.user - user not authenticated");
    return res.status(401).json({ error: "User not authenticated" });
  }

  if (!chatId || (!userMessage.trim() && !req.file)) {
    return res
      .status(400)
      .json({ error: "Chat ID and user message are required." });
  }


  try {
    const chat = await Chat.findOne({ _id: chatId, userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const promptParts = [];
    let fileDataForDb = null;

    // Handle file upload
    if (req.file) {
      promptParts.push(fileToGenerativePart(req.file.buffer, req.file.mimetype));
      // For now, we are not saving the file to a permanent storage,
      // so we won't have a URL. This could be extended with S3, etc.
      fileDataForDb = {
        name: req.file.originalname,
        type: req.file.mimetype,
      };
    }

    if (userMessage.trim()) {
      promptParts.push({ text: userMessage });
    }

    // Save user message
    const userMessageDoc = chat.messages.create({
      role: "user",
      content: userMessage.trim() ? userMessage : null, // Set content to null if empty
      file: fileDataForDb
    });
    chat.messages.push(userMessageDoc);

    // --- MODIFICATION START: Correctly prepare chat history for Gemini ---
    const history = chat.messages
      .slice(0, -1) // Exclude the message we just added
      .map((msg) => {
        // The Gemini API requires that historical messages with files still have a text part,
        // even if it's empty. We also need to handle the role mapping correctly.
        const role = msg.role === "assistant" ? "model" : "user";

        // If a historical message had a file, we can't resend the buffer.
        // We represent it with its text content, which might be empty.
        // The 'sticky' model selection ensures we stay on the vision model.
        const parts = [{ text: msg.content || "" }];

        return {
          role: role,
          parts: parts,
        };
      })
      .filter(item => item.parts.some(part => part.text.trim() !== '' || (item.role === 'user' && chat.messages.some(m => m.file)))); // Keep history with text or if files were ever involved
    // --- MODIFICATION END ---

    // --- MODIFICATION START: Make model selection "sticky" for vision ---
    let modelName;
    if (req.file) {
      // Use specific models based on file type
      if (req.file.mimetype === 'application/pdf') {
        modelName = 'gemini-2.0-flash'; // As requested for PDFs
      } else {
        modelName = 'gemini-2.0-flash'; // For other files like images
      }
    } else {
      modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash'; // For text-only messages
    }
    const model = genAI.getGenerativeModel({ model: modelName });

    let aiReply;
    try {
      const chatSession = model.startChat({ history: history });
      const result = await chatSession.sendMessage(promptParts);

      aiReply =
        result?.response && typeof result.response.text === "function"
          ? result.response.text()
          : "";
    } catch (aiError) {
      console.error("Generative AI call failed:", aiError);
      aiReply =
        "Athena is currently unavailable (AI service error). Please try again later.";
    }

    // --- MODIFICATION START: Handle empty AI responses safely ---
    if (!aiReply || !aiReply.trim()) {
      aiReply = "I'm sorry, I was unable to generate a response. Please try rephrasing your message.";
    }
    // --- MODIFICATION END ---

    // Save AI reply
    const assistantMessageDoc = chat.messages.create({
      role: "assistant",
      content: aiReply,
    });
    chat.messages.push(assistantMessageDoc);
    chat.updatedAt = Date.now();
    await chat.save();

    res.json({
      userMessage: userMessageDoc,
      assistantMessage: assistantMessageDoc,
    });
  } catch (error) {
    console.error("Error handling chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/chat/:chatId/messages
 * Fetch all messages for a specific chat.
 */
async function getChatMessages(req, res) {
  const userId = req.user.id;
  const { chatId } = req.params;

  try {
    const chat = await Chat.findOne({ _id: chatId, userId });
    if (!chat) {
      return res
        .status(404)
        .json({ error: "Chat not found or you do not have permission." });
    }
    res.json({ messages: chat.messages });
  } catch (error) {
    console.error("Error fetching chat messages:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * GET /api/chats
 * Fetch all chat sessions for a user.
 */
async function listUserChats(req, res) {
  const userId = req.user.id;
  try {
    const chats = await Chat.find({ userId })
      .select("title updatedAt")
      .sort({ updatedAt: -1 });
    res.json(chats);
  } catch (error) {
    console.error("Error listing user chats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * PUT /api/chat/:chatId/rename
 * Rename a specific chat session.
 */
async function renameChat(req, res) {
  const userId = req.user.id;
  const { chatId } = req.params;
  const { newTitle } = req.body;

  if (!newTitle) {
    return res.status(400).json({ error: "New title is required." });
  }

  try {
    const chat = await Chat.findOneAndUpdate(
      { _id: chatId, userId },
      { title: newTitle, updatedAt: Date.now() },
      { new: true }
    );

    if (!chat) {
      return res
        .status(404)
        .json({ error: "Chat not found or you do not have permission." });
    }

    res.json({ message: "Chat renamed successfully.", chat });
  } catch (error) {
    console.error("Error renaming chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

/**
 * DELETE /api/chat/:chatId
 * Delete a specific chat session.
 */
async function deleteChat(req, res) {
  const userId = req.user.id;
  const { chatId } = req.params;

  try {
    const result = await Chat.deleteOne({ _id: chatId, userId });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ error: "Chat not found or you do not have permission." });
    }
    res.status(204).send();
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  createNewChat,
  handleChat,
  getChatMessages,
  listUserChats,
  renameChat,
  deleteChat,
  fileToGenerativePart,
};
