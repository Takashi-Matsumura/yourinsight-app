import type { NextRequest } from "next/server";
import { getSurvey, listTopics } from "@/lib/repo/surveys";
import { listQA, listSessions, parseReflection } from "@/lib/repo/sessions";

export const dynamic = "force-dynamic";

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection for free text and visitor ids
  // (a badge can carry arbitrary text). Spreadsheets treat a leading
  // apostrophe as a text prefix.
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/surveys/[surveyId]/export">) {
  const { surveyId } = await ctx.params;
  const survey = await getSurvey(surveyId);
  if (!survey) return Response.json({ error: "not found" }, { status: 404 });
  const topics = await listTopics(surveyId);
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));

  const header = [
    "session_id",
    "external_id",
    "started_at",
    "status",
    "ended_early",
    "reflection_feedback",
    "q_index",
    "topic",
    "question",
    "kind",
    "answer",
    "free_text",
    "answered_at",
    "recommended_solutions",
    "recommended_reasons",
  ];
  const lines = [header.join(",")];
  for (const s of await listSessions(surveyId)) {
    const reflection = parseReflection(s.reflection);
    const recommendedNames = (reflection?.recommended_solutions ?? []).map((r) => r.name).join("；");
    const recommendedReasons = (reflection?.recommended_solutions ?? []).map((r) => r.reason).join("；");
    for (const { question, answer } of await listQA(s.id)) {
      if (!answer) continue;
      lines.push(
        [
          s.id,
          s.external_id ?? "",
          s.started_at,
          s.status,
          s.ended_early ? 1 : 0,
          s.reflection_feedback ?? "",
          question.order_index + 1,
          question.topic_id ? (topicLabel.get(question.topic_id) ?? "") : "",
          question.text,
          question.kind,
          answer.value,
          answer.free_text ?? "",
          answer.answered_at,
          recommendedNames,
          recommendedReasons,
        ]
          .map(csvCell)
          .join(","),
      );
    }
  }
  const body = "﻿" + lines.join("\r\n");
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="responses-${surveyId.slice(0, 8)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
