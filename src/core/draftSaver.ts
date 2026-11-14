// 入力途中のテキストを下書きとして自動保存する（SPEC.md 3.1）
// 入力のたびに save() を呼んでよい。書き込みは1つずつ順に行い、
// 書き込み中に次の入力が来たら、終わりしだい最新の内容だけを書く。
import type { DiaryRepository } from "./ports";
import type { DiaryDay } from "./types";

export interface DraftSaver {
  /** 最新の入力内容を保存する。空なら下書きを消す */
  save(text: string, day?: DiaryDay): void;
  /** いま頼まれている保存がすべて終わるまで待つ */
  whenIdle(): Promise<void>;
}

export function createDraftSaver(
  repo: Pick<DiaryRepository, "saveDraft" | "clearDraft">,
  options: { now?: () => Date; onError?: () => void } = {},
): DraftSaver {
  let pending: { text: string; day?: DiaryDay } | undefined;
  let running: Promise<void> | undefined;

  async function run(): Promise<void> {
    while (pending) {
      const { text, day } = pending;
      pending = undefined;
      try {
        if (text === "") {
          await repo.clearDraft();
        } else {
          const updatedAt = (options.now ? options.now() : new Date()).toISOString();
          await repo.saveDraft(day ? { text, day, updatedAt } : { text, updatedAt });
        }
      } catch {
        // 保存に失敗しても入力は止めない。次の入力でまた試す
        options.onError?.();
      }
    }
    running = undefined;
  }

  return {
    save(text, day) {
      pending = day ? { text, day } : { text };
      running ??= run();
    },
    whenIdle() {
      return running ?? Promise.resolve();
    },
  };
}
