"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { readSse } from "@/lib/sse-client";
import { updateSeedQ1Action } from "../actions";
import { btnPrimary, btnSecondary, btnText, inputCls } from "../ui";
import { ESCAPE_OPTION } from "@/lib/survey/public";
import type { GeneratedQuestion, QuestionKind, SeedQuestions, Survey, Topic } from "@/lib/types";

interface Progress {
  step: number;
  total: number;
  label: string;
}

export function SeedPanel({ survey, topics }: { survey: Survey; topics: Topic[] }) {
  const router = useRouter();
  const seed = survey.seed_questions;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(seed?.q1.text ?? "");
  const [kind, setKind] = useState<QuestionKind>(seed?.q1.kind ?? "single");
  const [options, setOptions] = useState((seed?.q1.options ?? []).join("、"));
  const [topicId, setTopicId] = useState(seed?.q1.topic_id ?? topics[0]?.id ?? "");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  const branchCount = seed ? Object.keys(seed.q2_by_option).length : 0;
  const generating = progress !== null;

  const generate = async (keepQ1: boolean) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setError(null);
    setProgress({ step: 0, total: 1, label: "準備しています" });
    try {
      const res = await fetch(`/api/admin/surveys/${survey.id}/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepQ1 }),
        signal: ac.signal,
      });
      await readSse(res, ({ event, data }) => {
        if (event === "progress") setProgress(data as Progress);
        else if (event === "seed") {
          const s = data as SeedQuestions;
          setText(s.q1.text);
          setKind(s.q1.kind);
          setOptions(s.q1.options.join("、"));
          setTopicId(s.q1.topic_id);
          setEditing(false);
          router.refresh();
        } else if (event === "error") setError((data as { message: string }).message);
      });
    } catch (e) {
      if (!ac.signal.aborted) setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProgress(null);
    }
  };

  const saveQ1 = () => {
    setError(null);
    start(async () => {
      const q1: GeneratedQuestion = {
        lead: "",
        text,
        kind,
        options: kind === "text" ? [] : options.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
        topic_id: topicId,
        satisfied_topic_ids: [],
      };
      await updateSeedQ1Action(survey.id, q1);
      setEditing(false);
    });
  };

  if (topics.length === 0) {
    return <p className="text-sm text-ink-muted">先に論点を保存してください。</p>;
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">
        最初の質問は回答者が待たずに見られるよう、公開前に生成して保存します。選択肢ごとの2問目も同時に用意し、回答者がAIの待ちを初めて経験するのは3問目からになります。
      </p>

      {seed && !editing && (
        <figure className="rounded-md border border-rule bg-paper px-6 py-8 max-w-sm">
          <figcaption className="text-xs text-ink-faint mb-4">回答者にはこう見えます</figcaption>
          <p className="font-serif text-[1.4rem] leading-[1.5] text-ink">{seed.q1.text}</p>
          {seed.q1.kind === "single" && (
            <ul className="mt-6 border-y border-rule">
              {[...seed.q1.options, ESCAPE_OPTION].map((o) => (
                <li key={o} className="border-t border-rule first:border-t-0 min-h-12 flex items-center gap-3 px-2 text-ink">
                  <span aria-hidden className="size-3.5 rounded-full border border-ink-faint" />
                  <span className={o === ESCAPE_OPTION ? "text-ink-muted" : ""}>{o}</span>
                </li>
              ))}
            </ul>
          )}
          {seed.q1.kind === "scale" && (
            <div className="mt-6">
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="min-h-12 rounded-md border border-rule flex items-center justify-center text-ink">
                    {n}
                  </span>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-xs text-ink-muted">
                <span>{seed.q1.options[0]}</span>
                <span>{seed.q1.options[1]}</span>
              </div>
            </div>
          )}
          {seed.q1.kind === "text" && <div className="mt-6 h-24 rounded-md border border-rule bg-paper-2" />}
          <p className="mt-5 text-xs text-ink-faint">
            論点: {topics.find((t) => t.id === seed.q1.topic_id)?.label ?? "—"} ／ 2問目の分岐: {branchCount}本
            {seed.q1.kind !== "text" && branchCount === 0 && "（未生成）"}
          </p>
        </figure>
      )}

      {(editing || !seed) && (
        <div className="space-y-3 max-w-lg">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="質問文（40字以内が目安）" className={inputCls} maxLength={80} />
          <div className="flex gap-2">
            <select value={kind} onChange={(e) => setKind(e.target.value as QuestionKind)} className={`${inputCls} w-auto`}>
              <option value="single">選択式</option>
              <option value="scale">5段階</option>
              <option value="text">自由記述</option>
            </select>
            <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={`${inputCls} w-auto`} aria-label="論点">
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          {kind !== "text" && (
            <input
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              placeholder={kind === "scale" ? "左端ラベル、右端ラベル" : "選択肢を「、」で区切る（3〜5個）"}
              className={inputCls}
            />
          )}
          <p className="text-xs text-ink-faint">手で編集して保存すると、2問目の分岐は作り直しが必要になります。</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!seed && (
          <button type="button" onClick={() => generate(false)} disabled={generating} className={btnPrimary}>
            最初の質問と分岐を生成
          </button>
        )}
        {seed && !editing && (
          <>
            {seed.q1.kind !== "text" && branchCount === 0 && (
              <button type="button" onClick={() => generate(true)} disabled={generating} className={btnPrimary}>
                2問目の分岐を生成
              </button>
            )}
            <button type="button" onClick={() => generate(false)} disabled={generating} className={btnSecondary}>
              最初の質問を作り直す
            </button>
            <button type="button" onClick={() => setEditing(true)} disabled={generating} className={btnText}>
              手で編集
            </button>
          </>
        )}
        {(editing || !seed) && (
          <>
            <button type="button" onClick={saveQ1} disabled={pending || !text.trim() || generating} className={btnSecondary}>
              {pending ? "保存しています…" : "この質問を保存"}
            </button>
            {seed && (
              <button type="button" onClick={() => setEditing(false)} className={btnText}>
                やめる
              </button>
            )}
          </>
        )}
      </div>

      {progress && (
        <div className="rise text-sm text-ink-muted" aria-live="polite">
          <p className="breathe">
            {progress.label}
            {progress.total > 1 && (
              <span className="tabular-nums ml-2">
                {Math.min(progress.step, progress.total)} / {progress.total}
              </span>
            )}
          </p>
          <div className="mt-2 h-1 w-full max-w-sm rounded-full bg-paper-3 overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-(--dur-slow) ease-(--ease-out)"
              style={{ width: `${Math.round((Math.min(progress.step, progress.total) / Math.max(1, progress.total)) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
