"use client";
/// <reference types="react/canary" />

import Link from "next/link";
import { startTransition, useEffect, useRef, useState, ViewTransition } from "react";
import { readSse } from "@/lib/sse-client";
import { ESCAPE_OPTION, type Light, type PublicQuestion, type QuestionPayload, type RunnerInitial } from "@/lib/survey/public";
import type { Reflection, ReflectionFeedback, RecommendedSolution } from "@/lib/types";
import { sessionStorageKey } from "../resume-link";

type WaitStatus = "sending" | "queued" | "generating" | "streaming";

interface Answered {
  q: PublicQuestion;
  value: string;
  freeText?: string;
}

type Phase =
  | { kind: "question"; q: PublicQuestion }
  | {
      kind: "waiting";
      answered: Answered | null;
      status: WaitStatus;
      position: number | null;
      lead: string;
      text: string;
      startedAt: number;
    }
  | {
      kind: "reflecting";
      status: WaitStatus;
      position: number | null;
      partial: Reflection;
      startedAt: number;
    }
  | { kind: "done"; reflection: Reflection | null; feedback: ReflectionFeedback | null }
  | { kind: "error"; message: string; retry: (() => void) | null };

interface AnswerBody {
  questionId: string;
  value: string;
  freeText?: string | null;
}

const SCALE_VALUES = ["1", "2", "3", "4", "5"];

function vibrate() {
  try {
    navigator.vibrate?.(10);
  } catch {
    // unsupported
  }
}

function useElapsed(startedAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt]);
  return startedAt === null ? 0 : now - startedAt;
}

