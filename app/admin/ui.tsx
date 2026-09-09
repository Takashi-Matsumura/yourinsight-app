import Link from "next/link";
import type { ReactNode } from "react";

export const inputCls =
  "w-full min-h-11 rounded-md border border-rule bg-paper-2 px-3 text-ink placeholder:text-ink-faint transition-colors duration-(--dur-fast) focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:opacity-50";

export const textareaCls = `${inputCls} py-2.5 leading-relaxed`;

export const btnPrimary =
  "inline-flex items-center justify-center min-h-11 rounded-md bg-accent px-4 text-accent-ink font-medium transition-[filter,transform,opacity] duration-(--dur-fast) ease-(--ease-out) hover:brightness-110 active:translate-y-px disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const btnSecondary =
  "inline-flex items-center justify-center min-h-11 rounded-md border border-rule bg-paper-2 px-4 text-ink transition-colors duration-(--dur-fast) hover:bg-paper-3 active:bg-paper-3 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const btnDanger =
  "inline-flex items-center justify-center min-h-11 rounded-md border border-danger/40 px-4 text-danger transition-colors duration-(--dur-fast) hover:bg-danger/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

export const btnText =
  "inline-flex items-center min-h-11 px-1 text-ink-muted underline underline-offset-4 decoration-rule hover:text-ink transition-colors duration-(--dur-fast) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded-sm";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-ink-muted mb-1.5">{label}</span>
      {children}
      {hint && <span className="block mt-1.5 text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-rule pt-6">
      <div className="flex items-baseline justify-between gap-4 mb-4">
        <h2 className="font-serif text-xl text-ink">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatusBadge({ status }: { status: "draft" | "published" | "closed" }) {
  const label = status === "draft" ? "下書き" : status === "published" ? "公開中" : "終了";
  const cls =
    status === "published"
      ? "bg-accent-soft text-accent"
      : status === "closed"
        ? "bg-paper-3 text-ink-muted"
        : "border border-rule text-ink-muted";
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs ${cls}`}>{label}</span>;
}

export function BackButton({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-rule text-ink-muted transition-colors duration-(--dur-fast) hover:border-accent hover:bg-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
