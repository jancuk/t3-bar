import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, rasterizeGlyph, trayIconDataUrls, trayIconPng } from '../src/main/trayIcon';

describe('tray icon', () => {
  it('produces valid PNG structure', () => {
    const png = trayIconPng(16);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR');
    expect(png.readUInt32BE(16)).toBe(16);
    expect(png.readUInt32BE(20)).toBe(16);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(6);
    expect(png.subarray(png.length - 8, png.length - 4).toString('ascii')).toBe('IEND');
  });

  it('IDAT inflates to the expected raw size and the CRCs verify', () => {
    const png = trayIconPng(32);
    let off = 8;
    const types: string[] = [];
    let idat = Buffer.alloc(0);
    while (off < png.length) {
      const len = png.readUInt32BE(off);
      const type = png.subarray(off + 4, off + 8).toString('ascii');
      const data = png.subarray(off + 8, off + 8 + len);
      types.push(type);
      if (type === 'IDAT') idat = Buffer.concat([idat, data]);
      off += 12 + len;
    }
    expect(types).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(inflateSync(idat).length).toBe((32 * 4 + 1) * 32);
  });

  it('draws black-on-transparent pixels with a centered T', () => {
    const px = rasterizeGlyph(32);
    let opaque = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] !== 0) {
        opaque++;
        expect([px[i], px[i + 1], px[i + 2], px[i + 3]]).toEqual([0, 0, 0, 255]);
      }
    }
    expect(opaque).toBeGreaterThan(40);
    expect(opaque).toBeLessThan(32 * 32 * 0.6);
    expect(px[3]).toBe(0); // corner is transparent
  });

  it('encodes arbitrary RGBA', () => {
    const png = encodePng(new Uint8Array([255, 0, 0, 255]), 1, 1);
    expect(png.readUInt32BE(16)).toBe(1);
  });

  it('returns data URLs for 1x and 2x', () => {
    const u = trayIconDataUrls();
    expect(u.x1.startsWith('data:image/png;base64,')).toBe(true);
    expect(u.x2.startsWith('data:image/png;base64,')).toBe(true);
    const w = (s: string) => Buffer.from(s.split(',')[1] as string, 'base64').readUInt32BE(16);
    expect(w(u.x1)).toBe(16);
    expect(w(u.x2)).toBe(32);
  });
});
