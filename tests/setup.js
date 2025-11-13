import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from '../src/db/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load test env vars BEFORE anything else
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

// Set test environment
process.env.NODE_ENV = 'test';

// Initialize database for tests
beforeAll(async () => {
  try {
    await initDB();
  } catch (err) {
    console.error('Failed to initialize test database:', err);
    throw err;
  }
});
