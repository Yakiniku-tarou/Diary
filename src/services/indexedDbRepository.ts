// IndexedDB 版の DiaryRepository（端末内に保存）
// ストア：entries（キー day）、settings、draft
import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import { isValidDayBoundaryHour } from "../core/day";
import type { DiaryRepository } from "../core/ports";
import { DEFAULT_SETTINGS, type DiaryDay, type DiaryEntry, type Draft, type Settings } from "../core/types";

const DB_VERSION = 1;
const SINGLE_KEY = "current";

interface DiaryDb extends DBSchema {
  entries: { key: DiaryDay; value: DiaryEntry };
  settings: { key: string; value: Partial<Settings> };
  draft: { key: string; value: Draft };
}

export class IndexedDbDiaryRepository implements DiaryRepository {
  private readonly db: Promise<IDBPDatabase<DiaryDb>>;

  constructor(name = "voice-diary") {
    this.db = openDB<DiaryDb>(name, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("entries", { keyPath: "day" });
        db.createObjectStore("settings");
        db.createObjectStore("draft");
      },
    });
  }

  /** 保存領域を開けるか確かめる（開けなければ例外） */
  async ready(): Promise<void> {
    await this.db;
  }

  async getEntry(day: DiaryDay): Promise<DiaryEntry | undefined> {
    return (await this.db).get("entries", day);
  }

  async putEntry(entry: DiaryEntry): Promise<void> {
    await (await this.db).put("entries", entry);
  }

  async deleteEntry(day: DiaryDay): Promise<void> {
    await (await this.db).delete("entries", day);
  }

  async listEntries(): Promise<DiaryEntry[]> {
    return (await this.db).getAll("entries");
  }

  async getSettings(): Promise<Settings> {
    const stored = await (await this.db).get("settings", SINGLE_KEY);
    const settings = { ...DEFAULT_SETTINGS, ...stored };
    if (!isValidDayBoundaryHour(settings.dayBoundaryHour)) {
      settings.dayBoundaryHour = DEFAULT_SETTINGS.dayBoundaryHour;
    }
    return settings;
  }

  async saveSettings(settings: Settings): Promise<void> {
    await (await this.db).put("settings", settings, SINGLE_KEY);
  }

  async getDraft(): Promise<Draft | undefined> {
    return (await this.db).get("draft", SINGLE_KEY);
  }

  async saveDraft(draft: Draft): Promise<void> {
    await (await this.db).put("draft", draft, SINGLE_KEY);
  }

  async clearDraft(): Promise<void> {
    await (await this.db).delete("draft", SINGLE_KEY);
  }
}
