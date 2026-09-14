import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSurvey } from "@/lib/repo/surveys";
import { startSession } from "@/lib/survey/start";
import { EXTERNAL_ID_MAX } from "@/lib/survey/public";
import { StartPanel } from "./start-panel";

export const dynamic = "force-dynamic";

export default async function IntroPage(props: PageProps<"/s/[surveyId]">) {
  await connection();
  const { surveyId } = await props.params;
  const survey = await getSurvey(surveyId);
  if (!survey) notFound();

  async function start(formData: FormData) {
    "use server";
    // Visitor badge scanned on the intro screen. Opaque, client-supplied text:
    // normalise the length and store it as-is via a bound parameter.
    const raw = formData.get("external_id");
    const externalId =
      typeof raw === "string" ? raw.replace(/\0/g, "").trim().slice(0, EXTERNAL_ID_MAX) : "";
    const session = await startSession(surveyId, externalId || null);
    redirect(`/s/${surveyId}/${session.id}`);
  }

  const paragraphs = survey.intro_text.split(/\n+/).filter(Boolean);

  const intro = (
    <>
      <h1 className="font-serif text-3xl leading-snug text-ink">{survey.title}</h1>
      <div className="mt-6 space-y-3 text-[17px] leading-relaxed text-ink">
        {paragraphs.length > 0 ? (
          paragraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : survey.viewpoint === "organization" ? (
          <p>5分ほど、あなたのチームの回り方について聞かせてください。</p>
        ) : (
          <p>5分ほど、あなたの最近の仕事について聞かせてください。</p>
        )}
      </div>
    </>
  );

  return (
    <main className="flex flex-1 flex-col w-full max-w-md mx-auto px-6 pt-safe pb-safe">
      {survey.status !== "published" ? (
        <div className="flex-1 flex flex-col justify-center py-10">
          <h1 className="font-serif text-3xl leading-snug text-ink">{survey.title}</h1>
          <p className="mt-8 text-ink-muted">このアンケートは現在受け付けていません。</p>
        </div>
      ) : (
        <StartPanel surveyId={surveyId} start={start}>
          {intro}
        </StartPanel>
      )}
    </main>
  );
}
