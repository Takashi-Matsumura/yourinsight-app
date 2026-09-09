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
import type { Light, PublicQuestion, QuestionPayload, RunnerInitial } from "@/lib/survey/public";

export function startSession(surveyId: string): Session {
  const survey = getSurvey(surveyId);
  if (!survey || survey.status !== "published") {
    throw new Error("このアンケートは現在受け付けていません");
  }
  const session = createSession(surveyId);
  const ctx: EngineContext = { survey, topics: listTopics(surveyId), session };
  const seed = seedFor(ctx, []);
  if (seed) persistQuestion(ctx, seed, "seed", null, 0);
  return session;
}

export function toPublicQuestion(q: Question): PublicQuestion {
  return { id: q.id, index: q.order_index, lead: q.lead, text: q.text, kind: q.kind, options: q.options };
}

export function lightsFor(ctx: EngineContext): { lights: Light[]; remaining: number } {
  const coverage = getCoverage(ctx.session.id);
  const lights = coverageView(ctx, coverage).map((c) => ({ label: c.label, satisfied: c.satisfied }));
  return { lights, remaining: estimateRemaining(ctx, coverage) };
}

export function questionPayload(ctx: EngineContext, q: Question): QuestionPayload {
  return { question: toPublicQuestion(q), ...lightsFor(ctx) };
}

export function runnerInitial(ctx: EngineContext): RunnerInitial {
  const qa = listQA(ctx.session.id);
  const pending = qa.find((x) => !x.answer)?.question ?? null;
  const { lights, remaining } = lightsFor(ctx);
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
