// メモリ内版と IndexedDB 版の両方に、同じテストをかける
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { DiaryRepository } from "../../src/core/ports";
import { DEFAULT_SETTINGS, type DiaryEntry } from "../../src/core/types";
import { IndexedDbDiaryRepository } from "../../src/services/indexedDbRepository";
import { MemoryDiaryRepository } from "../../src/services/memoryRepository";

const entry = (day: string): DiaryEntry => ({
  day,
  title: "t",
  body: "b",
  isComposed: true,
  segments: [{ id: "1", recordedAt: "2026-11-15T00:00:00.000Z", transcript: "原文" }],
  createdAt: "2026-11-15T00:00:00.000Z",
  updatedAt: "2026-11-15T00:00:00.000Z",
});

let dbCount = 0;
const implementations: [string, () => DiaryRepository][] = [
  ["MemoryDiaryRepository", () => new MemoryDiaryRepository()],
  ["IndexedDbDiaryRepository", () => new IndexedDbDiaryRepository(`test-db-${++dbCount}`)],
];

describe.each(implementations)("%s", (_name, create) => {
  it("日記の保存・取得・一覧・削除（1日1件で上書き）", async () => {
    const repo = create();
    await repo.putEntry(entry("2026-11-15"));
    await repo.putEntry(entry("2026-11-14"));
    await repo.putEntry({ ...entry("2026-11-15"), body: "上書き", previousBody: "b" });

    expect(await repo.getEntry("2026-11-15")).toEqual({ ...entry("2026-11-15"), body: "上書き", previousBody: "b" });
    expect((await repo.listEntries()).map((e) => e.day).sort()).toEqual(["2026-11-14", "2026-11-15"]);
    expect(await repo.getEntry("2026-01-01")).toBeUndefined();

    await repo.deleteEntry("2026-11-15");
    expect(await repo.getEntry("2026-11-15")).toBeUndefined();
    expect(await repo.listEntries()).toHaveLength(1);
  });

  it("取り出した日記を書き換えても、保存内容は変わらない", async () => {
    const repo = create();
    const e = entry("2026-11-15");
    await repo.putEntry(e);
    e.body = "外で書き換え";
    const got = await repo.getEntry("2026-11-15");
    if (!got) throw new Error("取得できない");
    got.title = "外で書き換え";
    (got.segments as unknown as { transcript: string }[])[0]!.transcript = "外で書き換え";

    expect(await repo.getEntry("2026-11-15")).toEqual(entry("2026-11-15"));
  });

  it("設定：未保存なら既定値、保存した項目はそれを返す", async () => {
    const repo = create();
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ apiKey: "", model: "claude-haiku-5-5", style: "plain", dayBoundaryHour: 4 });

    await repo.saveSettings({ ...DEFAULT_SETTINGS, apiKey: "key", style: "polite", dayBoundaryHour: 5 });
    expect(await repo.getSettings()).toEqual({ ...DEFAULT_SETTINGS, apiKey: "key", style: "polite", dayBoundaryHour: 5 });
  });

  it("下書きの保存・上書き・取得・削除", async () => {
    const repo = create();
    expect(await repo.getDraft()).toBeUndefined();
    await repo.saveDraft({ text: "話しかけ", updatedAt: "2026-11-15T00:00:00.000Z" });
    await repo.saveDraft({ text: "話しかけの続き", day: "2026-11-15", updatedAt: "2026-11-15T00:00:01.000Z" });
    expect(await repo.getDraft()).toEqual({ text: "話しかけの続き", day: "2026-11-15", updatedAt: "2026-11-15T00:00:01.000Z" });
    await repo.clearDraft();
    expect(await repo.getDraft()).toBeUndefined();
  });
});

describe("IndexedDbDiaryRepository", () => {
  it("開き直しても（再読み込みしても）内容が残る", async () => {
    const first = new IndexedDbDiaryRepository("persist-db");
    await first.putEntry(entry("2026-11-15"));
    await first.saveDraft({ text: "途中", updatedAt: "2026-11-15T00:00:00.000Z" });
    await first.saveSettings({ ...DEFAULT_SETTINGS, style: "polite" });

    const second = new IndexedDbDiaryRepository("persist-db");
    await second.ready();
    expect(await second.getEntry("2026-11-15")).toEqual(entry("2026-11-15"));
    expect((await second.getDraft())?.text).toBe("途中");
    expect((await second.getSettings()).style).toBe("polite");
  });

  it("保存された境目の時刻がおかしければ既定値に戻す", async () => {
    const repo = new IndexedDbDiaryRepository("broken-settings-db");
    await repo.saveSettings({ ...DEFAULT_SETTINGS, dayBoundaryHour: 99 });
    expect((await repo.getSettings()).dayBoundaryHour).toBe(4);
  });
});
