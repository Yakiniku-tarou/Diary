import { describe, expect, it } from "vitest";
import {
  addVoiceInput,
  fallbackTitle,
  regenerateEntry,
  undoLastCompose,
  updateEntryText,
  type DiaryDeps,
} from "../../src/core/diary";
import { ComposeError } from "../../src/core/errors";
import type { DiaryEntry } from "../../src/core/types";
import { MemoryDiaryRepository } from "../../src/services/memoryRepository";
import { MockDiaryComposer, type MockResponse } from "../../src/services/mockComposer";

const DAY = "2026-11-15";
const json = (title: string, body: string) => JSON.stringify({ title, body });

/** 呼ぶたびに1分進む時計と、連番の ID */
function setup(responses: MockResponse[] = [], entries: DiaryEntry[] = []) {
  const repo = new MemoryDiaryRepository({ entries });
  const composer = new MockDiaryComposer(...responses);
  let minutes = 0;
  let id = 0;
  const deps: DiaryDeps = {
    repo,
    composer,
    now: () => new Date(Date.UTC(2026, 10, 15, 3, minutes++)),
    newId: () => `seg-${++id}`,
  };
  return { repo, composer, deps };
}

function composedEntry(overrides: Partial<DiaryEntry> = {}): DiaryEntry {
  return {
    day: DAY,
    title: "雨の日",
    body: "朝から雨だった。",
    isComposed: true,
    segments: [{ id: "old-1", recordedAt: "2026-11-14T23:00:00.000Z", transcript: "えー朝から雨だった" }],
    createdAt: "2026-11-14T23:00:00.000Z",
    updatedAt: "2026-11-14T23:01:00.000Z",
    ...overrides,
  };
}

describe("addVoiceInput：その日初めての入力", () => {
  it("原文から新規生成し、タイトルと本文を保存する", async () => {
    const { repo, composer, deps } = setup([json("雨の日", "朝から雨だった。")]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "  えー朝から雨だった  ", style: "plain", compose: true });

    expect(r.status).toBe("composed");
    const saved = await repo.getEntry(DAY);
    expect(saved).toMatchObject({ day: DAY, title: "雨の日", body: "朝から雨だった。", isComposed: true });
    expect(saved?.previousBody).toBeUndefined();
    expect(saved?.segments).toEqual([
      { id: "seg-1", recordedAt: "2026-11-15T03:00:00.000Z", transcript: "えー朝から雨だった" },
    ]);
    expect(saved?.createdAt).toBe("2026-11-15T03:00:00.000Z");
    // 新規用のプロンプト（追記の指示なし）
    expect(composer.calls).toHaveLength(1);
    expect(composer.calls[0]?.system).not.toContain("追記のルール");
    expect(composer.calls[0]?.user).toContain("えー朝から雨だった");
  });

  it("API を呼ぶ時点で、原文はもう保存されている", async () => {
    let savedWhenCalled: DiaryEntry | undefined;
    const { repo, deps } = setup();
    deps.composer = {
      compose: async () => {
        savedWhenCalled = await repo.getEntry(DAY);
        return json("t", "b");
      },
    };
    await addVoiceInput(deps, { day: DAY, transcript: "話した内容", style: "plain", compose: true });
    expect(savedWhenCalled?.segments.map((s) => s.transcript)).toEqual(["話した内容"]);
    expect(savedWhenCalled?.body).toBe("話した内容");
    expect(savedWhenCalled?.isComposed).toBe(false);
  });

  it("原文を保存した時点（API を呼ぶ前）で onTranscriptSaved が呼ばれる。失敗しても呼ばれる", async () => {
    const order: string[] = [];
    const { deps } = setup();
    deps.composer = {
      compose: async () => {
        order.push("api");
        throw new TypeError("offline");
      },
    };
    await addVoiceInput(deps, {
      day: DAY,
      transcript: "話した内容",
      style: "plain",
      compose: true,
      onTranscriptSaved: (entry) => {
        order.push(`saved:${entry.segments.length}`);
      },
    });
    expect(order).toEqual(["saved:1", "api"]);
  });

  it("「まとめずにそのまま保存」：API を呼ばず、原文を本文・日付をタイトルにする", async () => {
    const { repo, composer, deps } = setup();
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した内容", style: "plain", compose: false });

    expect(r.status).toBe("saved");
    expect(composer.calls).toHaveLength(0);
    expect(await repo.getEntry(DAY)).toMatchObject({ title: fallbackTitle(DAY), body: "話した内容", isComposed: false });
  });

  it("空の入力はエラーにして何も保存しない", async () => {
    const { repo, deps } = setup();
    await expect(addVoiceInput(deps, { day: DAY, transcript: " \n ", style: "plain", compose: true })).rejects.toThrow();
    expect(await repo.listEntries()).toEqual([]);
  });
});

