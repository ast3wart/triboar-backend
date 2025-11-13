import 'dotenv/config.js';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cron from 'node-cron';
import { initDB } from './db/connection.js';
import logger from './utils/logger.js';
import { errorHandler, asyncHandler } from './api/middleware/errorHandler.js';
import * as syncService from './services/syncService.js';

// Validate BACKEND_API_TOKEN is set on startup
const BACKEND_API_TOKEN = process.env.BACKEND_API_TOKEN;
if (!BACKEND_API_TOKEN) {
  const errorMsg = 'CRITICAL: BACKEND_API_TOKEN environment variable is required but not set. Application cannot start without it.';
  logger.error(errorMsg);
  console.error(errorMsg);
  process.exit(1);
}

if (BACKEND_API_TOKEN.length < 32) {
  const errorMsg = 'CRITICAL: BACKEND_API_TOKEN must be at least 32 characters long. Current length: ' + BACKEND_API_TOKEN.length;
  logger.error(errorMsg);
  console.error(errorMsg);
  process.exit(1);
}

// Routes
import authRoutes from './api/routes/auth.js';
import checkoutRoutes from './api/routes/checkout.js';
import webhookRoutes from './api/routes/webhooks.js';
import adminRoutes from './api/routes/admin.js';
import listsRoutes from './api/routes/lists.js';

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Middleware =====

// Security
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}));

// Logging
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()),
  },
}));

// ===== Routes =====

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Stripe webhooks must be registered BEFORE json() middleware to receive raw body for signature verification
app.use('/webhooks', webhookRoutes);

// Body parsing (for all other routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/lists', listsRoutes);

// ===== Error Handling =====

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

// Global error handler
app.use(errorHandler);

// ===== Server Startup =====

const startServer = async () => {
  try {
    // Initialize database
    await initDB();
    logger.info('Database initialized');

    // Schedule daily sync at 11:59 PM (23:59)
    cron.schedule('59 23 * * *', () => {
      logger.info('Running scheduled daily sync');
      syncService.performDailySync().catch(err => {
        logger.error({ err }, 'Scheduled daily sync failed');
      });
    });
    logger.info('Daily sync scheduled for 11:59 PM');

    // Start server
    app.listen(PORT, () => {
      logger.info({ port: PORT }, 'Server started');
      console.log(`\n✓ Server running at http://localhost:${PORT}`);
      console.log(`✓ Health check: GET http://localhost:${PORT}/health`);
      console.log(`✓ Discord OAuth: GET http://localhost:${PORT}/api/auth/discord`);
      console.log(`✓ Daily sync scheduled for 11:59 PM`);
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server only if not in test mode
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;
