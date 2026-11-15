// 日記にまとめる処理の流れ（SPEC.md 6.1）
//
// 大原則：API を呼ぶ前に、原文を VoiceSegment として保存する。
// 先に保存する状態は「原文を本文の末尾に足し、isComposed = false」で、
// これは API 失敗時に残すべき状態そのもの。途中でアプリが閉じられても内容は残る。
import { formatDiaryDayJa } from "./day";
import { ComposeError, toComposeError } from "./errors";
import { parseComposerResponse } from "./parse";
import type { DiaryComposer, DiaryRepository } from "./ports";
import { buildAppendPrompt, buildNewPrompt } from "./prompt";
import type { DiaryDay, DiaryEntry, DiaryFormat, DiaryStyle, VoiceSegment } from "./types";

export interface DiaryDeps {
  repo: DiaryRepository;
  composer: DiaryComposer;
  now?: () => Date;
  newId?: () => string;
}

export type ComposeOutcome =
  /** 日記にまとめて保存した */
  | { status: "composed"; entry: DiaryEntry }
  /** まとめずにそのまま保存した */
  | { status: "saved"; entry: DiaryEntry }
  /** まとめに失敗した。原文は保存済みで、あとでまとめ直せる */
  | { status: "failed"; entry: DiaryEntry; error: ComposeError }
  /** まとめている間に日記が変更・削除されたので、結果を書き込まなかった */
  | { status: "conflict"; entry: DiaryEntry | undefined };

/** AI が使えないときのタイトル（日付） */
export function fallbackTitle(day: DiaryDay): string {
  return formatDiaryDayJa(day);
}

function appendRaw(body: string, transcript: string): string {
  return body.trim() ? `${body.trimEnd()}\n\n${transcript}` : transcript;
}

/** previousBody を設定（空の本文なら持たない） */
function withPreviousBody(entry: DiaryEntry, previousBody: string | undefined): DiaryEntry {
  const { previousBody: _old, ...rest } = entry;
  return previousBody?.trim() ? { ...rest, previousBody } : rest;
}

/** まとめている間に、誰か（別の画面操作）が日記を書き換えていないか */
function isSameVersion(a: DiaryEntry, b: DiaryEntry): boolean {
  return a.updatedAt === b.updatedAt && a.body === b.body && a.segments.length === b.segments.length;
}

function clock(deps: DiaryDeps) {
  return {
    nowIso: () => (deps.now ? deps.now() : new Date()).toISOString(),
    newId: deps.newId ?? (() => crypto.randomUUID()),
  };
}

/**
 * 話した内容を日記に加える（その日初めての入力・追記の両方）。
 * compose = false なら「まとめずにそのまま保存」。
 */
export async function addVoiceInput(
  deps: DiaryDeps,
  input: {
    day: DiaryDay;
    transcript: string;
    style: DiaryStyle;
    /** まとめ方。省略時は文章 */
    format?: DiaryFormat;
    compose: boolean;
    /** 原文を保存し終えた時点で呼ばれる（下書きを消してよい合図）。まとめの完了より前 */
    onTranscriptSaved?: (entry: DiaryEntry) => void | Promise<void>;
  },
): Promise<ComposeOutcome> {
  const { nowIso, newId } = clock(deps);
  const transcript = input.transcript.trim();
  if (!transcript) throw new Error("話した内容が空です");

  const existing = await deps.repo.getEntry(input.day);
  const savedAt = nowIso();
  const segment: VoiceSegment = { id: newId(), recordedAt: savedAt, transcript };
  const previousBody = existing?.body ?? "";

  // 1. 先に原文を保存する
  const saved: DiaryEntry = existing
    ? withPreviousBody(
        {
          ...existing,
          body: appendRaw(previousBody, transcript),
          isComposed: false,
          segments: [...existing.segments, segment],
          updatedAt: savedAt,
        },
        previousBody,
      )
    : {
        day: input.day,
        title: fallbackTitle(input.day),
        body: transcript,
        isComposed: false,
        segments: [segment],
        createdAt: savedAt,
        updatedAt: savedAt,
      };
  await deps.repo.putEntry(saved);
  await input.onTranscriptSaved?.(saved);

  if (!input.compose) return { status: "saved", entry: saved };

  // 2. まとめる。本文が空なら原文すべてから新規、あれば追記
  const isAppend = previousBody.trim() !== "";
  const prompt = isAppend
    ? buildAppendPrompt({ day: input.day, style: input.style, format: input.format ?? "prose", currentBody: previousBody, segment })
    : buildNewPrompt({ day: input.day, style: input.style, format: input.format ?? "prose", segments: saved.segments });

  const result = await runComposer(deps, prompt, input.day);
  if (result instanceof ComposeError) return { status: "failed", entry: saved, error: result };

  // 3. 結果を書き込む
  const latest = await deps.repo.getEntry(input.day);
  if (!latest || !isSameVersion(latest, saved)) return { status: "conflict", entry: latest };

  // 追記では、本人が付けた（または AI が付けた）タイトルを保つ
  const currentTitle = existing?.title.trim() ?? "";
  const keepTitle = currentTitle !== "" && currentTitle !== fallbackTitle(input.day);
  const composed: DiaryEntry = {
    ...latest,
    title: keepTitle ? currentTitle : result.title,
    body: result.body,
    isComposed: true,
    updatedAt: nowIso(),
  };
  await deps.repo.putEntry(composed);
  return { status: "composed", entry: composed };
}

