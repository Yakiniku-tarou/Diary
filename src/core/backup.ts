// バックアップ（JSON 書き出し・読み込み）と Markdown 書き出し（SPEC.md 3.3, 5.4）
// APIキーは扱わない（バックアップには日記だけを入れる）
import { formatDay, formatDiaryDayJa, isValidDiaryDay } from "./day";
import type { DiaryEntry, VoiceSegment } from "./types";

const BACKUP_APP = "VoiceDiary";
const BACKUP_VERSION = 1;

/** 書き出しの催促を出すまでの日数 */
export const EXPORT_REMINDER_DAYS = 30;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  entries: DiaryEntry[];
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

const byDayAsc = (a: DiaryEntry, b: DiaryEntry) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0);

/** 日記だけを並べた JSON にする（設定・APIキーは含めない） */
export function toBackupJson(entries: readonly DiaryEntry[], exportedAt: Date): string {
  const file: BackupFile = {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    // 余計なプロパティが混ざらないよう、型の項目だけを書き出す
    entries: [...entries].sort(byDayAsc).map(pickEntry),
  };
  return JSON.stringify(file, null, 2);
}

function pickEntry(e: DiaryEntry): DiaryEntry {
  return {
    day: e.day,
    title: e.title,
    body: e.body,
    ...(e.previousBody !== undefined ? { previousBody: e.previousBody } : {}),
    isComposed: e.isComposed,
    segments: e.segments.map((s) => ({ id: s.id, recordedAt: s.recordedAt, transcript: s.transcript })),
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const isString = (v: unknown): v is string => typeof v === "string";
const isIsoDate = (v: unknown): v is string => isString(v) && !Number.isNaN(Date.parse(v));

function isSegment(v: unknown): v is VoiceSegment {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return isString(s.id) && isIsoDate(s.recordedAt) && isString(s.transcript);
}

function isEntry(v: unknown): v is DiaryEntry {
  if (typeof v !== "object" || v === null) return false;
  const e = v as Record<string, unknown>;
  return (
    isString(e.day) &&
    isValidDiaryDay(e.day) &&
    isString(e.title) &&
    isString(e.body) &&
    (e.previousBody === undefined || isString(e.previousBody)) &&
    typeof e.isComposed === "boolean" &&
    Array.isArray(e.segments) &&
    e.segments.every(isSegment) &&
    isIsoDate(e.createdAt) &&
    isIsoDate(e.updatedAt)
  );
}

/** バックアップ JSON を読む。形が正しくなければ BackupError（1件でも壊れていれば読み込まない） */
export function parseBackupJson(text: string): DiaryEntry[] {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new BackupError("JSON ファイルとして読めませんでした。");
  }
  if (typeof value !== "object" || value === null || (value as { app?: unknown }).app !== BACKUP_APP) {
    throw new BackupError("このアプリのバックアップファイルではありません。");
  }
  const file = value as { version?: unknown; entries?: unknown };
  if (file.version !== BACKUP_VERSION) {
    throw new BackupError("対応していない形式のバックアップです。");
  }
  if (!Array.isArray(file.entries)) {
    throw new BackupError("バックアップに日記が入っていません。");
  }
  const days = new Set<string>();
  file.entries.forEach((entry, i) => {
    if (!isEntry(entry)) throw new BackupError(`${i + 1}件目の日記の形式が正しくありません。`);
    if (days.has(entry.day)) throw new BackupError(`${entry.day} の日記が重複しています。`);
    days.add(entry.day);
  });
  return (file.entries as DiaryEntry[]).map(pickEntry);
}

export interface MergeResult {
  /** 保存するもの（新規＋更新） */
  toPut: DiaryEntry[];
  added: number;
  updated: number;
  /** 端末内のほうが新しい（または同じ）ので残したもの */
  kept: number;
}

/** 読み込み：同じ日付は更新日時が新しいほうを残す */
export function mergeBackup(current: readonly DiaryEntry[], incoming: readonly DiaryEntry[]): MergeResult {
  const byDay = new Map(current.map((e) => [e.day, e]));
  const result: MergeResult = { toPut: [], added: 0, updated: 0, kept: 0 };
  for (const entry of incoming) {
    const existing = byDay.get(entry.day);
    if (!existing) {
      result.toPut.push(entry);
      result.added++;
    } else if (Date.parse(entry.updatedAt) > Date.parse(existing.updatedAt)) {
      result.toPut.push(entry);
      result.updated++;
    } else {
      result.kept++;
    }
  }
  return result;
}

/** 読む用の Markdown（古い順） */
export function toMarkdown(entries: readonly DiaryEntry[]): string {
  const sections = [...entries].sort(byDayAsc).map((e) => {
    const dayLabel = formatDiaryDayJa(e.day);
    const heading = e.title.trim() && e.title !== dayLabel ? `${dayLabel}　${e.title.trim()}` : dayLabel;
    return `## ${heading}\n\n${e.body.trim()}\n`;
  });
  return ["# 音声日記\n", ...sections].join("\n");
}

/** 書き出すファイル名。日付は端末のローカル日付 */
export function exportFileName(now: Date, kind: "json" | "markdown"): string {
  return `voice-diary-${formatDay(now)}.${kind === "json" ? "json" : "md"}`;
}

/**
 * 書き出しの催促を出すか。
 * 最後の書き出しから30日以上たっていたら出す。一度も書き出していなければ、最も古い日記の作成から数える。
 */
export function shouldRemindExport(
  lastExportedAt: string | undefined,
  entries: readonly DiaryEntry[],
  now: Date,
): boolean {
  if (entries.length === 0) return false;
  const since = lastExportedAt
    ? Date.parse(lastExportedAt)
    : Math.min(...entries.map((e) => Date.parse(e.createdAt)));
  const elapsedMs = now.getTime() - since;
  return elapsedMs >= EXPORT_REMINDER_DAYS * 24 * 60 * 60 * 1000;
}
