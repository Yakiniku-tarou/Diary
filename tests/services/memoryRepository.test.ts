import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type DiaryEntry } from "../../src/core/types";
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

describe("MemoryDiaryRepository", () => {
  it("日記の保存・取得・一覧・削除（1日1件で上書き）", async () => {
    const repo = new MemoryDiaryRepository();
    await repo.putEntry(entry("2026-11-15"));
    await repo.putEntry(entry("2026-11-14"));
    await repo.putEntry({ ...entry("2026-11-15"), body: "上書き" });

    expect((await repo.getEntry("2026-11-15"))?.body).toBe("上書き");
    expect((await repo.listEntries()).map((e) => e.day).sort()).toEqual(["2026-11-14", "2026-11-15"]);

    await repo.deleteEntry("2026-11-15");
    expect(await repo.getEntry("2026-11-15")).toBeUndefined();
    expect(await repo.listEntries()).toHaveLength(1);
  });

  it("取り出した日記を書き換えても、保存内容は変わらない", async () => {
    const repo = new MemoryDiaryRepository();
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
    const repo = new MemoryDiaryRepository();
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS).toMatchObject({ model: "claude-haiku-5-5", style: "plain", dayBoundaryHour: 4 });

    await repo.saveSettings({ ...DEFAULT_SETTINGS, style: "polite", dayBoundaryHour: 5 });
    expect(await repo.getSettings()).toMatchObject({ style: "polite", dayBoundaryHour: 5, model: "claude-haiku-5-5" });
  });

  it("下書きの保存・取得・削除", async () => {
    const repo = new MemoryDiaryRepository();
    expect(await repo.getDraft()).toBeUndefined();
    await repo.saveDraft({ text: "話しかけ", updatedAt: "2026-11-15T00:00:00.000Z" });
    expect(await repo.getDraft()).toEqual({ text: "話しかけ", updatedAt: "2026-11-15T00:00:00.000Z" });
    await repo.clearDraft();
    expect(await repo.getDraft()).toBeUndefined();
  });
});
