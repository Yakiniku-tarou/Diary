import { useCallback, useEffect, useMemo, useState } from "react";
import {
  WEEKDAY_LABELS,
  buildMonthGrid,
  compareMonth,
  formatMonthJa,
  monthOfDay,
  shiftMonth,
  type YearMonth,
} from "../core/calendar";
import { dayToDate, formatDiaryDayJa, toDiaryDay } from "../core/day";
import { searchEntries } from "../core/search";
import type { DiaryDay, DiaryEntry } from "../core/types";
import type { AppServices } from "./App";
import { DayScreen } from "./DayScreen";

type View = "calendar" | "list";

interface Loaded {
  entries: DiaryEntry[];
  today: DiaryDay;
}

/** 「ふりかえり」：カレンダー／リスト、キーワード検索、日付をタップして詳細へ */
export function ReviewScreen({ services }: { services: AppServices }) {
  const { repo } = services;
  const [loaded, setLoaded] = useState<Loaded>();
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>("calendar");
  const [month, setMonth] = useState<YearMonth>();
  const [query, setQuery] = useState("");
  const [openDay, setOpenDay] = useState<DiaryDay>();

  const reload = useCallback(async () => {
    const [entries, settings] = await Promise.all([repo.listEntries(), repo.getSettings()]);
    const today = toDiaryDay(new Date(), settings.dayBoundaryHour);
    setLoaded({ entries, today });
    setMonth((current) => current ?? monthOfDay(today));
  }, [repo]);

  // 開いたときと、詳細から戻ってきたときに読み直す
  useEffect(() => {
    if (openDay !== undefined) return;
    let cancelled = false;
    reload().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [reload, openDay]);

  const entryByDay = useMemo(() => new Map((loaded?.entries ?? []).map((e) => [e.day, e])), [loaded]);
  const results = useMemo(() => searchEntries(loaded?.entries ?? [], query), [loaded, query]);

  if (openDay !== undefined) {
    return (
      <>
        <button type="button" className="button text back" onClick={() => setOpenDay(undefined)}>
          ‹ ふりかえりに戻る
        </button>
        <DayScreen key={openDay} services={services} day={openDay} restoreDraft="same-day" />
      </>
    );
  }

  if (failed) return <p className="notice error">日記を読み込めませんでした。</p>;
  if (!loaded || !month) return <p className="muted">読み込み中…</p>;

  const searching = query.trim() !== "";
  const thisMonth = monthOfDay(loaded.today);

  return (
    <>
      <h1 className="page-title">ふりかえり</h1>

      <input
        type="search"
        className="search-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="キーワードで探す"
        aria-label="キーワードで探す"
        enterKeyHint="search"
      />

      {!searching && (
        <div className="segmented" role="group" aria-label="表示の切り替え">
          {(["calendar", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={v === view ? "segment active" : "segment"}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {v === "calendar" ? "カレンダー" : "リスト"}
            </button>
          ))}
        </div>
      )}

      {!searching && view === "calendar" ? (
        <section className="calendar" aria-label={formatMonthJa(month)}>
          <div className="calendar-header">
            <button type="button" className="month-nav" aria-label="前の月" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </button>
            <h2>{formatMonthJa(month)}</h2>
            <button
              type="button"
              className="month-nav"
              aria-label="次の月"
              disabled={compareMonth(month, thisMonth) >= 0}
              onClick={() => setMonth(shiftMonth(month, 1))}
            >
              ›
            </button>
          </div>
          <div className="calendar-grid">
            {WEEKDAY_LABELS.map((w) => (
              <span key={w} className="calendar-weekday" aria-hidden="true">
                {w}
              </span>
            ))}
            {buildMonthGrid(month)
              .flat()
              .map((day, i) => {
                if (day === null) return <span key={`blank-${i}`} />;
                const hasEntry = entryByDay.has(day);
                const classes = ["calendar-day", hasEntry ? "has-entry" : "", day === loaded.today ? "today" : ""];
                return (
                  <button
                    key={day}
                    type="button"
                    className={classes.filter(Boolean).join(" ")}
                    // 未来の日には書けない
                    disabled={day > loaded.today}
                    aria-label={`${formatDiaryDayJa(day)}${hasEntry ? "（日記あり）" : ""}`}
                    onClick={() => setOpenDay(day)}
                  >
                    {dayToDate(day).getDate()}
                    <span className="calendar-dot" aria-hidden="true" />
                  </button>
                );
              })}
          </div>
          <p className="field-help">印のある日に日記があります。印のない過去の日をタップすると、その日の日記を書けます。</p>
        </section>
      ) : (
        <>
          {searching && <p className="muted small">{results.length}件 見つかりました</p>}
          {results.length === 0 ? (
            <p className="muted">{searching ? "当てはまる日記はありません。" : "日記はまだありません。"}</p>
          ) : (
            <ul className="entry-list">
              {results.map((entry) => (
                <li key={entry.day}>
                  <button type="button" className="entry-list-item" onClick={() => setOpenDay(entry.day)}>
                    <span className="entry-list-day">{formatDiaryDayJa(entry.day)}</span>
                    {entry.title.trim() !== "" && <span className="entry-list-title">{entry.title}</span>}
                    <span className="entry-list-body">{entry.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
