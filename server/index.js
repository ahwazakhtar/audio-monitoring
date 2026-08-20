'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { ensureSheetSetup } = require('./services/googleSheets');
const { listInstruments } = require('./config/instruments');
const { getAllObservations } = require('./services/csvLoader');

const authRouter = require('./routes/auth');
const observationsRouter = require('./routes/observations');
const audioRouter = require('./routes/audio');
const reviewsRouter = require('./routes/reviews');
const analyticsRouter = require('./routes/analytics');
const instrumentsRouter = require('./routes/instruments');

const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  /^https:\/\/.*\.vercel\.app$/,
  // Any extra origin configured via env (e.g. custom domain)
  ...(process.env.ALLOWED_ORIGIN ? [process.env.ALLOWED_ORIGIN] : []),
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman, mobile apps)
      if (!origin) return callback(null, true);

      const isAllowed = allowedOrigins.some((allowed) => {
        if (typeof allowed === 'string') return allowed === origin;
        if (allowed instanceof RegExp) return allowed.test(origin);
        return false;
      });

      if (isAllowed) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${origin}`));
      }
    },
    credentials: true,
  })
);

// ---------------------------------------------------------------------------
// Body parsing
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
app.use('/api/auth', authRouter);
app.use('/api/observations', observationsRouter);
app.use('/api/audio', audioRouter);

// reviews.js handles: GET /api/session, POST|DELETE /api/claim/:id,
//                     POST /api/reviews, GET /api/reviews/mine
app.use('/api', reviewsRouter);

app.use('/api/analytics', analyticsRouter);
app.use('/api/instruments', instrumentsRouter);

// ---------------------------------------------------------------------------
// 404 catch-all
// ---------------------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------
async function start() {
  try {
    console.log('Initializing Google Sheets tabs...');
    await ensureSheetSetup();
    console.log('Google Sheets setup complete.');
  } catch (err) {
    console.error('WARNING: Google Sheets setup failed:', err.message);
    console.error('The server will start anyway — sheet operations may fail at runtime.');
  }

  // Sync each instrument's master data file from Drive before serving
  // requests, so the first Dashboard load doesn't stall on a cold download.
  // A per-instrument failure here doesn't block the others or the server —
  // csvLoader falls back to whatever's already on disk, or an empty list.
  for (const { key, label } of listInstruments()) {
    try {
      const observations = await getAllObservations(key);
      console.log(`Synced "${label}" data from Drive: ${observations.length} observations.`);
    } catch (err) {
      console.error(`WARNING: failed to load "${label}" data:`, err.message);
    }
  }

  app.listen(PORT, () => {
    console.log(`Audio monitoring server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}

start();
