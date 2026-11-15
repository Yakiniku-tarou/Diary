import { describe, expect, it } from "vitest";
import { buildMonthGrid, compareMonth, formatMonthJa, monthOfDay, shiftMonth } from "../../src/core/calendar";

describe("月の計算", () => {
  it("日付から月を取り出す", () => {
    expect(monthOfDay("2026-11-15")).toEqual({ year: 2026, month: 11 });
    expect(monthOfDay("2026-01-01")).toEqual({ year: 2026, month: 1 });
  });

  it("月をずらす（年をまたぐ）", () => {
    expect(shiftMonth({ year: 2026, month: 11 }, 1)).toEqual({ year: 2026, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 3 }, -14)).toEqual({ year: 2025, month: 1 });
  });

  it("月の前後を比べる", () => {
    expect(compareMonth({ year: 2026, month: 11 }, { year: 2026, month: 11 })).toBe(0);
    expect(compareMonth({ year: 2025, month: 12 }, { year: 2026, month: 1 })).toBeLessThan(0);
    expect(compareMonth({ year: 2026, month: 2 }, { year: 2026, month: 1 })).toBeGreaterThan(0);
  });

  it("日本語の表記", () => {
    expect(formatMonthJa({ year: 2026, month: 3 })).toBe("2026年3月");
  });
});

describe("buildMonthGrid", () => {
  it("2026年11月：1日は日曜、30日まで、5週", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 11 });
    expect(weeks).toHaveLength(5);
    expect(weeks[0]).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
    expect(weeks[4]).toEqual(["2026-11-29", "2026-11-30", null, null, null, null, null]);
  });

  it("2026年8月：1日は土曜で、6週になる", () => {
    const weeks = buildMonthGrid({ year: 2026, month: 8 });
    expect(weeks).toHaveLength(6);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-08-01"]);
    expect(weeks[5]).toEqual(["2026-08-30", "2026-08-31", null, null, null, null, null]);
  });

  it("うるう年の2月は29日まで、平年は28日まで", () => {
    const days = (year: number) =>
      buildMonthGrid({ year, month: 2 })
        .flat()
        .filter((d) => d !== null);
    expect(days(2028).at(-1)).toBe("2028-02-29");
    expect(days(2027).at(-1)).toBe("2027-02-28");
    expect(days(2027)).toHaveLength(28);
  });

  it("どの週も7マス", () => {
    for (let month = 1; month <= 12; month++) {
      for (const week of buildMonthGrid({ year: 2026, month })) expect(week).toHaveLength(7);
    }
  });
});
