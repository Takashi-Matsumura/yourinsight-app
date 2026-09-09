import Link from "next/link";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex-1 flex flex-col">
      <header className="border-b border-rule">
        <nav className="mx-auto w-full max-w-3xl px-6 h-14 flex items-center justify-between">
          <Link href="/admin" className="font-serif text-lg text-ink">
            yourinsight <span className="text-ink-faint text-sm ml-1">管理</span>
          </Link>
          <div className="flex items-center gap-5 text-sm">
            <Link href="/admin" className="text-ink-muted hover:text-ink">
              アンケート
            </Link>
            <Link href="/admin/solutions" className="text-ink-muted hover:text-ink">
              ソリューション
            </Link>
            <Link href="/admin/settings" className="text-ink-muted hover:text-ink">
              設定
            </Link>
          </div>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl px-6 py-8 flex-1">{children}</main>
    </div>
  );
}
