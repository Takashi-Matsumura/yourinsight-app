import type { NextRequest } from "next/server";
import { checkConnection } from "@/lib/llm/client";
import { queueSnapshot } from "@/lib/llm/queue";
import { getLlmSettings } from "@/lib/repo/settings";
import type { LlmSettings } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const override = (await req.json().catch(() => ({}))) as Partial<LlmSettings>;
  const settings: LlmSettings = { ...getLlmSettings(), ...override };
  const result = await checkConnection(settings);
  return Response.json({ ...result, queue: queueSnapshot() });
}
