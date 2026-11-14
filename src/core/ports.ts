// core が使う外部とのつなぎ口。実装は services/ に置く
import type { DiaryDay, DiaryEntry, Draft, Settings } from "./types";

/** Claude に渡す内容 */
export interface ComposePrompt {
  system: string;
  user: string;
}

/** 日記にまとめる係。応答の生テキストを返す。失敗時は ComposeError を投げる */
export interface DiaryComposer {
  compose(prompt: ComposePrompt): Promise<string>;
}

/** 保存先 */
export interface DiaryRepository {
  getEntry(day: DiaryDay): Promise<DiaryEntry | undefined>;
  putEntry(entry: DiaryEntry): Promise<void>;
  deleteEntry(day: DiaryDay): Promise<void>;
  /** 全件（順不同） */
  listEntries(): Promise<DiaryEntry[]>;

  /** 未保存の項目は既定値で埋めて返す */
  getSettings(): Promise<Settings>;
  saveSettings(settings: Settings): Promise<void>;

  getDraft(): Promise<Draft | undefined>;
  saveDraft(draft: Draft): Promise<void>;
  clearDraft(): Promise<void>;
}
