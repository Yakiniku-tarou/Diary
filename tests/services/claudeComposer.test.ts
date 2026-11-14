import { describe, expect, it } from "vitest";
import { ComposeError } from "../../src/core/errors";
import { ClaudeDiaryComposer, testClaudeConnection, type ClaudeDeps } from "../../src/services/claudeComposer";

const KEY = "sk-ant-test-key";
const PROMPT = { system: "システム", user: "ユーザー" };

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

/** 順番に応答を返す fetch の代わり */
function fakeFetch(...responses: (Response | Error)[]) {
  const calls: Call[] = [];
  const fn = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    const next = responses.shift();
    if (!next) throw new Error("応答が足りない");
    if (next instanceof Error) throw next;
    return next;
  }) as typeof fetch;
  return { fn, calls };
}

const ok = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
const apiError = (status: number, message: string) =>
  new Response(JSON.stringify({ type: "error", error: { type: "x", message } }), { status });
const message = (text: string, stop_reason = "end_turn") => ({
  content: [
    { type: "thinking", thinking: "", signature: "sig" },
    { type: "text", text },
  ],
  stop_reason,
});

function setup(responses: (Response | Error)[], config = { apiKey: KEY, model: "claude-haiku-5-5" }) {
  const { fn, calls } = fakeFetch(...responses);
  const sleeps: number[] = [];
  const deps: ClaudeDeps = {
    getConfig: () => config,
    fetch: fn,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  return { composer: new ClaudeDiaryComposer(deps), deps, calls, sleeps };
}

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    if (e instanceof ComposeError) return e.kind;
    throw e;
  }
  return "成功";
}

describe("ClaudeDiaryComposer：リクエスト", () => {
  it("SPEC 3.2 のエンドポイント・ヘッダ・本文で呼ぶ", async () => {
    const { composer, calls } = setup([ok(message('{"title":"t","body":"b"}'))]);
    await composer.compose(PROMPT);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(calls[0]?.headers).toEqual({
      "content-type": "application/json",
      "x-api-key": KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    });
    expect(calls[0]?.body).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 4096,
      system: "システム",
      messages: [{ role: "user", content: "ユーザー" }],
    });
  });

  it("応答を title・body の JSON に固定する。温度などは送らない", async () => {
    const { composer, calls } = setup([ok(message("{}"))]);
    await composer.compose(PROMPT);
    const body = calls[0]?.body as { output_config: { effort: string; format: { type: string; schema: object } } };
    expect(body.output_config.effort).toBe("low");
    expect(body.output_config.format).toEqual({
      type: "json_schema",
      schema: {
        type: "object",
        properties: { title: { type: "string" }, body: { type: "string" } },
        required: ["title", "body"],
        additionalProperties: false,
      },
    });
    expect(Object.keys(calls[0]?.body ?? {}).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
  });

  it("設定は呼ぶたびに読み直し、前後の空白を除く", async () => {
    const config = { apiKey: "  first  ", model: " model-a " };
    const { composer, calls } = setup([ok(message("a")), ok(message("b"))], config);
    await composer.compose(PROMPT);
    config.apiKey = "second";
    config.model = "model-b";
    await composer.compose(PROMPT);
    expect(calls.map((c) => [c.headers["x-api-key"], c.body.model])).toEqual([
      ["first", "model-a"],
      ["second", "model-b"],
    ]);
  });
});

describe("ClaudeDiaryComposer：応答", () => {
  it("先頭が thinking ブロックでも、text ブロックの文字列を返す", async () => {
    const { composer } = setup([ok(message('{"title":"雨の日","body":"朝から雨だった。"}'))]);
    expect(await composer.compose(PROMPT)).toBe('{"title":"雨の日","body":"朝から雨だった。"}');
  });

  it("text が無い・空なら bad-response", async () => {
    const { composer } = setup([ok({ content: [{ type: "thinking", thinking: "" }], stop_reason: "end_turn" }), ok({})]);
    expect(await kindOf(composer.compose(PROMPT))).toBe("bad-response");
    expect(await kindOf(composer.compose(PROMPT))).toBe("bad-response");
  });

  it("途中で切れた（max_tokens）・断られた（refusal）応答は使わない", async () => {
    const { composer } = setup([ok(message('{"title":"t","body":"途中まで', "max_tokens")), ok(message("", "refusal"))]);
    expect(await kindOf(composer.compose(PROMPT))).toBe("truncated");
    expect(await kindOf(composer.compose(PROMPT))).toBe("refused");
  });

  it("JSON でない 200 応答は bad-response", async () => {
    const { composer } = setup([new Response("<html>", { status: 200 })]);
    expect(await kindOf(composer.compose(PROMPT))).toBe("bad-response");
  });
});

describe("ClaudeDiaryComposer：失敗", () => {
  it("APIキー未設定なら通信せずに no-api-key", async () => {
    const { composer, calls } = setup([], { apiKey: "   ", model: "claude-haiku-5-5" });
    expect(await kindOf(composer.compose(PROMPT))).toBe("no-api-key");
    expect(calls).toHaveLength(0);
  });

  it("圏外（fetch が例外）なら offline。例外の文面は持ち出さない", async () => {
    const { composer } = setup([new TypeError(`Failed to fetch with ${KEY}`)]);
    const error = await composer.compose(PROMPT).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ComposeError);
    expect((error as ComposeError).kind).toBe("offline");
    expect((error as ComposeError).message).not.toContain(KEY);
  });

  it.each([
    [401, "auth"],
    [403, "auth"],
    [429, "rate-limit"],
    [400, "bad-request"],
    [404, "bad-request"],
    [413, "bad-request"],
  ])("HTTP %i は %s（やり直さない）。API の説明文を持つ", async (status, kind) => {
    const { composer, calls } = setup([apiError(status, "APIからの説明")]);
    const error = (await composer.compose(PROMPT).catch((e: unknown) => e)) as ComposeError;
    expect(error.kind).toBe(kind);
    expect(error.message).toBe("APIからの説明");
    expect(calls).toHaveLength(1);
  });

  it("サーバー側の不調（529・500）は1回だけやり直す", async () => {
    const recovered = setup([apiError(529, "Overloaded"), ok(message("成功"))]);
    expect(await recovered.composer.compose(PROMPT)).toBe("成功");
    expect(recovered.calls).toHaveLength(2);
    expect(recovered.sleeps).toHaveLength(1);

    const failed = setup([apiError(500, "x"), apiError(529, "Overloaded")]);
    expect(await kindOf(failed.composer.compose(PROMPT))).toBe("overloaded");
    expect(failed.calls).toHaveLength(2);
  });

  it("エラー応答が JSON でなければ status を説明にする", async () => {
    const { composer } = setup([new Response("Bad Gateway", { status: 400 })]);
    const error = (await composer.compose(PROMPT).catch((e: unknown) => e)) as ComposeError;
    expect(error.message).toBe("HTTP 400");
  });
});

describe("testClaudeConnection（接続テスト）", () => {
  it("短いメッセージを同じヘッダで送り、成功なら何も返さない", async () => {
    const { deps, calls } = setup([ok(message("OK"))]);
    await expect(testClaudeConnection(deps)).resolves.toBeUndefined();
    expect(calls[0]?.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(calls[0]?.body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 64 });
    expect(calls[0]?.body.system).toBeUndefined();
  });

  it("キーが違えば auth", async () => {
    const { deps } = setup([apiError(401, "invalid x-api-key")]);
    expect(await kindOf(testClaudeConnection(deps))).toBe("auth");
  });
});
