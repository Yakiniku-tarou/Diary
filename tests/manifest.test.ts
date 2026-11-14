import { describe, expect, it } from "vitest";
import manifestText from "../public/manifest.webmanifest?raw";

// public/ にある PNG の一覧（ファイル名だけ使う）
const pngFiles = Object.keys(import.meta.glob("../public/*.png")).map((p) => p.replace("../public/", ""));

describe("manifest.webmanifest", () => {
  const manifest = JSON.parse(manifestText) as {
    display: string;
    start_url: string;
    scope: string;
    lang: string;
    icons: { src: string; sizes: string }[];
  };

  it("ホーム画面から全画面（standalone）で起動する設定になっている", () => {
    expect(manifest.display).toBe("standalone");
  });

  it("GitHub Pages のサブパスでも動くよう相対パスになっている", () => {
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
  });

  it("日本語の設定になっている", () => {
    expect(manifest.lang).toBe("ja");
  });

  it("192px と 512px のアイコンがあり、ファイルが実在する", () => {
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    for (const icon of manifest.icons) {
      expect(pngFiles).toContain(icon.src);
    }
  });

  it("iPhone 用の apple-touch-icon がある", () => {
    expect(pngFiles).toContain("apple-touch-icon.png");
  });
});
