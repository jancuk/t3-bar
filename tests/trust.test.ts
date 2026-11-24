import { describe, expect, it } from 'vitest';
import { isTrustedPageUrl } from '../src/main/trust';

const prod = {
  mainFileUrl: 'file:///app/dist/renderer/index.html',
  pillFileUrl: 'file:///app/dist/renderer/pill.html',
};
const dev = { ...prod, devServerOrigin: 'http://127.0.0.1:5173' };

describe('isTrustedPageUrl (production)', () => {
  it('accepts exactly the file for each page, ignoring query and hash', () => {
    expect(isTrustedPageUrl(prod.mainFileUrl, 'main', prod)).toBe(true);
    expect(isTrustedPageUrl(`${prod.mainFileUrl}?capture=1#x`, 'main', prod)).toBe(true);
    expect(isTrustedPageUrl(prod.pillFileUrl, 'pill', prod)).toBe(true);
  });
  it('rejects the other page', () => {
    expect(isTrustedPageUrl(prod.pillFileUrl, 'main', prod)).toBe(false);
    expect(isTrustedPageUrl(prod.mainFileUrl, 'pill', prod)).toBe(false);
  });
  it('rejects other files, schemes and bad input', () => {
    for (const u of ['file:///app/dist/renderer/other.html', 'https://example.com/index.html', 'http://127.0.0.1:5173/', 'about:blank', 'nope', '', undefined]) {
      expect(isTrustedPageUrl(u, 'main', prod)).toBe(false);
    }
  });
});

describe('isTrustedPageUrl (dev server)', () => {
  it('accepts the dev origin with the right path per page', () => {
    expect(isTrustedPageUrl('http://127.0.0.1:5173/', 'main', dev)).toBe(true);
    expect(isTrustedPageUrl('http://127.0.0.1:5173/index.html', 'main', dev)).toBe(true);
    expect(isTrustedPageUrl('http://127.0.0.1:5173/pill.html?capture=1', 'pill', dev)).toBe(true);
  });
  it('rejects wrong pages and origins', () => {
    expect(isTrustedPageUrl('http://127.0.0.1:5173/pill.html', 'main', dev)).toBe(false);
    expect(isTrustedPageUrl('http://127.0.0.1:5173/', 'pill', dev)).toBe(false);
    expect(isTrustedPageUrl('http://127.0.0.1:5174/', 'main', dev)).toBe(false);
    expect(isTrustedPageUrl('http://localhost:5173/', 'main', dev)).toBe(false);
    expect(isTrustedPageUrl(prod.mainFileUrl, 'main', dev)).toBe(false);
  });
});

describe('pill ready channel', () => {
  it('is only reachable from the pill page, never the main page', () => {
    expect(isTrustedPageUrl(prod.pillFileUrl, 'pill', prod)).toBe(true);
    expect(isTrustedPageUrl(prod.mainFileUrl, 'pill', prod)).toBe(false);
    expect(isTrustedPageUrl('http://127.0.0.1:5173/pill.html', 'pill', dev)).toBe(true);
  });
});
