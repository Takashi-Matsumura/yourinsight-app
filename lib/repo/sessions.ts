import { db, newId, nowIso } from "@/lib/db";
import type {
  Answer,
  Question,
  QuestionKind,
  QuestionSource,
  Reflection,
  ReflectionFeedback,
  Session,
  Solution,
  TopicCoverage,
} from "@/lib/types";

interface SessionRow {
  id: string;
  survey_id: string;
  status: Session["status"];
  started_at: string;
  completed_at: string | null;
  ended_early: number;
  reflection: string | null;
  reflection_feedback: ReflectionFeedback | null;
  external_id: string | null;
}

interface QuestionRow {
  id: string;
  session_id: string;
  order_index: number;
  topic_id: string | null;
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string;
  source: QuestionSource;
  latency_ms: number | null;
  created_at: string;
  satisfied_topic_ids: string;
}

interface CoverageRow {
  session_id: string;
  topic_id: string;
  satisfied: number;
  asked_count: number;
}

function rowToSession(r: SessionRow): Session {
  return { ...r, ended_early: r.ended_early === 1 };
}

function rowToQuestion(r: QuestionRow): Question {
  let options: string[] = [];
  try {
    options = JSON.parse(r.options) as string[];
  } catch {
    options = [];
  }
  let satisfiedTopicIds: string[] = [];
  try {
    satisfiedTopicIds = JSON.parse(r.satisfied_topic_ids) as string[];
  } catch {
    satisfiedTopicIds = [];
  }
  return { ...r, options, satisfied_topic_ids: satisfiedTopicIds };
}

export async function createSession(surveyId: string): Promise<Session> {
  const d = db();
  const id = newId();
  await d.batch([
    d
      .prepare(
        "INSERT INTO sessions (id, survey_id, status, started_at) VALUES (?, ?, 'in_progress', ?)",
      )
      .bind(id, surveyId, nowIso()),
    d
      .prepare(
        `INSERT INTO topic_coverage (session_id, topic_id, satisfied, asked_count)
         SELECT ?, id, 0, 0 FROM survey_topics WHERE survey_id = ?`,
      )
      .bind(id, surveyId),
  ]);
  return (await getSession(id))!;
}

export async function getSession(id: string): Promise<Session | null> {
  const row = await db().prepare("SELECT * FROM sessions WHERE id = ?").bind(id).first<SessionRow>();
  return row ? rowToSession(row) : null;
}

export async function listSessions(surveyId: string): Promise<Session[]> {
  const { results } = await db()
    .prepare("SELECT * FROM sessions WHERE survey_id = ? ORDER BY started_at DESC")
    .bind(surveyId)
    .all<SessionRow>();
  return results.map(rowToSession);
}

export async function completeSession(id: string, endedEarly: boolean): Promise<void> {
  await db()
    .prepare(
      "UPDATE sessions SET status = 'completed', completed_at = ?, ended_early = ? WHERE id = ? AND status = 'in_progress'",
    )
    .bind(nowIso(), endedEarly ? 1 : 0, id)
    .run();
}

export async function saveReflection(id: string, reflection: string): Promise<void> {
  await db().prepare("UPDATE sessions SET reflection = ? WHERE id = ?").bind(reflection, id).run();
}

export async function saveReflectionFeedback(
  id: string,
  feedback: ReflectionFeedback,
): Promise<void> {
  await db()
    .prepare("UPDATE sessions SET reflection_feedback = ? WHERE id = ?")
    .bind(feedback, id)
    .run();
}

export async function listQuestions(sessionId: string): Promise<Question[]> {
  const { results } = await db()
    .prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY order_index")
    .bind(sessionId)
    .all<QuestionRow>();
  return results.map(rowToQuestion);
}

export async function getQuestion(id: string): Promise<Question | null> {
  const row = await db()
    .prepare("SELECT * FROM questions WHERE id = ?")
    .bind(id)
    .first<QuestionRow>();
  return row ? rowToQuestion(row) : null;
}

export interface QuestionInput {
  session_id: string;
  order_index: number;
  topic_id: string | null;
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string[];
  source: QuestionSource;
  latency_ms: number | null;
  satisfied_topic_ids: string[];
}

