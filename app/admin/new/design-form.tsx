"use client";

import { useRef, useState, useTransition } from "react";
import { readSse } from "@/lib/sse-client";
import { createBlankSurvey, createSurveyFromDesign, type DesignDraft } from "../actions";
import { btnPrimary, btnSecondary, btnText, Field, inputCls, textareaCls } from "../ui";
import type { Solution, SurveyViewpoint } from "@/lib/types";

const VIEWPOINTS: { value: SurveyViewpoint; label: string; hint: string }[] = [
  { value: "individual", label: "あなた自身の視点で", hint: "回答者本人の行動と時間を聞く" },
  { value: "organization", label: "チーム・組織の視点で", hint: "チームや部署の回り方を、見聞きした事実から聞く" },
];

type Status = "idle" | "queued" | "generating" | "streaming" | "done" | "error";

interface Partial {
  title: string;
  intro_text: string;
  labels: string[];
}

const PLACEHOLDER_PURPOSE =
  "例: 人手不足が続く中で、現場の何が本当のボトルネックになっているのかを知りたい。本人が自覚していない負担や、諦められている業務を見つけたい。";

export function DesignForm({ solutions }: { solutions: Solution[] }) {
  const [viewpoint, setViewpoint] = useState<SurveyViewpoint>("individual");
  const [purpose, setPurpose] = useState("");
  const [audience, setAudience] = useState("");
  const [solutionIds, setSolutionIds] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [position, setPosition] = useState<number | null>(null);
  const [partial, setPartial] = useState<Partial>({ title: "", intro_text: "", labels: [] });
  const [design, setDesign] = useState<DesignDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const abortRef = useRef<AbortController | null>(null);

  const toggleSolution = (id: string) =>
    setSolutionIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  const generate = async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setStatus("queued");
    setPosition(null);
    setPartial({ title: "", intro_text: "", labels: [] });
    setDesign(null);
    setError(null);
    try {
      const res = await fetch("/api/admin/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose, audience, viewpoint, solutionIds }),
        signal: ac.signal,
      });
      await readSse(res, ({ event, data }) => {
        if (event === "queued") {
          setPosition((data as { position: number }).position);
        } else if (event === "generating") {
          setStatus("generating");
          setPosition(null);
        } else if (event === "token") {
          setStatus("streaming");
          setPartial(data as Partial);
        } else if (event === "design") {
          const d = data as Omit<DesignDraft, "purpose" | "audience" | "viewpoint" | "solution_ids">;
          setDesign({ ...d, purpose, audience, viewpoint, solution_ids: solutionIds });
          setStatus("done");
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

  const busy = status === "queued" || status === "generating" || status === "streaming";

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <Field label="視点" hint="質問の主語が変わります。">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {VIEWPOINTS.map((v) => {
              const checked = viewpoint === v.value;
              return (
                <label
                  key={v.value}
                  className={`flex flex-col gap-0.5 rounded-md border px-3 py-2.5 text-sm cursor-pointer transition-colors duration-(--dur-fast) ${
                    checked ? "border-accent bg-accent-soft text-accent" : "border-rule text-ink-muted"
                  }`}
                >
                  <input
                    type="radio"
                    name="viewpoint"
                    checked={checked}
                    onChange={() => setViewpoint(v.value)}
                    disabled={busy}
                    className="sr-only"
                  />
                  <span className={checked ? "text-accent" : "text-ink"}>{v.label}</span>
                  <span className="text-xs text-ink-faint">{v.hint}</span>
                </label>
              );
            })}
          </div>
        </Field>
        <Field label="調査の目的" hint="何を知りたいか、なぜ知りたいかを自由に。長くて構いません。">
          <textarea
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            rows={5}
            placeholder={PLACEHOLDER_PURPOSE}
            className={textareaCls}
            disabled={busy}
          />
        </Field>
        <Field label="対象者" hint="任意。例: 小売店舗のスタッフ／製造現場のリーダー">
          <input
            value={audience}
            onChange={(e) => setAudience(e.target.value)}
            className={inputCls}
            disabled={busy}
          />
        </Field>
        {solutions.length > 0 && (
          <Field
            label="関連しそうなソリューション（任意・複数選択可）"
            hint="選ぶと、合致する論点にだけ自動でタグが付きます。無理に全論点には付けません。"
          >
            <div className="flex flex-wrap gap-2">
              {solutions.map((s) => {
                const checked = solutionIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer transition-colors duration-(--dur-fast) ${
                      checked ? "border-accent bg-accent-soft text-accent" : "border-rule text-ink-muted"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSolution(s.id)}
                      disabled={busy}
                      className="sr-only"
                    />
                    {s.name}
                  </label>
                );
              })}
            </div>
          </Field>
        )}
        <div className="flex items-center gap-4">
          <button type="button" onClick={generate} disabled={busy || !purpose.trim()} className={btnPrimary}>
            {busy ? "設計しています…" : design ? "もう一度設計する" : "AIに設計してもらう"}
          </button>
          <form action={createBlankSurvey}>
            <input type="hidden" name="purpose" value={purpose} />
            <input type="hidden" name="audience" value={audience} />
            <input type="hidden" name="viewpoint" value={viewpoint} />
            <button type="submit" className={btnText} disabled={busy}>
              空のまま作る
            </button>
          </form>
        </div>
      </div>

      {(busy || design) && (
        <div className="rise border-t border-rule pt-6 space-y-5" aria-live="polite">
          {busy && (
            <p className="breathe text-sm text-ink-muted">
              {status === "queued" && position !== null && position > 1
                ? `順番待ち（あと${position - 1}件）`
                : status === "streaming"
                  ? "論点を書き出しています"
                  : "目的を読んでいます"}
            </p>
          )}
          <div>
            <p className="text-xs text-ink-muted mb-1">題名</p>
            <p className="font-serif text-xl text-ink min-h-7">{design?.title ?? partial.title}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted mb-1">導入文</p>
            <p className="text-ink leading-relaxed min-h-6">{design?.intro_text ?? partial.intro_text}</p>
          </div>
          <div>
            <p className="text-xs text-ink-muted mb-2">論点</p>
            <ol className="space-y-2">
              {(design ? design.topics.map((t) => t.label) : partial.labels).map((label, i) => {
                const solutionId = design?.topics[i]?.target_solution_id;
                const solutionName = solutionId ? solutions.find((s) => s.id === solutionId)?.name : null;
                return (
                  <li key={i} className="rise flex gap-3 items-baseline">
                    <span className="text-ink-faint tabular-nums text-sm">{i + 1}</span>
                    <div>
                      <p className="text-ink">
                        {label}
                        {solutionName && (
                          <span className="ml-2 rounded-sm bg-accent-soft px-1.5 py-0.5 text-xs text-accent align-middle">
                            {solutionName}
                          </span>
                        )}
                      </p>
                      {design && <p className="text-sm text-ink-muted">{design.topics[i]?.description}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          {design && (
            <div className="flex items-center gap-4 pt-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => startTransition(() => createSurveyFromDesign(design))}
                className={btnPrimary}
              >
                {pending ? "作成しています…" : "この内容で作成する"}
              </button>
              <button type="button" onClick={generate} className={btnSecondary}>
                別の案を出す
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
