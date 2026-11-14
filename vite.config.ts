import { defineConfig } from "vitest/config";

// GitHub Actions では BASE_PATH に "/<リポジトリ名>/" を渡す（deploy.yml 参照）。
// ローカル開発では "/"。
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  base: process.env.BASE_PATH ?? "/",
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
