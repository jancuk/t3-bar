import type { T3WidgetApi } from '../shared/types';

declare global {
  interface Window {
    t3widget: T3WidgetApi;
  }
}

export {};
