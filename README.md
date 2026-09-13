# yourinsight

スマートフォン向けの、AIによる適応型アンケートアプリです。固定の質問票を用意する代わりに、調査の「目的」と「知りたいことの道筋（論点）」だけを定義すると、回答者の回答内容に応じてローカルLLMが次の質問をリアルタイムに生成します。

回答が終わると、その人の回答だけをもとにした短い「振り返り」を生成して表示します。断定はせず、本人が話してくれたことを静かに言い直し、ひとつだけ問いかけの形で気づきを添える、という体験を目指しています。

## 主な機能

- **適応型の質問生成**: 目的と論点をもとに、行動・事実ベースの質問をLLMがその場で1問ずつ作成
- **論点カバレッジ駆動**: 「あと何問」ではなく論点の充足状況で進行を管理し、必要な情報が揃ったら自動的に終了
- **待ち時間ゼロの導入**: 最初の質問（と主要な分岐）は公開時に生成・保存しておき、回答者が待つのは3問目以降だけ
- **ストリーミング表示**: 質問文・振り返り文をSSEで1文字ずつ表示し、生成中の間も体験を止めない
- **匿名回答**: 個人を特定する情報は扱わない設計（外部IDによる将来的な突合用のフィールドのみ用意）
- **管理画面**: アンケートの作成・編集、QRコード付き回答用URLの発行、回答一覧・集計・CSVエクスポート、AIによる横断的な分析
- **関連リソースの案内（任意機能）**: 案内したい情報（製品・サービスなど）をカタログとして登録しておくと、回答内容に本当に合致した場合にだけ、振り返りの後に案内を表示します。無理な当てはめはしません。カタログを登録しなければこの機能は一切動作しません

## 技術構成

