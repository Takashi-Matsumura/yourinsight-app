"use client";

import { useState, useTransition } from "react";
import { saveTopicsAction } from "../actions";
import { btnSecondary, btnText, inputCls, textareaCls } from "../ui";
import type { QuestionKind, Solution, Topic } from "@/lib/types";

interface Row {
  id?: string;
  label: string;
  description: string;
  priority: number;
  targetSolutionId: string | null;
  fbText: string;
  fbKind: QuestionKind;
  fbOptions: string;
}

function toRow(t: Topic): Row {
  return {
    id: t.id,
    label: t.label,
    description: t.description,
    priority: t.priority,
    targetSolutionId: t.target_solution_id,
    fbText: t.fallback_question?.text ?? "",
    fbKind: t.fallback_question?.kind ?? "single",
    fbOptions: (t.fallback_question?.options ?? []).join("、"),
  };
}

const EMPTY: Row = {
  label: "",
  description: "",
  priority: 2,
  targetSolutionId: null,
  fbText: "",
  fbKind: "single",
  fbOptions: "",
};

export function TopicsEditor({
  surveyId,
  initial,
  solutions,
}: {
  surveyId: string;
  initial: Topic[];
  solutions: Solution[];
}) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows((rs) => rs.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const copy = [...rs];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const save = () => {
    setSaved(false);
    setError(null);
    start(async () => {
      try {
        await saveTopicsAction(
          surveyId,
          rows.map((r) => ({
            id: r.id,
            label: r.label,
            description: r.description,
            priority: r.priority,
            target_solution_id: r.targetSolutionId,
            fallback_question: r.fbText.trim()
              ? {
                  lead: "",
                  text: r.fbText,
                  kind: r.fbKind,
                  options: r.fbKind === "text" ? [] : r.fbOptions.split(/[、,]/).map((s) => s.trim()).filter(Boolean),
                  topic_id: "",
                  satisfied_topic_ids: [],
                }
              : null,
          })),
        );
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="rounded-md border border-rule bg-paper-2 p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-ink-faint tabular-nums text-sm w-5">T{i + 1}</span>
              <input
                value={r.label}
                onChange={(e) => update(i, { label: e.target.value })}
                placeholder="論点の名前（例: 業務の属人化）"
                className={`${inputCls} flex-1`}
                maxLength={30}
              />
              <select
                value={r.priority}
                onChange={(e) => update(i, { priority: Number(e.target.value) })}
                className={`${inputCls} w-auto`}
                aria-label="優先度"
              >
                <option value={1}>優先度 1</option>
                <option value={2}>優先度 2</option>
                <option value={3}>優先度 3</option>
              </select>
              {solutions.length > 0 && (
                <select
                  value={r.targetSolutionId ?? ""}
                  onChange={(e) => update(i, { targetSolutionId: e.target.value || null })}
                  className={`${inputCls} w-auto`}
                  aria-label="対象ソリューション"
                >
                  <option value="">紐付けなし</option>
                  {solutions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
              <button type="button" onClick={() => move(i, -1)} className={btnText} aria-label="上へ">
                ↑
              </button>
              <button type="button" onClick={() => move(i, 1)} className={btnText} aria-label="下へ">
                ↓
              </button>
              <button type="button" onClick={() => remove(i)} className={`${btnText} text-danger`}>
                削除
              </button>
            </div>
            <textarea
              value={r.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="この論点で何を把握したいか（1文）"
              rows={2}
              className={textareaCls}
              maxLength={200}
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-ink-muted min-h-8 inline-flex items-center">
                予備質問{r.fbText ? "" : "（未設定）"}
              </summary>
              <div className="mt-2 space-y-2 pl-1">
                <p className="text-xs text-ink-faint">AI生成が失敗した時に出す、文脈に依存しない質問。</p>
                <input
                  value={r.fbText}
                  onChange={(e) => update(i, { fbText: e.target.value })}
                  placeholder="質問文"
                  className={inputCls}
                  maxLength={80}
                />
                <div className="flex gap-2">
                  <select
                    value={r.fbKind}
                    onChange={(e) => update(i, { fbKind: e.target.value as QuestionKind })}
                    className={`${inputCls} w-auto`}
                  >
                    <option value="single">選択式</option>
                    <option value="scale">5段階</option>
                    <option value="text">自由記述</option>
                  </select>
                  {r.fbKind !== "text" && (
                    <input
                      value={r.fbOptions}
                      onChange={(e) => update(i, { fbOptions: e.target.value })}
                      placeholder={r.fbKind === "scale" ? "左端ラベル、右端ラベル" : "選択肢を「、」で区切る"}
                      className={`${inputCls} flex-1`}
                    />
                  )}
                </div>
              </div>
            </details>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-4">
        <button type="button" onClick={() => setRows((rs) => [...rs, { ...EMPTY }])} className={btnText}>
          ＋ 論点を追加
        </button>
        <button type="button" onClick={save} disabled={pending} className={btnSecondary}>
          {pending ? "保存しています…" : "論点を保存"}
        </button>
        {saved && <span className="text-sm text-ink-muted">保存しました</span>}
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>
    </div>
  );
}
