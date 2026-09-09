/* Hallmark · genre: editorial · macrostructure: Marquee Hero (single-viewport, mobile-only — CTA visible immediately, no true below-fold on a kiosk screen) · theme: locked (existing app tokens, burnt-orange accent hue 38) · enrichment: none (typography + equal-weight CTA cards) · nav: none · footer: none */
import Link from "next/link";
import { connection } from "next/server";
import { listSurveys } from "@/lib/repo/surveys";

export const dynamic = "force-dynamic";

export default async function Home() {
  await connection();
  const surveys = listSurveys().filter((s) => s.status === "published");

  return (
    <main className="flex flex-1 flex-col px-6 pt-safe pb-safe max-w-md w-full mx-auto">
      <header className="pt-12 pb-10 rise">
        <p className="font-serif text-4xl tracking-tight text-ink">yourinsight</p>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-muted">
          答えによって、次の質問が変わります。
        </p>
      </header>

      <section className="flex-1 flex flex-col gap-4">
        {surveys.length === 0 ? (
          <p className="rise text-sm text-ink-muted" style={{ animationDelay: "80ms" }}>
            公開中のアンケートはまだありません。
          </p>
        ) : (
          surveys.map((s, i) => (
            <SurveyCard
              key={s.id}
              id={s.id}
              title={s.title}
              introText={s.intro_text}
              viewpointLabel={s.viewpoint === "organization" ? "チーム・組織の視点で" : "あなた自身の視点で"}
              delayMs={80 + i * 60}
            />
          ))
        )}
      </section>
    </main>
  );
}

function SurveyCard({
  id,
  title,
  introText,
  viewpointLabel,
  delayMs,
}: {
  id: string;
  title: string;
  introText: string;
  viewpointLabel: string;
  delayMs: number;
}) {
  return (
    <Link
      href={`/s/${id}`}
      className="rise group block rounded-md bg-accent px-5 py-6 text-accent-ink transition-[filter,transform] duration-(--dur-fast) ease-(--ease-out) hover:brightness-110 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <p className="text-xs font-medium text-accent-ink/70">{viewpointLabel}</p>
      <p className="mt-1 font-serif text-2xl leading-snug break-words">{title}</p>
      {introText && (
        <p className="mt-2 text-sm leading-relaxed text-accent-ink/80 line-clamp-2">{introText}</p>
      )}
      <div className="mt-5 flex items-center gap-3">
        <span className="text-[15px] font-medium">はじめる</span>
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-ink text-accent transition-transform duration-(--dur-fast) ease-(--ease-out) group-hover:translate-x-0.5"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </div>
    </Link>
  );
}
