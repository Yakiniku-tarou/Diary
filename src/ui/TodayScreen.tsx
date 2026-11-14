import { useCallback, useEffect, useState } from "react";
import { toDiaryDay } from "../core/day";
import type { DiaryDay } from "../core/types";
import type { AppServices } from "./App";
import { DayScreen } from "./DayScreen";

/** 「今日」：日付の境目を反映した今日の日記を開く */
export function TodayScreen({ services }: { services: AppServices }) {
  const { repo } = services;
  const [day, setDay] = useState<DiaryDay>();
  const [failed, setFailed] = useState(false);

  const refreshDay = useCallback(async () => {
    const settings = await repo.getSettings();
    setDay(toDiaryDay(new Date(), settings.dayBoundaryHour));
  }, [repo]);

  useEffect(() => {
    refreshDay().catch(() => setFailed(true));
    // アプリに戻ってきたとき、日付が変わっていれば新しい日に切り替える
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshDay().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshDay]);

  if (failed) return <p className="notice error">日記を読み込めませんでした。</p>;
  if (!day) return <p className="muted">読み込み中…</p>;
  // 日付が変わったら画面ごと作り直す（入力途中の内容は下書きから戻る）
  return <DayScreen key={day} services={services} day={day} restoreDraft="any" />;
}
