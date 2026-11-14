import { describe, expect, it } from "vitest";
import {
  dayToDate,
  formatDay,
  formatDiaryDayJa,
  formatTime,
  isValidDiaryDay,
  toDiaryDay,
} from "../../src/core/day";

// new Date(年, 月-1, 日, 時, 分) はローカル時刻
const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

describe("toDiaryDay（日付の境目）", () => {
  it("境目4時：3:59 は前日、4:00 は当日", () => {
    expect(toDiaryDay(at(2026, 11, 15, 3, 59), 4)).toBe("2026-11-14");
    expect(toDiaryDay(at(2026, 11, 15, 4, 0), 4)).toBe("2026-11-15");
  });

  it("境目4時：0:00 は前日、23:59 は当日", () => {
    expect(toDiaryDay(at(2026, 11, 15, 0, 0), 4)).toBe("2026-11-14");
    expect(toDiaryDay(at(2026, 11, 15, 23, 59), 4)).toBe("2026-11-15");
  });

  it("月末：12月1日 3:59 は 11月30日", () => {
    expect(toDiaryDay(at(2026, 12, 1, 3, 59), 4)).toBe("2026-11-30");
    expect(toDiaryDay(at(2026, 12, 1, 4, 0), 4)).toBe("2026-12-01");
  });

  it("2月末：うるう年でない年は 2月28日、うるう年は 2月29日", () => {
    expect(toDiaryDay(at(2026, 3, 1, 1), 4)).toBe("2026-02-28");
    expect(toDiaryDay(at(2028, 3, 1, 1), 4)).toBe("2028-02-29");
  });

  it("年末：1月1日 3:59 は前年の 12月31日", () => {
    expect(toDiaryDay(at(2027, 1, 1, 3, 59), 4)).toBe("2026-12-31");
    expect(toDiaryDay(at(2027, 1, 1, 4, 0), 4)).toBe("2027-01-01");
  });

  it("境目0時なら暦どおり", () => {
    expect(toDiaryDay(at(2026, 11, 15, 0, 0), 0)).toBe("2026-11-15");
  });

  it("境目は設定で変えられる（6時）", () => {
    expect(toDiaryDay(at(2026, 11, 15, 5, 59), 6)).toBe("2026-11-14");
    expect(toDiaryDay(at(2026, 11, 15, 6, 0), 6)).toBe("2026-11-15");
  });

  it("境目が範囲外・小数ならエラー", () => {
    expect(() => toDiaryDay(at(2026, 11, 15, 12), -1)).toThrow(RangeError);
    expect(() => toDiaryDay(at(2026, 11, 15, 12), 24)).toThrow(RangeError);
    expect(() => toDiaryDay(at(2026, 11, 15, 12), 4.5)).toThrow(RangeError);
  });
});

describe("日付の形式", () => {
  it("formatDay は0埋めする", () => {
    expect(formatDay(at(2026, 1, 5, 12))).toBe("2026-01-05");
  });

  it("isValidDiaryDay は存在しない日付や形式違いを弾く", () => {
    expect(isValidDiaryDay("2026-11-15")).toBe(true);
    expect(isValidDiaryDay("2028-02-29")).toBe(true);
    expect(isValidDiaryDay("2026-02-29")).toBe(false);
    expect(isValidDiaryDay("2026-13-01")).toBe(false);
    expect(isValidDiaryDay("2026-1-5")).toBe(false);
    expect(isValidDiaryDay("")).toBe(false);
  });

  it("dayToDate はローカル0時の Date を返し、不正な日付はエラー", () => {
    expect(dayToDate("2026-11-15").getTime()).toBe(at(2026, 11, 15, 0).getTime());
    expect(() => dayToDate("2026-02-30")).toThrow(RangeError);
  });

  it("formatDiaryDayJa は曜日つきの日本語", () => {
    expect(formatDiaryDayJa("2026-11-15")).toBe("2026年11月15日（日）");
    expect(formatDiaryDayJa("2027-01-01")).toBe("2027年1月1日（金）");
  });

  it("formatTime はローカル時刻の HH:MM（テストは日本時間）", () => {
    expect(formatTime("2026-11-15T00:05:00.000Z")).toBe("09:05");
  });
});
