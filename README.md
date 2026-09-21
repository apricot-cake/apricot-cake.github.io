# @apricot-cake

アプリを載せる静的な個人サイトです。公開するファイルは `site/` にあります。

## 更新

`site/index.html`、`site/styles.css`、`site/assets/` を直接編集します。ビルドは不要です。

サイトアイコンは [Twemoji](https://github.com/jdecked/twemoji) のコーヒーを使用しています（CC-BY 4.0）。

## ローカルツール

Fandocker は公開サイトとは独立したローカルツールとして `tools/fandocker/` に置いています。初回はそのフォルダーで `npm install` を実行し、以後は `start.vbs` または `npm start` で起動します。

## 公開

公開先は https://apricot-cake.com/ です。
`.github/workflows/deploy.yml`が`main`へのpushを受けて`site/`をGitHub Pagesへ公開します。GitHubのSettings → Pagesで公開元をGitHub Actionsに設定します。
