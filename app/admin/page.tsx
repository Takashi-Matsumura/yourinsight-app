import Link from "next/link";
import { connection } from "next/server";
import { countSessions, listSurveys } from "@/lib/repo/surveys";
import { btnPrimary, StatusBadge } from "./ui";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  await connection();
  const surveys = listSurveys().map((s) => ({ ...s, counts: countSessions(s.id) }));

  return (
    <div className="space-y-8">
      <AutoRefresh seconds={5} />
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-ink">アンケート</h1>
          <p className="mt-1 text-sm text-ink-muted">回答数は5秒ごとに更新されます</p>
        </div>
        <Link href="/admin/new" className={btnPrimary}>
          新しく作る
        </Link>
      </div>

      {surveys.length === 0 ? (
        <p className="text-ink-muted">まだアンケートがありません。目的を書くと、AIが論点と最初の質問を設計します。</p>
      ) : (
        <ul className="border-y border-rule divide-y divide-rule">
          {surveys.map((s) => (
            <li key={s.id}>
              <Link
                href={`/admin/${s.id}`}
                className="flex items-center justify-between gap-4 py-4 hover:bg-paper-3 -mx-3 px-3 rounded-sm transition-colors duration-(--dur-fast)"
              >
                <div className="min-w-0">
                  <p className="text-xs text-ink-faint">
                    {s.viewpoint === "organization" ? "チーム・組織の視点" : "個人の視点"}
                  </p>
                  <p className="font-serif text-lg text-ink truncate">{s.title}</p>
                  <p className="mt-0.5 text-sm text-ink-muted truncate">{s.purpose}</p>
                </div>
                <div className="shrink-0 text-right space-y-1">
                  <StatusBadge status={s.status} />
                  <p className="text-sm text-ink-muted tabular-nums">
                    {s.counts.completed} 完了 / {s.counts.total} 開始
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
