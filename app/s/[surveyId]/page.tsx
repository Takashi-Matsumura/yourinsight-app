import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getSurvey } from "@/lib/repo/surveys";
import { startSession } from "@/lib/survey/start";
import { ResumeLink } from "./resume-link";

export const dynamic = "force-dynamic";

export default async function IntroPage(props: PageProps<"/s/[surveyId]">) {
  await connection();
  const { surveyId } = await props.params;
  const survey = await getSurvey(surveyId);
  if (!survey) notFound();

  async function start() {
    "use server";
    const session = await startSession(surveyId);
    redirect(`/s/${surveyId}/${session.id}`);
  }

  const paragraphs = survey.intro_text.split(/\n+/).filter(Boolean);

  return (
    <main className="flex flex-1 flex-col w-full max-w-md mx-auto px-6 pt-safe pb-safe">
      <div className="flex-1 flex flex-col justify-center py-10">
        <h1 className="font-serif text-3xl leading-snug text-ink">{survey.title}</h1>
        {survey.status !== "published" ? (
          <p className="mt-8 text-ink-muted">このアンケートは現在受け付けていません。</p>
        ) : (
          <>
            <div className="mt-6 space-y-3 text-[17px] leading-relaxed text-ink">
              {paragraphs.length > 0 ? (
                paragraphs.map((p, i) => <p key={i}>{p}</p>)
              ) : survey.viewpoint === "organization" ? (
                <p>5分ほど、あなたのチームの回り方について聞かせてください。</p>
              ) : (
                <p>5分ほど、あなたの最近の仕事について聞かせてください。</p>
              )}
            </div>
            <ul className="mt-8 space-y-2 text-sm text-ink-muted">
              <li>答えによって、次の質問が変わります。</li>
              <li>匿名です。誰が答えたかは記録されません。</li>
              <li>途中でやめても大丈夫です。</li>
            </ul>
          </>
        )}
      </div>

      {survey.status === "published" && (
        <div className="space-y-4">
          <form action={start}>
            <button
              type="submit"
              className="w-full min-h-14 rounded-md bg-accent text-accent-ink text-[17px] font-medium transition-[background-color,transform] duration-(--dur-fast) ease-(--ease-out) hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            >
              はじめる
            </button>
          </form>
          <ResumeLink surveyId={surveyId} />
        </div>
      )}
    </main>
  );
}
