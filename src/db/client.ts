import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

function create(pool: Pool) {
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof create>;

const globalForDb = globalThis as unknown as { __retpapDb?: { db: Db; pool: Pool } };

/**
 * Lazily builds the pool so importing this module never requires env vars,
 * and caches it on globalThis so Next.js dev reloads do not leak connections.
 */
export function getDb(): { db: Db; pool: Pool } {
  if (globalForDb.__retpapDb) return globalForDb.__retpapDb;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const pool = new Pool({ connectionString, max: 10 });
  const db = create(pool);
  globalForDb.__retpapDb = { db, pool };
  return globalForDb.__retpapDb;
}
