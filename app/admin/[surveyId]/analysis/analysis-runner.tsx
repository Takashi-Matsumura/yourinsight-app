"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { readSse } from "@/lib/sse-client";
import { btnPrimary } from "../../ui";

type Status = "idle" | "queued" | "generating" | "done" | "error";

export function AnalysisRunner({
  surveyId,
  completed,
  lastRun,
}: {
  surveyId: string;
  completed: number;
  lastRun: { at: string; sessions: number } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("queued");
    setError(null);
    try {
      const res = await fetch(`/api/admin/surveys/${surveyId}/analysis`, { method: "POST", signal: ac.signal });
      await readSse(res, ({ event, data }) => {
        if (event === "queued") setPosition((data as { position: number }).position);
        else if (event === "generating") {
          setStatus("generating");
          setPosition(null);
        } else if (event === "analysis") {
          setStatus("done");
          router.refresh();
        } else if (event === "error") {
          setError((data as { message: string }).message);
          setStatus("error");
        }
      });
    } catch (e) {
      if (ac.signal.aborted) return;
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  };

  const busy = status === "queued" || status === "generating";

  return (
    <div className="rounded-md border border-rule bg-paper-2 px-5 py-4 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-48 text-sm text-ink-muted">
        {lastRun ? (
          <>
            前回: {new Date(lastRun.at).toLocaleString("ja-JP")}（{lastRun.sessions}人分）。現在の完了数は {completed} 人。
          </>
        ) : (
          <>完了した回答 {completed} 人分から、回答者が直接は述べていない構造的な課題を推論します。</>
        )}
        {busy && (
          <p className="breathe mt-1" aria-live="polite">
            {status === "queued" && position !== null && position > 1
              ? `順番待ち（あと${position - 1}件）`
              : "回答を読み込んで、課題を推論しています（1〜2分かかります）"}
          </p>
        )}
        {error && <p className="mt-1 text-danger">{error}</p>}
      </div>
      <button type="button" onClick={run} disabled={busy || completed === 0} className={btnPrimary}>
        {busy ? "分析しています…" : lastRun ? "もう一度分析する" : "分析する"}
      </button>
    </div>
  );
}