export function SurveyRunner({ initial }: { initial: RunnerInitial }) {
  const { surveyId, sessionId } = initial;
  const [lights, setLights] = useState<Light[]>(initial.lights);
  const [remaining, setRemaining] = useState(initial.remaining);
  const [phase, setPhase] = useState<Phase>(() => {
    if (initial.status === "completed") {
      return { kind: "done", reflection: initial.reflection, feedback: initial.feedback };
    }
    if (initial.pending) return { kind: "question", q: initial.pending };
    return { kind: "waiting", answered: null, status: "sending", position: null, lead: "", text: "", startedAt: Date.now() };
  });
  const [confirmEnd, setConfirmEnd] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    try {
      if (phase.kind === "done") localStorage.removeItem(sessionStorageKey(surveyId));
      else localStorage.setItem(sessionStorageKey(surveyId), sessionId);
    } catch {
      // storage unavailable
    }
  }, [phase.kind, surveyId, sessionId]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (initial.status !== "in_progress" || initial.pending) return;
    const ac = new AbortController();
    abortRef.current = ac;
    runNext(null, null, ac);
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPayload(p: QuestionPayload) {
    startTransition(() => {
      setLights(p.lights);
      setRemaining(p.remaining);
      setPhase({ kind: "question", q: p.question });
    });
  }

  function beginReflection(endEarly: boolean) {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setConfirmEnd(false);
      startTransition(() => {
        setLights((ls) => ls.map((l) => ({ ...l, satisfied: true })));
        setPhase({
          kind: "reflecting",
          status: "sending",
          position: null,
          partial: { heard: [], insight: "", thanks: "", recommended_solutions: [] },
          startedAt: Date.now(),
        });
      });
      (async () => {
        try {
          const res = await fetch(`/api/session/${sessionId}/reflection`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endEarly }),
            signal: ac.signal,
          });
          await readSse(res, ({ event, data }) => {
            if (ac.signal.aborted) return;
            if (event === "queued") {
              const { position } = data as { position: number };
              setPhase((p) => (p.kind === "reflecting" ? { ...p, status: "queued", position } : p));
            } else if (event === "generating") {
              setPhase((p) => (p.kind === "reflecting" ? { ...p, status: "generating", position: null } : p));
            } else if (event === "token") {
              const partial = data as Reflection;
              setPhase((p) => (p.kind === "reflecting" ? { ...p, status: "streaming", partial } : p));
            } else if (event === "reflection") {
              startTransition(() => setPhase({ kind: "done", reflection: data as Reflection, feedback: null }));
            } else if (event === "error") {
              setPhase({ kind: "error", message: "振り返りを作れませんでした", retry: () => beginReflection(endEarly) });
            }
          });
        } catch {
          if (ac.signal.aborted) return;
          setPhase({ kind: "error", message: "接続が途切れました", retry: () => beginReflection(endEarly) });
        }
      })();
  }

  function requestNext(body: AnswerBody | null, answered: Answered | null) {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      startTransition(() => {
        setPhase({
          kind: "waiting",
          answered,
          status: "sending",
          position: null,
          lead: "",
          text: "",
          startedAt: Date.now(),
        });
      });
      runNext(body, answered, ac);
  }

  function runNext(body: AnswerBody | null, answered: Answered | null, ac: AbortController) {
      (async () => {
        try {
          const res = await fetch(`/api/session/${sessionId}/next`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body ?? {}),
            signal: ac.signal,
          });
          await readSse(res, ({ event, data }) => {
            if (ac.signal.aborted) return;
            if (event === "queued") {
              const { position } = data as { position: number };
              setPhase((p) => (p.kind === "waiting" ? { ...p, status: "queued", position } : p));
            } else if (event === "generating") {
              setPhase((p) => (p.kind === "waiting" ? { ...p, status: "generating", position: null } : p));
            } else if (event === "token") {
              const { lead, text } = data as { lead: string; text: string };
              setPhase((p) => (p.kind === "waiting" ? { ...p, status: "streaming", lead, text } : p));
            } else if (event === "question") {
              applyPayload(data as QuestionPayload);
            } else if (event === "complete") {
              beginReflection(false);
            } else if (event === "error") {
              const { message } = data as { message: string };
              setPhase({ kind: "error", message, retry: () => requestNext(body, answered) });
            }
          });
        } catch {
          if (ac.signal.aborted) return;
          setPhase({ kind: "error", message: "接続が途切れました", retry: () => requestNext(body, answered) });
        }
      })();
  }

  function answer(q: PublicQuestion, value: string, freeText?: string) {
    vibrate();
    requestNext({ questionId: q.id, value, freeText: freeText ?? null }, { q, value, freeText });
  }

  function undo() {
    if (phase.kind !== "waiting" || !phase.answered) return;
    const q = phase.answered.q;
    abortRef.current?.abort();
    startTransition(() => setPhase({ kind: "question", q }));
  }

  const canEnd = phase.kind === "question" || phase.kind === "waiting";

  return (
    <main className="flex flex-1 flex-col w-full max-w-md mx-auto px-6 pt-safe pb-safe">
      <header className="flex items-center justify-between py-3">
        <Lights lights={lights} />
        <p className="text-xs text-ink-muted tabular-nums">
          {phase.kind === "done" || phase.kind === "reflecting"
            ? ""
            : remaining === 0
              ? "まもなく終わります"
              : `あと${remaining}〜${remaining + 1}問ほど`}
        </p>
      </header>

      <section className="flex-1 flex flex-col py-6">
        <ViewTransition key={phaseKey(phase)} enter="card-in" exit="card-out" default="none">
          <div className="flex-1 flex flex-col">
            {phase.kind === "question" && <QuestionView q={phase.q} onAnswer={answer} />}
            {phase.kind === "waiting" && <WaitingView phase={phase} onUndo={undo} />}
            {phase.kind === "reflecting" && <ReflectingView phase={phase} />}
            {phase.kind === "done" && (
              <DoneView
                reflection={phase.reflection}
                feedback={phase.feedback}
                surveyId={surveyId}
                ctaText={initial.ctaText}
                onFeedback={async (fb) => {
                  vibrate();
                  setPhase((p) => (p.kind === "done" ? { ...p, feedback: fb } : p));
                  await fetch(`/api/session/${sessionId}/feedback`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ feedback: fb }),
                  }).catch(() => undefined);
                }}
              />
            )}
            {phase.kind === "error" && (
              <div className="flex-1 flex flex-col justify-center gap-4">
                <p className="font-serif text-xl text-ink">{phase.message}</p>
                {phase.retry && (
                  <button type="button" onClick={phase.retry} className={primaryBtn}>
                    もう一度
                  </button>
                )}
              </div>
            )}
          </div>
        </ViewTransition>
      </section>

      {canEnd && (
        <footer className="py-3 text-center text-sm min-h-12">
          {confirmEnd ? (
            <div className="flex items-center justify-center gap-6">
              <span className="text-ink-muted">ここで終えますか？</span>
              <button type="button" onClick={() => beginReflection(true)} className={textBtn}>
                終える
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className={textBtn}>
                続ける
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmEnd(true)} className={`${textBtn} text-ink-faint`}>
              ここまでで終える
            </button>
          )}
        </footer>
      )}
    </main>
  );
}

