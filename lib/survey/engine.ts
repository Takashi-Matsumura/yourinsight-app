import { getLlmSettings } from "@/lib/repo/settings";
import { getSurvey, listTopics } from "@/lib/repo/surveys";
import {
  getCoverage,
  getSession,
  insertQuestion,
  listQA,
  markAsked,
  markSatisfied,
  type QA,
} from "@/lib/repo/sessions";
import { complete, completeStream, LlmError } from "@/lib/llm/client";
import { enqueue } from "@/lib/llm/queue";
import { nextQuestionMessages } from "@/lib/llm/prompts";
import { nextQuestionSchema } from "@/lib/llm/schemas";
import { extractPartialString } from "@/lib/llm/partial";
import type {
  GeneratedQuestion,
  Question,
  QuestionKind,
  QuestionSource,
  Session,
  Solution,
  Survey,
  Topic,
  TopicCoverage,
} from "@/lib/types";

export interface SurveyContext {
  survey: Survey;
  topics: Topic[];
}

export interface EngineContext extends SurveyContext {
  session: Session;
}

export function loadContext(sessionId: string): EngineContext | null {
  const session = getSession(sessionId);
  if (!session) return null;
  const survey = getSurvey(session.survey_id);
  if (!survey) return null;
  return { survey, topics: listTopics(survey.id), session };
}

export function topicKey(topics: Topic[], topicId: string): string {
  const idx = topics.findIndex((t) => t.id === topicId);
  return idx >= 0 ? `T${idx + 1}` : "";
}

export function topicIdFromKey(topics: Topic[], key: string): string | null {
  const m = /^T(\d+)$/.exec(key);
  if (!m) return null;
  return topics[Number(m[1]) - 1]?.id ?? null;
}

export function solutionKey(solutions: Solution[], solutionId: string): string {
  const idx = solutions.findIndex((s) => s.id === solutionId);
  return idx >= 0 ? `S${idx + 1}` : "";
}

export function solutionIdFromKey(solutions: Solution[], key: string): string | null {
  const m = /^S(\d+)$/.exec(key);
  if (!m) return null;
  return solutions[Number(m[1]) - 1]?.id ?? null;
}

export interface CoverageView {
  topic_id: string;
  label: string;
  satisfied: boolean;
  asked_count: number;
}

export function coverageView(ctx: EngineContext, coverage: TopicCoverage[]): CoverageView[] {
  const byId = new Map(coverage.map((c) => [c.topic_id, c]));
  return ctx.topics.map((t) => {
    const c = byId.get(t.id);
    return {
      topic_id: t.id,
      label: t.label,
      satisfied: c?.satisfied ?? false,
      asked_count: c?.asked_count ?? 0,
    };
  });
}

export function effectiveSatisfied(ctx: EngineContext, coverage: TopicCoverage[]): Set<string> {
  const s = new Set<string>();
  for (const c of coverage) {
    if (c.satisfied || c.asked_count >= ctx.survey.max_per_topic) s.add(c.topic_id);
  }
  return s;
}

export type CompletionReason = "all_satisfied" | "hard_cap" | "no_topics";

export function completionReason(
  ctx: EngineContext,
  coverage: TopicCoverage[],
  askedCount: number,
): CompletionReason | null {
  if (ctx.topics.length === 0) return "no_topics";
  if (askedCount >= ctx.survey.hard_cap) return "hard_cap";
  const satisfied = effectiveSatisfied(ctx, coverage);
  if (ctx.topics.every((t) => satisfied.has(t.id))) return "all_satisfied";
  return null;
}

export function estimateRemaining(ctx: EngineContext, coverage: TopicCoverage[]): number {
  const satisfied = effectiveSatisfied(ctx, coverage);
  return ctx.topics.filter((t) => !satisfied.has(t.id)).length;
}

export function seedFor(ctx: EngineContext, qa: QA[]): GeneratedQuestion | null {
  const seed = ctx.survey.seed_questions;
  if (!seed) return null;
  if (qa.length === 0) return seed.q1;
  if (qa.length === 1 && qa[0].question.source === "seed" && qa[0].answer) {
    const q1 = qa[0].question;
    const idx = q1.kind === "scale" ? qa[0].answer.value : String(q1.options.indexOf(qa[0].answer.value));
    return seed.q2_by_option[idx] ?? null;
  }
  return null;
}

export function fallbackFor(ctx: EngineContext, coverage: TopicCoverage[], qa: QA[]): GeneratedQuestion | null {
  const satisfied = effectiveSatisfied(ctx, coverage);
  const askedTexts = new Set(qa.map((x) => x.question.text));
  const candidates = ctx.topics
    .filter((t) => !satisfied.has(t.id) && t.fallback_question && !askedTexts.has(t.fallback_question.text))
    .sort((a, b) => a.priority - b.priority);
  const t = candidates[0];
  if (!t || !t.fallback_question) return null;
  return { ...t.fallback_question, topic_id: t.id, satisfied_topic_ids: [] };
}

export function appliedSatisfiedIds(generated: GeneratedQuestion): string[] {
  return generated.satisfied_topic_ids.filter((id) => id !== generated.topic_id);
}

