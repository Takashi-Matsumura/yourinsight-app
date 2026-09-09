import type { DatabaseSync } from "node:sqlite";

export function migrate(d: DatabaseSync): void {
  const hasColumn = (table: string, col: string): boolean =>
    (d.prepare(`PRAGMA table_info(${table})`).all() as unknown as { name: string }[]).some(
      (c) => c.name === col,
    );
  if (!hasColumn("survey_topics", "target_solution_id")) {
    d.exec(
      "ALTER TABLE survey_topics ADD COLUMN target_solution_id TEXT REFERENCES solutions(id) ON DELETE SET NULL",
    );
  }
  if (!hasColumn("surveys", "cta_text")) {
    d.exec(
      "ALTER TABLE surveys ADD COLUMN cta_text TEXT NOT NULL DEFAULT 'ブースのスタッフにお尋ねください'",
    );
  }
  if (!hasColumn("surveys", "viewpoint")) {
    d.exec("ALTER TABLE surveys ADD COLUMN viewpoint TEXT NOT NULL DEFAULT 'individual'");
  }
}

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT '',
  intro_text TEXT NOT NULL DEFAULT '',
  max_per_topic INTEGER NOT NULL DEFAULT 3,
  hard_cap INTEGER NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
  seed_questions TEXT,
  cta_text TEXT NOT NULL DEFAULT 'ブースのスタッフにお尋ねください',
  viewpoint TEXT NOT NULL DEFAULT 'individual' CHECK (viewpoint IN ('individual','organization')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS solutions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pitch TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS survey_topics (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  priority INTEGER NOT NULL DEFAULT 1,
  fallback_question TEXT,
  target_solution_id TEXT REFERENCES solutions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_survey ON survey_topics(survey_id, order_index);

CREATE TABLE IF NOT EXISTS survey_solutions (
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  solution_id TEXT NOT NULL REFERENCES solutions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (survey_id, solution_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_solutions_solution ON survey_solutions(solution_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','completed','abandoned')),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  ended_early INTEGER NOT NULL DEFAULT 0,
  reflection TEXT,
  reflection_feedback TEXT CHECK (reflection_feedback IS NULL OR reflection_feedback IN ('agree','disagree')),
  external_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_survey ON sessions(survey_id, started_at);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  topic_id TEXT REFERENCES survey_topics(id) ON DELETE SET NULL,
  lead TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('single','scale','text')),
  options TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL CHECK (source IN ('seed','llm','fallback')),
  latency_ms INTEGER,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, order_index)
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL UNIQUE REFERENCES questions(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  free_text TEXT,
  answered_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_answers_session ON answers(session_id);

CREATE TABLE IF NOT EXISTS topic_coverage (
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES survey_topics(id) ON DELETE CASCADE,
  satisfied INTEGER NOT NULL DEFAULT 0,
  asked_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (session_id, topic_id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS analyses (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  session_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analyses_survey ON analyses(survey_id, created_at);
`;
