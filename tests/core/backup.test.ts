import { describe, expect, it } from "vitest";
import {
  BackupError,
  exportFileName,
  mergeBackup,
  parseBackupJson,
  shouldRemindExport,
  toBackupJson,
  toMarkdown,
} from "../../src/core/backup";
import type { DiaryEntry } from "../../src/core/types";

function entry(day: string, overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    day,
    title: `${day} のタイトル`,
    body: `${day} の本文`,
    isComposed: true,
    segments: [{ id: `${day}-1`, recordedAt: `${day}T10:00:00.000Z`, transcript: `${day} の原文` }],
    createdAt: `${day}T10:00:00.000Z`,
    updatedAt: `${day}T10:05:00.000Z`,
    ...overrides,
  };
}

describe("JSON バックアップ", () => {
  it("書き出して読み込むと元に戻る（previousBody も含む）", () => {
    const entries = [entry("2026-11-15", { previousBody: "前の本文" }), entry("2026-11-14")];
    const restored = parseBackupJson(toBackupJson(entries, new Date("2026-11-15T12:00:00Z")));
    expect(restored).toEqual([entry("2026-11-14"), entry("2026-11-15", { previousBody: "前の本文" })]);
  });

  it("日付の古い順に並び、余計な項目（APIキーなど）は入らない", () => {
    const withExtra = { ...entry("2026-11-15"), apiKey: "sk-ant-secret" } as DiaryEntry;
    const json = toBackupJson([withExtra, entry("2026-11-01")], new Date("2026-11-15T12:00:00Z"));
    expect(json).not.toContain("sk-ant-secret");
    expect(json).not.toContain("apiKey");
    const file = JSON.parse(json);
    expect(file).toMatchObject({ app: "VoiceDiary", version: 1, exportedAt: "2026-11-15T12:00:00.000Z" });
    expect(file.entries.map((e: DiaryEntry) => e.day)).toEqual(["2026-11-01", "2026-11-15"]);
  });

  it("壊れたファイル・別のファイルは BackupError", () => {
    expect(() => parseBackupJson("{壊れた")).toThrow(BackupError);
    expect(() => parseBackupJson(JSON.stringify({ foo: 1 }))).toThrow("このアプリのバックアップファイルではありません。");
    expect(() => parseBackupJson(JSON.stringify({ app: "VoiceDiary", version: 99, entries: [] }))).toThrow(BackupError);
    expect(() => parseBackupJson(JSON.stringify({ app: "VoiceDiary", version: 1 }))).toThrow(BackupError);
  });

  it("1件でも形式が正しくない日記があれば、全体を読み込まない", () => {
    const bad = (e: unknown) =>
      JSON.stringify({ app: "VoiceDiary", version: 1, exportedAt: "", entries: [entry("2026-11-14"), e] });
    expect(() => parseBackupJson(bad({ ...entry("2026-11-15"), day: "2026-02-30" }))).toThrow("2件目");
    expect(() => parseBackupJson(bad({ ...entry("2026-11-15"), isComposed: "yes" }))).toThrow(BackupError);
    expect(() => parseBackupJson(bad({ ...entry("2026-11-15"), segments: [{ id: "x" }] }))).toThrow(BackupError);
    expect(() => parseBackupJson(bad({ ...entry("2026-11-15"), updatedAt: "昨日" }))).toThrow(BackupError);
    expect(() => parseBackupJson(bad(entry("2026-11-14")))).toThrow("重複");
  });
});

describe("mergeBackup（同じ日付は更新日時が新しいほうを残す）", () => {
  it("新規は追加、新しいものは更新、古い・同じものは端末内を残す", () => {
    const current = [
      entry("2026-11-01", { updatedAt: "2026-11-01T12:00:00.000Z" }),
      entry("2026-11-02", { updatedAt: "2026-11-02T12:00:00.000Z" }),
      entry("2026-11-03", { updatedAt: "2026-11-03T12:00:00.000Z" }),
    ];
    const incoming = [
      entry("2026-11-01", { updatedAt: "2026-11-01T13:00:00.000Z", body: "新しい" }),
      entry("2026-11-02", { updatedAt: "2026-11-02T11:00:00.000Z", body: "古い" }),
      entry("2026-11-03", { updatedAt: "2026-11-03T12:00:00.000Z", body: "同じ時刻" }),
      entry("2026-11-04"),
    ];
    const r = mergeBackup(current, incoming);
    expect(r).toMatchObject({ added: 1, updated: 1, kept: 2 });
    expect(r.toPut.map((e) => [e.day, e.body])).toEqual([
      ["2026-11-01", "新しい"],
      ["2026-11-04", "2026-11-04 の本文"],
    ]);
  });

  it("タイムゾーン表記が違っても時刻で比べる", () => {
    const current = [entry("2026-11-01", { updatedAt: "2026-11-01T12:00:00.000Z" })];
    const incoming = [entry("2026-11-01", { updatedAt: "2026-11-01T20:30:00+09:00" })]; // = 11:30Z（古い）
    expect(mergeBackup(current, incoming).kept).toBe(1);
  });
});

describe("toMarkdown", () => {
  it("古い順に、日付とタイトルの見出しと本文を並べる。原文は入れない", () => {
    const md = toMarkdown([
      entry("2026-11-15", { title: "雨の日", body: "朝から雨だった。\n\n夜は晴れた。" }),
      entry("2026-11-14"),
    ]);
    expect(md).toBe(
      "# 音声日記\n\n" +
        "## 2026年11月14日（土）　2026-11-14 のタイトル\n\n2026-11-14 の本文\n\n" +
        "## 2026年11月15日（日）　雨の日\n\n朝から雨だった。\n\n夜は晴れた。\n",
    );
    expect(md).not.toContain("の原文");
  });

  it("タイトルが日付のまま・空なら、日付だけの見出しにする", () => {
    expect(toMarkdown([entry("2026-11-15", { title: "2026年11月15日（日）" })])).toContain("## 2026年11月15日（日）\n");
    expect(toMarkdown([entry("2026-11-15", { title: "" })])).toContain("## 2026年11月15日（日）\n");
  });
});

describe("exportFileName", () => {
  it("ローカル日付つきのファイル名", () => {
    const now = new Date(2026, 10, 15, 23, 0);
    expect(exportFileName(now, "json")).toBe("voice-diary-2026-11-15.json");
    expect(exportFileName(now, "markdown")).toBe("voice-diary-2026-11-15.md");
  });
});

describe("shouldRemindExport（30日たったら催促）", () => {
  const entries = [
    entry("2026-10-01", { createdAt: "2026-10-01T00:00:00.000Z" }),
    entry("2026-11-01", { createdAt: "2026-11-01T00:00:00.000Z" }),
  ];

  it("最後の書き出しから30日未満なら出さず、30日以上なら出す", () => {
    const last = "2026-10-16T00:00:00.000Z";
    expect(shouldRemindExport(last, entries, new Date("2026-11-14T23:59:59.000Z"))).toBe(false);
    expect(shouldRemindExport(last, entries, new Date("2026-11-15T00:00:00.000Z"))).toBe(true);
  });

  it("一度も書き出していなければ、最も古い日記の作成から数える", () => {
    expect(shouldRemindExport(undefined, entries, new Date("2026-10-30T00:00:00.000Z"))).toBe(false);
    expect(shouldRemindExport(undefined, entries, new Date("2026-10-31T00:00:00.000Z"))).toBe(true);
  });

  it("日記が無ければ出さない", () => {
    expect(shouldRemindExport(undefined, [], new Date("2030-01-01T00:00:00.000Z"))).toBe(false);
  });
});
