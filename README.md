# ケーキ屋さん

Astro・TypeScript・Astro Components・Tailwind CSS v4で作る個人サイトです。MarkdownとMDXに対応しています。

## 開発

- `npm ci`：依存パッケージをインストール
- `npm run dev`：ローカルプレビュー
- `npm run build`：公開用ファイルを`dist/`に生成
- `npm run preview`：ビルド結果を確認

## ローカルツール

Fandocker は公開サイトとは独立したローカルツールとして `tools/fandocker/` に置いています。初回はそのフォルダーで `npm install` を実行し、以後は `start.vbs` または `npm start` で起動します。

## 記事と画像

コード・記事・掲載用画像をこのリポジトリで管理します。

- `content/blog/`：記事
- `content/assets/`：掲載用画像
- `content/pages/links.md`：リンク集

記事の必須項目は`title`、`category`、`pubDate`です。カテゴリは`apps`（アプリ）です。日付は並び順とRSSだけに使用します。
画像は記事からの相対パス（例：`../assets/example.png`）で指定します。

## 公開

公開先は https://apricot-cake.com/ です。
`.github/workflows/deploy.yml`が`main`へのpushを受けてビルドし、GitHub Pagesへ公開します。GitHubのSettings → Pagesで公開元をGitHub Actionsに設定します。

## ページとデザイン

`/`が記事一覧、`/categories/apps/`がアプリ一覧、`/blog/<記事名>/`が記事、`/links/`がリンク集です。
Tailwindは公式のViteプラグインで読み込みます。レイアウトの装飾は各Astroファイルのユーティリティクラス、テーマ・基本設定・Markdown本文の装飾は`src/styles/global.css`で管理します。レイアウトは`src/layouts/`、共通部品は`src/components/`にあります。
