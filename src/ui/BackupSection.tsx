import { useRef, useState } from "react";
import {
  BackupError,
  exportFileName,
  mergeBackup,
  parseBackupJson,
  toBackupJson,
  toMarkdown,
  type MergeResult,
} from "../core/backup";
import { formatDiaryDayJa, formatDay } from "../core/day";
import type { DiaryRepository } from "../core/ports";
import { ConfirmDialog } from "./ConfirmDialog";
import { shareOrDownload } from "./shareFile";

interface Notice {
  kind: "ok" | "error" | "info";
  text: string;
}

interface Props {
  repo: DiaryRepository;
  lastExportedAt: string | undefined;
  /** JSON を書き出せたとき（最後の書き出し日時を記録する） */
  onExported: (at: string) => void;
}

/** 設定画面の「バックアップ」：JSON 書き出し／読み込み、Markdown 書き出し */
export function BackupSection({ repo, lastExportedAt, onExported }: Props) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice>();
  const [pending, setPending] = useState<MergeResult>();
  const fileInput = useRef<HTMLInputElement>(null);

  const exportAs = async (kind: "json" | "markdown") => {
    if (busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const entries = await repo.listEntries();
      if (entries.length === 0) {
        setNotice({ kind: "info", text: "書き出す日記がまだありません。" });
        return;
      }
      const now = new Date();
      const result =
        kind === "json"
          ? await shareOrDownload(exportFileName(now, "json"), toBackupJson(entries, now), "application/json")
          : await shareOrDownload(exportFileName(now, "markdown"), toMarkdown(entries), "text/markdown");
      if (result === "cancelled") return;
      // バックアップとして数えるのは JSON だけ（Markdown は読む用で、読み込めない）
      if (kind === "json") onExported(now.toISOString());
      setNotice({
        kind: "ok",
        text: `${entries.length}件の日記を書き出しました。${result === "shared" ? "" : "ダウンロードしたファイルを確認してください。"}`,
      });
    } catch {
      setNotice({ kind: "error", text: "書き出せませんでした。" });
    } finally {
      setBusy(false);
    }
  };

  const onFileChosen = async (file: File | undefined) => {
    if (!file || busy) return;
    setBusy(true);
    setNotice(undefined);
    try {
      const incoming = parseBackupJson(await file.text());
      const merge = mergeBackup(await repo.listEntries(), incoming);
      if (merge.toPut.length === 0) {
        setNotice({
          kind: "info",
          text:
            incoming.length === 0
              ? "バックアップに日記が入っていませんでした。"
              : `読み込む必要のある日記はありませんでした（${merge.kept}件はこの端末のほうが新しいか同じです）。`,
        });
      } else {
        setPending(merge);
      }
    } catch (e) {
      setNotice({
        kind: "error",
        text: e instanceof BackupError ? e.message : "ファイルを読み込めませんでした。",
      });
    } finally {
      setBusy(false);
      // 同じファイルをもう一度選べるようにする
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const applyImport = async () => {
    const merge = pending;
    setPending(undefined);
    if (!merge || busy) return;
    setBusy(true);
    let saved = 0;
    try {
      for (const entry of merge.toPut) {
        await repo.putEntry(entry);
        saved++;
      }
      setNotice({ kind: "ok", text: `読み込みました（追加 ${merge.added}件、更新 ${merge.updated}件）。` });
    } catch {
      setNotice({
        kind: "error",
        text: `読み込みの途中で保存できなくなりました（${merge.toPut.length}件中 ${saved}件まで保存）。空き容量を確認して、もう一度読み込んでください。`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group">
      <h2>バックアップ</h2>
      <p className="field-help">
        日記はこの端末の中にしかありません。ときどき JSON を書き出して、「ファイル」などに保存してください。
        {lastExportedAt
          ? `最後の書き出し：${formatDiaryDayJa(formatDay(new Date(lastExportedAt)))}`
          : "まだ一度も書き出していません。"}
      </p>

      <button type="button" className="button secondary" disabled={busy} onClick={() => void exportAs("json")}>
        JSON を書き出す（バックアップ）
      </button>
      <button type="button" className="button secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
        JSON を読み込む
      </button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void onFileChosen(e.target.files?.[0])}
      />
      <button type="button" className="button secondary" disabled={busy} onClick={() => void exportAs("markdown")}>
        Markdown を書き出す（読む用）
      </button>
      <p className="field-help">バックアップに APIキーは含まれません。</p>

      {notice && (
        <p className={`notice ${notice.kind === "info" ? "" : notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
          {notice.text}
        </p>
      )}

      <ConfirmDialog
        open={pending !== undefined}
        message="バックアップを読み込みますか？"
        detail={
          pending
            ? `追加 ${pending.added}件、更新 ${pending.updated}件（バックアップのほうが新しい日記で置き換えます）、そのまま ${pending.kept}件。`
            : ""
        }
        confirmLabel="読み込む"
        onConfirm={() => void applyImport()}
        onCancel={() => setPending(undefined)}
      />
    </section>
  );
}
