import { connection } from "next/server";
import { getLlmSettings } from "@/lib/repo/settings";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await connection();
  const settings = await getLlmSettings();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-2xl text-ink">LLM接続</h1>
        <p className="mt-1 text-sm text-ink-muted">
          llama.cpp サーバ（OpenAI互換API）に接続します。疎通テストは実際に JSON Schema 付きの生成を1回行って検証します。
        </p>
      </div>
      <SettingsForm initial={settings} />
    </div>
  );
}
