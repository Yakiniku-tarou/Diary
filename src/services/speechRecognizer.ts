// ブラウザの音声認識（Web Speech API）による録音入力。実験的なおまけ機能（SPEC.md 3.1）
// iPhone の Safari では動作が不安定なので、使えない環境ではボタンを出さない。
// 聞き取った内容はログに出さない。

/** 使う範囲だけを写した Web Speech API の形（ブラウザごとに型定義の有無が違うため自前で持つ） */
interface RecognitionResultLike {
  readonly length: number;
  readonly [index: number]: { readonly transcript: string } | undefined;
}

interface RecognitionEventLike {
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResultLike | undefined };
}

export interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { readonly error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type RecognitionConstructor = new () => RecognitionLike;

export type SpeechErrorKind = "not-allowed" | "failed";

export interface SpeechHandlers {
  /** 録音を始めてから今までに聞き取った全文（途中経過を含む。来るたびに置き換える） */
  onText(text: string): void;
  /** 録音が終わった（自分で止めた・無音で自動終了した・エラー） */
  onEnd(error?: SpeechErrorKind): void;
}

export interface SpeechSession {
  /** 録音を止める。聞き取り済みの内容は onText で届いたあと onEnd が呼ばれる */
  stop(): void;
  /** すぐに打ち切る。以後 onText / onEnd は呼ばれない */
  cancel(): void;
}

/** このブラウザの音声認識。無ければ undefined */
export function findSpeechRecognition(scope: object = globalThis): RecognitionConstructor | undefined {
  const s = scope as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  const ctor = s.SpeechRecognition ?? s.webkitSpeechRecognition;
  return typeof ctor === "function" ? (ctor as RecognitionConstructor) : undefined;
}

function toErrorKind(code: string): SpeechErrorKind | undefined {
  // 何も話さなかった・自分で止めた、はエラー扱いにしない
  if (code === "no-speech" || code === "aborted") return undefined;
  if (code === "not-allowed" || code === "service-not-allowed") return "not-allowed";
  return "failed";
}

/** 録音を始める。始められなければ onEnd("failed") を呼ぶ */
export function startSpeechRecognition(Recognition: RecognitionConstructor, handlers: SpeechHandlers): SpeechSession {
  let closed = false;
  let error: SpeechErrorKind | undefined;
  const finish = () => {
    if (closed) return;
    closed = true;
    handlers.onEnd(error);
  };

  let recognition: RecognitionLike;
  try {
    recognition = new Recognition();
    recognition.lang = "ja-JP";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      if (closed) return;
      // ブラウザによって「確定」の付き方が違うので、毎回すべての結果をつなぎ直す
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i]?.[0]?.transcript ?? "";
      }
      handlers.onText(text);
    };
    recognition.onerror = (event) => {
      error = toErrorKind(event.error) ?? error;
    };
    recognition.onend = finish;
    recognition.start();
  } catch {
    error = "failed";
    finish();
    return { stop: () => undefined, cancel: () => undefined };
  }

  return {
    stop() {
      if (closed) return;
      try {
        recognition.stop();
      } catch {
        finish();
      }
    },
    cancel() {
      if (closed) return;
      closed = true;
      try {
        recognition.abort();
      } catch {
        // すでに止まっている
      }
    },
  };
}