function phaseKey(p: Phase): string {
  switch (p.kind) {
    case "question":
      return `q:${p.q.id}`;
    case "waiting":
      return `w:${p.answered?.q.id ?? "init"}`;
    default:
      return p.kind;
  }
}

const primaryBtn =
  "w-full min-h-14 rounded-md bg-accent text-accent-ink text-[17px] font-medium transition-[filter,transform,opacity] duration-(--dur-fast) ease-(--ease-out) hover:brightness-110 active:translate-y-px disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const textBtn =
  "min-h-11 px-2 underline underline-offset-4 decoration-rule text-ink-muted hover:text-ink hover:decoration-ink-muted transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-sm";

function Lights({ lights }: { lights: Light[] }) {
  return (
    <ol className="flex items-center gap-2" aria-label="論点の進み具合">
      {lights.map((l, i) => (
        <li
          key={i}
          aria-label={`${l.label}: ${l.satisfied ? "聞き終えた" : "まだ"}`}
          className={`size-2.5 rounded-full transition-colors duration-(--dur-slow) ease-(--ease-out) ${
            l.satisfied ? "bg-accent" : "border border-ink-faint"
          }`}
        />
      ))}
    </ol>
  );
}

function QuestionView({
  q,
  onAnswer,
}: {
  q: PublicQuestion;
  onAnswer: (q: PublicQuestion, value: string, freeText?: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [escapeOpen, setEscapeOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const [text, setText] = useState("");

  const choose = (value: string) => {
    setSelected(value);
    onAnswer(q, value);
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col justify-end pb-8">
        {q.lead && <p className="mb-3 text-[15px] text-ink-muted leading-relaxed">{q.lead}</p>}
        <h2 className="font-serif text-[1.6rem] leading-[1.5] text-ink">{q.text}</h2>
      </div>

      {q.kind === "single" && (
        <div>
          <ul className="border-y border-rule">
            {[...q.options, ESCAPE_OPTION].map((opt, i) => {
              const isEscape = opt === ESCAPE_OPTION;
              const isSelected = selected === opt;
              return (
                <li key={opt} className="border-t border-rule first:border-t-0">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    style={{ animationDelay: `${i * 40}ms` }}
                    onClick={() => {
                      if (isEscape) {
                        setSelected(opt);
                        setEscapeOpen(true);
                      } else {
                        choose(opt);
                      }
                    }}
                    className={`rise w-full min-h-14 px-3 py-3.5 flex items-center gap-3 text-left text-[17px] leading-snug transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-paper-3 active:bg-paper-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus ${
                      isSelected ? "bg-accent-soft text-accent" : "text-ink"
                    } ${isEscape ? "text-ink-muted" : ""}`}
                  >
                    <span
                      aria-hidden
                      className={`size-4 shrink-0 rounded-full border transition-colors duration-(--dur-fast) ${
                        isSelected ? "border-accent bg-accent" : "border-ink-faint"
                      }`}
                    />
                    <span>{opt}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          {escapeOpen && (
            <div className="rise mt-4 space-y-3">
              <label className="block text-sm text-ink-muted">
                よければ、ひとことで
                <input
                  autoFocus
                  value={freeText}
                  onChange={(e) => setFreeText(e.target.value)}
                  maxLength={200}
                  className="mt-1.5 w-full min-h-12 rounded-md border border-rule bg-paper-2 px-3 text-ink placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
                  placeholder="任意"
                />
              </label>
              <button type="button" onClick={() => onAnswer(q, ESCAPE_OPTION, freeText)} className={primaryBtn}>
                次へ
              </button>
            </div>
          )}
        </div>
      )}

      {q.kind === "scale" && (
        <div className="rise">
          <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={q.text}>
            {SCALE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={selected === v}
                onClick={() => choose(v)}
                className={`min-h-14 rounded-md border text-lg tabular-nums transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-paper-3 active:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${
                  selected === v ? "border-accent bg-accent-soft text-accent" : "border-rule text-ink"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-ink-muted">
            <span>{q.options[0] ?? ""}</span>
            <span>{q.options[1] ?? ""}</span>
          </div>
        </div>
      )}

      {q.kind === "text" && (
        <form
          className="rise space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onAnswer(q, text.trim());
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={500}
            placeholder="短くて大丈夫です"
            className="w-full rounded-md border border-rule bg-paper-2 px-3 py-3 text-ink leading-relaxed placeholder:text-ink-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus"
          />
          <button type="submit" disabled={!text.trim()} className={primaryBtn}>
            次へ
          </button>
        </form>
      )}
    </div>
  );
}

function statusText(status: WaitStatus, position: number | null, elapsed: number): string {
  if (status === "queued" && position !== null) {
    return position <= 1 ? "もうすぐ順番です" : `前の方の回答を処理しています（あと${position - 1}人）`;
  }
  if (elapsed < 2000) return "読んでいます";
  if (elapsed < 15000) return "次に聞くことを考えています";
  return "もう少しだけお待ちください";
}

function WaitingView({ phase, onUndo }: { phase: Phase & { kind: "waiting" }; onUndo: () => void }) {
  const elapsed = useElapsed(phase.startedAt);
  const value = phase.answered?.value ?? "";
  const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value;
  const streaming = phase.status === "streaming" && (phase.lead || phase.text);

  return (
    <div className="flex-1 flex flex-col">
      {phase.answered && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-paper-3 px-4 py-3">
          <p className="text-sm text-ink-muted">
            「<span className="text-ink">{shown}</span>」と答えました
          </p>
          <button type="button" onClick={onUndo} className={`${textBtn} shrink-0 text-sm`}>
            取り消す
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-end pb-8">
        {streaming ? (
          <>
            {phase.lead && <p className="mb-3 text-[15px] text-ink-muted leading-relaxed">{phase.lead}</p>}
            <h2 className={`font-serif text-[1.6rem] leading-[1.5] text-ink ${phase.text ? "caret-blink" : ""}`}>
              {phase.text}
            </h2>
          </>
        ) : (
          <p className="breathe text-[15px] text-ink-muted" aria-live="polite">
            {statusText(phase.status, phase.position, elapsed)}
          </p>
        )}
      </div>
      <div className="min-h-14" aria-hidden />
    </div>
  );
}

function ReflectingView({ phase }: { phase: Phase & { kind: "reflecting" } }) {
  const elapsed = useElapsed(phase.startedAt);
  const { heard, insight, thanks } = phase.partial;
  const hasContent = heard.length > 0 || insight;

  return (
    <div className="flex-1 flex flex-col justify-center">
      {!hasContent ? (
        <p className="breathe text-[15px] text-ink-muted" aria-live="polite">
          {phase.status === "queued" && phase.position !== null && phase.position > 1
            ? `前の方の回答を処理しています（あと${phase.position - 1}人）`
            : elapsed < 3000
              ? "ここまでの話を、読み返しています"
              : "あなたの回答から見えてきたことを、まとめています"}
        </p>
      ) : (
        <ReflectionText heard={heard} insight={insight} thanks={thanks} streaming />
      )}
    </div>
  );
}

function ReflectionText({
  heard,
  insight,
  thanks,
  streaming,
}: {
  heard: string[];
  insight: string;
  thanks: string;
  streaming: boolean;
}) {
  return (
    <div className="space-y-8">
      {heard.length > 0 && (
        <div>
          <p className="text-xs text-ink-muted mb-3">あなたが話してくれたこと</p>
          <ul className="space-y-2">
            {heard.map((h, i) => (
              <li key={i} className="rise font-serif text-lg leading-relaxed text-ink" style={{ animationDelay: `${i * 80}ms` }}>
                {h}
              </li>
            ))}
          </ul>
        </div>
      )}
      {insight && (
        <p className={`rise font-serif text-[1.35rem] leading-[1.7] text-ink ${streaming && !thanks ? "caret-blink" : ""}`}>
          {insight}
        </p>
      )}
      {thanks && <p className="rise text-[15px] text-ink-muted">{thanks}</p>}
    </div>
  );
}

function SolutionGuidance({ items, ctaText }: { items: RecommendedSolution[]; ctaText: string }) {
  return (
    <div className="rise mt-10 pt-8 border-t border-rule" style={{ animationDelay: "300ms" }}>
      <p className="text-xs text-ink-muted mb-4 text-center tracking-wide">ご案内</p>
      <div className="space-y-5">
        {items.map((item, i) => (
          <div key={i}>
            <p className="font-serif text-lg text-ink">{item.name}</p>
            <p className="mt-1 text-[15px] leading-relaxed text-ink-muted">{item.reason}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-ink-muted">{ctaText}</p>
    </div>
  );
}

function DoneView({
  reflection,
  feedback,
  surveyId,
  ctaText,
  onFeedback,
}: {
  reflection: Reflection | null;
  feedback: ReflectionFeedback | null;
  surveyId: string;
  ctaText: string;
  onFeedback: (fb: ReflectionFeedback) => void;
}) {
  const heard = reflection?.heard ?? [];
  const insight = reflection?.insight ?? "";
  const thanks = reflection?.thanks ?? "ありがとうございました。";
  const recommendations = reflection?.recommended_solutions ?? [];

  return (
    <div className="flex-1 flex flex-col">
      <div className="flex-1 flex flex-col justify-center">
        <ReflectionText heard={heard} insight={insight} thanks={thanks} streaming={false} />
        {recommendations.length > 0 && <SolutionGuidance items={recommendations} ctaText={ctaText} />}
      </div>

      <div className="space-y-5 pt-8">
        {insight && (
          <div className="rise">
            {feedback === null ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onFeedback("agree")}
                  className="min-h-14 rounded-md border border-rule text-[17px] text-ink transition-colors duration-(--dur-fast) hover:bg-paper-3 active:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  そうかも
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback("disagree")}
                  className="min-h-14 rounded-md border border-rule text-[17px] text-ink transition-colors duration-(--dur-fast) hover:bg-paper-3 active:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                >
                  ちがう気がする
                </button>
              </div>
            ) : (
              <p className="text-center text-sm text-ink-muted">
                {feedback === "agree" ? "受け取りました。" : "そうですか。教えてくれて、ありがとうございます。"}
              </p>
            )}
          </div>
        )}
        <p className="text-center text-xs text-ink-faint">この画面は閉じて大丈夫です</p>
        <p className="text-center text-sm">
          <Link href={`/s/${surveyId}`} className={textBtn}>
            はじめから
          </Link>
        </p>
      </div>
    </div>
  );
}