describe("addVoiceInput：API 失敗", () => {
  it("圏外など：原文を本文にして isComposed = false で残す", async () => {
    const { repo, deps } = setup([new TypeError("Failed to fetch")]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した内容", style: "plain", compose: true });

    expect(r.status).toBe("failed");
    if (r.status !== "failed") return;
    expect(r.error.kind).toBe("offline");
    expect(await repo.getEntry(DAY)).toMatchObject({ title: fallbackTitle(DAY), body: "話した内容", isComposed: false });
  });

  it("キー未設定などの ComposeError は種類を保って返す", async () => {
    const { deps } = setup([new ComposeError("no-api-key")]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した内容", style: "plain", compose: true });
    expect(r.status === "failed" && r.error.kind).toBe("no-api-key");
  });

  it("追記の失敗：原文を既存の本文の末尾に足し、直前の本文を previousBody に残す", async () => {
    const { repo, deps } = setup([new ComposeError("overloaded")], [composedEntry()]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "夕方は晴れた", style: "plain", compose: true });

    expect(r.status).toBe("failed");
    const saved = await repo.getEntry(DAY);
    expect(saved).toMatchObject({
      title: "雨の日",
      body: "朝から雨だった。\n\n夕方は晴れた",
      previousBody: "朝から雨だった。",
      isComposed: false,
    });
    expect(saved?.segments.map((s) => s.transcript)).toEqual(["えー朝から雨だった", "夕方は晴れた"]);
  });

  it("応答の本文が空なら失敗扱いにし、原文の入った本文を上書きしない", async () => {
    const { repo, deps } = setup([json("t", "   ")]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した内容", style: "plain", compose: true });
    expect(r.status === "failed" && r.error.kind).toBe("bad-response");
    expect((await repo.getEntry(DAY))?.body).toBe("話した内容");
  });

  it("JSON でない応答は、応答全体を本文・日付をタイトルにして保存する", async () => {
    const { repo, deps } = setup(["朝から雨だった。"]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "えー朝から雨", style: "plain", compose: true });
    expect(r.status).toBe("composed");
    expect(await repo.getEntry(DAY)).toMatchObject({ title: fallbackTitle(DAY), body: "朝から雨だった。", isComposed: true });
  });
});

describe("addVoiceInput：2回目以降（追記）", () => {
  it("現在の本文と新しい原文だけを渡し、直前の本文を previousBody に退避する", async () => {
    const { repo, composer, deps } = setup([json("別のタイトル", "朝から雨だった。\n\n夕方は晴れた。")], [composedEntry()]);
    const r = await addVoiceInput(deps, { day: DAY, transcript: "夕方は晴れた", style: "plain", compose: true });

    expect(r.status).toBe("composed");
    const saved = await repo.getEntry(DAY);
    expect(saved).toMatchObject({
      title: "雨の日", // 既存のタイトルを保つ
      body: "朝から雨だった。\n\n夕方は晴れた。",
      previousBody: "朝から雨だった。",
      isComposed: true,
      createdAt: "2026-11-14T23:00:00.000Z",
    });
    expect(saved?.segments.map((s) => s.transcript)).toEqual(["えー朝から雨だった", "夕方は晴れた"]);

    const prompt = composer.calls[0];
    expect(prompt?.system).toContain("追記のルール");
    expect(prompt?.user).toContain("<current_body>\n朝から雨だった。\n</current_body>");
    expect(prompt?.user).toContain("夕方は晴れた");
    // 過去の原文は渡さない（本文の手修正を保つため、本文を元にする）
    expect(prompt?.user).not.toContain("えー朝から雨だった");
  });

  it("手修正した本文が、そのまま追記のプロンプトに渡る", async () => {
    const { composer, deps } = setup([json("t", "b")], [composedEntry({ body: "手で直した本文。" })]);
    await addVoiceInput(deps, { day: DAY, transcript: "追加", style: "plain", compose: true });
    expect(composer.calls[0]?.user).toContain("<current_body>\n手で直した本文。\n</current_body>");
  });

  it("タイトルがまだ日付のままなら、AI のタイトルを使う", async () => {
    const { repo, deps } = setup([json("晴れた日", "本文。")], [composedEntry({ title: fallbackTitle(DAY), isComposed: false })]);
    await addVoiceInput(deps, { day: DAY, transcript: "追加", style: "plain", compose: true });
    expect((await repo.getEntry(DAY))?.title).toBe("晴れた日");
  });

  it("本文が空の既存日記には、全原文から新規生成する", async () => {
    const { composer, deps } = setup([json("t", "b")], [composedEntry({ body: "" })]);
    await addVoiceInput(deps, { day: DAY, transcript: "追加", style: "plain", compose: true });
    expect(composer.calls[0]?.system).not.toContain("追記のルール");
    expect(composer.calls[0]?.user).toContain("えー朝から雨だった");
    expect(composer.calls[0]?.user).toContain("追加");
  });

  it("文体の設定がプロンプトに反映される", async () => {
    const { composer, deps } = setup([json("t", "b")]);
    await addVoiceInput(deps, { day: DAY, transcript: "話した", style: "polite", compose: true });
    expect(composer.calls[0]?.system).toContain("文体は敬体で統一する。");
  });

  it("まとめ方の設定がプロンプトに反映される（省略時は文章）", async () => {
    const bullets = setup([json("t", "・b")]);
    await addVoiceInput(bullets.deps, { day: DAY, transcript: "話した", style: "plain", format: "bullets", compose: true });
    expect(bullets.composer.calls[0]?.system).toContain("本文は箇条書きにする。");

    const prose = setup([json("t", "b")]);
    await addVoiceInput(prose.deps, { day: DAY, transcript: "話した", style: "plain", compose: true });
    expect(prose.composer.calls[0]?.system).toContain("段落だけの文章にする。");
  });
});

describe("addVoiceInput：まとめている間の変更", () => {
  it("その間に日記が編集されたら、結果で上書きせず conflict を返す", async () => {
    const { repo, deps } = setup();
    deps.composer = {
      compose: async () => {
        await updateEntryText({ repo, now: () => new Date("2026-11-15T09:00:00Z") }, DAY, { body: "編集した" });
        return json("t", "AIの本文");
      },
    };
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した", style: "plain", compose: true });
    expect(r.status).toBe("conflict");
    expect((await repo.getEntry(DAY))?.body).toBe("編集した");
  });

  it("その間に日記が削除されたら、復活させない", async () => {
    const { repo, deps } = setup();
    deps.composer = {
      compose: async () => {
        await repo.deleteEntry(DAY);
        return json("t", "b");
      },
    };
    const r = await addVoiceInput(deps, { day: DAY, transcript: "話した", style: "plain", compose: true });
    expect(r).toEqual({ status: "conflict", entry: undefined });
    expect(await repo.getEntry(DAY)).toBeUndefined();
  });
});

describe("regenerateEntry（まとめ直す）", () => {
  const twoSegments = composedEntry({
    body: "手で直した本文。",
    segments: [
      { id: "s1", recordedAt: "2026-11-15T00:00:00.000Z", transcript: "朝の話" },
      { id: "s2", recordedAt: "2026-11-15T10:00:00.000Z", transcript: "夜の話" },
    ],
  });

  it("全原文から作り直し、直前の本文を previousBody に退避する", async () => {
    const { repo, composer, deps } = setup([json("新タイトル", "作り直した本文。")], [twoSegments]);
    const r = await regenerateEntry(deps, { day: DAY, style: "plain" });

    expect(r.status).toBe("composed");
    expect(await repo.getEntry(DAY)).toMatchObject({
      title: "新タイトル",
      body: "作り直した本文。",
      previousBody: "手で直した本文。",
      isComposed: true,
    });
    expect(composer.calls[0]?.system).not.toContain("追記のルール");
    expect(composer.calls[0]?.user).toContain("朝の話");
    expect(composer.calls[0]?.user).toContain("夜の話");
  });

  it("まとめ方の設定がプロンプトに反映される", async () => {
    const { composer, deps } = setup([json("新タイトル", "・朝の話\n・夜の話")], [twoSegments]);
    await regenerateEntry(deps, { day: DAY, style: "plain", format: "bullets" });
    expect(composer.calls[0]?.system).toContain("本文は箇条書きにする。");
  });

  it("失敗したら日記は何も変えない", async () => {
    const { repo, deps } = setup([new ComposeError("rate-limit")], [twoSegments]);
    const r = await regenerateEntry(deps, { day: DAY, style: "plain" });
    expect(r.status === "failed" && r.error.kind).toBe("rate-limit");
    expect(await repo.getEntry(DAY)).toEqual(twoSegments);
  });

  it("失敗状態（isComposed = false）の日記をまとめ直すと isComposed = true になる", async () => {
    const failed = composedEntry({ body: "朝から雨だった。\n\n夕方は晴れた", isComposed: false });
    const { repo, deps } = setup([json("t", "まとめた本文。")], [failed]);
    await regenerateEntry(deps, { day: DAY, style: "plain" });
    expect((await repo.getEntry(DAY))?.isComposed).toBe(true);
  });

  it("日記がない・原文がないときはエラー", async () => {
    const { deps } = setup([], [composedEntry({ day: "2026-11-14", segments: [] })]);
    await expect(regenerateEntry(deps, { day: DAY, style: "plain" })).rejects.toThrow();
    await expect(regenerateEntry(deps, { day: "2026-11-14", style: "plain" })).rejects.toThrow();
  });
});

describe("undoLastCompose（元に戻す）", () => {
  it("previousBody を本文に戻し、previousBody を消す（1段階だけ）", async () => {
    const { repo, deps } = setup([json("t", "AIの本文。")], [composedEntry()]);
    await regenerateEntry(deps, { day: DAY, style: "plain" });

    const restored = await undoLastCompose(deps, DAY);
    expect(restored).toMatchObject({ body: "朝から雨だった。", isComposed: false });
    expect(restored?.previousBody).toBeUndefined();
    expect(await repo.getEntry(DAY)).toEqual(restored);

    // 2回目は何もしない
    expect(await undoLastCompose(deps, DAY)).toBeUndefined();
    expect((await repo.getEntry(DAY))?.body).toBe("朝から雨だった。");
  });

  it("追記を元に戻すと追記前の本文になり、原文は残る", async () => {
    const { repo, deps } = setup([json("t", "朝から雨だった。夕方は晴れた。")], [composedEntry()]);
    await addVoiceInput(deps, { day: DAY, transcript: "夕方は晴れた", style: "plain", compose: true });
    await undoLastCompose(deps, DAY);

    const entry = await repo.getEntry(DAY);
    expect(entry?.body).toBe("朝から雨だった。");
    expect(entry?.segments.map((s) => s.transcript)).toEqual(["えー朝から雨だった", "夕方は晴れた"]);
  });

  it("日記がなければ undefined", async () => {
    const { deps } = setup();
    expect(await undoLastCompose(deps, DAY)).toBeUndefined();
  });
});

describe("updateEntryText（手修正）", () => {
  it("タイトル・本文だけを変え、原文には触れない", async () => {
    const original = composedEntry();
    const { repo, deps } = setup([], [original]);
    const updated = await updateEntryText(deps, DAY, { title: "新しいタイトル" });

    expect(updated).toMatchObject({ title: "新しいタイトル", body: original.body });
    expect(updated.segments).toEqual(original.segments);
    expect(updated.updatedAt).not.toBe(original.updatedAt);
    expect(await repo.getEntry(DAY)).toEqual(updated);
  });

  it("日記がなければエラー", async () => {
    const { deps } = setup();
    await expect(updateEntryText(deps, DAY, { body: "x" })).rejects.toThrow();
  });
});

describe("原文は保存後に書き換えられない", () => {
  it("新規 → 追記 → 手修正 → まとめ直し → 元に戻す を通しても、原文は話したときのまま", async () => {
    const { repo, deps } = setup([json("a", "本文1。"), json("b", "本文2。"), new TypeError("offline"), json("c", "本文3。")]);
    await addVoiceInput(deps, { day: DAY, transcript: "一回目の話", style: "plain", compose: true });
    await addVoiceInput(deps, { day: DAY, transcript: "二回目の話", style: "plain", compose: true });
    await addVoiceInput(deps, { day: DAY, transcript: "三回目の話", style: "plain", compose: true }); // 失敗
    await updateEntryText(deps, DAY, { body: "手で全部書き直した" });
    await regenerateEntry(deps, { day: DAY, style: "plain" });
    await undoLastCompose(deps, DAY);

    const entry = await repo.getEntry(DAY);
    expect(entry?.segments).toEqual([
      { id: "seg-1", recordedAt: "2026-11-15T03:00:00.000Z", transcript: "一回目の話" },
      { id: "seg-2", recordedAt: "2026-11-15T03:02:00.000Z", transcript: "二回目の話" },
      { id: "seg-3", recordedAt: "2026-11-15T03:04:00.000Z", transcript: "三回目の話" },
    ]);
    expect(entry?.body).toBe("手で全部書き直した");
  });
});
