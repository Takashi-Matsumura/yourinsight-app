import Link from "next/link";
import { StatusBadge } from "../ui";
import type { Survey } from "@/lib/types";

export function SurveyNav({ survey, current }: { survey: Survey; current: "edit" | "responses" | "analysis" }) {
  const item = (key: typeof current, href: string, label: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={`min-h-11 inline-flex items-center border-b-2 px-1 text-sm transition-colors duration-(--dur-fast) ${
        current === key ? "border-accent text-ink" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {label}
    </Link>
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/admin" className="text-sm text-ink-muted hover:text-ink">
          ← アンケート
        </Link>
      </div>
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-2xl text-ink">{survey.title}</h1>
        <StatusBadge status={survey.status} />
      </div>
      <nav className="flex items-center gap-6 border-b border-rule">
        {item("edit", `/admin/${survey.id}`, "設計")}
        {item("responses", `/admin/${survey.id}/responses`, "回答")}
        {item("analysis", `/admin/${survey.id}/analysis`, "分析")}
        <a
          href={`/s/${survey.id}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto min-h-11 inline-flex items-center text-sm text-ink-muted hover:text-ink"
        >
          回答画面を開く ↗
        </a>
      </nav>
    </div>
  );
}
