# QL

Astro・TypeScript・Astro Components・CSSで作る個人サイトです。MarkdownとMDXに対応しています。

## 保存先と公開

コードはGitHub、記事と画像は非公開のCloudflare R2、公開先はCloudflare Pagesです。
GitHub連携でpushを受け、R2からコンテンツを取得してAstroでビルドします。閲覧者にはPagesから配信します。

## 開発

- `npm ci`：依存パッケージをインストール
- `npm run content:pull`：R2からコンテンツを取得
- `npm run dev`：ローカルプレビュー
- `npm run build`：ローカルコンテンツでビルド
- `npm run preview`：ビルド結果を確認

`.env.example`を`.env`へコピーし、R2の接続情報を設定します。`.env`、`content/`、取得時のバックアップはGit対象外です。
取得は全ファイルのダウンロードに成功してから反映し、以前のローカル内容は`.content-backup-*/content/`に残します。未編集の状態で取得し、バックアップは必要に応じて整理してください。

## 記事と画像

- `content/blog/`：記事
- `content/assets/`：掲載用画像
- `content/pages/links.md`：リンク集

記事の必須項目は`title`、`category`、`pubDate`です。カテゴリは`apps`（アプリ）です。日付は並び順とRSSだけに使用します。
画像は記事からの相対パス（例：`../assets/example.png`）で指定します。

編集後は`npm run build`で確認し、`npm run content:upload`でR2へ保存します。アップロードは同名ファイルを上書きし、リモートの余分なファイルは削除しません。削除はR2の管理画面で行います。
R2の更新だけでは公開は更新されません。Pagesで再デプロイするか、GitHubへコードの変更をpushします。アップロード完了前にビルドを開始しないでください。

## Cloudflare設定

1. このサイト専用のR2バケットをStandardで作成します。公開アクセスは無効のままにします。
2. ローカルのアップロード用に、そのバケットの読み書き用認証情報を設定します。
3. PagesはGitHubのコードリポジトリへ接続し、本番ブランチを`main`にします。
4. ビルドコマンドを`npm run build:pages`、出力ディレクトリを`dist`にします。
5. ビルド環境に`R2_ENDPOINT`、`R2_BUCKET`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY`を設定します。Pages用の認証情報は、そのバケットの読み取り専用にします。キーとシークレットは暗号化された環境変数に保存します。
6. `SITE_URL`に本番の`https://<プロジェクト名>.pages.dev`を、`NODE_VERSION`に`24`、`ASTRO_TELEMETRY_DISABLED`に`1`を設定します。

本番URLが未設定の場合、Pagesでは`CF_PAGES_URL`、ローカルでは`http://localhost:4321`を使用します。

R2の無料枠を超えると従量課金されます。予算アラートは通知のみで、自動停止や課金上限ではありません。

## ページとデザイン

`/`が記事一覧、`/categories/apps/`がアプリ一覧、`/blog/<記事名>/`が記事、`/links/`がリンク集です。
共通CSSは`src/styles/global.css`、レイアウトは`src/layouts/`、共通部品は`src/components/`にあります。

## 接続状況

R2契約・コンテンツの初回アップロード・GitHubリポジトリ作成・Pages接続は未実施です。ローカルのコンテンツは`content/`に保持しています。
