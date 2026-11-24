import type { ErrorCode, Result } from '../../shared/types';

export const api = () => window.t3widget;

export interface UiError {
  code: ErrorCode;
  message: string;
}

export function toUiError(r: Extract<Result<unknown>, { ok: false }>): UiError {
  return { code: r.code, message: friendlyMessage(r.code, r.message) };
}

export function friendlyMessage(code: ErrorCode, message: string): string {
  switch (code) {
    case 'CLI_NOT_FOUND': return 'T3 CLI not found. Check the CLI path in settings.';
    case 'CLI_TIMEOUT': return 'Timed out. If you were sending a message, check the thread before resending.';
    case 'T3_APP_MISSING': return 'The T3 Code app is not installed.';
    case 'SERVER_UNREACHABLE': return 'T3 Code server is not running.';
    case 'PROJECT_NOT_FOUND': return message || 'Project not found in T3 Code.';
    case 'THREAD_NOT_FOUND': return 'That thread is no longer available.';
    case 'IN_FLIGHT': return 'Still sending the previous message.';
    default: return message || 'Something went wrong.';
  }
}
