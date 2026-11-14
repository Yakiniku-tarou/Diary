// Claude の応答から日記を取り出す（SPEC.md 6.3）

export interface ComposedDiary {
  title: string;
  body: string;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** JSON として読めて body が文字列なら取り出す */
function tryParse(text: string, fallbackTitle: string): ComposedDiary | undefined {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { title, body } = value as { title?: unknown; body?: unknown };
  if (typeof body !== "string") return undefined;
  const cleanTitle = typeof title === "string" ? title.replace(/\s*\n\s*/g, " ").trim() : "";
  return {
    title: cleanTitle || fallbackTitle,
    body: normalizeNewlines(body).trim(),
  };
}

/**
 * JSON の文字列の中に生の改行・タブが入っていると JSON.parse が失敗するので、
 * 文字列の中にあるものだけエスケープする（モデルがこの形で返すことがある）
 */
function escapeControlCharsInStrings(json: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of json) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === "\n") { out += "\\n"; continue; }
      else if (ch === "\r") { out += "\\r"; continue; }
      else if (ch === "\t") { out += "\\t"; continue; }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

/**
 * 1. 全体を JSON として解釈
 * 2. だめなら最初の `{` から最後の `}` までを取り出して再解釈
 *    （文字列の中の生の改行もエスケープして試す）
 * 3. それでもだめなら応答全体を本文、タイトルを日付にする
 */
export function parseComposerResponse(text: string, fallbackTitle: string): ComposedDiary {
  const trimmed = text.trim();
  const direct = tryParse(trimmed, fallbackTitle);
  if (direct) return direct;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const json = trimmed.slice(start, end + 1);
    const inner = tryParse(json, fallbackTitle) ?? tryParse(escapeControlCharsInStrings(json), fallbackTitle);
    if (inner) return inner;
  }

  return { title: fallbackTitle, body: normalizeNewlines(trimmed) };
}
