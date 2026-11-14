// 日付の扱い。すべて端末のローカル時刻で判定する
import type { DiaryDay } from "./types";

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Date のローカル日付を "YYYY-MM-DD" にする */
export function formatDay(date: Date): DiaryDay {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function isValidDayBoundaryHour(hour: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

/**
 * その時刻に書いた内容が、どの日の日記になるか。
 * 境目（既定 4時）より前の時刻は前日の日記になる。
 */
export function toDiaryDay(now: Date, dayBoundaryHour: number): DiaryDay {
  if (!isValidDayBoundaryHour(dayBoundaryHour)) {
    throw new RangeError("日付の境目は 0〜23 の整数で指定してください");
  }
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < dayBoundaryHour) {
    date.setDate(date.getDate() - 1);
  }
  return formatDay(date);
}

export function isValidDiaryDay(value: string): boolean {
  const m = DAY_PATTERN.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d;
}

/** "YYYY-MM-DD" をその日のローカル 0時の Date にする */
export function dayToDate(day: DiaryDay): Date {
  if (!isValidDiaryDay(day)) throw new RangeError(`日付の形式が正しくありません: ${day}`);
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

/** "2026年11月15日（日）" */
export function formatDiaryDayJa(day: DiaryDay): string {
  const date = dayToDate(day);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`;
}

/** ISO 8601 の時刻をローカルの "HH:MM" にする */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
