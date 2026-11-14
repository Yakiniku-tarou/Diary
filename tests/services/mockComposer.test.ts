import { describe, expect, it } from "vitest";
import { MockDiaryComposer } from "../../src/services/mockComposer";

const prompt = { system: "s", user: "u" };

describe("MockDiaryComposer", () => {
  it("積んだ順に応答を返し、呼ばれたプロンプトを記録する", async () => {
    const m = new MockDiaryComposer("一つ目", (p) => `二つ目:${p.user}`);
    expect(await m.compose(prompt)).toBe("一つ目");
    expect(await m.compose({ system: "s", user: "x" })).toBe("二つ目:x");
    expect(m.calls).toEqual([prompt, { system: "s", user: "x" }]);
  });

  it("Error を積むと投げる", async () => {
    const m = new MockDiaryComposer(new Error("失敗"));
    await expect(m.compose(prompt)).rejects.toThrow("失敗");
  });

  it("応答が無いときは既定の JSON を返し、enqueue で足せる", async () => {
    const m = new MockDiaryComposer();
    expect(JSON.parse(await m.compose(prompt))).toHaveProperty("title");
    m.enqueue("追加");
    expect(await m.compose(prompt)).toBe("追加");
  });
});
