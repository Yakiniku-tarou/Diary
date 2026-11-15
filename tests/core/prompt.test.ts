import { describe, expect, it } from "vitest";
import { buildAppendPrompt, buildNewPrompt, buildSystemPrompt, COMPOSE_MAX_TOKENS } from "../../src/core/prompt";
import type { VoiceSegment } from "../../src/core/types";

const seg = (id: string, recordedAt: string, transcript: string): VoiceSegment => ({ id, recordedAt, transcript });

describe("buildSystemPrompt", () => {
  it("常体／敬体を差し込む", () => {
    expect(buildSystemPrompt("plain")).toContain("文体は常体で統一する。");
    expect(buildSystemPrompt("polite")).toContain("文体は敬体で統一する。");
  });

  it("SPEC 6.2 のルールと出力形式を含む", () => {
    const p = buildSystemPrompt("plain");
    expect(p.startsWith("あなたは日記の清書係です。")).toBe(true);
    expect(p).toContain("締めの感想を創作しない。");
    expect(p).toContain("タイトルはその日を一言で表す15文字以内のものにする。");
    expect(p.endsWith('出力は次のJSONだけを返す：\n{"title": "...", "body": "..."}')).toBe(true);
  });
});

describe("まとめ方（文章／箇条書き）", () => {
  it("指定しなければ文章で、箇条書きを使わない指示になる", () => {
    expect(buildSystemPrompt("plain")).toBe(buildSystemPrompt("plain", "prose"));
    expect(buildSystemPrompt("plain")).toContain("- 箇条書きや見出しは使わず、段落だけの文章にする。");
    expect(buildSystemPrompt("plain")).toContain("段落を分けて読みやすく並べ替える。");
  });

  it("箇条書きでは「・」で始まる項目にする指示になり、段落の指示は入らない", () => {
    const p = buildSystemPrompt("polite", "bullets");
    expect(p).toContain("- 本文は箇条書きにする。各項目は行頭に「・」を付けて1行ずつ書き");
    expect(p).not.toContain("段落だけの文章にする");
    expect(p).not.toContain("段落を分けて");
    // ほかのルールと出力形式は同じ
    expect(p).toContain("文体は敬体で統一する。");
    expect(p).toContain("締めの感想を創作しない。");
    expect(p.endsWith('出力は次のJSONだけを返す：\n{"title": "...", "body": "..."}')).toBe(true);
  });

  it("新規・追記のどちらにも反映される", () => {
    const segment = seg("a", "2026-11-15T00:05:00.000Z", "朝ごはんを食べた");
    const created = buildNewPrompt({ day: "2026-11-15", style: "plain", format: "bullets", segments: [segment] });
    expect(created.system).toBe(buildSystemPrompt("plain", "bullets"));
    const appended = buildAppendPrompt({
      day: "2026-11-15",
      style: "plain",
      format: "bullets",
      currentBody: "・朝は雨だった",
      segment,
    });
    expect(appended.system.startsWith(buildSystemPrompt("plain", "bullets"))).toBe(true);
    expect(appended.system).toContain("現在の本文の内容と表現は変えずに");
  });
});

describe("buildNewPrompt", () => {
  it("全原文を時刻つきで順に渡す（テストは日本時間）", () => {
    const p = buildNewPrompt({
      day: "2026-11-15",
      style: "plain",
      segments: [
        seg("a", "2026-11-15T00:05:00.000Z", "朝ごはんを食べた"),
        seg("b", "2026-11-15T12:30:00.000Z", "夜は映画を見た"),
      ],
    });
    expect(p.system).toBe(buildSystemPrompt("plain"));
    expect(p.user).toContain("2026年11月15日（日）の日記です。");
    expect(p.user).toContain("（09:05 に話した内容）\n朝ごはんを食べた\n\n（21:30 に話した内容）\n夜は映画を見た");
    expect(p.user.indexOf("朝ごはん")).toBeLessThan(p.user.indexOf("映画"));
  });
});

describe("buildAppendPrompt", () => {
  it("現在の本文と新しい原文を渡し、内容と表現を変えない指示を加える", () => {
    const p = buildAppendPrompt({
      day: "2026-11-15",
      style: "polite",
      currentBody: "朝は雨でした。",
      segment: seg("c", "2026-11-15T10:00:00.000Z", "夕方は晴れた"),
    });
    expect(p.system.startsWith(buildSystemPrompt("polite"))).toBe(true);
    expect(p.system).toContain("現在の本文の内容と表現は変えずに、新しく話された内容を適切な位置に組み込む。");
    expect(p.user).toContain("<current_body>\n朝は雨でした。\n</current_body>");
    expect(p.user).toContain("（19:00 に話した内容）\n夕方は晴れた");
  });
});

it("max_tokens の既定は 4096", () => {
  expect(COMPOSE_MAX_TOKENS).toBe(4096);
});
