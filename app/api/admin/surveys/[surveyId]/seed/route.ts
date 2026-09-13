import type { NextRequest } from "next/server";
import { sseResponse } from "@/lib/llm/sse";
import { getSurvey, listTopics, setSeedQuestions } from "@/lib/repo/surveys";
import { generateSeed } from "@/lib/survey/seed";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/surveys/[surveyId]/seed">) {
  const { surveyId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { keepQ1?: boolean };
  const survey = await getSurvey(surveyId);
  if (!survey) return Response.json({ error: "not found" }, { status: 404 });
  const topics = await listTopics(surveyId);
  if (topics.length === 0) return Response.json({ error: "論点がありません" }, { status: 400 });

  return sseResponse(async (send) => {
    const keepQ1 = body.keepQ1 ? (survey.seed_questions?.q1 ?? null) : null;
    const seed = await generateSeed(
      { survey, topics },
      { keepQ1, onProgress: (p) => send("progress", p) },
    );
    await setSeedQuestions(surveyId, seed);
    send("seed", seed);
  }, req.signal);
}