export async function insertQuestion(q: QuestionInput): Promise<Question> {
  const id = newId();
  await db()
    .prepare(
      `INSERT INTO questions (id, session_id, order_index, topic_id, lead, text, kind, options, source, latency_ms, created_at, satisfied_topic_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      q.session_id,
      q.order_index,
      q.topic_id,
      q.lead,
      q.text,
      q.kind,
      JSON.stringify(q.options),
      q.source,
      q.latency_ms,
      nowIso(),
      JSON.stringify(q.satisfied_topic_ids),
    )
    .run();
  return (await getQuestion(id))!;
}

export async function upsertAnswer(input: {
  question_id: string;
  session_id: string;
  value: string;
  free_text: string | null;
}): Promise<Answer> {
  const now = nowIso();
  await db()
    .prepare(
      `INSERT INTO answers (id, question_id, session_id, value, free_text, answered_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET value = excluded.value, free_text = excluded.free_text, answered_at = excluded.answered_at`,
    )
    .bind(newId(), input.question_id, input.session_id, input.value, input.free_text, now)
    .run();
  const row = await db()
    .prepare("SELECT * FROM answers WHERE question_id = ?")
    .bind(input.question_id)
    .first<Answer>();
  return { ...row! };
}

export async function listAnswers(sessionId: string): Promise<Answer[]> {
  const { results } = await db()
    .prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY answered_at")
    .bind(sessionId)
    .all<Answer>();
  return results.map((r) => ({ ...r }));
}

export interface QA {
  question: Question;
  answer: Answer | null;
}

export async function listQA(sessionId: string): Promise<QA[]> {
  const [questions, answers] = await Promise.all([
    listQuestions(sessionId),
    listAnswers(sessionId),
  ]);
  const byQuestion = new Map(answers.map((a) => [a.question_id, a]));
  return questions.map((q) => ({ question: q, answer: byQuestion.get(q.id) ?? null }));
}

export async function getCoverage(sessionId: string): Promise<TopicCoverage[]> {
  const { results } = await db()
    .prepare(
      `SELECT c.* FROM topic_coverage c JOIN survey_topics t ON t.id = c.topic_id
       WHERE c.session_id = ? ORDER BY t.order_index`,
    )
    .bind(sessionId)
    .all<CoverageRow>();
  return results.map((r) => ({ ...r, satisfied: r.satisfied === 1 }));
}

export async function markAsked(sessionId: string, topicId: string): Promise<void> {
  await db()
    .prepare(
      "UPDATE topic_coverage SET asked_count = asked_count + 1 WHERE session_id = ? AND topic_id = ?",
    )
    .bind(sessionId, topicId)
    .run();
}

export async function markSatisfied(sessionId: string, topicIds: string[]): Promise<void> {
  if (topicIds.length === 0) return;
  const d = db();
  await d.batch(
    topicIds.map((id) =>
      d
        .prepare("UPDATE topic_coverage SET satisfied = 1 WHERE session_id = ? AND topic_id = ?")
        .bind(sessionId, id),
    ),
  );
}

export async function countAnswersAfter(sessionId: string, orderIndex: number): Promise<number> {
  const row = await db()
    .prepare(
      `SELECT COUNT(*) AS n FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = ? AND q.order_index > ?`,
    )
    .bind(sessionId, orderIndex)
    .first<{ n: number }>();
  return row!.n;
}

export async function truncateSessionAfter(sessionId: string, orderIndex: number): Promise<void> {
  const d = db();
  await d.batch([
    d
      .prepare("DELETE FROM questions WHERE session_id = ? AND order_index > ?")
      .bind(sessionId, orderIndex),
    d
      .prepare("UPDATE topic_coverage SET satisfied = 0, asked_count = 0 WHERE session_id = ?")
      .bind(sessionId),
  ]);

  const { results: survivors } = await d
    .prepare("SELECT topic_id, satisfied_topic_ids FROM questions WHERE session_id = ?")
    .bind(sessionId)
    .all<{ topic_id: string | null; satisfied_topic_ids: string }>();

  const askedCounts = new Map<string, number>();
  const satisfiedIds = new Set<string>();
  for (const row of survivors) {
    if (row.topic_id) askedCounts.set(row.topic_id, (askedCounts.get(row.topic_id) ?? 0) + 1);
    try {
      for (const id of JSON.parse(row.satisfied_topic_ids) as string[]) satisfiedIds.add(id);
    } catch {
      // ignore malformed rows
    }
  }

  const updates = [
    ...Array.from(askedCounts, ([topicId, count]) =>
      d
        .prepare("UPDATE topic_coverage SET asked_count = ? WHERE session_id = ? AND topic_id = ?")
        .bind(count, sessionId, topicId),
    ),
    ...Array.from(satisfiedIds, (topicId) =>
      d
        .prepare("UPDATE topic_coverage SET satisfied = 1 WHERE session_id = ? AND topic_id = ?")
        .bind(sessionId, topicId),
    ),
  ];
  if (updates.length > 0) await d.batch(updates);
}

export function parseReflection(raw: string | null): Reflection | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<Reflection>;
    return {
      heard: parsed.heard ?? [],
      insight: parsed.insight ?? "",
      thanks: parsed.thanks ?? "",
      recommended_solutions: parsed.recommended_solutions ?? [],
    };
  } catch {
    return null;
  }
}

export interface SolutionFit {
  solution: Solution;
  count: number;
  evidence: string[];
}

export async function aggregateSolutionFit(
  surveyId: string,
  solutions: Solution[],
): Promise<SolutionFit[]> {
  if (solutions.length === 0) return [];
  const byId = new Map(solutions.map((s) => [s.id, s]));
  const { results } = await db()
    .prepare("SELECT reflection FROM sessions WHERE survey_id = ? AND status = 'completed'")
    .bind(surveyId)
    .all<{ reflection: string | null }>();

  const hits = new Map<string, { count: number; evidence: string[] }>();
  for (const row of results) {
    const reflection = parseReflection(row.reflection);
    if (!reflection) continue;
    for (const rec of reflection.recommended_solutions) {
      if (!rec.solution_id || !byId.has(rec.solution_id)) continue;
      const entry = hits.get(rec.solution_id) ?? { count: 0, evidence: [] };
      entry.count += 1;
      if (entry.evidence.length < 5) entry.evidence.push(rec.reason);
      hits.set(rec.solution_id, entry);
    }
  }

  return solutions
    .map((solution) => {
      const hit = hits.get(solution.id);
      return { solution, count: hit?.count ?? 0, evidence: hit?.evidence ?? [] };
    })
    .sort((a, b) => b.count - a.count);
}
