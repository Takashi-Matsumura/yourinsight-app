import type { NextRequest } from "next/server";
import { loadContext } from "@/lib/survey/engine";
import { historyPayload } from "@/lib/survey/start";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/session/[sessionId]/history">) {
  const { sessionId } = await ctx.params;
  const ectx = loadContext(sessionId);
  if (!ectx) return Response.json({ error: "session not found" }, { status: 404 });
  return Response.json(historyPayload(ectx));
}
