"use client";

import { useEffect, useState } from "react";
import { btnSecondary, btnText } from "../ui";

export function QrPanel({ url, qrDataUrl, published }: { url: string; qrDataUrl: string; published: boolean }) {
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start gap-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrDataUrl} alt="回答用URLのQRコード" width={160} height={160} className="rounded-sm border border-rule bg-white" />
      <div className="space-y-3 min-w-0">
        <p className="font-mono text-sm text-ink break-all">{url}</p>
        {!published && <p className="text-xs text-ink-faint">公開すると、このURLから回答できます。</p>}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setFull(true)} className={btnSecondary}>
            QRを全画面で表示
          </button>
          <button type="button" onClick={copy} className={btnText}>
            {copied ? "コピーしました" : "URLをコピー"}
          </button>
        </div>
      </div>

      {full && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QRコード"
          onClick={() => setFull(false)}
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-6 p-8 cursor-pointer"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="回答用URLのQRコード" className="w-[min(80vw,80vh)] h-auto" />
          <p className="font-mono text-base text-[#1c1a18] break-all text-center">{url}</p>
          <p className="text-sm text-[#6b6864]">タップで閉じる</p>
        </div>
      )}
    </div>
  );
}
