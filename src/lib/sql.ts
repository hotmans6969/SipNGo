import { createClient, type Client, type InArgs, type Transaction } from "@libsql/client";

/**
 * Thin query layer over libSQL.
 *
 * The app previously used better-sqlite3, whose API is synchronous and reads a
 * file off local disk. That works on a server with a persistent volume, but
 * rules out every serverless host. libSQL speaks the same SQL dialect over the
 * network, so the queries themselves are unchanged — only the calling
 * convention had to become async.
 *
 * Everything goes through `one` / `all` / `run` rather than the raw client, so
 * result-shape handling lives in one place and a future driver change touches
 * this file rather than sixty call sites.
 */

export type Args = InArgs;

export interface Queryable {
  /** First matching row, or null. */
  one<T>(sql: string, args?: Args): Promise<T | null>;
  /** All matching rows. */
  all<T>(sql: string, args?: Args): Promise<T[]>;
  /** Executes a statement and returns how many rows it changed. */
  run(sql: string, args?: Args): Promise<number>;
}

/** libSQL returns row objects that are also array-like; callers want the object. */
function toRow<T>(row: unknown): T {
  return row as T;
}

function wrap(executor: Client | Transaction): Queryable {
  return {
    async one<T>(sql: string, args: Args = []): Promise<T | null> {
      const result = await executor.execute({ sql, args });
      return result.rows.length ? toRow<T>(result.rows[0]) : null;
    },
    async all<T>(sql: string, args: Args = []): Promise<T[]> {
      const result = await executor.execute({ sql, args });
      return result.rows.map((r) => toRow<T>(r));
    },
    async run(sql: string, args: Args = []): Promise<number> {
      const result = await executor.execute({ sql, args });
      return result.rowsAffected;
    },
  };
}

let client: Client | undefined;

/**
 * The underlying client.
 *
 * DATABASE_URL points at Turso in production (libsql://…). Locally and in
 * tests it is a `file:` URL, so development needs no network and no account.
 */
export function getClient(): Client {
  if (!client) {
    const url = process.env.DATABASE_URL || defaultLocalUrl();
    const authToken = process.env.DATABASE_AUTH_TOKEN;

    if (url.startsWith("libsql://") && !authToken) {
      throw new Error(
        "DATABASE_AUTH_TOKEN is required when DATABASE_URL points at a remote database."
      );
    }

    client = createClient({ url, ...(authToken ? { authToken } : {}) });
  }
  return client;
}

function defaultLocalUrl(): string {
  // DATABASE_PATH is still honoured so existing local setups and the test
  // suite keep working without knowing about URLs.
  const path = process.env.DATABASE_PATH || "sipngo.db";
  return `file:${path}`;
}

/** Query helpers bound to the shared connection. */
export const sql: Queryable = {
  one: (statement, args) => wrap(getClient()).one(statement, args),
  all: (statement, args) => wrap(getClient()).all(statement, args),
  run: (statement, args) => wrap(getClient()).run(statement, args),
};

/** Runs several statements in one call. Used for schema DDL. */
export async function executeMultiple(statements: string): Promise<void> {
  await getClient().executeMultiple(statements);
}

/**
 * Runs `fn` inside a write transaction, committing on success and rolling back
 * on any thrown error.
 *
 * Order creation and every points change depend on this: allocating the day's
 * order number and inserting its lines have to happen together, or two
 * simultaneous checkouts can be handed the same number.
 */
export async function transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
  const tx = await getClient().transaction("write");
  try {
    const result = await fn(wrap(tx));
    await tx.commit();
    return result;
  } catch (error) {
    try {
      await tx.rollback();
    } catch {
      // The transaction may already be closed; the original error is what matters.
    }
    throw error;
  }
}

/** Closes the connection. Used by tests; a server keeps it open. */
export function closeClient(): void {
  client?.close();
  client = undefined;
}
