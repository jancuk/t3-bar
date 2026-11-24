export type PageKind = 'main' | 'pill';

export interface TrustContext {
  devServerOrigin?: string;
  mainFileUrl: string;
  pillFileUrl: string;
}

export function isTrustedPageUrl(url: string | undefined, page: PageKind, ctx: TrustContext): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (ctx.devServerOrigin) {
      if (u.origin !== ctx.devServerOrigin) return false;
      return page === 'main' ? u.pathname === '/' || u.pathname === '/index.html' : u.pathname === '/pill.html';
    }
    if (u.protocol !== 'file:') return false;
    const expected = new URL(page === 'main' ? ctx.mainFileUrl : ctx.pillFileUrl);
    return u.origin + u.pathname === expected.origin + expected.pathname;
  } catch {
    return false;
  }
}
