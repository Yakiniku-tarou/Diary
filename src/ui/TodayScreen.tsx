import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatDiaryDayJa, toDiaryDay } from "../core/day";
import { addVoiceInput, regenerateEntry, type ComposeOutcome } from "../core/diary";
import { createDraftSaver } from "../core/draftSaver";
import { composeErrorDetail, composeErrorMessage } from "../core/errors";
import type { DiaryDay, DiaryEntry } from "../core/types";
import type { AppServices } from "./App";

interface Notice {
  kind: "error" | "info";
  text: string;
  detail?: string;
}

type Busy = "composing" | "saving" | undefined;

export function TodayScreen({ services }: { services: AppServices }) {
  const { repo } = services;
  const [day, setDay] = useState<DiaryDay>();
  const [entry, setEntry] = useState<DiaryEntry>();
  const [text, setText] = useState("");
  const [inputOpen, setInputOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>();
  const [notice, setNotice] = useState<Notice>();
  const busyRef = useRef(false);

  const draftSaver = useMemo(
    () =>
      createDraftSaver(repo, {
        onError: () => setNotice({ kind: "error", text: "下書きを保存できませんでした。端末の空き容量を確認してください。" }),
      }),
    [repo],
  );

  /** 今日の日付（境目を反映）と、その日の日記を読み込む */
  const loadToday = useCallback(async () => {
    const settings = await repo.getSettings();
    const today = toDiaryDay(new Date(), settings.dayBoundaryHour);
    setDay(today);
    setEntry(await repo.getEntry(today));
  }, [repo]);

  // 起動時：日記と下書きを読み込む
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await loadToday();
        const draft = await repo.getDraft();
        if (!cancelled && draft?.text) {
          setText(draft.text);
          setInputOpen(true);
        }
      } catch {
        if (!cancelled) setNotice({ kind: "error", text: "日記を読み込めませんでした。" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadToday, repo]);

  // アプリに戻ってきたとき、日付が変わっていれば表示を切り替える
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !busyRef.current) void loadToday().catch(() => undefined);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadToday]);

  const onChangeText = (value: string) => {
    setText(value);
    draftSaver.save(value);
  };

  const showOutcome = (outcome: ComposeOutcome) => {
    setEntry(outcome.entry);
    if (outcome.status === "failed") {
      const detail = composeErrorDetail(outcome.error);
      setNotice({ kind: "error", text: composeErrorMessage(outcome.error), ...(detail ? { detail } : {}) });
    } else if (outcome.status === "conflict") {
      setNotice({ kind: "info", text: "まとめている間に日記が変更されたため、まとめた結果は反映していません。" });
    }
  };

  const run = async (kind: NonNullable<Busy>, task: () => Promise<ComposeOutcome>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setNotice(undefined);
    try {
      showOutcome(await task());
    } catch {
      setNotice({ kind: "error", text: "保存できませんでした。入力した内容は下書きに残っています。" });
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  };

  const submit = (compose: boolean) => {
    if (!day || !text.trim()) return;
    void run(compose ? "composing" : "saving", async () => {
      const settings = await repo.getSettings();
      return addVoiceInput(services, {
        day,
        transcript: text,
        style: settings.style,
        compose,
        // 原文を保存できた時点で、入力欄と下書きを空にする（まとめの完了は待たない）
        onTranscriptSaved: (saved) => {
          setEntry(saved);
          setText("");
          setInputOpen(false);
          draftSaver.save("");
        },
      });
    });
  };

  const composeLater = () => {
    if (!day) return;
    void run("composing", async () => {
      const settings = await repo.getSettings();
      return regenerateEntry(services, { day, style: settings.style });
    });
  };

  if (!day) return <p className="muted">読み込み中…</p>;

  const showInput = !entry || inputOpen;
  const canSubmit = text.trim() !== "" && !busy;

  return (
    <>
      <h1 className="page-title">{formatDiaryDayJa(day)}</h1>

      {entry && (
        <article className="entry">
          {entry.title !== formatDiaryDayJa(day) && <h2 className="entry-title">{entry.title}</h2>}
          <div className="entry-body">{entry.body}</div>
        </article>
      )}

      {busy === "composing" && (
        <p className="status" role="status">
          <span className="spinner" aria-hidden="true" />
          日記にまとめています…
        </p>
      )}

      {notice && (
        <div className={`notice ${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          <p>{notice.text}</p>
          {notice.detail && <p className="small">{notice.detail}</p>}
        </div>
      )}

      {entry && !entry.isComposed && !busy && (
        <div className="notice info">
          <p>まだ日記にまとめていません。あとでまとめ直せます。</p>
          <button type="button" className="button secondary" onClick={composeLater}>
            日記にまとめる
          </button>
        </div>
      )}

      {showInput ? (
        <div className="composer">
          <textarea
            className="voice-input"
            value={text}
            onChange={(e) => onChangeText(e.target.value)}
            placeholder="キーボードのマイクを押して話してください"
            aria-label={entry ? "追記する内容" : "今日の日記の内容"}
            disabled={busy !== undefined}
          />
          <button type="button" className="button primary" disabled={!canSubmit} onClick={() => submit(true)}>
            {entry ? "日記に追記する" : "日記にする"}
          </button>
          <button type="button" className="button text" disabled={!canSubmit} onClick={() => submit(false)}>
            まとめずにそのまま保存
          </button>
          {entry && text === "" && !busy && (
            <button type="button" className="button text" onClick={() => setInputOpen(false)}>
              閉じる
            </button>
          )}
        </div>
      ) : (
        !busy && (
          <button type="button" className="button secondary wide" onClick={() => setInputOpen(true)}>
            追記する
          </button>
        )
      )}
    </>
  );
}