export function persistQuestion(
  ctx: EngineContext,
  generated: GeneratedQuestion,
  source: QuestionSource,
  latencyMs: number | null,
  orderIndex: number,
): Question {
  const q = insertQuestion({
    session_id: ctx.session.id,
    order_index: orderIndex,
    topic_id: generated.topic_id || null,
    lead: generated.lead ?? "",
    text: generated.text,
    kind: generated.kind,
    options: generated.options,
    source,
    latency_ms: latencyMs,
    satisfied_topic_ids: source === "llm" ? appliedSatisfiedIds(generated) : [],
  });
  if (generated.topic_id) markAsked(ctx.session.id, generated.topic_id);
  return q;
}

interface RawGenerated {
  done: boolean;
  satisfied_topic_ids: string[];
  topic_id: string;
  lead: string;
  text: string;
  kind: QuestionKind;
  options: string[];
}

function normalize(ctx: SurveyContext, raw: RawGenerated): { generated: GeneratedQuestion; done: boolean } {
  const topicId = topicIdFromKey(ctx.topics, raw.topic_id) ?? ctx.topics[0]?.id ?? "";
  const satisfied = raw.satisfied_topic_ids
    .map((k) => topicIdFromKey(ctx.topics, k))
    .filter((x): x is string => Boolean(x));
  let kind = raw.kind;
  let options = raw.options.map((o) => o.trim()).filter(Boolean);
  if (kind === "scale" && options.length !== 2) {
    kind = options.length >= 3 ? "single" : "text";
  }
  if (kind === "single" && options.length < 2) kind = "text";
  if (kind === "text") options = [];
  return {
    done: raw.done === true,
    generated: {
      lead: (raw.lead ?? "").trim().slice(0, 60),
      text: raw.text.trim(),
      kind,
      options: options.slice(0, 5),
      topic_id: topicId,
      satisfied_topic_ids: satisfied,
    },
  };
}

export interface GenerateOptions {
  qa: QA[];
  coverage: TopicCoverage[];
  signal: AbortSignal;
  onQueued?: (position: number) => void;
  onStart?: () => void;
  onDelta?: (partial: { lead: string; text: string }) => void;
}

export interface GenerateResult {
  generated: GeneratedQuestion;
  done: boolean;
  latencyMs: number;
}

export async function generateNextQuestion(ctx: EngineContext, opts: GenerateOptions): Promise<GenerateResult> {
  const settings = getLlmSettings();
  const keys = ctx.topics.map((_, i) => `T${i + 1}`);
  const messages = nextQuestionMessages({
    survey: ctx.survey,
    topics: ctx.topics,
    coverage: opts.coverage,
    qa: opts.qa,
    isFirst: opts.qa.length === 0,
  });
  const schema = nextQuestionSchema(keys, { allowText: !opts.qa.some((x) => x.question.kind === "text") });
  const suppressLead = Boolean(opts.qa[opts.qa.length - 1]?.question.lead);

  return enqueue(
    async () => {
      opts.onStart?.();
      const started = Date.now();
      let raw = "";
      let lastLead = "";
      let lastText = "";
      for await (const delta of completeStream({
        settings,
        messages,
        schema,
        maxTokens: 220,
        signal: opts.signal,
      })) {
        raw += delta;
        if (opts.onDelta) {
          const lead = suppressLead ? "" : (extractPartialString(raw, "lead") ?? "");
          const text = extractPartialString(raw, "text") ?? "";
          if (lead !== lastLead || text !== lastText) {
            lastLead = lead;
            lastText = text;
            opts.onDelta({ lead, text });
          }
        }
      }
      let parsed: RawGenerated;
      try {
        parsed = JSON.parse(raw) as RawGenerated;
      } catch {
        throw new LlmError("LLMの出力をJSONとして解釈できませんでした");
      }
      const { generated, done } = normalize(ctx, parsed);
      if (suppressLead) generated.lead = "";
      return { generated, done, latencyMs: Date.now() - started };
    },
    { maxConcurrency: settings.maxConcurrency, signal: opts.signal, onPosition: opts.onQueued },
  );
}

export function emptyCoverage(ctx: SurveyContext): TopicCoverage[] {
  return ctx.topics.map((t) => ({ session_id: "", topic_id: t.id, satisfied: false, asked_count: 0 }));
}

export async function generateQuestionOnce(
  ctx: SurveyContext,
  qa: QA[],
  coverage: TopicCoverage[],
): Promise<GeneratedQuestion> {
  const settings = getLlmSettings();
  const keys = ctx.topics.map((_, i) => `T${i + 1}`);
  const messages = nextQuestionMessages({
    survey: ctx.survey,
    topics: ctx.topics,
    coverage,
    qa,
    isFirst: qa.length === 0,
  });
  const schema = nextQuestionSchema(keys, { allowText: !qa.some((x) => x.question.kind === "text") });
  const r = await enqueue(
    () => complete({ settings, messages, schema, maxTokens: 220, timeoutMs: 90_000 }),
    { maxConcurrency: settings.maxConcurrency, maxQueue: 32 },
  );
  return normalize(ctx, JSON.parse(r.content) as RawGenerated).generated;
}

export function applySatisfied(ctx: EngineContext, generated: GeneratedQuestion): void {
  markSatisfied(ctx.session.id, appliedSatisfiedIds(generated));
}

export function snapshot(ctx: EngineContext) {
  const qa = listQA(ctx.session.id);
  const coverage = getCoverage(ctx.session.id);
  return { qa, coverage };
}
