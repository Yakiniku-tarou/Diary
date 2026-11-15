import { describe, expect, it } from "vitest";
import { searchEntries, sortNewestFirst } from "../../src/core/search";
import type { DiaryEntry } from "../../src/core/types";

function entry(day: string, overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    day,
    title: "タイトル",
    body: "本文",
    isComposed: true,
    segments: [{ id: `${day}-1`, recordedAt: `${day}T10:00:00.000Z`, transcript: "原文" }],
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:05:00.000Z`,
    ...overrides,
  };
}

const days = (entries: DiaryEntry[]) => entries.map((e) => e.day);

describe("sortNewestFirst", () => {
  it("新しい日付の順に並べ、元の配列は変えない", () => {
    const entries = [entry("2026-11-14"), entry("2026-12-01"), entry("2025-12-31")];
    expect(days(sortNewestFirst(entries))).toEqual(["2026-12-01", "2026-11-14", "2025-12-31"]);
    expect(days(entries)).toEqual(["2026-11-14", "2026-12-01", "2025-12-31"]);
  });
});

describe("searchEntries", () => {
  const entries = [
    entry("2026-11-13", { title: "散歩の日" }),
    entry("2026-11-14", { body: "友人とカレーを食べた。" }),
    entry("2026-11-15", {
      body: "仕事の話",
      segments: [{ id: "s", recordedAt: "2026-11-15T10:00:00.000Z", transcript: "えー、帰りに散歩した" }],
    }),
  ];

  it("キーワードが空なら全件を新しい順に返す", () => {
    expect(days(searchEntries(entries, ""))).toEqual(["2026-11-15", "2026-11-14", "2026-11-13"]);
    expect(days(searchEntries(entries, " 　 "))).toEqual(["2026-11-15", "2026-11-14", "2026-11-13"]);
  });

  it("タイトル・本文・原文のどれかに含まれれば見つかる", () => {
    expect(days(searchEntries(entries, "散歩"))).toEqual(["2026-11-15", "2026-11-13"]);
    expect(days(searchEntries(entries, "カレー"))).toEqual(["2026-11-14"]);
  });

  it("空白（全角も）で区切った語は、すべて含むものだけ", () => {
    expect(days(searchEntries(entries, "散歩　仕事"))).toEqual(["2026-11-15"]);
    expect(days(searchEntries(entries, "散歩 カレー"))).toEqual([]);
  });

  it("全角・半角、大文字・小文字の違いを無視する", () => {
    const list = [entry("2026-11-15", { body: "iPhone で Ｃｌａｕｄｅ を使った。ｶﾚｰ も食べた" })];
    expect(searchEntries(list, "IPHONE")).toHaveLength(1);
    expect(searchEntries(list, "claude")).toHaveLength(1);
    expect(searchEntries(list, "カレー")).toHaveLength(1);
  });

  it("見つからなければ空", () => {
    expect(searchEntries(entries, "旅行")).toEqual([]);
  });
});