/** 「まとめ直す」：その日の全原文から作り直す。直前の本文は previousBody に退避 */
export async function regenerateEntry(
  deps: DiaryDeps,
  input: { day: DiaryDay; style: DiaryStyle; format?: DiaryFormat },
): Promise<ComposeOutcome> {
  const { nowIso } = clock(deps);
  const entry = await deps.repo.getEntry(input.day);
  if (!entry) throw new Error("日記が見つかりません");
  if (entry.segments.length === 0) throw new Error("話した原文がないため、まとめ直せません");

  const prompt = buildNewPrompt({
    day: input.day,
    style: input.style,
    format: input.format ?? "prose",
    segments: entry.segments,
  });
  const result = await runComposer(deps, prompt, input.day);
  if (result instanceof ComposeError) return { status: "failed", entry, error: result };

  const latest = await deps.repo.getEntry(input.day);
  if (!latest || !isSameVersion(latest, entry)) return { status: "conflict", entry: latest };

  const regenerated = withPreviousBody(
    { ...latest, title: result.title, body: result.body, isComposed: true, updatedAt: nowIso() },
    latest.body,
  );
  await deps.repo.putEntry(regenerated);
  return { status: "composed", entry: regenerated };
}

/** composer を呼び、応答を解析する。失敗は ComposeError で返す（投げない） */
async function runComposer(
  deps: DiaryDeps,
  prompt: Parameters<DiaryComposer["compose"]>[0],
  day: DiaryDay,
) {
  let raw: string;
  try {
    raw = await deps.composer.compose(prompt);
  } catch (error) {
    return toComposeError(error);
  }
  const parsed = parseComposerResponse(raw, fallbackTitle(day));
  if (!parsed.body.trim()) return new ComposeError("bad-response", "応答の本文が空です");
  return parsed;
}

/**
 * 「元に戻す」：previousBody を本文に戻す（1段階だけ）。
 * 戻した本文が最新の原文を含むとは限らないので、isComposed は false にして「まとめ直す」を促す。
 * previousBody がなければ何もせず undefined を返す。
 */
export async function undoLastCompose(deps: DiaryDeps, day: DiaryDay): Promise<DiaryEntry | undefined> {
  const { nowIso } = clock(deps);
  const entry = await deps.repo.getEntry(day);
  if (!entry || entry.previousBody === undefined) return undefined;
  const restored = withPreviousBody(
    { ...entry, body: entry.previousBody, isComposed: false, updatedAt: nowIso() },
    undefined,
  );
  await deps.repo.putEntry(restored);
  return restored;
}

/** タイトル・本文の手修正。原文（segments）には触れない */
export async function updateEntryText(
  deps: Pick<DiaryDeps, "repo" | "now">,
  day: DiaryDay,
  patch: { title?: string; body?: string },
): Promise<DiaryEntry> {
  const entry = await deps.repo.getEntry(day);
  if (!entry) throw new Error("日記が見つかりません");
  const updated: DiaryEntry = {
    ...entry,
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    updatedAt: (deps.now ? deps.now() : new Date()).toISOString(),
  };
  await deps.repo.putEntry(updated);
  return updated;
}
