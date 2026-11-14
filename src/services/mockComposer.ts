// モックの DiaryComposer（テスト用・APIキーなしでの画面確認用）
import type { ComposePrompt, DiaryComposer } from "../core/ports";

/** 応答：文字列をそのまま返す／Error を投げる／プロンプトから作る */
export type MockResponse = string | Error | ((prompt: ComposePrompt) => string);

export class MockDiaryComposer implements DiaryComposer {
  /** 呼ばれたときのプロンプト（テストで中身を確かめる用） */
  readonly calls: ComposePrompt[] = [];
  private readonly queue: MockResponse[];

  constructor(...responses: MockResponse[]) {
    this.queue = [...responses];
  }

  /** 次に返す応答を足す */
  enqueue(...responses: MockResponse[]): void {
    this.queue.push(...responses);
  }

  async compose(prompt: ComposePrompt): Promise<string> {
    this.calls.push(prompt);
    const response = this.queue.shift() ?? MockDiaryComposer.defaultResponse;
    if (response instanceof Error) throw response;
    return typeof response === "function" ? response(prompt) : response;
  }

  /** 応答が積まれていないときに返すもの */
  static readonly defaultResponse: MockResponse = () =>
    JSON.stringify({ title: "モックの日記", body: "（モックで作った日記の本文です）" });
}
