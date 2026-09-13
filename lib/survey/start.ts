import { getSurvey, listTopics } from "@/lib/repo/surveys";
import { createSession, getCoverage, listQA, parseReflection } from "@/lib/repo/sessions";
import {
  coverageView,
  estimateRemaining,
  persistQuestion,
  seedFor,
  type EngineContext,
} from "@/lib/survey/engine";
import type { Question, Session } from "@/lib/types";
import type { HistoryPayload, Light, PublicQuestion, QuestionPayload, RunnerInitial } from "@/lib/survey/public";

export async function startSession(surveyId: string): Promise<Session> {
  const survey = await getSurvey(surveyId);
  if (!survey || survey.status !== "published") {
    throw new Error("このアンケートは現在受け付けていません");
  }
  const session = await createSession(surveyId);
  const ctx: EngineContext = { survey, topics: await listTopics(surveyId), session };
  const seed = seedFor(ctx, []);
  if (seed) await persistQuestion(ctx, seed, "seed", null, 0);
  return session;
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return { id: q.id, index: q.order_index, lead: q.lead, text: q.text, kind: q.kind, options: q.options };
}

export async function lightsFor(
  ctx: EngineContext,
): Promise<{ lights: Light[]; remaining: number }> {
  const coverage = await getCoverage(ctx.session.id);
  const lights = coverageView(ctx, coverage).map((c) => ({ label: c.label, satisfied: c.satisfied }));
  return { lights, remaining: estimateRemaining(ctx, coverage) };
}

export async function questionPayload(ctx: EngineContext, q: Question): Promise<QuestionPayload> {
  const [qa, lightsResult] = await Promise.all([listQA(ctx.session.id), lightsFor(ctx)]);
  const answered = qa.filter((x) => x.answer).length;
  return { question: toPublicQuestion(q), ...lightsResult, answered };
}

export async function historyPayload(ctx: EngineContext): Promise<HistoryPayload> {
  const qa = await listQA(ctx.session.id);
  const items = qa
    .filter((x) => x.answer)
    .map((x) => ({
      question: toPublicQuestion(x.question),
      value: x.answer!.value,
      freeText: x.answer!.free_text,
    }));
  return { items };
}

export async function runnerInitial(ctx: EngineContext): Promise<RunnerInitial> {
  const [qa, { lights, remaining }] = await Promise.all([listQA(ctx.session.id), lightsFor(ctx)]);
  const pending = qa.find((x) => !x.answer)?.question ?? null;
  const reflection = parseReflection(ctx.session.reflection);
  return {
    surveyId: ctx.survey.id,
    sessionId: ctx.session.id,
    title: ctx.survey.title,
    status: ctx.session.status === "in_progress" ? "in_progress" : "completed",
    pending: pending ? toPublicQuestion(pending) : null,
    lights,
    remaining,
    answered: qa.filter((x) => x.answer).length,
    reflection,
    feedback: ctx.session.reflection_feedback,
    ctaText: ctx.survey.cta_text,
  };
}
