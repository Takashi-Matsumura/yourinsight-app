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

export async function listSolutions(): Promise<Solution[]> {
  const { results } = await db().prepare("SELECT * FROM solutions ORDER BY created_at").all<SolutionRow>();
  return results.map(rowToSolution);
}

export async function getSolution(id: string): Promise<Solution | null> {
  const row = await db().prepare("SELECT * FROM solutions WHERE id = ?").bind(id).first<SolutionRow>();
  return row ? rowToSolution(row) : null;
}

export interface SolutionInput {
  name: string;
  pitch: string;
  description: string;
  url: string | null;
}

export async function createSolution(input: SolutionInput): Promise<Solution> {
  const id = newId();
  const now = nowIso();
  await db()
    .prepare(
      "INSERT INTO solutions (id, name, pitch, description, url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.name, input.pitch, input.description, input.url, now, now)
    .run();
  return (await getSolution(id))!;
}

export async function updateSolution(id: string, input: SolutionInput): Promise<void> {
  await db()
    .prepare(
      "UPDATE solutions SET name = ?, pitch = ?, description = ?, url = ?, updated_at = ? WHERE id = ?",
    )
    .bind(input.name, input.pitch, input.description, input.url, nowIso(), id)
    .run();
}

export async function deleteSolution(id: string): Promise<void> {
  await db().prepare("DELETE FROM solutions WHERE id = ?").bind(id).run();
}

export async function getSurveySolutionIds(surveyId: string): Promise<string[]> {
  const { results } = await db()
    .prepare("SELECT solution_id FROM survey_solutions WHERE survey_id = ? ORDER BY order_index")
    .bind(surveyId)
    .all<{ solution_id: string }>();
  return results.map((r) => r.solution_id);
}

export async function getSurveySolutions(surveyId: string): Promise<Solution[]> {
  const { results } = await db()
    .prepare(
      `SELECT s.* FROM solutions s
       JOIN survey_solutions ss ON ss.solution_id = s.id
       WHERE ss.survey_id = ? ORDER BY ss.order_index`,
    )
    .bind(surveyId)
    .all<SolutionRow>();
  return results.map(rowToSolution);
}

export async function setSurveySolutions(surveyId: string, solutionIds: string[]): Promise<void> {
  const d = db();
  const insertStmts = solutionIds.map((solutionId, i) =>
    d
      .prepare("INSERT INTO survey_solutions (survey_id, solution_id, order_index) VALUES (?, ?, ?)")
      .bind(surveyId, solutionId, i),
  );

  const clearTargetsStmt =
    solutionIds.length === 0
      ? d.prepare("UPDATE survey_topics SET target_solution_id = NULL WHERE survey_id = ?").bind(surveyId)
      : d
          .prepare(
            `UPDATE survey_topics SET target_solution_id = NULL
             WHERE survey_id = ? AND target_solution_id IS NOT NULL AND target_solution_id NOT IN (${solutionIds.map(() => "?").join(",")})`,
          )
          .bind(surveyId, ...solutionIds);

  await d.batch([
    d.prepare("DELETE FROM survey_solutions WHERE survey_id = ?").bind(surveyId),
    ...insertStmts,
    clearTargetsStmt,
  ]);
}
