"use client";

import { useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { EXTERNAL_ID_MAX } from "@/lib/survey/public";
import { QrScanner } from "./qr-scanner";
import { ResumeLink } from "./resume-link";

const primaryBtn =
  "w-full min-h-14 rounded-md bg-accent text-accent-ink text-[17px] font-medium transition-[filter,transform,opacity] duration-(--dur-fast) ease-(--ease-out) hover:brightness-110 active:translate-y-px disabled:opacity-60 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const secondaryBtn =
  "w-full min-h-12 rounded-md border border-rule bg-paper-2 text-ink text-[15px] transition-colors duration-(--dur-fast) hover:bg-paper-3 active:bg-paper-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

const textBtn =
  "shrink-0 min-h-11 px-1 text-sm text-ink-muted underline underline-offset-4 decoration-rule hover:text-ink transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-sm";

export function StartPanel({
  surveyId,
  start,
  children,
}: {
  surveyId: string;
  start: (formData: FormData) => Promise<void>;
  children: ReactNode;
}) {
  const [externalId, setExternalId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closeScanner = () => {
    setScanning(false);
    triggerRef.current?.focus();
  };

  return (
    <>
      <div className="flex-1 flex flex-col justify-center py-10">
        {children}
        <ul className="mt-8 space-y-2 text-sm text-ink-muted">
          <li>答えによって、次の質問が変わります。</li>
          <li>
            {externalId
              ? "読み取った来場者IDと回答を紐づけて記録します。"
              : "回答内容は記録され、集計に使われます。"}
          </li>
          <li>途中でやめても大丈夫です。</li>
        </ul>
      </div>

      <div className="space-y-4">
        {externalId ? (
          <div className="flex items-center gap-3 rounded-md bg-accent-soft px-3 py-2">
            <span className="text-xs text-ink-muted shrink-0">来場者ID</span>
            <span
              className="min-w-0 flex-1 font-mono text-sm text-accent break-all line-clamp-2"
              title={externalId}
            >
              {externalId}
            </span>
            <button ref={triggerRef} type="button" onClick={() => setScanning(true)} className={textBtn}>
              読み直す
            </button>
            <button type="button" onClick={() => setExternalId(null)} className={textBtn}>
              解除
            </button>
          </div>
        ) : (
          <button ref={triggerRef} type="button" onClick={() => setScanning(true)} className={secondaryBtn}>
            来場者のQRコードを読み取る
          </button>
        )}

        <form action={start}>
          <input type="hidden" name="external_id" value={externalId ?? ""} />
          <SubmitButton />
        </form>
        <ResumeLink surveyId={surveyId} />
      </div>

      {scanning && (
        <QrScanner
          onResult={(text) => {
            const cleaned = text.trim().slice(0, EXTERNAL_ID_MAX);
            if (cleaned) setExternalId(cleaned);
            closeScanner();
          }}
          onClose={closeScanner}
        />
      )}
    </>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={primaryBtn}>
      {pending ? "開始しています…" : "はじめる"}
    </button>
  );
}
