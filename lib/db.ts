import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, migrate } from "./schema";

const g = globalThis as unknown as { __yourinsightDb?: DatabaseSync };

export function db(): DatabaseSync {
  if (!g.__yourinsightDb) {
    const file =
      process.env.DB_PATH ?? path.join(process.cwd(), ".data", "yourinsight.db");
    mkdirSync(path.dirname(file), { recursive: true });
    const d = new DatabaseSync(file);
    d.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;");
    d.exec(SCHEMA_SQL);
    migrate(d);
    g.__yourinsightDb = d;
  }
  return g.__yourinsightDb;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
