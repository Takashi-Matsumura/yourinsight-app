import Link from "next/link";
import { connection } from "next/server";
import { listSurveys } from "@/lib/repo/surveys";

export const dynamic = "force-dynamic";

export default async function Home() {
  await connection();
  const surveys = listSurveys().filter((s) => s.status === "published");

  return (
    <main className="flex flex-1 flex-col px-6 pt-safe pb-safe max-w-md w-full mx-auto">
      <header className="pt-10 pb-8">
        <p className="font-serif text-2xl text-ink">yourinsight</p>
        <p className="mt-2 text-sm text-ink-muted">答えによって次の質問が変わる、短い対話型アンケート</p>
      </header>

      <section className="flex-1">
        {surveys.length === 0 ? (
          <p className="text-sm text-ink-muted">公開中のアンケートはまだありません。</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {surveys.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/s/${s.id}`}
                  className="flex items-center justify-between py-4 text-ink hover:text-accent focus-visible:text-accent"
                >
                  <span className="font-serif text-lg">{s.title}</span>
                  <span aria-hidden className="text-ink-faint">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="pt-8">
        <Link href="/admin" className="text-sm text-ink-muted underline underline-offset-4">
          管理画面
        </Link>
      </footer>
    </main>
  );
}
