"use client";

import { useState, useTransition } from "react";
import { deleteSurveyAction, setStatusAction } from "../actions";
import { btnDanger, btnPrimary, btnSecondary, btnText } from "../ui";
import type { Survey } from "@/lib/types";

export function PublishControls({
  survey,
  topicCount,
  hasSeed,
}: {
  survey: Survey;
  topicCount: number;
  hasSeed: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(async () => {
      try {
        await fn();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const canPublish = topicCount > 0 && hasSeed;

  return (
    <div className="rounded-md border border-rule bg-paper-2 px-5 py-4 flex flex-wrap items-center gap-4">
      <div className="flex-1 min-w-48 text-sm text-ink-muted">
        {survey.status === "draft" &&
          (canPublish
            ? "公開すると回答を受け付けます。"
            : `公開には${topicCount === 0 ? "論点" : "最初の質問"}が必要です。`)}
        {survey.status === "published" && "回答を受け付けています。設計の変更は次の回答者から反映されます。"}
        {survey.status === "closed" && "受付を終了しています。"}
      </div>
      <div className="flex items-center gap-3">
        {survey.status !== "published" && (
          <button
            type="button"
            disabled={pending || !canPublish}
            onClick={() => run(() => setStatusAction(survey.id, "published"))}
            className={btnPrimary}
          >
            {survey.status === "closed" ? "再公開" : "公開する"}
          </button>
        )}
        {survey.status === "published" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setStatusAction(survey.id, "closed"))}
            className={btnSecondary}
          >
            受付を終了
          </button>
        )}
        {survey.status === "closed" && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setStatusAction(survey.id, "draft"))}
            className={btnText}
          >
            下書きに戻す
          </button>
        )}
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-sm">
            <span className="text-ink-muted">回答ごと削除します。</span>
            <button type="button" disabled={pending} onClick={() => run(() => deleteSurveyAction(survey.id))} className={btnDanger}>
              削除する
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className={btnText}>
              やめる
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className={`${btnText} text-sm`}>
            削除
          </button>
        )}
      </div>
      {error && <p className="w-full text-sm text-danger">{error}</p>}
    </div>
  );
}
