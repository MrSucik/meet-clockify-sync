import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

/**
 * Gets the database connection
 * Creates a new connection if one doesn't exist
 */
export function getDb() {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set');
    }

    pool = new Pool({ connectionString });
    db = drizzle(pool, { schema });

    console.log('✅ Database connection established');
  }

  return db;
}

/**
 * Closes the database connection
 */
export async function closeDb() {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
    console.log('✅ Database connection closed');
  }
}
