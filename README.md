# TFX-Conversioner (Photoshop UXP Plugin)

TFX を **完全再現**するのではなく、TFX 内の情報を抽出して Photoshop 上で再編集しやすい状態にする移行補助ツールです。

## 目的

- `.tfx` から抽出できる文字列をテキストレイヤー化
- 埋め込み PNG を抽出して配置
- その他の情報を INFO テキストレイヤーへ可読化
- 不明データも UNKNOWN として残す

## フォルダ構成

```text
.
├─ manifest.json
├─ index.html
├─ src/
│  ├─ main.js
│  ├─ parser/
│  │  ├─ tfxParser.js
│  │  ├─ pngExtractor.js
│  │  ├─ textExtractor.js
│  │  └─ styleExtractor.js
│  ├─ writer/
│  │  └─ photoshopWriter.js
│  └─ ui/
│     └─ styles.css
└─ sample/
```

## セットアップ手順

1. Photoshop 2025 を起動
2. UXP Developer Tool で本リポジトリを読み込み
3. `manifest.json` を指定してプラグインをロード
4. パネル `TFX Conversioner` を開く
5. `TFXを選択` → `解析実行`

## 使い方

- オプション（PNG抽出 / テキストレイヤー化 / INFO作成 / UNKNOWN出力）を選択
- `.tfx` を選択して解析実行
- 新規ドキュメントに以下レイヤーを生成
  - `INFO_MAIN`
  - `INFO_STYLE`（必要時）
  - `INFO_UNKNOWN`（必要時）
  - `TEXT_MAIN`
  - `TEXT_CANDIDATES`
  - `PNG_MAIN`
  - `PNG_OTHERS_x`

## 制限事項

- TFX 仕様の完全解読は未対応（ヒューリスティクス抽出）
- エフェクト再現（縁取り・シャドウ・グラデーション等）は未実装
- ドラッグ＆ドロップは UXP 制約により環境差があるため、基本はファイル選択を推奨

## 今後の拡張候補

- TFX 構造チャンクの辞書化
- 座標・整列・改行ルールの推定精度向上
- フォント名マッピング（和文名/欧文 PostScript 名の対応）
- UNKNOWN ブロックの自動クラスタリング
- RAW_DUMP レイヤー/外部テキスト出力

## 解析精度を上げるポイント

主に以下ファイルのロジックを強化してください。

- `src/parser/textExtractor.js`
  - UTF-8 / UTF-16 判定閾値
  - 文字列スコアリング
- `src/parser/pngExtractor.js`
  - PNG 切り出し時の CRC/チャンク妥当性検証
- `src/parser/styleExtractor.js`
  - フォント/サイズ/色の候補抽出ルール
  - 既知構造の署名追加
- `src/parser/tfxParser.js`
  - INFO 出力テンプレート
  - UNKNOWN の分類基準

