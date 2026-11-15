import { useEffect, useMemo, useRef, useState } from "react";
import { formatDiaryDayJa, formatTime } from "../core/day";
import { addVoiceInput, regenerateEntry, undoLastCompose, type ComposeOutcome } from "../core/diary";
import { createDraftSaver } from "../core/draftSaver";
import { composeErrorDetail, composeErrorMessage } from "../core/errors";
import type { DiaryDay, DiaryEntry } from "../core/types";
import { findSpeechRecognition, startSpeechRecognition, type SpeechSession } from "../services/speechRecognizer";
import type { AppServices } from "./App";
import { ConfirmDialog } from "./ConfirmDialog";
import { EntryEditor } from "./EntryEditor";

interface Notice {
  kind: "error" | "info";
  text: string;
  detail?: string;
}

type Busy = "composing" | "saving" | undefined;
type Confirming = "regenerate" | "delete" | undefined;

interface Props {
  services: AppServices;
  day: DiaryDay;
  /** 下書きの復元：今日の画面ではどの下書きも戻す。過去の日の画面ではその日宛てのものだけ */
  restoreDraft: "any" | "same-day";
}

/** ある1日の日記の画面：入力 → 日記にする、表示・編集、追記、まとめ直し、元に戻す、原文、削除 */
export function DayScreen({ services, day, restoreDraft }: Props) {
  const { repo } = services;
  const [loaded, setLoaded] = useState(false);
  const [entry, setEntry] = useState<DiaryEntry>();
  // 外から本文が変わるたびに増やし、編集欄を作り直す（自分の自動保存では増やさない）
  const [revision, setRevision] = useState(0);
  const [text, setText] = useState("");
  const [inputOpen, setInputOpen] = useState(false);
  const [showSegments, setShowSegments] = useState(false);
  const [busy, setBusy] = useState<Busy>();
  const [confirming, setConfirming] = useState<Confirming>();
  const [notice, setNotice] = useState<Notice>();
  const busyRef = useRef(false);
  const flushEdits = useRef<() => Promise<void>>(() => Promise.resolve());
  // 録音ボタン（実験的）。ブラウザの音声認識が無い環境では出さない
  const Recognition = useMemo(() => findSpeechRecognition(), []);
  const [recording, setRecording] = useState(false);
  const speech = useRef<SpeechSession | undefined>(undefined);

  const draftSaver = useMemo(
    () =>
      createDraftSaver(repo, {
        onError: () => setNotice({ kind: "error", text: "下書きを保存できませんでした。端末の空き容量を確認してください。" }),
      }),
    [repo],
  );

  const replaceEntry = (next: DiaryEntry | undefined) => {
    setEntry(next);
    setRevision((r) => r + 1);
  };

  // 開いたとき：日記と下書きを読み込む
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [stored, draft] = await Promise.all([repo.getEntry(day), repo.getDraft()]);
        if (cancelled) return;
        replaceEntry(stored);
        if (draft?.text && (restoreDraft === "any" || draft.day === day)) {
          setText(draft.text);
          setInputOpen(true);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setNotice({ kind: "error", text: "日記を読み込めませんでした。" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, day, restoreDraft]);

  const onChangeText = (value: string) => {
    setText(value);
    draftSaver.save(value, day);
  };

  // 画面を離れるときは録音を打ち切る（聞き取った分は下書きに入っている）
  useEffect(() => () => speech.current?.cancel(), []);

  const startRecording = () => {
    if (!Recognition || recording) return;
    const base = text;
    setNotice(undefined);
    setRecording(true);
    speech.current = startSpeechRecognition(Recognition, {
      // 聞き取った内容は、ふつうの入力と同じように下書きへ自動保存する
      onText: (spoken) => onChangeText(base + spoken),
      onEnd: (error) => {
        setRecording(false);
        if (error === "not-allowed") {
          setNotice({ kind: "error", text: "マイクを使えませんでした。キーボードのマイクで入力してください。" });
        } else if (error === "failed") {
          setNotice({ kind: "error", text: "録音を続けられませんでした。キーボードのマイクで入力してください。" });
        }
      },
    });
  };

  const showOutcome = (outcome: ComposeOutcome) => {
    replaceEntry(outcome.entry);
    if (outcome.status === "failed") {
      const detail = composeErrorDetail(outcome.error);
      setNotice({ kind: "error", text: composeErrorMessage(outcome.error), ...(detail ? { detail } : {}) });
    } else if (outcome.status === "conflict") {
      setNotice({ kind: "info", text: "まとめている間に日記が変更されたため、まとめた結果は反映していません。" });
    }
  };

  /** 日記を書き換える操作を1つずつ行う。始める前に、編集中の内容を保存しておく */
  const run = async (kind: NonNullable<Busy>, task: () => Promise<void>, failureText: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(kind);
    setNotice(undefined);
    try {
      await flushEdits.current();
      await task();
    } catch {
      setNotice({ kind: "error", text: failureText });
    } finally {
      busyRef.current = false;
      setBusy(undefined);
    }
  };

  const submit = (compose: boolean) => {
    if (!text.trim()) return;
    void run(
      compose ? "composing" : "saving",
      async () => {
        const settings = await repo.getSettings();
        const outcome = await addVoiceInput(services, {
          day,
          transcript: text,
          style: settings.style,
          format: settings.format,
          compose,
          // 原文を保存できた時点で、入力欄と下書きを空にする（まとめの完了は待たない）
          onTranscriptSaved: (saved) => {
            replaceEntry(saved);
            setText("");
            setInputOpen(false);
            draftSaver.save("");
          },
        });
        showOutcome(outcome);
      },
      "保存できませんでした。入力した内容は下書きに残っています。",
    );
  };

  const regenerate = () => {
    setConfirming(undefined);
    void run(
      "composing",
      async () => {
        const settings = await repo.getSettings();
        showOutcome(await regenerateEntry(services, { day, style: settings.style, format: settings.format }));
      },
      "まとめ直せませんでした。",
    );
  };

  const undo = () => {
    void run(
      "saving",
      async () => {
        const restored = await undoLastCompose(services, day);
        if (restored) replaceEntry(restored);
      },
      "元に戻せませんでした。",
    );
  };

  const remove = () => {
    setConfirming(undefined);
    void run(
      "saving",
      async () => {
        await repo.deleteEntry(day);
        replaceEntry(undefined);
        setShowSegments(false);
        setInputOpen(false);
      },
      "削除できませんでした。",
    );
  };

  const dayLabel = formatDiaryDayJa(day);

  if (!loaded) {
    return (
      <>
        <h1 className="page-title">{dayLabel}</h1>
        {notice ? <p className="notice error">{notice.text}</p> : <p className="muted">読み込み中…</p>}
      </>
    );
  }

  const showInput = !entry || inputOpen;
  const canSubmit = text.trim() !== "" && !busy && !recording;
  const hasSegments = (entry?.segments.length ?? 0) > 0;

  return (
    <>
      <h1 className="page-title">{dayLabel}</h1>

      {entry && (
        <EntryEditor
          key={revision}
          repo={repo}
          entry={entry}
          disabled={busy !== undefined}
          onSaved={setEntry}
          onError={() => setNotice({ kind: "error", text: "編集した内容を保存できませんでした。" })}
          flushRef={flushEdits}
        />
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

      {entry && !entry.isComposed && hasSegments && !busy && (
        <div className="notice info">
          <p>まだ日記にまとめていません。あとでまとめ直せます。</p>
          <button type="button" className="button secondary" onClick={regenerate}>
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
            aria-label={entry ? "追記する内容" : "日記の内容"}
            disabled={busy !== undefined}
            // 録音中は聞き取った内容で書き換わるので、手では打てないようにする
            readOnly={recording}
          />
          {Recognition &&
            (recording ? (
              <button type="button" className="mic-button recording" onClick={() => speech.current?.stop()}>
                <span className="recording-dot" aria-hidden="true" />
                聞き取り中… タップで止める
              </button>
            ) : (
              <button type="button" className="mic-button" disabled={busy !== undefined} onClick={startRecording}>
                <svg className="mic-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3a3 3 0 0 1 3 3v5a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M6 11a6 6 0 0 0 12 0 M12 17v4 M9 21h6" />
                </svg>
                タップして話す
              </button>
            ))}
          <button type="button" className="button primary" disabled={!canSubmit} onClick={() => submit(true)}>
            {entry ? "日記に追記する" : "日記にする"}
          </button>
          <button type="button" className="button text" disabled={!canSubmit} onClick={() => submit(false)}>
            まとめずにそのまま保存
          </button>
          {entry && text === "" && !busy && !recording && (
            <button type="button" className="button text" onClick={() => setInputOpen(false)}>
              閉じる
            </button>
          )}
        </div>
      ) : (
        <div className="actions">
          <button type="button" className="button secondary wide" disabled={busy !== undefined} onClick={() => setInputOpen(true)}>
            追記する
          </button>
          <div className="actions-row">
            <button type="button" className="button text" disabled={busy !== undefined || !hasSegments} onClick={() => setShowSegments((v) => !v)}>
              {showSegments ? "原文を閉じる" : "原文を見る"}
            </button>
            <button type="button" className="button text" disabled={busy !== undefined || !hasSegments} onClick={() => setConfirming("regenerate")}>
              まとめ直す
            </button>
            {entry?.previousBody !== undefined && (
              <button type="button" className="button text" disabled={busy !== undefined} onClick={undo}>
                元に戻す
              </button>
            )}
            <button type="button" className="button text danger-text" disabled={busy !== undefined} onClick={() => setConfirming("delete")}>
              削除
            </button>
          </div>
        </div>
      )}

      {entry && showSegments && (
        <section className="segments" aria-label="話した原文">
          <h2>話した原文</h2>
          <ol>
            {entry.segments.map((segment) => (
              <li key={segment.id}>
                <time dateTime={segment.recordedAt}>{formatTime(segment.recordedAt)}</time>
                <p>{segment.transcript}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      <ConfirmDialog
        open={confirming === "regenerate"}
        message="この日の原文すべてから、日記をまとめ直しますか？"
        detail="いまの本文とタイトルは置き換わります。本文は「元に戻す」で1回だけ戻せます。"
        confirmLabel="まとめ直す"
        onConfirm={regenerate}
        onCancel={() => setConfirming(undefined)}
      />
      <ConfirmDialog
        open={confirming === "delete"}
        message={`${dayLabel}の日記を削除しますか？`}
        detail="本文と、話した原文がすべて消えます。元には戻せません。"
        confirmLabel="削除する"
        danger
        onConfirm={remove}
        onCancel={() => setConfirming(undefined)}
      />
    </>
  );
}
