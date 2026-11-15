// ファイルの書き出し：iPhone では共有シート、使えない環境ではダウンロード（SPEC.md 5.4）

export type ShareResult = "shared" | "downloaded" | "cancelled";

export async function shareOrDownload(fileName: string, content: string, mimeType: string): Promise<ShareResult> {
  const file = new File([content], fileName, { type: mimeType });

  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch (e) {
      // 共有シートを閉じただけなら、書き出していない扱いにする
      if (e instanceof DOMException && e.name === "AbortError") return "cancelled";
      // それ以外（許可されなかった等）はダウンロードに切り替える
    }
  }

  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "downloaded";
}
