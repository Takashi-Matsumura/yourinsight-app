import { notFound } from "next/navigation";
import { connection } from "next/server";
import { countSessions, getSurvey, listTopics } from "@/lib/repo/surveys";
import { getSurveySolutions } from "@/lib/repo/solutions";
import { aggregateSolutionFit } from "@/lib/repo/sessions";
import { latestAnalysis } from "@/lib/repo/analyses";
import { Section } from "../../ui";
import { SurveyNav } from "../survey-nav";
import { AnalysisRunner } from "./analysis-runner";

export const dynamic = "force-dynamic";

const CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "確信度 高", cls: "bg-accent-soft text-accent" },
  medium: { label: "確信度 中", cls: "bg-paper-3 text-ink-muted" },
  low: { label: "確信度 低", cls: "border border-rule text-ink-faint" },
};

export default async function AnalysisPage(props: PageProps<"/admin/[surveyId]/analysis">) {
  await connection();
  const { surveyId } = await props.params;
  const survey = getSurvey(surveyId);
  if (!survey) notFound();
  const topics = listTopics(surveyId);
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const counts = countSessions(surveyId);
  const analysis = latestAnalysis(surveyId);
  const solutions = getSurveySolutions(surveyId);
  const solutionFit = aggregateSolutionFit(surveyId, solutions);

  return (
    <div className="space-y-10">
      <SurveyNav survey={survey} current="analysis" />

      <AnalysisRunner
        surveyId={surveyId}
        completed={counts.completed}
        lastRun={analysis ? { at: analysis.created_at, sessions: analysis.session_count } : null}
      />

      {solutions.length > 0 && (
        <Section title="ソリューション別の手応え">
          <p className="mb-4 text-xs text-ink-faint">回答から自動集計。分析を実行しなくても常に最新です。</p>
          <div className="space-y-4">
            {solutionFit.map(({ solution, count, evidence }) => (
              <div key={solution.id} className="rounded-md border border-rule bg-paper-2 p-4">
                <div className="flex items-baseline justify-between">
                  <p className="font-serif text-ink">{solution.name}</p>
                  <p className="text-sm text-ink-muted tabular-nums">{count}件</p>
                </div>
                {evidence.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-rule pl-3">
                    {evidence.map((e, j) => (
                      <li key={j} className="text-sm text-ink-muted">
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {analysis && (
        <>
          <Section title="全体像">
            <p className="text-ink leading-relaxed max-w-prose">{analysis.content.summary}</p>
          </Section>

          <Section title="見えてきた課題">
            <ol className="space-y-4">
              {analysis.content.issues.map((issue, i) => {
                const c = CONF[issue.confidence] ?? CONF.low;
                return (
                  <li key={i} className="rounded-md border border-rule bg-paper-2 p-5 space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-serif text-lg text-ink">{issue.title}</h3>
                      <span className={`text-xs rounded-sm px-2 py-0.5 ${c.cls}`}>{c.label}</span>
                      {issue.topic_id && topicLabel.get(issue.topic_id) && (
                        <span className="text-xs text-ink-faint">{topicLabel.get(issue.topic_id)}</span>
                      )}
                    </div>
                    <p className="text-ink leading-relaxed">{issue.description}</p>
                    <ul className="space-y-1 border-l-2 border-rule pl-3">
                      {issue.evidence.map((e, j) => (
                        <li key={j} className="text-sm text-ink-muted">
                          {e}
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          </Section>

          <Section title="回答者が「そうかも」と受け取った気づき">
            {analysis.content.confirmed_insights.length === 0 ? (
              <p className="text-sm text-ink-muted">まだ該当する反応がありません。</p>
            ) : (
              <ul className="space-y-2">
                {analysis.content.confirmed_insights.map((s, i) => (
                  <li key={i} className="font-serif text-ink leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {analysis.content.unaddressed_needs.length > 0 && (
            <Section title="拾えていないニーズ">
              <p className="mb-3 text-xs text-ink-faint">
                今のソリューションカタログでは対応できていない、繰り返し見られるパターンです。
              </p>
              <ul className="space-y-2">
                {analysis.content.unaddressed_needs.map((s, i) => (
                  <li key={i} className="text-ink leading-relaxed">
                    {s}
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
