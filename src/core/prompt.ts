// Claude に渡すプロンプトの組み立て（SPEC.md 6.2）
import { formatDiaryDayJa, formatTime } from "./day";
import type { ComposePrompt } from "./ports";
import type { DiaryDay, DiaryStyle, VoiceSegment } from "./types";

/** max_tokens の既定値 */
export const COMPOSE_MAX_TOKENS = 4096;

const STYLE_LABEL: Record<DiaryStyle, string> = {
  plain: "常体",
  polite: "敬体",
};

export function buildSystemPrompt(style: DiaryStyle): string {
  return `あなたは日記の清書係です。ユーザーが話した内容の文字起こしを、本人が書いた日記として読める文章に整えます。

ルール：
- 一人称の日記として書く。文体は${STYLE_LABEL[style]}で統一する。
- 話された内容だけを使う。出来事・感情・評価・教訓を勝手に付け足さない。締めの感想を創作しない。
- 「えー」「あのー」などの言いよどみ、言い直し、重複は取り除く。
- 音声認識の明らかな誤変換は文脈から直す。確信が持てない固有名詞はそのまま残す。
- 話があちこちに飛んでいても、時間の流れや話題ごとに段落を分けて読みやすく並べ替える。
- 本人の言い回しや口ぐせはできるだけ生かし、整えすぎない。
- 箇条書きや見出しは使わず、段落だけの文章にする。
- 長さは話された量に見合ったものにする。短い話を水増ししない。
- タイトルはその日を一言で表す15文字以内のものにする。

出力は次のJSONだけを返す：
{"title": "...", "body": "..."}`;
}

const APPEND_RULES = `

追記のルール：
- ユーザーから「現在の日記本文」と「新しく話された内容」が渡される。
- 現在の本文の内容と表現は変えずに、新しく話された内容を適切な位置に組み込む。
- body には、組み込んだあとの日記本文の全体を入れる。`;

function formatSegments(segments: readonly VoiceSegment[]): string {
  return segments
    .map((s) => `（${formatTime(s.recordedAt)} に話した内容）\n${s.transcript}`)
    .join("\n\n");
}

/** 新規・まとめ直し：その日の原文すべてから作る */
export function buildNewPrompt(params: {
  day: DiaryDay;
  style: DiaryStyle;
  segments: readonly VoiceSegment[];
}): ComposePrompt {
  return {
    system: buildSystemPrompt(params.style),
    user: `${formatDiaryDayJa(params.day)}の日記です。以下の文字起こしを日記に整えてください。

<transcript>
${formatSegments(params.segments)}
</transcript>`,
  };
}

/** 追記：現在の本文に新しい原文を組み込む */
export function buildAppendPrompt(params: {
  day: DiaryDay;
  style: DiaryStyle;
  currentBody: string;
  segment: VoiceSegment;
}): ComposePrompt {
  return {
    system: buildSystemPrompt(params.style) + APPEND_RULES,
    user: `${formatDiaryDayJa(params.day)}の日記です。

現在の日記本文：
<current_body>
${params.currentBody}
</current_body>

新しく話された内容：
<transcript>
${formatSegments([params.segment])}
</transcript>`,
  };
}
