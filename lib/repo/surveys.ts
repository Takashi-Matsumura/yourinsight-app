import { db, newId, nowIso } from "@/lib/db";
import type { GeneratedQuestion, SeedQuestions, Survey, SurveyStatus, Topic } from "@/lib/types";

interface SurveyRow {
  id: string;
  title: string;
  purpose: string;
  audience: string;
  intro_text: string;
  max_per_topic: number;
  hard_cap: number;
  status: SurveyStatus;
  seed_questions: string | null;
  cta_text: string;
  created_at: string;
  updated_at: string;
}

interface TopicRow {
  id: string;
  survey_id: string;
  order_index: number;
  label: string;
  description: string;
  priority: number;
  fallback_question: string | null;
  target_solution_id: string | null;
}

function parseJson<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function rowToSurvey(r: SurveyRow): Survey {
  return { ...r, seed_questions: parseJson<SeedQuestions>(r.seed_questions) };
}

function rowToTopic(r: TopicRow): Topic {
  return { ...r, fallback_question: parseJson<GeneratedQuestion>(r.fallback_question) };
}

export function listSurveys(): Survey[] {
  const rows = db().prepare("SELECT * FROM surveys ORDER BY created_at DESC").all() as unknown as SurveyRow[];
  return rows.map(rowToSurvey);
}

export function getSurvey(id: string): Survey | null {
  const row = db().prepare("SELECT * FROM surveys WHERE id = ?").get(id) as SurveyRow | undefined;
  return row ? rowToSurvey(row) : null;
}

export interface SurveyInput {
  title: string;
  purpose: string;
  audience: string;
  intro_text: string;
  max_per_topic?: number;
  hard_cap?: number;
  cta_text?: string;
}

export function createSurvey(input: SurveyInput): Survey {
  const id = newId();
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO surveys (id, title, purpose, audience, intro_text, max_per_topic, hard_cap, status, seed_questions, cta_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?)`,
    )
    .run(
      id,
      input.title,
      input.purpose,
      input.audience,
      input.intro_text,
      input.max_per_topic ?? 3,
      input.hard_cap ?? 15,
      input.cta_text ?? "ブースのスタッフにお尋ねください",
      now,
      now,
    );
  return getSurvey(id)!;
}

export function updateSurvey(id: string, patch: Partial<SurveyInput>): void {
  const current = getSurvey(id);
  if (!current) return;
  const next = { ...current, ...patch };
  db()
    .prepare(
      `UPDATE surveys SET title = ?, purpose = ?, audience = ?, intro_text = ?, max_per_topic = ?, hard_cap = ?, cta_text = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      next.title,
      next.purpose,
      next.audience,
      next.intro_text,
      next.max_per_topic,
      next.hard_cap,
      next.cta_text,
      nowIso(),
      id,
    );
}

export function setSurveyStatus(id: string, status: SurveyStatus): void {
  db().prepare("UPDATE surveys SET status = ?, updated_at = ? WHERE id = ?").run(status, nowIso(), id);
}

export function setSeedQuestions(id: string, seed: SeedQuestions | null): void {
  db()
    .prepare("UPDATE surveys SET seed_questions = ?, updated_at = ? WHERE id = ?")
    .run(seed ? JSON.stringify(seed) : null, nowIso(), id);
}

export function deleteSurvey(id: string): void {
  db().prepare("DELETE FROM surveys WHERE id = ?").run(id);
}

export function listTopics(surveyId: string): Topic[] {
  const rows = db()
    .prepare("SELECT * FROM survey_topics WHERE survey_id = ? ORDER BY order_index")
    .all(surveyId) as unknown as TopicRow[];
  return rows.map(rowToTopic);
}

export interface TopicInput {
  id?: string;
  label: string;
  description: string;
  priority: number;
  fallback_question: GeneratedQuestion | null;
  target_solution_id?: string | null;
}

export function replaceTopics(surveyId: string, topics: TopicInput[]): Topic[] {
  const d = db();
  const keepIds = topics.map((t) => t.id).filter((x): x is string => Boolean(x));
  d.exec("BEGIN");
  try {
    if (keepIds.length === 0) {
      d.prepare("DELETE FROM survey_topics WHERE survey_id = ?").run(surveyId);
    } else {
      const placeholders = keepIds.map(() => "?").join(",");
      d.prepare(`DELETE FROM survey_topics WHERE survey_id = ? AND id NOT IN (${placeholders})`).run(
        surveyId,
        ...keepIds,
      );
    }
    const upsert = d.prepare(
      `INSERT INTO survey_topics (id, survey_id, order_index, label, description, priority, fallback_question, target_solution_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET order_index = excluded.order_index, label = excluded.label,
         description = excluded.description, priority = excluded.priority, fallback_question = excluded.fallback_question,
         target_solution_id = excluded.target_solution_id`,
    );
    topics.forEach((t, i) => {
      upsert.run(
        t.id ?? newId(),
        surveyId,
        i,
        t.label,
        t.description,
        t.priority,
        t.fallback_question ? JSON.stringify(t.fallback_question) : null,
        t.target_solution_id ?? null,
      );
    });
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return listTopics(surveyId);
}

export function countSessions(surveyId: string): { total: number; completed: number } {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM sessions WHERE survey_id = ?`,
    )
    .get(surveyId) as { total: number; completed: number | null };
  return { total: row.total, completed: row.completed ?? 0 };
}
