import type { NextRequest } from "next/server";
import { sseResponse } from "@/lib/llm/sse";
import { loadContext, solutionIdFromKey } from "@/lib/survey/engine";
import { completeSession, listQA, parseReflection, saveReflection } from "@/lib/repo/sessions";
import { getLlmSettings } from "@/lib/repo/settings";
import { completeStream } from "@/lib/llm/client";
import { enqueue } from "@/lib/llm/queue";
import { reflectionMessages } from "@/lib/llm/prompts";
import { reflectionSchema } from "@/lib/llm/schemas";
import { extractPartialString, extractPartialStringArray } from "@/lib/llm/partial";
import { getSurveySolutions } from "@/lib/repo/solutions";
import type { Reflection } from "@/lib/types";

export const dynamic = "force-dynamic";

interface Body {
  endEarly?: boolean;
}

interface RawReflection {
  heard: string[];
  insight: string;
  thanks: string;
  recommended_solutions?: { solution_key: string; reason: string }[];
}

const EMPTY_REFLECTION: Reflection = {
  heard: [],
  insight: "",
  thanks: "また、いつでも。",
  recommended_solutions: [],
};

export async function POST(req: NextRequest, ctx: RouteContext<"/api/session/[sessionId]/reflection">) {
  const { sessionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const ectx = await loadContext(sessionId);
  if (!ectx) return Response.json({ error: "session not found" }, { status: 404 });

  return sseResponse(async (send, signal) => {
    if (ectx.session.reflection) {
      const existing = parseReflection(ectx.session.reflection);
      if (existing) {
        send("reflection", existing);
        return;
      }
    }

    if (ectx.session.status === "in_progress") {
      await completeSession(sessionId, body.endEarly === true);
    }

    const qa = (await listQA(sessionId)).filter((x) => x.answer);
    if (qa.length === 0) {
      await saveReflection(sessionId, JSON.stringify(EMPTY_REFLECTION));
      send("reflection", EMPTY_REFLECTION);
      return;
    }

    const settings = await getLlmSettings();
    const solutions = await getSurveySolutions(ectx.survey.id);
    const solutionKeys = solutions.map((_, i) => `S${i + 1}`);
    const messages = reflectionMessages({ survey: ectx.survey, topics: ectx.topics, qa, solutions });
    const schema = reflectionSchema(solutionKeys);

    try {
      const reflection = await enqueue(
        async () => {
          send("generating", {});
          let raw = "";
          for await (const delta of completeStream({
            settings,
            messages,
            schema,
            maxTokens: 420,
            signal,
            timeoutMs: 90_000,
          })) {
            raw += delta;
            send("token", {
              heard: extractPartialStringArray(raw, "heard") ?? [],
              insight: extractPartialString(raw, "insight") ?? "",
              thanks: extractPartialString(raw, "thanks") ?? "",
            });
          }
          const parsed = JSON.parse(raw) as RawReflection;
          const recommended_solutions = (parsed.recommended_solutions ?? []).flatMap((r) => {
            const solutionId = solutionIdFromKey(solutions, r.solution_key);
            const solution = solutions.find((s) => s.id === solutionId);
            if (!solution) return [];
            return [{ solution_id: solution.id, name: solution.name, reason: r.reason }];
          });
          const result: Reflection = {
            heard: parsed.heard,
            insight: parsed.insight,
            thanks: parsed.thanks,
            recommended_solutions,
          };
          return result;
        },
        {
          maxConcurrency: settings.maxConcurrency,
          signal,
          onPosition: (position) => send("queued", { position }),
        },
      );
      if (signal.aborted) return;
      await saveReflection(sessionId, JSON.stringify(reflection));
      send("reflection", reflection);
    } catch (e) {
      if (signal.aborted) return;
      console.error("[session/reflection] failed:", e instanceof Error ? e.message : e);
      const fallback: Reflection = {
        heard: qa.slice(0, 3).map((x) => x.answer!.value),
        insight: "",
        thanks: "話してくれて、ありがとうございました。",
        recommended_solutions: [],
      };
      await saveReflection(sessionId, JSON.stringify(fallback));
      send("reflection", fallback);
    }
  }, req.signal);
}
