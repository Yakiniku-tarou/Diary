// Claude API（Messages API）をブラウザから fetch で直接呼ぶ DiaryComposer（SPEC.md 3.2）
// SDK は使わない。APIキー・日記の内容はログに出さない
import { ComposeError } from "../core/errors";
import type { ComposePrompt, DiaryComposer } from "../core/ports";
import { COMPOSE_MAX_TOKENS } from "../core/prompt";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const TIMEOUT_MS = 90_000;
const RETRY_DELAY_MS = 1500;

export interface ClaudeConfig {
  apiKey: string;
  model: string;
}

export interface ClaudeDeps {
  /** 呼ぶたびに最新の設定を読む */
  getConfig: () => Promise<ClaudeConfig> | ClaudeConfig;
  fetch?: typeof fetch;
  /** 再試行までの待ち（テストで差し替える） */
  sleep?: (ms: number) => Promise<void>;
}

/** 応答を {"title", "body"} の JSON に固定する（構造化出力） */
const DIARY_FORMAT = {
  type: "json_schema",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string" },
    },
    required: ["title", "body"],
    additionalProperties: false,
  },
} as const;

interface MessagesResponse {
  content?: { type: string; text?: string }[];
  stop_reason?: string | null;
}

function headers(apiKey: string): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    // ブラウザから直接呼ぶために必要
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

/** エラー応答から API の説明文を取り出す */
async function errorMessage(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: { message?: unknown } };
    if (typeof data.error?.message === "string") return data.error.message;
  } catch {
    // JSON でなければ status だけ伝える
  }
  return `HTTP ${response.status}`;
}

function errorForStatus(status: number, message: string): ComposeError {
  if (status === 401 || status === 403) return new ComposeError("auth", message);
  if (status === 429) return new ComposeError("rate-limit", message);
  if (status >= 500) return new ComposeError("overloaded", message);
  return new ComposeError("bad-request", message);
}

async function post(deps: ClaudeDeps, body: Record<string, unknown>): Promise<MessagesResponse> {
  const config = await deps.getConfig();
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw new ComposeError("no-api-key");

  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const payload = JSON.stringify({ model: config.model.trim(), ...body });

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await doFetch(API_URL, {
        method: "POST",
        headers: headers(apiKey),
        body: payload,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      // 圏外・タイムアウトなど。例外の文面は使わない
      throw new ComposeError("offline");
    }
    if (response.ok) {
      try {
        return (await response.json()) as MessagesResponse;
      } catch {
        throw new ComposeError("bad-response", "応答を読み取れませんでした");
      }
    }
    // サーバー側の一時的な不調は1回だけやり直す
    if (response.status >= 500 && attempt === 0) {
      await sleep(RETRY_DELAY_MS);
      continue;
    }
    throw errorForStatus(response.status, await errorMessage(response));
  }
}

export class ClaudeDiaryComposer implements DiaryComposer {
  private readonly deps: ClaudeDeps;

  constructor(deps: ClaudeDeps) {
    this.deps = deps;
  }

  async compose(prompt: ComposePrompt): Promise<string> {
    const data = await post(this.deps, {
      max_tokens: COMPOSE_MAX_TOKENS,
      system: prompt.system,
      messages: [{ role: "user", content: prompt.user }],
      // 清書は軽い作業なので effort は low（速さ優先。考える分も max_tokens に数えられる）
      output_config: { effort: "low", format: DIARY_FORMAT },
    });

    if (data.stop_reason === "refusal") throw new ComposeError("refused");
    if (data.stop_reason === "max_tokens") throw new ComposeError("truncated");

    // 先頭が thinking ブロックのことがあるので、種類が text のものだけを集める
    const text = (data.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("");
    if (!text.trim()) throw new ComposeError("bad-response", "応答に本文がありません");
    return text;
  }
}

/** 接続テスト：短いメッセージを1回送る。成功なら何も返さず、失敗なら ComposeError */
export async function testClaudeConnection(deps: ClaudeDeps): Promise<void> {
  await post(deps, {
    max_tokens: 64,
    messages: [{ role: "user", content: "接続テストです。「OK」とだけ返してください。" }],
    output_config: { effort: "low" },
  });
}
