import type { NextRequest } from "next/server";
import { sseResponse } from "@/lib/llm/sse";
import { complete } from "@/lib/llm/client";
import { enqueue, HEAVY_QUEUE } from "@/lib/llm/queue";
import { analysisMessages } from "@/lib/llm/prompts";
import { analysisSchema } from "@/lib/llm/schemas";
import { getSurvey, listTopics } from "@/lib/repo/surveys";
import { listQA, listSessions } from "@/lib/repo/sessions";
import { saveAnalysis } from "@/lib/repo/analyses";
import { getLlmSettings } from "@/lib/repo/settings";
import { getSurveySolutions } from "@/lib/repo/solutions";
import type { Analysis, Reflection } from "@/lib/types";

export const dynamic = "force-dynamic";

const MAX_SESSIONS = 40;

function reflectionText(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Reflection;
    return [...r.heard, r.insight].filter(Boolean).join(" / ");
  } catch {
    return raw;
  }
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/surveys/[surveyId]/analysis">) {
  const { surveyId } = await ctx.params;
  const survey = await getSurvey(surveyId);
  if (!survey) return Response.json({ error: "not found" }, { status: 404 });
  const [topics, sessionList] = await Promise.all([listTopics(surveyId), listSessions(surveyId)]);
  const completedSessions = sessionList.filter((s) => s.status === "completed").slice(0, MAX_SESSIONS);
  const sessionsWithQa = await Promise.all(
    completedSessions.map(async (s) => ({
      qa: (await listQA(s.id)).filter((x) => x.answer),
      reflection: reflectionText(s.reflection),
      feedback: s.reflection_feedback,
    })),
  );
  const sessions = sessionsWithQa.filter((s) => s.qa.length > 0);
  if (sessions.length === 0) return Response.json({ error: "完了した回答がありません" }, { status: 400 });

  const settings = await getLlmSettings();
  const keys = topics.map((_, i) => `T${i + 1}`);
  const solutions = await getSurveySolutions(surveyId);
  const solutionKeys = solutions.map((_, i) => `S${i + 1}`);
  const messages = analysisMessages({ survey, topics, sessions, solutions });

  return sseResponse(async (send, signal) => {
    const r = await enqueue(
      () => {
        send("generating", {});
        return complete({
          settings,
          messages,
          schema: analysisSchema(keys, solutionKeys),
          maxTokens: 1800,
          temperature: 0.4,
          signal,
          timeoutMs: 300_000,
        });
      },
      {
        queue: HEAVY_QUEUE,
        maxConcurrency: settings.maxConcurrency,
        maxQueue: 16,
        signal,
        onPosition: (p) => send("queued", { position: p }),
      },
    );
    if (signal.aborted) return;
    const parsed = JSON.parse(r.content) as Analysis;
    const analysis: Analysis = {
      ...parsed,
      unaddressed_needs: parsed.unaddressed_needs ?? [],
      issues: parsed.issues.map((i) => {
        const m = /^T(\d+)$/.exec(i.topic_id ?? "");
        return { ...i, topic_id: m ? (topics[Number(m[1]) - 1]?.id ?? null) : null };
      }),
    };
    await saveAnalysis(surveyId, analysis, sessions.length);
    send("analysis", analysis);
  }, req.signal);
}
