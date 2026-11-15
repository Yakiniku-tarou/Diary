import { describe, expect, it } from "vitest";
import {
  findSpeechRecognition,
  startSpeechRecognition,
  type RecognitionLike,
  type SpeechErrorKind,
} from "../../src/services/speechRecognizer";

/** 音声認識の代わり。テストから結果・エラー・終了を起こせる */
class FakeRecognition implements RecognitionLike {
  static last: FakeRecognition | undefined;
  static failOnStart = false;
  lang = "";
  continuous = false;
  interimResults = false;
  onresult: RecognitionLike["onresult"] = null;
  onerror: RecognitionLike["onerror"] = null;
  onend: RecognitionLike["onend"] = null;
  started = false;
  stopped = false;
  aborted = false;

  constructor() {
    FakeRecognition.last = this;
  }
  start() {
    if (FakeRecognition.failOnStart) throw new Error("start できない");
    this.started = true;
  }
  stop() {
    this.stopped = true;
    this.onend?.();
  }
  abort() {
    this.aborted = true;
    this.onend?.();
  }
  emit(...transcripts: string[]) {
    this.onresult?.({ results: transcripts.map((transcript) => [{ transcript }]) });
  }
}

function start() {
  FakeRecognition.failOnStart = false;
  const texts: string[] = [];
  const ends: (SpeechErrorKind | undefined)[] = [];
  const session = startSpeechRecognition(FakeRecognition, {
    onText: (text) => texts.push(text),
    onEnd: (error) => ends.push(error),
  });
  return { session, texts, ends, recognition: FakeRecognition.last as FakeRecognition };
}

describe("findSpeechRecognition", () => {
  it("標準の名前でも webkit 付きでも見つける", () => {
    expect(findSpeechRecognition({ SpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
    expect(findSpeechRecognition({ webkitSpeechRecognition: FakeRecognition })).toBe(FakeRecognition);
  });

  it("無い環境では undefined", () => {
    expect(findSpeechRecognition({})).toBeUndefined();
    expect(findSpeechRecognition({ SpeechRecognition: "関数ではない" })).toBeUndefined();
  });
});

describe("startSpeechRecognition", () => {
  it("日本語・連続・途中経過ありで始める", () => {
    const { recognition } = start();
    expect(recognition.started).toBe(true);
    expect(recognition.lang).toBe("ja-JP");
    expect(recognition.continuous).toBe(true);
    expect(recognition.interimResults).toBe(true);
  });

  it("結果が来るたびに、すべての結果をつないだ全文を渡す", () => {
    const { texts, recognition } = start();
    recognition.emit("今日は");
    recognition.emit("今日は散歩した");
    recognition.emit("今日は散歩した。", "そのあと");
    expect(texts).toEqual(["今日は", "今日は散歩した", "今日は散歩した。そのあと"]);
  });

  it("止めると onEnd が1回だけ呼ばれる", () => {
    const { session, ends, recognition } = start();
    session.stop();
    session.stop();
    expect(recognition.stopped).toBe(true);
    expect(ends).toEqual([undefined]);
  });

  it("無音などで自動的に終わったときも onEnd が呼ばれる", () => {
    const { ends, recognition } = start();
    recognition.onend?.();
    expect(ends).toEqual([undefined]);
  });

  it("マイクが許可されていないときは not-allowed", () => {
    const { ends, recognition } = start();
    recognition.onerror?.({ error: "not-allowed" });
    recognition.onend?.();
    expect(ends).toEqual(["not-allowed"]);
  });

  it("その他のエラーは failed、無音・中断はエラーにしない", () => {
    const failed = start();
    failed.recognition.onerror?.({ error: "network" });
    failed.recognition.onend?.();
    expect(failed.ends).toEqual(["failed"]);

    const silent = start();
    silent.recognition.onerror?.({ error: "no-speech" });
    silent.recognition.onend?.();
    expect(silent.ends).toEqual([undefined]);
  });

  it("打ち切ったあとは、結果も終了も伝えない", () => {
    const { session, texts, ends, recognition } = start();
    session.cancel();
    recognition.emit("あとから届いた");
    expect(recognition.aborted).toBe(true);
    expect(texts).toEqual([]);
    expect(ends).toEqual([]);
  });

  it("始められなかったら failed で終わる", () => {
    FakeRecognition.failOnStart = true;
    const ends: (SpeechErrorKind | undefined)[] = [];
    const session = startSpeechRecognition(FakeRecognition, { onText: () => undefined, onEnd: (e) => ends.push(e) });
    expect(ends).toEqual(["failed"]);
    session.stop();
    session.cancel();
    expect(ends).toEqual(["failed"]);
    FakeRecognition.failOnStart = false;
  });
});
