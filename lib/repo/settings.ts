import { db } from "@/lib/db";
import type { LlmSettings } from "@/lib/types";

export const DEFAULT_LLM_SETTINGS: LlmSettings = {
  baseUrl: "http://localhost:8080",
  model: "gemma-4-12b-it-Q4_K_M.gguf",
  temperature: 0.7,
  maxConcurrency: 1,
};

const KEY = "llm";

export function getLlmSettings(): LlmSettings {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(KEY) as
    | { value: string }
    | undefined;
  if (!row) return { ...DEFAULT_LLM_SETTINGS };
  try {
    return { ...DEFAULT_LLM_SETTINGS, ...(JSON.parse(row.value) as Partial<LlmSettings>) };
  } catch {
    return { ...DEFAULT_LLM_SETTINGS };
  }
}

export function saveLlmSettings(settings: LlmSettings): void {
  db()
    .prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .run(KEY, JSON.stringify(settings));
}
