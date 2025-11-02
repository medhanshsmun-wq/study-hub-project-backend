const { GoogleGenerativeAI } = require('@google/generative-ai');

// Make sure you have GOOGLE_API_KEY in your .env file
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

module.exports = app => {
  app.post('/api/athena/chat', async (req, res) => {
    // Optional: Check if the user is logged in
    if (!req.user) {
      return res.status(401).send({ error: 'You must be logged in to chat with Athena.' });
    }

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const prompt = req.body.prompt;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      res.send({ text });
    } catch (error) {
      console.error('Error with Gemini API:', error);
      res.status(500).send({ error: 'Failed to get response from Athena.' });
    }
  });
};