import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createAutosaver } from "../core/autosaver";
import { formatDiaryDayJa } from "../core/day";
import { updateEntryText } from "../core/diary";
import type { DiaryRepository } from "../core/ports";
import type { DiaryEntry } from "../core/types";

type Patch = { title?: string; body?: string };

interface Props {
  repo: DiaryRepository;
  /** 表示する日記。外から内容が変わったとき（まとめ直しなど）は、親が key を変えて作り直す */
  entry: DiaryEntry;
  disabled: boolean;
  onSaved: (entry: DiaryEntry) => void;
  onError: () => void;
  /** 親が「いま編集中の内容をすぐ保存して」と頼むための口 */
  flushRef: RefObject<() => Promise<void>>;
}

/** タイトル・本文をその場で編集する。入力が止まって約1秒後に自動保存 */
export function EntryEditor({ repo, entry, disabled, onSaved, onError, flushRef }: Props) {
  const dayLabel = formatDiaryDayJa(entry.day);
  // タイトルがまだ日付のままなら、空欄として見せる
  const [title, setTitle] = useState(entry.title === dayLabel ? "" : entry.title);
  const [body, setBody] = useState(entry.body);
  const [status, setStatus] = useState<"idle" | "editing" | "saved">("idle");
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const dirty = useRef<Patch>({});
  const callbacks = useRef({ onSaved, onError });
  callbacks.current = { onSaved, onError };

  const saver = useMemo(
    () =>
      createAutosaver<Patch>(
        async (patch) => {
          const updated = await updateEntryText({ repo }, entry.day, patch);
          if (dirty.current === patch) {
            dirty.current = {};
            setStatus("saved");
          }
          callbacks.current.onSaved(updated);
        },
        { onError: () => callbacks.current.onError() },
      ),
    [repo, entry.day],
  );

  flushRef.current = () => saver.flush();

  // アプリを閉じる・別の画面へ移るときは、待たずに保存する
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      void saver.flush();
    };
  }, [saver]);

  // 本文の入力欄を内容の高さに合わせる
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body]);

  const change = (patch: Patch) => {
    dirty.current = { ...dirty.current, ...patch };
    saver.schedule(dirty.current);
    setStatus("editing");
  };

  return (
    <article className="entry">
      <input
        className="entry-title-input"
        type="text"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          change({ title: e.target.value });
        }}
        onBlur={() => void saver.flush()}
        placeholder="タイトル"
        aria-label="タイトル"
        disabled={disabled}
      />
      <textarea
        ref={bodyRef}
        className="entry-body-input"
        value={body}
        onChange={(e) => {
          setBody(e.target.value);
          change({ body: e.target.value });
        }}
        onBlur={() => void saver.flush()}
        aria-label="本文"
        rows={1}
        disabled={disabled}
      />
      <p className="save-status" aria-live="polite">
        {status === "editing" ? "編集中…" : status === "saved" ? "保存しました" : " "}
      </p>
    </article>
  );
}
