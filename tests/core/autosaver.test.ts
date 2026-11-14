import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver } from "../../src/core/autosaver";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function setup(save?: (v: string) => Promise<void>) {
  const saved: string[] = [];
  const errors: unknown[] = [];
  const saver = createAutosaver<string>(
    save ??
      (async (v) => {
        saved.push(v);
      }),
    { onError: (e) => errors.push(e) },
  );
  return { saver, saved, errors };
}

describe("createAutosaver（編集の自動保存）", () => {
  it("入力が止まって1秒後に保存する。それまでは保存しない", async () => {
    const { saver, saved } = setup();
    saver.schedule("あ");
    await vi.advanceTimersByTimeAsync(999);
    expect(saved).toEqual([]);
    expect(saver.pending).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(["あ"]);
    expect(saver.pending).toBe(false);
  });

  it("入力が続く間は待ち時間をやり直し、最後の内容を1回だけ保存する", async () => {
    const { saver, saved } = setup();
    saver.schedule("あ");
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule("あい");
    await vi.advanceTimersByTimeAsync(800);
    saver.schedule("あいう");
    await vi.advanceTimersByTimeAsync(999);
    expect(saved).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(["あいう"]);
  });

  it("flush は待たずにすぐ保存し、終わるまで待てる。あとで二重に保存しない", async () => {
    const { saver, saved } = setup();
    saver.schedule("急ぎ");
    await saver.flush();
    expect(saved).toEqual(["急ぎ"]);

    await vi.advanceTimersByTimeAsync(5000);
    expect(saved).toEqual(["急ぎ"]);
  });

  it("何も待っていなければ flush は何も保存しない", async () => {
    const { saver, saved } = setup();
    await saver.flush();
    expect(saved).toEqual([]);
    expect(saver.pending).toBe(false);
  });

  it("保存中に次の内容が来ても、順番に保存する（重ならない）", async () => {
    const log: string[] = [];
    const { saver } = setup(async (v) => {
      log.push(`開始:${v}`);
      await new Promise((r) => setTimeout(r, 300));
      log.push(`終了:${v}`);
    });
    saver.schedule("一");
    await vi.advanceTimersByTimeAsync(1000); // 一 の保存が始まる
    saver.schedule("二");
    const flushed = saver.flush(); // 二 もすぐ保存を頼む
    expect(saver.pending).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    await flushed;

    expect(log).toEqual(["開始:一", "終了:一", "開始:二", "終了:二"]);
    expect(saver.pending).toBe(false);
  });

  it("保存に失敗したら onError を呼び、次の保存は続けられる", async () => {
    let fail = true;
    const saved: string[] = [];
    const { saver, errors } = setup(async (v) => {
      if (fail) throw new Error("失敗");
      saved.push(v);
    });
    saver.schedule("一回目");
    await saver.flush();
    expect(errors).toHaveLength(1);

    fail = false;
    saver.schedule("二回目");
    await saver.flush();
    expect(saved).toEqual(["二回目"]);
  });
});
