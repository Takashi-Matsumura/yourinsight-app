import type { NextRequest } from "next/server";
import { sseResponse } from "@/lib/llm/sse";
import { completeStream } from "@/lib/llm/client";
import { enqueue, HEAVY_QUEUE } from "@/lib/llm/queue";
import { surveyDesignMessages } from "@/lib/llm/prompts";
import { surveyDesignSchema } from "@/lib/llm/schemas";
import { extractAllStrings, extractPartialString } from "@/lib/llm/partial";
import { getLlmSettings } from "@/lib/repo/settings";
import { getSolution } from "@/lib/repo/solutions";
import { solutionIdFromKey } from "@/lib/survey/engine";
import type { Solution, SurveyViewpoint } from "@/lib/types";

export const dynamic = "force-dynamic";

interface RawTopic {
  label: string;
  description: string;
  priority: number;
  target_solution_key: string;
  fallback_question: { text: string; kind: string; options: string[] };
}

interface RawDesign {
  title: string;
  intro_text: string;
  topics: RawTopic[];
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    purpose?: string;
    audience?: string;
    viewpoint?: string;
    solutionIds?: string[];
  };
  const purpose = (body.purpose ?? "").trim();
  if (!purpose) return Response.json({ error: "purpose required" }, { status: 400 });
  const audience = (body.audience ?? "").trim();
  const viewpoint: SurveyViewpoint = body.viewpoint === "organization" ? "organization" : "individual";
  const resolvedSolutions = await Promise.all((body.solutionIds ?? []).map((id) => getSolution(id)));
  const solutions = resolvedSolutions.filter((s): s is Solution => s !== null);
  const solutionKeys = solutions.map((_, i) => `S${i + 1}`);
  const settings = await getLlmSettings();
  const messages = surveyDesignMessages({ purpose, audience, viewpoint, solutions });
  const schema = surveyDesignSchema(solutionKeys);

  return sseResponse(async (send, signal) => {
    const design = await enqueue(
      async () => {
        send("generating", {});
        let raw = "";
        for await (const delta of completeStream({
          settings,
          messages,
          schema,
          maxTokens: 1400,
          signal,
          timeoutMs: 180_000,
        })) {
          raw += delta;
          send("token", {
            title: extractPartialString(raw, "title") ?? "",
            intro_text: extractPartialString(raw, "intro_text") ?? "",
            labels: extractAllStrings(raw, "label"),
          });
        }
        return JSON.parse(raw) as RawDesign;
      },
      {
        queue: HEAVY_QUEUE,
        maxConcurrency: settings.maxConcurrency,
        maxQueue: 16,
        signal,
        onPosition: (position) => send("queued", { position }),
      },
    );
    if (signal.aborted) return;
    const resolved = {
      ...design,
      topics: design.topics.map((t) => ({
        ...t,
        target_solution_id: solutionIdFromKey(solutions, t.target_solution_key),
      })),
    };
    send("design", resolved);
  }, req.signal);
}
