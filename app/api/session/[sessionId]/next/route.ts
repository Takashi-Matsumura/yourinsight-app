import type { NextRequest } from "next/server";
import { sseResponse } from "@/lib/llm/sse";
import {
  applySatisfied,
  completionReason,
  fallbackFor,
  generateNextQuestion,
  loadContext,
  persistQuestion,
  seedFor,
  snapshot,
} from "@/lib/survey/engine";
import { questionPayload } from "@/lib/survey/start";
import {
  completeSession,
  deleteUnansweredQuestionsAfter,
  getCoverage,
  getQuestion,
  upsertAnswer,
} from "@/lib/repo/sessions";

export const dynamic = "force-dynamic";

interface Body {
  questionId?: string;
  value?: string;
  freeText?: string | null;
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/session/[sessionId]/next">) {
  const { sessionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const ectx = loadContext(sessionId);
  if (!ectx) return Response.json({ error: "session not found" }, { status: 404 });

  return sseResponse(async (send, signal) => {
    if (ectx.session.status !== "in_progress") {
      send("complete", { reason: "already_completed" });
      return;
    }

    if (body.questionId && typeof body.value === "string") {
      const q = getQuestion(body.questionId);
      if (!q || q.session_id !== sessionId) {
        send("error", { message: "質問が見つかりません" });
        return;
      }
      upsertAnswer({
        question_id: q.id,
        session_id: sessionId,
        value: body.value.trim().slice(0, 500),
        free_text: body.freeText ? body.freeText.trim().slice(0, 500) || null : null,
      });
      deleteUnansweredQuestionsAfter(sessionId, q.order_index);
    }

    const { qa, coverage } = snapshot(ectx);

    const pending = qa.find((x) => !x.answer);
    if (pending) {
      send("question", questionPayload(ectx, pending.question));
      return;
    }

    const reason = completionReason(ectx, coverage, qa.length);
    if (reason) {
      completeSession(sessionId, false);
      send("complete", { reason });
      return;
    }

    const orderIndex = qa.length;

    const seed = seedFor(ectx, qa);
    if (seed) {
      const q = persistQuestion(ectx, seed, "seed", null, orderIndex);
      send("question", questionPayload(ectx, q));
      return;
    }

    try {
      const r = await generateNextQuestion(ectx, {
        qa,
        coverage,
        signal,
        onQueued: (position) => send("queued", { position }),
        onStart: () => send("generating", {}),
        onDelta: (partial) => send("token", partial),
      });
      if (signal.aborted) return;
      applySatisfied(ectx, r.generated);
      const after = getCoverage(sessionId);
      const reasonAfter = r.done ? "all_satisfied" : completionReason(ectx, after, qa.length);
      if (reasonAfter) {
        completeSession(sessionId, false);
        send("complete", { reason: reasonAfter });
        return;
      }
      const q = persistQuestion(ectx, r.generated, "llm", r.latencyMs, orderIndex);
      send("question", questionPayload(ectx, q));
    } catch (e) {
      if (signal.aborted) return;
      console.error("[session/next] generation failed:", e instanceof Error ? e.message : e);
      const fb = fallbackFor(ectx, coverage, qa);
      if (!fb) {
        completeSession(sessionId, false);
        send("complete", { reason: "all_satisfied" });
        return;
      }
      const q = persistQuestion(ectx, fb, "fallback", null, orderIndex);
      send("question", questionPayload(ectx, q));
    }
  }, req.signal);
}
