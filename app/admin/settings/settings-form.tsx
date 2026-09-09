"use client";

import { useState, useTransition } from "react";
import { saveSettingsAction } from "../actions";
import { btnPrimary, btnSecondary, Field, inputCls } from "../ui";
import type { LlmSettings } from "@/lib/types";
import type { ConnectionCheck } from "@/lib/llm/client";

type Result = ConnectionCheck & { queue: { running: number; waiting: number } };

export function SettingsForm({ initial }: { initial: LlmSettings }) {
  const [s, setS] = useState<LlmSettings>(initial);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  const save = () => {
    setSaved(false);
    const fd = new FormData();
    fd.set("baseUrl", s.baseUrl);
    fd.set("model", s.model);
    fd.set("temperature", String(s.temperature));
    fd.set("maxConcurrency", String(s.maxConcurrency));
    start(async () => {
      await saveSettingsAction(fd);
      setSaved(true);
    });
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/llm/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(s),
      });
      setResult((await res.json()) as Result);
    } catch (e) {
      setResult({
        ok: false,
        models: [],
        modelFound: false,
        jsonSchemaOk: false,
        latencyMs: null,
        error: e instanceof Error ? e.message : String(e),
        queue: { running: 0, waiting: 0 },
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <Field label="ベースURL" hint="例: http://localhost:8080（末尾の /v1 は不要）">
        <input value={s.baseUrl} onChange={(e) => setS({ ...s, baseUrl: e.target.value })} className={inputCls} />
      </Field>
      <Field label="モデル名" hint="/v1/models に表示される id と一致させます。">
        <input value={s.model} onChange={(e) => setS({ ...s, model: e.target.value })} className={inputCls} list="models" />
        {result && result.models.length > 0 && (
          <datalist id="models">
            {result.models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="temperature" hint="質問生成の揺らぎ。0.5〜0.8が目安。">
          <input
            type="number"
            step={0.1}
            min={0}
            max={2}
            value={s.temperature}
            onChange={(e) => setS({ ...s, temperature: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
        <Field label="同時実行数" hint="llama.cpp の -np（スロット数）に合わせます。既定1。">
          <input
            type="number"
            min={1}
            max={8}
            value={s.maxConcurrency}
            onChange={(e) => setS({ ...s, maxConcurrency: Number(e.target.value) })}
            className={inputCls}
          />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className={btnPrimary}>
          {pending ? "保存しています…" : "保存"}
        </button>
        <button type="button" onClick={test} disabled={testing} className={btnSecondary}>
          {testing ? "テスト中…" : "疎通テスト"}
        </button>
        {saved && <span className="text-sm text-ink-muted">保存しました</span>}
      </div>

      {result && (
        <div className="rise rounded-md border border-rule bg-paper-2 p-4 text-sm space-y-2">
          <Row ok={result.models.length > 0} label="サーバに接続" detail={result.models.length > 0 ? `${result.models.length}モデル` : ""} />
          <Row ok={result.modelFound} label="モデル名が一致" detail={result.modelFound ? s.model : result.models.join(", ") || "—"} />
          <Row
            ok={result.jsonSchemaOk}
            label="JSON Schema 構造化出力"
            detail={result.jsonSchemaOk && result.latencyMs !== null ? `${(result.latencyMs / 1000).toFixed(1)}秒` : ""}
          />
          <p className="text-xs text-ink-faint">キュー: 実行中 {result.queue.running} / 待機 {result.queue.waiting}</p>
          {result.error && <p className="text-danger">{result.error}</p>}
        </div>
      )}
    </div>
  );
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <p className="flex items-center gap-3">
      <span className={`size-2 rounded-full ${ok ? "bg-accent" : "bg-danger"}`} aria-hidden />
      <span className="text-ink">{label}</span>
      <span className="text-ink-muted truncate">{detail}</span>
    </p>
  );
}
