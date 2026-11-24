import type { ErrorCode, Result } from '../shared/types';

export type { ErrorCode };

export class AppError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function toResult<T>(fn: () => Promise<T>): Promise<Result<T>>;
export function toResult<T>(fn: () => T): Result<T>;
export function toResult<T>(fn: () => T | Promise<T>): Result<T> | Promise<Result<T>> {
  try {
    const out = fn();
    if (out instanceof Promise) {
      return out.then(
        (data): Result<T> => ({ ok: true, data }),
        (e: unknown) => errorToResult(e),
      );
    }
    return { ok: true, data: out };
  } catch (e) {
    return errorToResult(e);
  }
}

export function errorToResult(e: unknown): { ok: false; code: ErrorCode; message: string } {
  if (e instanceof AppError) return { ok: false, code: e.code, message: e.message };
  return { ok: false, code: 'UNKNOWN', message: e instanceof Error ? e.message : String(e) };
}
