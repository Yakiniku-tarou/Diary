// メモリ内の DiaryRepository（テスト用・IndexedDB が使えないときの代わり）
// IndexedDB と同じく、保存・取得のたびに複製して渡す（呼び出し側の書き換えが保存内容に漏れない）
import type { DiaryRepository } from "../core/ports";
import { DEFAULT_SETTINGS, type DiaryDay, type DiaryEntry, type Draft, type Settings } from "../core/types";

export class MemoryDiaryRepository implements DiaryRepository {
  private entries = new Map<DiaryDay, DiaryEntry>();
  private settings: Partial<Settings> = {};
  private draft: Draft | undefined;

  constructor(initial?: { entries?: DiaryEntry[]; settings?: Partial<Settings>; draft?: Draft }) {
    for (const e of initial?.entries ?? []) this.entries.set(e.day, structuredClone(e));
    if (initial?.settings) this.settings = structuredClone(initial.settings);
    if (initial?.draft) this.draft = structuredClone(initial.draft);
  }

  async getEntry(day: DiaryDay): Promise<DiaryEntry | undefined> {
    const e = this.entries.get(day);
    return e && structuredClone(e);
  }

  async putEntry(entry: DiaryEntry): Promise<void> {
    this.entries.set(entry.day, structuredClone(entry));
  }

  async deleteEntry(day: DiaryDay): Promise<void> {
    this.entries.delete(day);
  }

  async listEntries(): Promise<DiaryEntry[]> {
    return [...this.entries.values()].map((e) => structuredClone(e));
  }

  async getSettings(): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...structuredClone(this.settings) };
  }

  async saveSettings(settings: Settings): Promise<void> {
    this.settings = structuredClone(settings);
  }

  async getDraft(): Promise<Draft | undefined> {
    return this.draft && structuredClone(this.draft);
  }

  async saveDraft(draft: Draft): Promise<void> {
    this.draft = structuredClone(draft);
  }

  async clearDraft(): Promise<void> {
    this.draft = undefined;
  }
}
