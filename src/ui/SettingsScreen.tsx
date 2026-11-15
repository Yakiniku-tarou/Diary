import { useEffect, useRef, useState } from "react";
import { ComposeError, composeErrorDetail, composeErrorMessage, toComposeError } from "../core/errors";
import { DEFAULT_MODEL, type DiaryFormat, type DiaryStyle, type Settings } from "../core/types";
import { testClaudeConnection } from "../services/claudeComposer";
import type { AppServices } from "./App";
import { BackupSection } from "./BackupSection";

type TestResult =
  | { status: "testing" }
  | { status: "ok" }
  | { status: "failed"; text: string; detail?: string };

const HOURS = Array.from({ length: 24 }, (_, h) => h);

export function SettingsScreen({ services }: { services: AppServices }) {
  const { repo } = services;
  const [settings, setSettings] = useState<Settings>();
  const [saveFailed, setSaveFailed] = useState(false);
  const [test, setTest] = useState<TestResult>();
  // 保存は1つずつ順に行う（入力のたびに保存するので、順番が入れ替わらないようにする）
  const saveQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    repo.getSettings().then(
      (loaded) => {
        if (!cancelled) setSettings(loaded);
      },
      () => {
        if (!cancelled) setSaveFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repo]);

  if (!settings) {
    return saveFailed ? <p className="notice error">設定を読み込めませんでした。</p> : <p className="muted">読み込み中…</p>;
  }

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setTest(undefined);
    saveQueue.current = saveQueue.current
      .then(() => repo.saveSettings(next))
      .then(
        () => setSaveFailed(false),
        () => setSaveFailed(true),
      );
  };

  const runTest = async () => {
    setTest({ status: "testing" });
    try {
      await testClaudeConnection({ getConfig: () => settings });
      setTest({ status: "ok" });
    } catch (e) {
      const error: ComposeError = toComposeError(e);
      const detail = composeErrorDetail(error);
      setTest({ status: "failed", text: composeErrorMessage(error), ...(detail ? { detail } : {}) });
    }
  };

  return (
    <>
      <h1 className="page-title">設定</h1>

      {saveFailed && (
        <p className="notice error" role="alert">
          設定を保存できませんでした。
        </p>
      )}

      <section className="settings-group">
        <h2>Claude API</h2>

        <label className="field">
          <span className="field-label">APIキー</span>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value.trim() })}
            placeholder="sk-ant-..."
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <span className="field-help">この端末の中にだけ保存されます。バックアップには含まれません。</span>
        </label>

        <button
          type="button"
          className="button secondary"
          disabled={!settings.apiKey || test?.status === "testing"}
          onClick={() => void runTest()}
        >
          {test?.status === "testing" ? "接続を確認しています…" : "接続テスト"}
        </button>
        {test?.status === "ok" && (
          <p className="notice ok" role="status">
            接続できました。
          </p>
        )}
        {test?.status === "failed" && (
          <div className="notice error" role="alert">
            <p>{test.text}</p>
            {test.detail && <p className="small">{test.detail}</p>}
          </div>
        )}

        <label className="field">
          <span className="field-label">モデルID</span>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => update({ model: e.target.value })}
            placeholder={DEFAULT_MODEL}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          {settings.model.trim() !== DEFAULT_MODEL && (
            <button type="button" className="button text" onClick={() => update({ model: DEFAULT_MODEL })}>
              既定（{DEFAULT_MODEL}）に戻す
            </button>
          )}
        </label>
      </section>

      <section className="settings-group">
        <h2>日記</h2>

        <label className="field">
          <span className="field-label">まとめ方</span>
          <select value={settings.format} onChange={(e) => update({ format: e.target.value as DiaryFormat })}>
            <option value="prose">文章（既定）</option>
            <option value="bullets">箇条書き</option>
          </select>
          <span className="field-help">
            次に「日記にする」「まとめ直す」を押したときから使われます。すでにある日記は変わりません。
          </span>
        </label>

        <label className="field">
          <span className="field-label">文体</span>
          <select value={settings.style} onChange={(e) => update({ style: e.target.value as DiaryStyle })}>
            <option value="plain">常体（〜だ・〜である）</option>
            <option value="polite">敬体（〜です・〜ます）</option>
          </select>
        </label>

        <label className="field">
          <span className="field-label">日付の境目</span>
          <select
            value={settings.dayBoundaryHour}
            onChange={(e) => update({ dayBoundaryHour: Number(e.target.value) })}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {h} 時{h === 4 ? "（既定）" : ""}
              </option>
            ))}
          </select>
          <span className="field-help">この時刻より前に書いた内容は、前の日の日記になります。</span>
        </label>
      </section>

      <BackupSection
        repo={repo}
        lastExportedAt={settings.lastExportedAt}
        onExported={(at) => update({ lastExportedAt: at })}
      />
    </>
  );
}
