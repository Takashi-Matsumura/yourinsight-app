// Secrets set via `wrangler secret put` — not declared in wrangler.jsonc,
// so `wrangler types` doesn't know about them. Declared here instead of
// editing the generated worker-configuration.d.ts (which gets overwritten).
declare namespace Cloudflare {
  interface Env {
    CF_ACCESS_CLIENT_ID?: string;
    CF_ACCESS_CLIENT_SECRET?: string;
  }
}
