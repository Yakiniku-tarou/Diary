// アイコン PNG を生成するスクリプト（外部ライブラリなし。Node 標準の zlib だけを使う）
// 実行：npm run icons
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const BG = [0x8a, 0x5a, 0x3b]; // 革表紙っぽい茶色
const PAGE = [0xfb, 0xf7, 0xf0]; // 紙の色
const LINE = [0xc9, 0xb8, 0xa3]; // 罫線
const DOT = [0xc0, 0x5a, 0x3e]; // しおり

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const i = y * (size * 3 + 1) + 1 + x * 3;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 角丸の四角形の内側か
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// scale：図柄の大きさ（maskable は安全領域に収めるため小さめ）
function diary(scale) {
  const m = (1 - scale) / 2;
  const p = (v) => m + v * scale;
  return (x, y) => {
    // しおり（ページ上端から垂れるリボン）
    if (x >= p(0.62) && x <= p(0.7) && y >= p(0.12) && y <= p(0.42)) return DOT;
    if (inRoundRect(x, y, p(0.22), p(0.16), p(0.78), p(0.84), 0.04 * scale)) {
      // 罫線
      for (let i = 0; i < 6; i++) {
        const ly = p(0.32 + i * 0.09);
        if (Math.abs(y - ly) < 0.012 * scale && x > p(0.3) && x < p(0.7)) return LINE;
      }
      return PAGE;
    }
    return BG;
  };
}

const out = (name, size, scale) => {
  writeFileSync(new URL(`../public/${name}`, import.meta.url), png(size, diary(scale)));
  console.log(`public/${name} (${size}px)`);
};

out("apple-touch-icon.png", 180, 1);
out("icon-192.png", 192, 1);
out("icon-512.png", 512, 1);
out("icon-maskable-512.png", 512, 0.75);
