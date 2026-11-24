import { deflateSync } from 'node:zlib';

/** Draws a "T" inside a rounded-square outline. Returns black-on-transparent RGBA. */
export function rasterizeGlyph(size: number): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const s = size / 16; // design on a 16 grid
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 255;
  };
  const rect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.round(y0 * s); y < Math.round(y1 * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round(x1 * s); x++) set(x, y);
  };
  const t = Math.max(1, Math.round(1.5 * s) / s); // stroke thickness (grid units)
  const r = 3; // corner radius (grid units)
  // Outline of rounded square spanning 1..15
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = (x + 0.5) / s;
      const gy = (y + 0.5) / s;
      const lo = 1, hi = 15;
      if (gx < lo || gx > hi || gy < lo || gy > hi) continue;
      const inside = (inset: number) => {
        const a = lo + inset, b = hi - inset, rr = Math.max(0, r - inset);
        if (gx < a || gx > b || gy < a || gy > b) return false;
        const cx = gx < a + rr ? a + rr : gx > b - rr ? b - rr : gx;
        const cy = gy < a + rr ? a + rr : gy > b - rr ? b - rr : gy;
        return (gx - cx) ** 2 + (gy - cy) ** 2 <= rr * rr;
      };
      if (inside(0) && !inside(t)) set(x, y);
    }
  }
  // "T": top bar and stem
  rect(4.5, 4.5, 11.5, 6.2);
  rect(7.2, 6.2, 8.8, 11.8);
  return px;
}

let crcTable: Uint32Array | null = null;
function crc32(buf: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([len, typeAndData, crc]);
}

export function encodePng(rgba: Uint8Array, width: number, height: number): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

export function trayIconPng(size: number): Buffer {
  return encodePng(rasterizeGlyph(size), size, size);
}

export function trayIconDataUrls(): { x1: string; x2: string } {
  const url = (n: number) => `data:image/png;base64,${trayIconPng(n).toString('base64')}`;
  return { x1: url(16), x2: url(32) };
}
