import type { MochiApi } from './preload';

declare global {
  interface Window {
    mochi: MochiApi;
  }
}

export {};
