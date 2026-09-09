"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

export const sessionStorageKey = (surveyId: string) => `yi:session:${surveyId}`;

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

export function ResumeLink({ surveyId }: { surveyId: string }) {
  const sessionId = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(sessionStorageKey(surveyId));
      } catch {
        return null;
      }
    },
    () => null,
  );

  if (!sessionId) return null;
  return (
    <p className="text-center text-sm">
      <Link
        href={`/s/${surveyId}/${sessionId}`}
        className="text-ink-muted underline underline-offset-4 hover:text-ink"
      >
        前回の続きから
      </Link>
    </p>
  );
}