- [Next.js 16](https://nextjs.org/)（App Router）
- React 19 / TypeScript
- Tailwind CSS v4
- [Cloudflare D1](https://developers.cloudflare.com/d1/)（SQLite互換）
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) へ [vinext](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) アダプタでデプロイ
- ローカルLLM（OpenAI互換の `/v1/chat/completions` エンドポイントを持つサーバであれば利用可能。[llama.cpp](https://github.com/ggml-org/llama.cpp) のサーバモードなどを想定。社内LAN上のエッジAIサーバを [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) 経由で公開して利用する構成を想定）

## 必要な環境

- Node.js 24 系
- JSON Schema による構造化出力（`response_format.json_schema`）に対応した、OpenAI互換のLLM推論サーバ
  - `/v1/models` と `/v1/chat/completions` の両方に対応していること
  - モデルによっては構造化出力に対応していない場合があるため、`/admin/settings` の疎通テストで実際に動作確認することを推奨します

## セットアップ（ローカル開発）

```bash
npm install
npm run dev:vinext
```

`http://localhost:3001` で起動します（workerdランタイム + ローカルD1のシミュレーション）。初回はローカルD1にマイグレーションを適用してください。

```bash
npx wrangler d1 migrations apply yourinsight --local
```

### LLM接続の設定

`/admin/settings` から、推論サーバのベースURL・モデル名・同時実行数などを設定します。環境変数は不要です（設定値はデータベースに保存されます）。

同時実行数は、推論サーバが同時に処理できるリクエスト数（例: llama.cpp サーバの `-np` オプション）に合わせて設定してください。

## Cloudflareへのデプロイ

```bash
npx wrangler d1 create yourinsight   # wrangler.jsonc の database_id を更新
npx wrangler d1 migrations apply yourinsight --remote
npm run build:vinext
npm run deploy:vinext
```

社内LANなどローカルネットワーク上のLLMサーバを使う場合、Workersはグローバルエッジで実行されるため直接は到達できません。[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) でLLMサーバのエンドポイントを`https://llm.<あなたのドメイン>`のようなホスト名として公開し、Cloudflare Access のサービストークンで保護してください。ヘッダー `CF-Access-Client-Id` / `CF-Access-Client-Secret` を次のシークレットとしてWorkerに設定すると、LLMクライアントが自動的に付与します。

```bash
npx wrangler secret put CF_ACCESS_CLIENT_ID
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
```

### ローカルLLMをCloudflare Tunnelで公開する手順

1. **cloudflaredのインストールとログイン**
   ```bash
   brew install cloudflared
   cloudflared tunnel login   # ブラウザで対象ドメインを選択・認可
   ```
2. **Tunnelの作成とingress設定**
   ```bash
   cloudflared tunnel create <tunnel名>
   ```
   `~/.cloudflared/config.yml` を作成する。
   ```yml
   tunnel: <tunnel ID>
   credentials-file: /Users/<user>/.cloudflared/<tunnel ID>.json

   ingress:
     - hostname: llm.<あなたのドメイン>
       service: http://localhost:8080
     - service: http_status:404
   ```
3. **DNSレコードの追加**
   ```bash
   cloudflared tunnel route dns <tunnel名> llm.<あなたのドメイン>
   ```
4. **マシン起動時から常駐させる（ログイン前から起動する場合）**
   ユーザーのLaunchAgentではなく、root権限のLaunchDaemonとして登録する。`--config`で設定ファイルの場所を明示しないと、root実行時に`~/.cloudflared/`が`/var/root/.cloudflared/`を指してしまい認証情報が見つからないので注意。
   ```bash
   sudo /usr/libexec/PlistBuddy -c "Add :Label string com.cloudflare.cloudflared" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments array" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments:0 string /opt/homebrew/bin/cloudflared" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments:1 string --config" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments:2 string /Users/<user>/.cloudflared/config.yml" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments:3 string tunnel" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ProgramArguments:4 string run" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :RunAtLoad bool true" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :StandardOutPath string /Library/Logs/com.cloudflare.cloudflared.out.log" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :StandardErrorPath string /Library/Logs/com.cloudflare.cloudflared.err.log" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :KeepAlive:SuccessfulExit bool false" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo /usr/libexec/PlistBuddy -c "Add :ThrottleInterval integer 5" /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo chown root:wheel /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo chmod 644 /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   sudo launchctl bootstrap system /Library/LaunchDaemons/com.cloudflare.cloudflared.plist
   ```
   （ログイン中だけ動けばよい場合は `cloudflared service install` で作成されるユーザーLaunchAgentのままでよいが、`ProgramArguments`に`tunnel run <ID>`が入っているか確認すること）
5. **Cloudflare Accessで保護する**（Zero Trustダッシュボード）
   1. 「Access コントロール」→「サービス資格情報」→「サービストークンを作成する」
   2. 「Access コントロール」→「ポリシー」→ アクション「サービス認証」、含める条件に上記トークンを指定したポリシーを作成
   3. 「Access コントロール」→「アプリケーション」→「Self-hosted」で `llm.<あなたのドメイン>` を登録し、作成したポリシーを紐付け
   4. 発行されたClient ID / Client Secretを、上記の `wrangler secret put` でWorkerに設定
6. **動作確認**
   ```bash
   curl -o /dev/null -w '%{http_code}\n' https://llm.<あなたのドメイン>/v1/models   # 403なら保護成功
   ```
   `/admin/settings` の疎通テストで「サーバに接続」「モデル名一致」「JSON Schema構造化出力」がすべて成功すれば完了。

## 使い方

### アンケートの作成・管理（`/admin`）

1. `/admin` の一覧から **「新しく作る」** をクリックし、`/admin/new` で調査の目的（自由文）と対象者（任意）を入力する
2. ソリューション（後述）を登録済みなら、関連しそうなものを任意でチェックする
3. **「AIに設計してもらう」** を押すと、目的（と選んだソリューション）をもとにAIが論点（知りたいことの道筋）を3〜5個、タイトル、導入文、予備質問を自動生成する
   - 選んだソリューションに本当に合致する論点にだけ、自動でタグが付く（無理に全部には付かない）
4. 内容を確認し **「この内容で作成する」** を押すと保存され、編集画面（`/admin/[surveyId]`）に移動する

編集画面でできること:

| セクション | 内容 |
|---|---|
| 上部の帯 | 公開／受付終了／削除、公開に必要な条件の案内 |
| 基本 | 題名・目的・対象者・導入文・ご案内のCTA文言・1論点あたりの最大質問数・絶対上限 |
| 使用するソリューション | このアンケートで使うソリューションをチェックで選択（後から変更可） |
| 論点（知りたいことの道筋） | 各論点の名前・優先度・対象ソリューション・説明・予備質問を編集 |
| 最初の質問 | 公開前にAIが生成する1問目（回答者が待たずに見られる質問）。作り直しや手動編集も可能 |
| 回答用URL | QRコード表示、URLコピー |

公開には「論点」と「最初の質問」の両方が必要。公開後は上部タブの **「回答」** で回答一覧・集計・CSV出力、**「分析」** でAIによる横断分析（ソリューション別の手応え、拾えていないニーズを含む）を確認できる。

### ソリューションカタログの登録（`/admin/solutions`）

「ソリューション」は全アンケート共通で使える、案内したいもの（製品・サービスなど）のカタログ。単体では何もせず、アンケート側で選んで初めて使われる。

1. **「＋ ソリューションを追加」** で新しいカードを追加する
2. 次の項目を入力する
   - **ソリューション名**
   - **一言**（実績・売り文句。ここに書いた内容だけをAIが案内文でそのまま引用する。数字などを新たに創作することはない）
   - **どんな課題を解決するソリューションか**（説明文。AIが回答者との合致を判断する材料になる）
   - **資料URL**（任意）
3. **「保存」** で1件ずつ保存する（削除すると、各アンケートの紐付けも自動的に外れる）

登録したソリューションは、アンケート作成・論点編集時の選択肢になり、回答者の振り返り画面では回答内容が本当に合致した場合だけ「ご案内」として表示される（合致しなければ何も表示されない）。何も登録しなければ、アプリは案内機能なしの状態のまま動作する。

## 実機（スマートフォン）での動作確認

LAN内の別端末から開発サーバへアクセスする場合は、`next.config.ts` の `allowedDevOrigins` にアクセス元のホスト名・IPアドレスを追加してください。

```ts
const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.23"], // 実機のIPアドレスなどに置き換える
};
```

## スクリプト

| コマンド | 内容 |
|---|---|
| `npm run dev:vinext` | Cloudflare Workers向けの開発サーバを起動（workerd + ローカルD1） |
| `npm run build:vinext` | Cloudflare Workers向けの本番ビルド |
| `npm run deploy:vinext` | Cloudflare Workersへデプロイ |
| `npm run lint` | ESLint を実行 |
| `npm run typecheck` | 型チェック（`tsc --noEmit`）を実行 |

## ディレクトリ構成（概要）

```
app/
  s/[surveyId]/[sessionId]/   回答者向けUI
  admin/                      管理画面
  api/                        ストリーミングAPI・管理API
lib/
  db.ts                       D1バインディングの取得
  repo/                       データアクセス層
  llm/                        LLMクライアント・プロンプト・スキーマ
  survey/                     アンケート生成エンジン
migrations/                   D1のスキーマ定義（wrangler d1 migrations）
```

## 認証について

現時点では `/admin` に認証機構はありません。社内LANなど、信頼できるネットワーク内での利用を前提としています。

## ライセンス

[MIT License](./LICENSE)
