import { useState } from "react";

type Tab = "today" | "review" | "settings";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "今日" },
  { id: "review", label: "ふりかえり" },
  { id: "settings", label: "設定" },
];

// ホーム画面のアイコンから起動しているか（フェーズ1の動作確認用に表示する）
function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
}

export function App() {
  const [tab, setTab] = useState<Tab>("today");
  const current = TABS.find((t) => t.id === tab);

  return (
    <div className="app">
      <main className="content">
        <h1 className="page-title">{current?.label}</h1>
        <p className="placeholder">準備中です。</p>
        <p className="placeholder small">
          起動方法：{isStandalone() ? "ホーム画面のアイコン" : "ブラウザ"}
        </p>
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
