import { db, newId, nowIso } from "@/lib/db";
import type { Analysis } from "@/lib/types";

export interface StoredAnalysis {
  id: string;
  survey_id: string;
  content: Analysis;
  session_count: number;
  created_at: string;
}

export async function latestAnalysis(surveyId: string): Promise<StoredAnalysis | null> {
  const row = await db()
    .prepare("SELECT * FROM analyses WHERE survey_id = ? ORDER BY created_at DESC LIMIT 1")
    .bind(surveyId)
    .first<{ id: string; survey_id: string; content: string; session_count: number; created_at: string }>();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.content) as Partial<Analysis>;
    const content: Analysis = {
      summary: parsed.summary ?? "",
      issues: parsed.issues ?? [],
      confirmed_insights: parsed.confirmed_insights ?? [],
      unaddressed_needs: parsed.unaddressed_needs ?? [],
    };
    return { ...row, content };
  } catch {
    return null;
  }
}

export async function saveAnalysis(
  surveyId: string,
  content: Analysis,
  sessionCount: number,
): Promise<StoredAnalysis> {
  const id = newId();
  await db()
    .prepare("INSERT INTO analyses (id, survey_id, content, session_count, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, surveyId, JSON.stringify(content), sessionCount, nowIso())
    .run();
  return (await latestAnalysis(surveyId))!;
}
