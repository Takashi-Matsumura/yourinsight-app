import { connection } from "next/server";
import { listSolutions } from "@/lib/repo/solutions";
import { DesignForm } from "./design-form";

export const dynamic = "force-dynamic";

export default async function NewSurveyPage() {
  await connection();
  const solutions = await listSolutions();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-ink">新しいアンケート</h1>
        <p className="mt-1 text-sm text-ink-muted">
          目的を書くと、AIが論点（知りたいことの道筋）と予備質問を設計します。作成後に編集できます。
        </p>
      </div>
      <DesignForm solutions={solutions} />
    </div>
  );
}
