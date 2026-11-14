// 編集内容の自動保存（SPEC.md 5.2：入力が止まって約1秒後に保存）
// schedule() のたびに待ち時間をやり直し、止まったら最新の内容を1回だけ保存する。
// 保存は1つずつ順に行う。画面を離れる前などは flush() ですぐ保存する。

export interface Autosaver<T> {
  /** 最新の内容を渡す。入力のたびに呼んでよい */
  schedule(value: T): void;
  /** 待っている内容があればすぐ保存し、進行中の保存も含めて終わるまで待つ */
  flush(): Promise<void>;
  /** まだ保存されていない内容があるか */
  readonly pending: boolean;
}

export const AUTOSAVE_DELAY_MS = 1000;

export function createAutosaver<T>(
  save: (value: T) => Promise<void>,
  options: { delayMs?: number; onError?: (error: unknown) => void } = {},
): Autosaver<T> {
  const delayMs = options.delayMs ?? AUTOSAVE_DELAY_MS;
  let waiting: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let queue: Promise<void> = Promise.resolve();
  let saving = 0;

  function start(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!waiting) return;
    const { value } = waiting;
    waiting = undefined;
    saving++;
    queue = queue
      .then(() => save(value))
      .catch((error: unknown) => options.onError?.(error))
      .finally(() => {
        saving--;
      });
  }

  return {
    schedule(value) {
      waiting = { value };
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(start, delayMs);
    },
    flush() {
      start();
      return queue;
    },
    get pending() {
      return waiting !== undefined || saving > 0;
    },
  };
}
