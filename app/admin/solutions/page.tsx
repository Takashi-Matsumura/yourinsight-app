import { connection } from "next/server";
import { listSolutions } from "@/lib/repo/solutions";
import { SolutionsEditor } from "./solutions-editor";

export const dynamic = "force-dynamic";

export default async function SolutionsPage() {
  await connection();
  const solutions = listSolutions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-ink">ソリューション</h1>
        <p className="mt-1 text-sm text-ink-muted">
          自社の展示ソリューションを登録します。ここで登録したものはアンケート作成時に選んで使えます。
          未登録でも、これまで通りの動作（案内の生成をしない）に変わりありません。
        </p>
      </div>
      <SolutionsEditor initial={solutions} />
    </div>
  );
}
