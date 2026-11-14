// まとめ処理（Claude API 呼び出し）の失敗の種類

export type ComposeErrorKind =
  | "no-api-key" // APIキー未設定
  | "offline" // 圏外・通信できない
  | "auth" // APIキーが正しくない
  | "rate-limit" // 回数制限
  | "overloaded" // 混雑・サーバー側の不調
  | "bad-request" // リクエストの誤り（モデルIDの誤りなど）
  | "bad-response" // 応答から日記を取り出せない
  | "truncated" // 長すぎて途中で切れた
  | "refused" // モデルが応答を断った
  | "unknown";

export class ComposeError extends Error {
  readonly kind: ComposeErrorKind;

  constructor(kind: ComposeErrorKind, message?: string) {
    super(message ?? kind);
    this.name = "ComposeError";
    this.kind = kind;
  }
}

export function toComposeError(error: unknown): ComposeError {
  if (error instanceof ComposeError) return error;
  if (error instanceof TypeError) return new ComposeError("offline", error.message);
  return new ComposeError("unknown", error instanceof Error ? error.message : String(error));
}

/** 画面に出す説明 */
export function composeErrorMessage(error: ComposeError): string {
  switch (error.kind) {
    case "no-api-key":
      return "APIキーが設定されていません。設定画面で入力してください。";
    case "offline":
      return "通信できませんでした。電波の届くところで、あとでまとめ直せます。";
    case "auth":
      return "APIキーが正しくないようです。設定画面で確認してください。";
    case "rate-limit":
      return "利用の上限に達しました。しばらくしてからまとめ直してください。";
    case "overloaded":
      return "Claude が混み合っています。しばらくしてからまとめ直してください。";
    case "bad-request":
      return "リクエストが受け付けられませんでした。設定のモデルIDを確認してください。";
    case "bad-response":
      return "日記をうまく作れませんでした。あとでまとめ直せます。";
    case "truncated":
      return "内容が長すぎて、まとめきれませんでした。原文はそのまま保存してあります。";
    case "refused":
      return "この内容は日記にまとめられませんでした。原文はそのまま保存してあります。";
    case "unknown":
      return "日記にまとめられませんでした。あとでまとめ直せます。";
  }
}

/** API が返した説明など、原因を調べる手がかり（設定の誤りに関係する種類だけ） */
export function composeErrorDetail(error: ComposeError): string | undefined {
  const kinds: ComposeErrorKind[] = ["auth", "bad-request", "unknown"];
  return kinds.includes(error.kind) && error.message !== error.kind ? error.message : undefined;
}
