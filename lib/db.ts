import { env } from "cloudflare:workers";

export function db(): D1Database {
  return env.DB;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
