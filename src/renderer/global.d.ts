import type { PillApi, T3BarApi } from '../shared/types';

declare global {
  interface Window {
    t3bar: T3BarApi;
    t3pill?: PillApi;
  }
}

export {};
