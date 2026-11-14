import { useEffect, useState } from "react";
import type { DiaryComposer, DiaryRepository } from "../core/ports";
import { ClaudeDiaryComposer } from "../services/claudeComposer";
import { IndexedDbDiaryRepository } from "../services/indexedDbRepository";
import { SettingsScreen } from "./SettingsScreen";
import { TodayScreen } from "./TodayScreen";

export interface AppServices {
  repo: DiaryRepository;
  composer: DiaryComposer;
}

type Tab = "today" | "review" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "review", label: "ふりかえり" },
  { id: "settings", label: "設定" },
];

type Startup = { status: "loading" } | { status: "ready"; services: AppServices } | { status: "error" };

function useServices(): Startup {
  const [startup, setStartup] = useState<Startup>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const repo = new IndexedDbDiaryRepository();
    repo.ready().then(
      () => {
        if (cancelled) return;
        const composer = new ClaudeDiaryComposer({ getConfig: () => repo.getSettings() });
        setStartup({ status: "ready", services: { repo, composer } });
      },
      () => {
        if (!cancelled) setStartup({ status: "error" });
      },
    );
    // データが自動で消されにくくなるよう頼む（断られても動作は変わらない）
    void navigator.storage?.persist?.().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return startup;
}

export function App() {
  const startup = useServices();
  const [tab, setTab] = useState<Tab>("today");

  return (
    <div className="app">
      <main className="content">
        {startup.status === "loading" && <p className="muted">読み込み中…</p>}
        {startup.status === "error" && (
          <div className="notice error" role="alert">
            <p>保存領域を開けませんでした。</p>
            <p className="small">
              プライベートブラウズでは使えません。通常のモードで、ホーム画面のアイコンから開いてください。
            </p>
          </div>
        )}
        {startup.status === "ready" && (
          <>
            {tab === "today" && <TodayScreen services={startup.services} />}
            {tab === "review" && (
              <>
                <h1 className="page-title">ふりかえり</h1>
                <p className="muted">準備中です。</p>
              </>
            )}
            {tab === "settings" && <SettingsScreen services={startup.services} />}
          </>
        )}
      </main>
      <nav className="tabbar" aria-label="メイン">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={t.id === tab ? "tab active" : "tab"}
            aria-current={t.id === tab ? "page" : undefined}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
