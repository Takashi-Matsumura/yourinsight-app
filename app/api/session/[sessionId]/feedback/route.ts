import type { NextRequest } from "next/server";
import { getSession, saveReflectionFeedback } from "@/lib/repo/sessions";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/session/[sessionId]/feedback">) {
  const { sessionId } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { feedback?: string };
  if (body.feedback !== "agree" && body.feedback !== "disagree") {
    return Response.json({ error: "invalid feedback" }, { status: 400 });
  }
  const session = await getSession(sessionId);
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });
  await saveReflectionFeedback(sessionId, body.feedback);
  return Response.json({ ok: true });
}
