import { db, newId, nowIso } from "@/lib/db";
import type { GeneratedQuestion, SeedQuestions, Survey, SurveyStatus, SurveyViewpoint, Topic } from "@/lib/types";

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
  viewpoint: SurveyViewpoint;
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

export async function listSurveys(): Promise<Survey[]> {
  const { results } = await db()
    .prepare("SELECT * FROM surveys ORDER BY created_at DESC")
    .all<SurveyRow>();
  return results.map(rowToSurvey);
}

export async function getSurvey(id: string): Promise<Survey | null> {
  const row = await db().prepare("SELECT * FROM surveys WHERE id = ?").bind(id).first<SurveyRow>();
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
  viewpoint?: SurveyViewpoint;
}

export async function createSurvey(input: SurveyInput): Promise<Survey> {
  const id = newId();
  const now = nowIso();
  await db()
    .prepare(
      `INSERT INTO surveys (id, title, purpose, audience, intro_text, max_per_topic, hard_cap, status, seed_questions, cta_text, viewpoint, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.title,
      input.purpose,
      input.audience,
      input.intro_text,
      input.max_per_topic ?? 3,
      input.hard_cap ?? 15,
      input.cta_text ?? "ブースのスタッフにお尋ねください",
      input.viewpoint ?? "individual",
      now,
      now,
    )
    .run();
  return (await getSurvey(id))!;
}

export async function updateSurvey(id: string, patch: Partial<SurveyInput>): Promise<void> {
  const current = await getSurvey(id);
  if (!current) return;
  const next = { ...current, ...patch };
  await db()
    .prepare(
      `UPDATE surveys SET title = ?, purpose = ?, audience = ?, intro_text = ?, max_per_topic = ?, hard_cap = ?, cta_text = ?, viewpoint = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(
      next.title,
      next.purpose,
      next.audience,
      next.intro_text,
      next.max_per_topic,
      next.hard_cap,
      next.cta_text,
      next.viewpoint,
      nowIso(),
      id,
    )
    .run();
}

export async function setSurveyStatus(id: string, status: SurveyStatus): Promise<void> {
  await db()
    .prepare("UPDATE surveys SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, nowIso(), id)
    .run();
}

export async function setSeedQuestions(id: string, seed: SeedQuestions | null): Promise<void> {
  await db()
    .prepare("UPDATE surveys SET seed_questions = ?, updated_at = ? WHERE id = ?")
    .bind(seed ? JSON.stringify(seed) : null, nowIso(), id)
    .run();
}

export async function deleteSurvey(id: string): Promise<void> {
  await db().prepare("DELETE FROM surveys WHERE id = ?").bind(id).run();
}

export async function listTopics(surveyId: string): Promise<Topic[]> {
  const { results } = await db()
    .prepare("SELECT * FROM survey_topics WHERE survey_id = ? ORDER BY order_index")
    .bind(surveyId)
    .all<TopicRow>();
  return results.map(rowToTopic);
}

export interface TopicInput {
  id?: string;
  label: string;
  description: string;
  priority: number;
  fallback_question: GeneratedQuestion | null;
  target_solution_id?: string | null;
}

export async function replaceTopics(surveyId: string, topics: TopicInput[]): Promise<Topic[]> {
  const d = db();
  const keepIds = topics.map((t) => t.id).filter((x): x is string => Boolean(x));

  const deleteStmt =
    keepIds.length === 0
      ? d.prepare("DELETE FROM survey_topics WHERE survey_id = ?").bind(surveyId)
      : d
          .prepare(
            `DELETE FROM survey_topics WHERE survey_id = ? AND id NOT IN (${keepIds.map(() => "?").join(",")})`,
          )
          .bind(surveyId, ...keepIds);

  const upsertSql = `INSERT INTO survey_topics (id, survey_id, order_index, label, description, priority, fallback_question, target_solution_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET order_index = excluded.order_index, label = excluded.label,
       description = excluded.description, priority = excluded.priority, fallback_question = excluded.fallback_question,
       target_solution_id = excluded.target_solution_id`;

  const upsertStmts = topics.map((t, i) =>
    d
      .prepare(upsertSql)
      .bind(
        t.id ?? newId(),
        surveyId,
        i,
        t.label,
        t.description,
        t.priority,
        t.fallback_question ? JSON.stringify(t.fallback_question) : null,
        t.target_solution_id ?? null,
      ),
  );

  await d.batch([deleteStmt, ...upsertStmts]);
  return listTopics(surveyId);
}

export async function countSessions(
  surveyId: string,
): Promise<{ total: number; completed: number }> {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
       FROM sessions WHERE survey_id = ?`,
    )
    .bind(surveyId)
    .first<{ total: number; completed: number | null }>();
  return { total: row!.total, completed: row!.completed ?? 0 };
}
