import { describe, expect, it } from "vitest";
import { parseComposerResponse } from "../../src/core/parse";

const FALLBACK = "2026年11月15日（日）";
const NL = "\n";

describe("parseComposerResponse", () => {
  it("JSON だけの応答を読む", () => {
    const r = parseComposerResponse(JSON.stringify({ title: "雨の日", body: "朝から雨だった。" }), FALLBACK);
    expect(r).toEqual({ title: "雨の日", body: "朝から雨だった。" });
  });

  it("前後に文章やコードブロックがあっても { 〜 } を取り出して読む", () => {
    const json = JSON.stringify({ title: "散歩", body: "公園を歩いた。\n\n夕方は読書。" });
    const text = ["はい、整えました。", "```json", json, "```", "以上です。"].join(NL);
    expect(parseComposerResponse(text, FALLBACK)).toEqual({ title: "散歩", body: "公園を歩いた。\n\n夕方は読書。" });
  });

  it("文字列の中に生の改行がある（厳密には不正な）JSON も読む", () => {
    const text = '{"title": "散歩", "body": "公園を歩いた。' + NL + NL + '夕方は\t読書。\\n引用は\\"こう\\"。"}';
    expect(parseComposerResponse(text, FALLBACK)).toEqual({
      title: "散歩",
      body: "公園を歩いた。\n\n夕方は\t読書。\n引用は\"こう\"。",
    });
  });

  it("JSON として読めなければ、応答全体を本文・タイトルを日付にする", () => {
    const text = "今日は朝から雨だった。{途中で壊れた";
    expect(parseComposerResponse(text, FALLBACK)).toEqual({ title: FALLBACK, body: text });
  });

  it("body が文字列でない JSON は失敗扱いで応答全体を本文にする", () => {
    const text = JSON.stringify({ title: "x", body: 123 });
    expect(parseComposerResponse(text, FALLBACK)).toEqual({ title: FALLBACK, body: text });
  });

  it("タイトルが無い・空なら日付をタイトルにする", () => {
    expect(parseComposerResponse(JSON.stringify({ body: "本文" }), FALLBACK)).toEqual({ title: FALLBACK, body: "本文" });
    expect(parseComposerResponse(JSON.stringify({ title: "  ", body: "本文" }), FALLBACK).title).toBe(FALLBACK);
  });

  it("タイトルの改行は空白にし、本文の CRLF は LF にそろえて前後の空白を除く", () => {
    const text = JSON.stringify({ title: "雨\nの日", body: "\n一段落目。\r\n\r\n二段落目。\n" });
    expect(parseComposerResponse(text, FALLBACK)).toEqual({ title: "雨 の日", body: "一段落目。\n\n二段落目。" });
  });

  it("応答が空なら本文も空（呼び出し側で失敗扱いにする）", () => {
    expect(parseComposerResponse("   ", FALLBACK)).toEqual({ title: FALLBACK, body: "" });
  });
});
