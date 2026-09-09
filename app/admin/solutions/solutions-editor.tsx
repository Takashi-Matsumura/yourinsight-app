"use client";

import { useState, useTransition } from "react";
import { createSolutionAction, deleteSolutionAction, updateSolutionAction } from "../actions";
import { btnPrimary, btnText, inputCls, textareaCls } from "../ui";
import type { Solution } from "@/lib/types";

interface Row {
  id?: string;
  name: string;
  pitch: string;
  description: string;
  url: string;
  saved: boolean;
}

function toRow(s: Solution): Row {
  return { id: s.id, name: s.name, pitch: s.pitch, description: s.description, url: s.url ?? "", saved: true };
}

const EMPTY: Row = { name: "", pitch: "", description: "", url: "", saved: false };

export function SolutionsEditor({ initial }: { initial: Solution[] }) {
  const [rows, setRows] = useState<Row[]>(initial.map(toRow));
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch, saved: false } : r)));

  const save = (i: number) => {
    setError(null);
    setPendingIndex(i);
    const row = rows[i];
    const input = { name: row.name, pitch: row.pitch, description: row.description, url: row.url || null };
    startTransition(async () => {
      try {
        if (row.id) {
          await updateSolutionAction(row.id, input);
          setRows((rs) => rs.map((r, j) => (j === i ? { ...r, saved: true } : r)));
        } else {
          const created = await createSolutionAction(input);
          setRows((rs) => rs.map((r, j) => (j === i ? toRow(created) : r)));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingIndex(null);
      }
    });
  };

  const remove = (i: number) => {
    const row = rows[i];
    if (!row.id) {
      setRows((rs) => rs.filter((_, j) => j !== i));
      return;
    }
    setPendingIndex(i);
    startTransition(async () => {
      try {
        await deleteSolutionAction(row.id!);
        setRows((rs) => rs.filter((_, j) => j !== i));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPendingIndex(null);
        setConfirmDelete(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {rows.map((r, i) => (
          <li key={r.id ?? `new-${i}`} className="rounded-md border border-rule bg-paper-2 p-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={r.name}
                onChange={(e) => update(i, { name: e.target.value })}
                placeholder="ソリューション名"
                className={inputCls}
                maxLength={40}
              />
              <input
                value={r.pitch}
                onChange={(e) => update(i, { pitch: e.target.value })}
                placeholder="一言（実績・売り文句。案内でそのまま引用されます）"
                className={inputCls}
                maxLength={100}
              />
            </div>
            <textarea
              value={r.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="どんな課題を解決するソリューションか（AIが質問・案内のマッチング判断に使います）"
              rows={2}
              className={textareaCls}
              maxLength={300}
            />
            <input
              value={r.url}
              onChange={(e) => update(i, { url: e.target.value })}
              placeholder="資料URL（任意）"
              className={inputCls}
            />
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => save(i)}
                disabled={pendingIndex === i || !r.name.trim()}
                className={btnPrimary}
              >
                {pendingIndex === i ? "保存しています…" : r.saved ? "保存済み" : "保存"}
              </button>
              {confirmDelete === i ? (
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-ink-muted">削除しますか？</span>
                  <button type="button" onClick={() => remove(i)} className={`${btnText} text-danger`}>
                    削除する
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className={btnText}>
                    やめる
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(i)} className={`${btnText} text-sm`}>
                  削除
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
      <button type="button" onClick={() => setRows((rs) => [...rs, { ...EMPTY }])} className={btnText}>
        ＋ ソリューションを追加
      </button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
