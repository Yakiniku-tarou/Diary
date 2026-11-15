// ふりかえりのカレンダー（月ごとの表）を組み立てる
import { dayToDate, formatDay } from "./day";
import type { DiaryDay } from "./types";

/** 年と月（month は 1〜12） */
export interface YearMonth {
  year: number;
  month: number;
}

export const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** その日記の日付が属する月 */
export function monthOfDay(day: DiaryDay): YearMonth {
  const date = dayToDate(day);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** delta か月ずらす（年をまたいでもよい） */
export function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const date = new Date(ym.year, ym.month - 1 + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() + 1 };
}

/** a が b より前なら負、同じなら 0、後なら正 */
export function compareMonth(a: YearMonth, b: YearMonth): number {
  return a.year * 12 + a.month - (b.year * 12 + b.month);
}

/** "2026年11月" */
export function formatMonthJa(ym: YearMonth): string {
  return `${ym.year}年${ym.month}月`;
}

/**
 * 1か月分の表。週ごと（日曜始まり）の配列で、その月に無いマスは null。
 */
export function buildMonthGrid(ym: YearMonth): (DiaryDay | null)[][] {
  const firstWeekday = new Date(ym.year, ym.month - 1, 1).getDay();
  const daysInMonth = new Date(ym.year, ym.month, 0).getDate();
  const cells: (DiaryDay | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(formatDay(new Date(ym.year, ym.month - 1, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (DiaryDay | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
