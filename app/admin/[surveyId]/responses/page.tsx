import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getSurvey, listTopics } from "@/lib/repo/surveys";
import { listQA, listSessions, parseReflection } from "@/lib/repo/sessions";
import { AutoRefresh } from "../../auto-refresh";
import { btnSecondary, Section } from "../../ui";
import { SurveyNav } from "../survey-nav";

export const dynamic = "force-dynamic";

interface Agg {
  text: string;
  kind: string;
  topicId: string | null;
  counts: Map<string, number>;
  texts: string[];
  total: number;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function ResponsesPage(props: PageProps<"/admin/[surveyId]/responses">) {
  await connection();
  const { surveyId } = await props.params;
  const survey = await getSurvey(surveyId);
  if (!survey) notFound();
  const [topics, sessionList] = await Promise.all([listTopics(surveyId), listSessions(surveyId)]);
  const topicLabel = new Map(topics.map((t) => [t.id, t.label]));
  const sessions = await Promise.all(
    sessionList.map(async (s) => ({
      ...s,
      qa: await listQA(s.id),
      reflection: parseReflection(s.reflection),
    })),
  );

  const agg = new Map<string, Agg>();
  for (const s of sessions) {
    for (const { question, answer } of s.qa) {
      if (!answer) continue;
      const key = question.text;
      const a =
        agg.get(key) ??
        ({ text: question.text, kind: question.kind, topicId: question.topic_id, counts: new Map(), texts: [], total: 0 } as Agg);
      a.total += 1;
      if (question.kind === "text") a.texts.push(answer.value);
      else {
        a.counts.set(answer.value, (a.counts.get(answer.value) ?? 0) + 1);
        if (answer.free_text) a.texts.push(`${answer.value}: ${answer.free_text}`);
      }
      agg.set(key, a);
    }
  }
  const byTopic = new Map<string | null, Agg[]>();
  for (const a of agg.values()) {
    const list = byTopic.get(a.topicId) ?? [];
    list.push(a);
    byTopic.set(a.topicId, list);
  }

  const completed = sessions.filter((s) => s.status === "completed");
  const agree = completed.filter((s) => s.reflection_feedback === "agree").length;
  const disagree = completed.filter((s) => s.reflection_feedback === "disagree").length;

  return (
    <div className="space-y-10">
      <AutoRefresh seconds={5} />
      <SurveyNav survey={survey} current="responses" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="開始" value={sessions.length} />
        <Stat label="完了" value={completed.length} />
        <Stat label="「そうかも」" value={agree} />
        <Stat label="「ちがう気がする」" value={disagree} />
      </div>

      <Section
        title="質問ごとの集計"
        aside={
          <a href={`/api/admin/surveys/${surveyId}/export`} className={`${btnSecondary} text-sm`}>
            CSVを書き出す
          </a>
        }
      >
        {agg.size === 0 ? (
          <p className="text-sm text-ink-muted">まだ回答がありません。</p>
        ) : (
          <div className="space-y-8">
            {[...topics.map((t) => t.id as string | null), null].map((tid) => {
              const list = byTopic.get(tid);
              if (!list || list.length === 0) return null;
              return (
                <div key={tid ?? "none"} className="space-y-4">
                  <h3 className="text-sm text-ink-muted">{tid ? topicLabel.get(tid) : "論点なし"}</h3>
                  {list
                    .sort((a, b) => b.total - a.total)
                    .map((a) => (
                      <div key={a.text} className="rounded-md border border-rule bg-paper-2 p-4">
                        <p className="font-serif text-ink">{a.text}</p>
                        <p className="text-xs text-ink-faint mt-1">{a.total}件</p>
                        {a.counts.size > 0 && (
                          <ul className="mt-3 space-y-1.5">
                            {[...a.counts.entries()]
                              .sort((x, y) => y[1] - x[1])
                              .map(([v, n]) => (
                                <li key={v} className="flex items-center gap-3 text-sm">
                                  <span className="w-40 shrink-0 truncate text-ink">{v}</span>
                                  <span className="flex-1 h-2 rounded-full bg-paper-3 overflow-hidden">
                                    <span className="block h-full bg-accent" style={{ width: `${Math.round((n / a.total) * 100)}%` }} />
                                  </span>
                                  <span className="w-8 text-right tabular-nums text-ink-muted">{n}</span>
                                </li>
                              ))}
                          </ul>
                        )}
                        {a.texts.length > 0 && (
                          <ul className="mt-3 space-y-1 text-sm text-ink-muted">
                            {a.texts.map((t, i) => (
                              <li key={i}>「{t}」</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="回答者ごと">
        {sessions.length === 0 ? (
          <p className="text-sm text-ink-muted">まだ回答がありません。</p>
        ) : (
          <ul className="border-y border-rule divide-y divide-rule">
            {sessions.map((s, i) => (
              <li key={s.id}>
                <details className="group">
                  <summary className="cursor-pointer min-h-12 flex items-center gap-4 text-sm list-none">
                    <span className="text-ink-faint tabular-nums w-8">#{sessions.length - i}</span>
                    <span className="text-ink-muted tabular-nums">{fmt(s.started_at)}</span>
                    <span className="text-ink">
                      {s.status === "completed" ? (s.ended_early ? "途中で終了" : "完了") : "回答中"}
                    </span>
                    <span className="text-ink-muted">{s.qa.filter((x) => x.answer).length}問</span>
                    {s.external_id && (
                      <span
                        title={s.external_id}
                        className="max-w-40 truncate rounded-sm bg-paper-3 px-2 py-0.5 font-mono text-xs text-ink-muted"
                      >
                        {s.external_id}
                      </span>
                    )}
                    {s.reflection_feedback && (
                      <span className="text-xs rounded-sm bg-paper-3 px-2 py-0.5 text-ink-muted">
                        {s.reflection_feedback === "agree" ? "そうかも" : "ちがう気がする"}
                      </span>
                    )}
                    {s.reflection && s.reflection.recommended_solutions.length > 0 && (
                      <span className="text-xs rounded-sm bg-accent-soft px-2 py-0.5 text-accent">
                        推奨: {s.reflection.recommended_solutions.map((r) => r.name).join("、")}
                      </span>
                    )}
                    <span className="ml-auto text-ink-faint group-open:rotate-90 transition-transform duration-(--dur-fast)">›</span>
                  </summary>
                  <div className="pb-5 pl-12 space-y-3">
                    {s.external_id && (
                      <p className="text-sm">
                        <span className="text-ink-faint">来場者ID </span>
                        <span className="font-mono text-ink break-all">{s.external_id}</span>
                      </p>
                    )}
                    {s.qa.map(({ question, answer }) => (
                      <div key={question.id} className="text-sm">
                        <p className="text-ink-muted">
                          {question.lead && <span className="text-ink-faint">{question.lead} </span>}
                          {question.text}
                          <span className="ml-2 text-xs text-ink-faint">
                            {question.topic_id ? topicLabel.get(question.topic_id) : ""} · {question.source}
                            {question.latency_ms ? ` · ${(question.latency_ms / 1000).toFixed(1)}s` : ""}
                          </span>
                        </p>
                        <p className="text-ink">
                          {answer ? (
                            <>
                              {answer.value}
                              {answer.free_text && <span className="text-ink-muted">（{answer.free_text}）</span>}
                            </>
                          ) : (
                            <span className="text-ink-faint">未回答</span>
                          )}
                        </p>
                      </div>
                    ))}
                    {s.reflection && (
                      <div className="mt-2 rounded-md bg-paper-3 p-3 text-sm space-y-1">
                        <p className="text-xs text-ink-faint">振り返り</p>
                        {s.reflection.heard.map((h, j) => (
                          <p key={j} className="text-ink-muted">
                            {h}
                          </p>
                        ))}
                        {s.reflection.insight && <p className="font-serif text-ink">{s.reflection.insight}</p>}
                        {s.reflection.recommended_solutions.map((r, j) => (
                          <p key={j} className="text-accent">
                            → {r.name}: {r.reason}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-rule bg-paper-2 px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-serif text-2xl text-ink tabular-nums">{value}</p>
    </div>
  );
}
