// ふりかえりの並べ替えとキーワード検索（SPEC.md 5.3）
import type { DiaryEntry } from "./types";

/** 全角・半角、大文字・小文字の違いを無視して比べられる形にする */
function normalize(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

/** 新しい日付の順に並べる（元の配列は変えない） */
export function sortNewestFirst(entries: readonly DiaryEntry[]): DiaryEntry[] {
  return [...entries].sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}

/**
 * キーワード検索。タイトル・本文・話した原文が対象。
 * 空白で区切った語をすべて含む日記を、新しい順に返す。語が無ければ全件。
 */
export function searchEntries(entries: readonly DiaryEntry[], query: string): DiaryEntry[] {
  const words = normalize(query).split(/\s+/).filter((w) => w !== "");
  const sorted = sortNewestFirst(entries);
  if (words.length === 0) return sorted;
  return sorted.filter((entry) => {
    const haystack = normalize(
      [entry.title, entry.body, ...entry.segments.map((s) => s.transcript)].join("\n"),
    );
    return words.every((w) => haystack.includes(w));
  });
}
