import { emptyCoverage, generateQuestionOnce, type SurveyContext } from "@/lib/survey/engine";
import type { QA } from "@/lib/repo/sessions";
import type { GeneratedQuestion, Question, SeedQuestions } from "@/lib/types";

function asQuestion(g: GeneratedQuestion): Question {
  return {
    id: "seed-q1",
    session_id: "",
    order_index: 0,
    topic_id: g.topic_id || null,
    lead: g.lead,
    text: g.text,
    kind: g.kind,
    options: g.options,
    source: "seed",
    latency_ms: null,
    created_at: "",
  };
}

function branchKeys(q1: GeneratedQuestion): string[] {
  if (q1.kind === "single") return q1.options.map((_, i) => String(i));
  if (q1.kind === "scale") return ["1", "2", "3", "4", "5"];
  return [];
}

export interface SeedProgress {
  step: number;
  total: number;
  label: string;
}

export async function generateSeed(
  ctx: SurveyContext,
  opts: { keepQ1?: GeneratedQuestion | null; onProgress?: (p: SeedProgress) => void },
): Promise<SeedQuestions> {
  const base = emptyCoverage(ctx);
  let q1 = opts.keepQ1 ?? null;
  const keys = q1 ? branchKeys(q1) : [];
  const total = (q1 ? 0 : 1) + (q1 ? keys.length : 5);

  let step = 0;
  if (!q1) {
    opts.onProgress?.({ step, total, label: "最初の質問" });
    q1 = await generateQuestionOnce(ctx, [], base);
    q1 = { ...q1, lead: "", satisfied_topic_ids: [] };
    step += 1;
  }

  const q1Question = asQuestion(q1);
  const coverage = base.map((c) => (c.topic_id === q1.topic_id ? { ...c, asked_count: 1 } : c));
  const q2_by_option: Record<string, GeneratedQuestion> = {};
  const branches = branchKeys(q1);
  const grandTotal = step + branches.length;

  for (const key of branches) {
    const value = q1.kind === "single" ? q1.options[Number(key)] : key;
    opts.onProgress?.({ step, total: grandTotal, label: `「${value}」の次の質問` });
    const qa: QA[] = [
      {
        question: q1Question,
        answer: {
          id: "seed-a1",
          question_id: q1Question.id,
          session_id: "",
          value,
          free_text: null,
          answered_at: "",
        },
      },
    ];
    q2_by_option[key] = await generateQuestionOnce(ctx, qa, coverage);
    step += 1;
  }
  opts.onProgress?.({ step, total: grandTotal, label: "完了" });
  return { q1, q2_by_option };
}
