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

export function createSession(surveyId: string): Session {
  const d = db();
  const id = newId();
  d.exec("BEGIN");
  try {
    d.prepare("INSERT INTO sessions (id, survey_id, status, started_at) VALUES (?, ?, 'in_progress', ?)").run(
      id,
      surveyId,
      nowIso(),
    );
    d.prepare(
      `INSERT INTO topic_coverage (session_id, topic_id, satisfied, asked_count)
       SELECT ?, id, 0, 0 FROM survey_topics WHERE survey_id = ?`,
    ).run(id, surveyId);
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
  return getSession(id)!;
}

export function getSession(id: string): Session | null {
  const row = db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ? rowToSession(row) : null;
}

export function listSessions(surveyId: string): Session[] {
  const rows = db()
    .prepare("SELECT * FROM sessions WHERE survey_id = ? ORDER BY started_at DESC")
    .all(surveyId) as unknown as SessionRow[];
  return rows.map(rowToSession);
}

export function completeSession(id: string, endedEarly: boolean): void {
  db()
    .prepare(
      "UPDATE sessions SET status = 'completed', completed_at = ?, ended_early = ? WHERE id = ? AND status = 'in_progress'",
    )
    .run(nowIso(), endedEarly ? 1 : 0, id);
}

export function saveReflection(id: string, reflection: string): void {
  db().prepare("UPDATE sessions SET reflection = ? WHERE id = ?").run(reflection, id);
}

export function saveReflectionFeedback(id: string, feedback: ReflectionFeedback): void {
  db().prepare("UPDATE sessions SET reflection_feedback = ? WHERE id = ?").run(feedback, id);
}

export function listQuestions(sessionId: string): Question[] {
  const rows = db()
    .prepare("SELECT * FROM questions WHERE session_id = ? ORDER BY order_index")
    .all(sessionId) as unknown as QuestionRow[];
  return rows.map(rowToQuestion);
}

export function getQuestion(id: string): Question | null {
  const row = db().prepare("SELECT * FROM questions WHERE id = ?").get(id) as QuestionRow | undefined;
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

export function insertQuestion(q: QuestionInput): Question {
  const id = newId();
  db()
    .prepare(
      `INSERT INTO questions (id, session_id, order_index, topic_id, lead, text, kind, options, source, latency_ms, created_at, satisfied_topic_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
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
    );
  return getQuestion(id)!;
}

export function upsertAnswer(input: {
  question_id: string;
  session_id: string;
  value: string;
  free_text: string | null;
}): Answer {
  const now = nowIso();
  db()
    .prepare(
      `INSERT INTO answers (id, question_id, session_id, value, free_text, answered_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(question_id) DO UPDATE SET value = excluded.value, free_text = excluded.free_text, answered_at = excluded.answered_at`,
    )
    .run(newId(), input.question_id, input.session_id, input.value, input.free_text, now);
  const row = db()
    .prepare("SELECT * FROM answers WHERE question_id = ?")
    .get(input.question_id) as unknown as Answer;
  return { ...row };
}

export function listAnswers(sessionId: string): Answer[] {
  const rows = db()
    .prepare("SELECT * FROM answers WHERE session_id = ? ORDER BY answered_at")
    .all(sessionId) as unknown as Answer[];
  return rows.map((r) => ({ ...r }));
}

export interface QA {
  question: Question;
  answer: Answer | null;
}

export function listQA(sessionId: string): QA[] {
  const questions = listQuestions(sessionId);
  const answers = new Map(listAnswers(sessionId).map((a) => [a.question_id, a]));
  return questions.map((q) => ({ question: q, answer: answers.get(q.id) ?? null }));
}

export function getCoverage(sessionId: string): TopicCoverage[] {
  const rows = db()
    .prepare(
      `SELECT c.* FROM topic_coverage c JOIN survey_topics t ON t.id = c.topic_id
       WHERE c.session_id = ? ORDER BY t.order_index`,
    )
    .all(sessionId) as unknown as CoverageRow[];
  return rows.map((r) => ({ ...r, satisfied: r.satisfied === 1 }));
}

export function markAsked(sessionId: string, topicId: string): void {
  db()
    .prepare(
      "UPDATE topic_coverage SET asked_count = asked_count + 1 WHERE session_id = ? AND topic_id = ?",
    )
    .run(sessionId, topicId);
}

export function markSatisfied(sessionId: string, topicIds: string[]): void {
  if (topicIds.length === 0) return;
  const stmt = db().prepare(
    "UPDATE topic_coverage SET satisfied = 1 WHERE session_id = ? AND topic_id = ?",
  );
  for (const id of topicIds) stmt.run(sessionId, id);
}

export function countAnswersAfter(sessionId: string, orderIndex: number): number {
  const row = db()
    .prepare(
      `SELECT COUNT(*) AS n FROM answers a
       JOIN questions q ON q.id = a.question_id
       WHERE a.session_id = ? AND q.order_index > ?`,
    )
    .get(sessionId, orderIndex) as { n: number };
  return row.n;
}

export function truncateSessionAfter(sessionId: string, orderIndex: number): void {
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM questions WHERE session_id = ? AND order_index > ?").run(sessionId, orderIndex);
    d.prepare("UPDATE topic_coverage SET satisfied = 0, asked_count = 0 WHERE session_id = ?").run(sessionId);
    const survivors = d
      .prepare("SELECT topic_id, satisfied_topic_ids FROM questions WHERE session_id = ?")
      .all(sessionId) as unknown as { topic_id: string | null; satisfied_topic_ids: string }[];

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

    const askedStmt = d.prepare(
      "UPDATE topic_coverage SET asked_count = ? WHERE session_id = ? AND topic_id = ?",
    );
    for (const [topicId, count] of askedCounts) askedStmt.run(count, sessionId, topicId);

    const satisfiedStmt = d.prepare(
      "UPDATE topic_coverage SET satisfied = 1 WHERE session_id = ? AND topic_id = ?",
    );
    for (const topicId of satisfiedIds) satisfiedStmt.run(sessionId, topicId);

    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
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

export function aggregateSolutionFit(surveyId: string, solutions: Solution[]): SolutionFit[] {
  if (solutions.length === 0) return [];
  const byId = new Map(solutions.map((s) => [s.id, s]));
  const rows = db()
    .prepare("SELECT reflection FROM sessions WHERE survey_id = ? AND status = 'completed'")
    .all(surveyId) as unknown as { reflection: string | null }[];

  const hits = new Map<string, { count: number; evidence: string[] }>();
  for (const row of rows) {
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
