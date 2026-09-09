"use client";

import { useState, useTransition } from "react";
import { setSurveySolutionsAction } from "../actions";
import { btnSecondary } from "../ui";
import type { Solution } from "@/lib/types";

export function SolutionsSelector({
  surveyId,
  allSolutions,
  initialSelectedIds,
}: {
  surveyId: string;
  allSolutions: Solution[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) => {
    setSaved(false);
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  };

  const save = () => {
    setSaved(false);
    startTransition(async () => {
      await setSurveySolutionsAction(surveyId, selected);
      setSaved(true);
    });
  };

  if (allSolutions.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        ソリューションがまだ登録されていません。「ソリューション」ページで登録すると、ここで選べます。
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {allSolutions.map((s) => {
          const checked = selected.includes(s.id);
          return (
            <label
              key={s.id}
              className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors duration-(--dur-fast) ${
                checked ? "border-accent bg-accent-soft text-accent" : "border-rule text-ink-muted"
              }`}
            >
              <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="sr-only" />
              {s.name}
            </label>
          );
        })}
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={save} disabled={pending} className={btnSecondary}>
          {pending ? "保存しています…" : "保存"}
        </button>
        {saved && <span className="text-sm text-ink-muted">保存しました</span>}
      </div>
    </div>
  );
}
