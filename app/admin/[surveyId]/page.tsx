import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { connection } from "next/server";
import QRCode from "qrcode";
import { countSessions, getSurvey, listTopics } from "@/lib/repo/surveys";
import { getSurveySolutionIds, getSurveySolutions, listSolutions } from "@/lib/repo/solutions";
import { updateSurveyAction } from "../actions";
import { btnSecondary, Field, inputCls, Section, textareaCls } from "../ui";
import { SurveyNav } from "./survey-nav";
import { TopicsEditor } from "./topics-editor";
import { SeedPanel } from "./seed-panel";
import { PublishControls } from "./publish-controls";
import { QrPanel } from "./qr-panel";
import { SolutionsSelector } from "./solutions-selector";

export const dynamic = "force-dynamic";

export default async function SurveyEditPage(props: PageProps<"/admin/[surveyId]">) {
  await connection();
  const { surveyId } = await props.params;
  const survey = await getSurvey(surveyId);
  if (!survey) notFound();
  const [topics, counts, allSolutions, activeSolutionIds, activeSolutions] = await Promise.all([
    listTopics(surveyId),
    countSessions(surveyId),
    listSolutions(),
    getSurveySolutionIds(surveyId),
    getSurveySolutions(surveyId),
  ]);

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const url = `${proto}://${host}/s/${surveyId}`;
  const qr = await QRCode.toDataURL(url, {
    margin: 1,
    width: 640,
    color: { dark: "#1c1a18", light: "#ffffff" },
  });

  const update = updateSurveyAction.bind(null, surveyId);

  return (
    <div className="space-y-10">
      <SurveyNav survey={survey} current="edit" />

      <PublishControls survey={survey} topicCount={topics.length} hasSeed={Boolean(survey.seed_questions?.q1)} />

      <Section title="基本">
        <form action={update} className="space-y-4">
          <Field label="題名">
            <input name="title" defaultValue={survey.title} className={inputCls} required maxLength={60} />
          </Field>
          <Field label="視点" hint="質問の主語が変わります。既存の回答には影響しません。">
            <select name="viewpoint" defaultValue={survey.viewpoint} className={inputCls}>
              <option value="individual">あなた自身の視点で</option>
              <option value="organization">チーム・組織の視点で</option>
            </select>
          </Field>
          <Field label="調査の目的" hint="AIはこの文章を毎回の質問生成で参照します。">
            <textarea name="purpose" defaultValue={survey.purpose} rows={4} className={textareaCls} />
          </Field>
          <Field label="対象者">
            <input name="audience" defaultValue={survey.audience} className={inputCls} maxLength={100} />
          </Field>
          <Field label="導入文" hint="回答者が最初に読む文章。会話の始まりのように。">
            <textarea name="intro_text" defaultValue={survey.intro_text} rows={3} className={textareaCls} />
          </Field>
          <Field label="ご案内のCTA文言" hint="ソリューションのご案内に添える一言。例: 「QRコードから資料をご覧ください」">
            <input name="cta_text" defaultValue={survey.cta_text} className={inputCls} maxLength={60} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="1論点あたりの最大質問数" hint="使い切ると自動的に次の論点へ。既定3。">
              <input
                name="max_per_topic"
                type="number"
                min={1}
                max={6}
                defaultValue={survey.max_per_topic}
                className={inputCls}
              />
            </Field>
            <Field label="絶対上限（安全弁）" hint="通常は到達しません。既定15。">
              <input name="hard_cap" type="number" min={3} max={40} defaultValue={survey.hard_cap} className={inputCls} />
            </Field>
          </div>
          <p className="text-xs text-ink-faint">
            論点{topics.length}個 × {survey.max_per_topic}問 = 最大{topics.length * survey.max_per_topic}問。1問あたり5〜9秒の待ちが入るため、論点は3〜4個が目安です。
          </p>
          <button type="submit" className={btnSecondary}>
            基本を保存
          </button>
        </form>
      </Section>

      <Section title="使用するソリューション">
        <SolutionsSelector surveyId={surveyId} allSolutions={allSolutions} initialSelectedIds={activeSolutionIds} />
      </Section>

      <Section title="論点（知りたいことの道筋）">
        <TopicsEditor surveyId={surveyId} initial={topics} solutions={activeSolutions} />
      </Section>

      <Section title="最初の質問">
        <SeedPanel survey={survey} topics={topics} />
      </Section>

      <Section title="回答用URL">
        <QrPanel url={url} qrDataUrl={qr} published={survey.status === "published"} />
      </Section>

      <Section title="この調査について">
        <p className="text-sm text-ink-muted">
          回答 {counts.total} 件（完了 {counts.completed} 件）
        </p>
      </Section>
    </div>
  );
}
