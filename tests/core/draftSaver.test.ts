import { describe, expect, it } from "vitest";
import { createDraftSaver } from "../../src/core/draftSaver";
import type { Draft } from "../../src/core/types";
import { MemoryDiaryRepository } from "../../src/services/memoryRepository";

const now = () => new Date("2026-11-15T03:00:00.000Z");

describe("createDraftSaver（下書きの自動保存）", () => {
  it("入力した内容が下書きとして保存される", async () => {
    const repo = new MemoryDiaryRepository();
    const saver = createDraftSaver(repo, { now });
    saver.save("今日は");
    await saver.whenIdle();
    expect(await repo.getDraft()).toEqual({ text: "今日は", updatedAt: "2026-11-15T03:00:00.000Z" });
  });

  it("どの日の日記への入力かも保存できる", async () => {
    const repo = new MemoryDiaryRepository();
    const saver = createDraftSaver(repo, { now });
    saver.save("追記", "2026-11-14");
    await saver.whenIdle();
    expect((await repo.getDraft())?.day).toBe("2026-11-14");
  });

  it("続けて入力しても、最後の内容が必ず残る（書き込みは重ならない）", async () => {
    const written: string[] = [];
    let active = 0;
    let maxActive = 0;
    const repo = {
      saveDraft: async (draft: Draft) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 5));
        written.push(draft.text);
        active--;
      },
      clearDraft: async () => {
        written.push("(消去)");
      },
    };
    const saver = createDraftSaver(repo, { now });
    for (const text of ["あ", "あい", "あいう", "あいうえ", "あいうえお"]) saver.save(text);
    await saver.whenIdle();

    expect(written.at(-1)).toBe("あいうえお");
    expect(maxActive).toBe(1);
    // 途中の内容は飛ばしてよい（最初と最後だけ書く）
    expect(written).toEqual(["あ", "あいうえお"]);
  });

  it("空になったら下書きを消す", async () => {
    const repo = new MemoryDiaryRepository();
    const saver = createDraftSaver(repo, { now });
    saver.save("途中");
    saver.save("");
    await saver.whenIdle();
    expect(await repo.getDraft()).toBeUndefined();
  });

  it("保存に失敗しても止まらず、次の入力は保存される", async () => {
    const repo = new MemoryDiaryRepository();
    let fail = true;
    let errors = 0;
    const flaky = {
      saveDraft: async (draft: Draft) => {
        if (fail) throw new Error("書き込み失敗");
        await repo.saveDraft(draft);
      },
      clearDraft: () => repo.clearDraft(),
    };
    const saver = createDraftSaver(flaky, { now, onError: () => errors++ });
    saver.save("一回目");
    await saver.whenIdle();
    expect(errors).toBe(1);

    fail = false;
    saver.save("二回目");
    await saver.whenIdle();
    expect((await repo.getDraft())?.text).toBe("二回目");
  });

  it("何も頼まれていなければ whenIdle はすぐ終わる", async () => {
    await expect(createDraftSaver(new MemoryDiaryRepository()).whenIdle()).resolves.toBeUndefined();
  });
});
