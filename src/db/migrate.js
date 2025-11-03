import 'dotenv/config.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getPool, initDB, closeDB } from './connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const getMigrationFiles = () => {
  const migrationsDir = path.join(__dirname, 'migrations');
  return fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
};

const getMigrationTable = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const getExecutedMigrations = async (pool) => {
  const result = await pool.query('SELECT name FROM migrations ORDER BY name');
  return result.rows.map(r => r.name);
};

const runMigrations = async () => {
  const pool = await initDB();

  try {
    await getMigrationTable(pool);
    const executedMigrations = await getExecutedMigrations(pool);
    const allMigrations = getMigrationFiles();

    const pendingMigrations = allMigrations.filter(
      m => !executedMigrations.includes(m)
    );

    if (pendingMigrations.length === 0) {
      console.log('✓ All migrations are up to date');
      return;
    }

    for (const migration of pendingMigrations) {
      const migrationPath = path.join(__dirname, 'migrations', migration);
      const sql = fs.readFileSync(migrationPath, 'utf8');

      console.log(`Running migration: ${migration}`);

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration]
        );
        await client.query('COMMIT');
        console.log(`✓ Completed: ${migration}`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`✗ Failed: ${migration}`, err.message);
        throw err;
      } finally {
        client.release();
      }
    }

    console.log('✓ All migrations completed successfully');
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    await closeDB();
  }
};

runMigrations();
