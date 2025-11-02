require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const MongoStore = require('connect-mongo');
const session = require('express-session');
const cors = require("cors"); // Make sure cors is required
const passport = require('passport');


// --- Refactored Data Loading ---
let studyData;
try {
    const dataModule = require('./data.js'); // Updated path
    studyData = dataModule.studyData;
} catch (error) {
    console.error('Failed to load data.js:', error.message);
    console.error('Please ensure data.js exists in the project root and exports studyData correctly.');
    process.exit(1); // Exit the process if data.js cannot be loaded
}

require(path.join(__dirname, 'User.js'));
require(path.join(__dirname, 'passport.js'));

const app = express();
const PORT = process.env.PORT || 3000;

// --- CORS Configuration for Production ---
// This MUST be configured before your session and routes.
const allowedOrigins = [ // Filter out any falsy values like undefined
  process.env.FRONTEND_URL, // your Vercel site
  "http://localhost:3000"   // for local testing
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error(`❌ CORS error: Origin '${origin}' not allowed.`);
      callback(new Error(`Origin '${origin}' not allowed by CORS`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE"], // Added methods from the other config
  credentials: true,
}));

// Middleware
// Trust the first proxy in front of the app (e.g., on Render, Vercel).
// This is required for secure cookies to work correctly.
app.set('trust proxy', 1);

app.use(express.json());
app.use(
    session({
        secret: process.env.COOKIE_KEY,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ 
            mongoUrl: process.env.MONGO_URI 
        }),
        cookie: {
            // Do not set the domain attribute. When omitted, browsers default to the host of the URL,
            // which is correct. The cookie will be sent on cross-site requests because of SameSite=None.
            // domain: process.env.NODE_ENV === 'production' ? '.vercel.app' : undefined,
            secure: process.env.NODE_ENV === 'production', 
            httpOnly: true, // Prevent client-side JS from accessing the cookie
            // sameSite must be 'none' for cross-site cookie requests.
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', 
            maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
        }
    })
);
app.use(passport.initialize());
app.use(passport.session());


// --- API Router Setup ---
const apiRouter = express.Router();

// Register auth routes on the apiRouter first
const authRouter = require(path.join(__dirname, 'authRoutes.js'));
apiRouter.use(authRouter);

// Register chat routes on the apiRouter
const chatRouter = require(path.join(__dirname, 'chatRoutes.js'));
apiRouter.use(chatRouter); // chatRouter paths are relative to the mount point

apiRouter.get('/data', (req, res) => {
    res.json(studyData);
});

// Health endpoint: reports whether Gemini API key and model are configured.
// This endpoint does NOT call the external API and is safe to use for configuration checks.
apiRouter.get('/health', (req, res) => {
    res.json({
        ok: true,
        geminiKeyPresent: !!process.env.GOOGLE_API_KEY,
        geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        mongoConnected: mongoose.connection.readyState === 1
    });
});

// Mount the consolidated API router
app.use('/api', apiRouter);

// --- Final Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB connected...');
        app.listen(PORT, () => {
            console.log(`🚀 Server is running on http://localhost:${PORT}`);
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);

        
    });