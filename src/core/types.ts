// データの型（SPEC.md 4章）

/** "2026-11-15" 形式。日記の日付 */
export type DiaryDay = string;

/** 文体：常体／敬体 */
export type DiaryStyle = "plain" | "polite";

/** まとめ方：文章（段落）／箇条書き */
export type DiaryFormat = "prose" | "bullets";

export interface VoiceSegment {
  readonly id: string;
  /** ISO 8601 */
  readonly recordedAt: string;
  /** 話した原文（保存後は書き換えない） */
  readonly transcript: string;
}

export interface DiaryEntry {
  /** 主キー。1日1件 */
  day: DiaryDay;
  /** AIが付ける短いタイトル（編集可） */
  title: string;
  /** 日記本文（編集可） */
  body: string;
  /** 再生成の直前の本文（1段階だけ元に戻せる） */
  previousBody?: string;
  /** AIによるまとめが済んでいるか */
  isComposed: boolean;
  /** 話した原文の記録 */
  segments: readonly VoiceSegment[];
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  apiKey: string;
  model: string;
  style: DiaryStyle;
  format: DiaryFormat;
  dayBoundaryHour: number;
  lastExportedAt?: string;
}

/** 入力途中の下書き */
export interface Draft {
  text: string;
  /** どの日の日記への入力か（過去の日の新規作成・追記のとき） */
  day?: DiaryDay;
  updatedAt: string;
}

export const DEFAULT_MODEL = "claude-haiku-5-5";

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  apiKey: "",
  model: DEFAULT_MODEL,
  style: "plain",
  format: "prose",
  dayBoundaryHour: 4,
};
