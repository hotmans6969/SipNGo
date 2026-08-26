import type { Client, InArgs, Transaction } from "@libsql/core/api";

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

let clientPromise: Promise<Client> | undefined;

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  // DATABASE_PATH keeps local setups and the test suite working without
  // anyone needing to know about URLs.
  return `file:${process.env.DATABASE_PATH || "sipngo.db"}`;
}

/**
 * Builds the client, choosing an implementation from the URL scheme.
 *
 * This split matters on serverless hosts. The package's default entry point
 * depends on `libsql`, a native module, purely so that it can open local
 * files. Bundled into a Vercel function that native dependency fails at
 * runtime and every query 500s. `@libsql/client/web` is pure HTTP with no
 * native code, so remote connections import that instead, and the node build
 * is loaded lazily — only when a `file:` URL is actually in use, which never
 * happens in production.
 */
async function createClientForUrl(url: string): Promise<Client> {
  const authToken = process.env.DATABASE_AUTH_TOKEN;
  const isRemote = /^(libsql|wss?|https?):/.test(url);

  if (isRemote) {
    if (!authToken) {
      throw new Error(
        "DATABASE_AUTH_TOKEN is required when DATABASE_URL points at a remote database."
      );
    }
    const { createClient } = await import("@libsql/client/web");
    return createClient({ url, authToken });
  }

  const { createClient } = await import("@libsql/client/node");
  return createClient({ url, ...(authToken ? { authToken } : {}) });
}

/** The underlying client, created once per process. */
export function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = createClientForUrl(databaseUrl()).catch((error) => {
      // A failed connection must not be cached, or a transient startup problem
      // poisons every later request.
      clientPromise = undefined;
      throw error;
    });
  }
  return clientPromise;
}

/** Query helpers bound to the shared connection. */
export const sql: Queryable = {
  async one(statement, args) {
    return wrap(await getClient()).one(statement, args);
  },
  async all(statement, args) {
    return wrap(await getClient()).all(statement, args);
  },
  async run(statement, args) {
    return wrap(await getClient()).run(statement, args);
  },
};

/** Runs several statements in one call. Used for schema DDL. */
export async function executeMultiple(statements: string): Promise<void> {
  const client = await getClient();
  await client.executeMultiple(statements);
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
  const client = await getClient();
  const tx = await client.transaction("write");
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

/** Describes the configured connection without revealing the credentials. */
export function describeConnection(): { mode: "remote" | "local"; host: string | null } {
  const url = databaseUrl();
  if (/^(libsql|wss?|https?):/.test(url)) {
    let host: string | null = null;
    try {
      host = new URL(url.replace(/^libsql:/, "https:")).host;
    } catch {
      host = null;
    }
    return { mode: "remote", host };
  }
  return { mode: "local", host: null };
}

/** Closes the connection. Used by tests; a server keeps it open. */
export async function closeClient(): Promise<void> {
  const pending = clientPromise;
  clientPromise = undefined;
  if (pending) {
    try {
      (await pending).close();
    } catch {
      // Nothing useful to do if it was already closed.
    }
  }
}
