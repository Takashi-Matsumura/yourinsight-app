import { db, newId, nowIso } from "@/lib/db";
import type { Solution } from "@/lib/types";

interface SolutionRow {
  id: string;
  name: string;
  pitch: string;
  description: string;
  url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToSolution(r: SolutionRow): Solution {
  return { ...r };
}

export function listSolutions(): Solution[] {
  const rows = db().prepare("SELECT * FROM solutions ORDER BY created_at").all() as unknown as SolutionRow[];
  return rows.map(rowToSolution);
}

export function getSolution(id: string): Solution | null {
  const row = db().prepare("SELECT * FROM solutions WHERE id = ?").get(id) as SolutionRow | undefined;
  return row ? rowToSolution(row) : null;
}

export interface SolutionInput {
  name: string;
  pitch: string;
  description: string;
  url: string | null;
}

export function createSolution(input: SolutionInput): Solution {
  const id = newId();
  const now = nowIso();
  db()
    .prepare(
      "INSERT INTO solutions (id, name, pitch, description, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, input.name, input.pitch, input.description, input.url, now, now);
  return getSolution(id)!;
}

export function updateSolution(id: string, input: SolutionInput): void {
  db()
    .prepare(
      "UPDATE solutions SET name = ?, pitch = ?, description = ?, url = ?, updated_at = ? WHERE id = ?",
    )
    .run(input.name, input.pitch, input.description, input.url, nowIso(), id);
}

export function deleteSolution(id: string): void {
  db().prepare("DELETE FROM solutions WHERE id = ?").run(id);
}

export function getSurveySolutionIds(surveyId: string): string[] {
  const rows = db()
    .prepare("SELECT solution_id FROM survey_solutions WHERE survey_id = ? ORDER BY order_index")
    .all(surveyId) as unknown as { solution_id: string }[];
  return rows.map((r) => r.solution_id);
}

export function getSurveySolutions(surveyId: string): Solution[] {
  const rows = db()
    .prepare(
      `SELECT s.* FROM solutions s
       JOIN survey_solutions ss ON ss.solution_id = s.id
       WHERE ss.survey_id = ? ORDER BY ss.order_index`,
    )
    .all(surveyId) as unknown as SolutionRow[];
  return rows.map(rowToSolution);
}

export function setSurveySolutions(surveyId: string, solutionIds: string[]): void {
  const d = db();
  d.exec("BEGIN");
  try {
    d.prepare("DELETE FROM survey_solutions WHERE survey_id = ?").run(surveyId);
    const insert = d.prepare(
      "INSERT INTO survey_solutions (survey_id, solution_id, order_index) VALUES (?, ?, ?)",
    );
    solutionIds.forEach((solutionId, i) => insert.run(surveyId, solutionId, i));
    if (solutionIds.length === 0) {
      d.prepare(
        "UPDATE survey_topics SET target_solution_id = NULL WHERE survey_id = ?",
      ).run(surveyId);
    } else {
      const placeholders = solutionIds.map(() => "?").join(",");
      d.prepare(
        `UPDATE survey_topics SET target_solution_id = NULL
         WHERE survey_id = ? AND target_solution_id IS NOT NULL AND target_solution_id NOT IN (${placeholders})`,
      ).run(surveyId, ...solutionIds);
    }
    d.exec("COMMIT");
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}
