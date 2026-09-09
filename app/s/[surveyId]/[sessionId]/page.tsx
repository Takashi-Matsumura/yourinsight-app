import { notFound } from "next/navigation";
import { connection } from "next/server";
import { loadContext } from "@/lib/survey/engine";
import { runnerInitial } from "@/lib/survey/start";
import { SurveyRunner } from "./survey-runner";

export const dynamic = "force-dynamic";

export default async function SessionPage(props: PageProps<"/s/[surveyId]/[sessionId]">) {
  await connection();
  const { surveyId, sessionId } = await props.params;
  const ctx = loadContext(sessionId);
  if (!ctx || ctx.survey.id !== surveyId) notFound();
  return <SurveyRunner initial={runnerInitial(ctx)} />;
}
