import pg from 'pg';
import logger from '../utils/logger.js';

const { Pool } = pg;

let pool;

export const initDB = async () => {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected error on idle client');
    });

    // Test connection
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();

    logger.info('Database connection established');
    return pool;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to database');
    throw err;
  }
};

export const getPool = () => {
  if (!pool) {
    throw new Error('Database not initialized. Call initDB first.');
  }
  return pool;
};

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await getPool().query(text, params);
    const duration = Date.now() - start;
    if (duration > 1000) {
      logger.warn({ duration, query: text }, 'Slow query detected');
    }
    return result;
  } catch (err) {
    logger.error({ err, query: text, params }, 'Database query failed');
    throw err;
  }
};

export const closeDB = async () => {
  if (pool) {
    await pool.end();
    logger.info('Database connection closed');
  }
};
