export interface DesktopApi {
  getLocale?: () => Promise<string>;
  getConfig?: () => Promise<unknown>;
  setConfig?: (config: unknown) => Promise<unknown>;
  getStatus?: () => Promise<unknown>;
  start?: () => Promise<unknown>;
  testModel?: (payload: unknown) => Promise<unknown>;
  connect?: (payload: unknown) => Promise<unknown>;
  onProgress?: (callback: (payload: unknown) => void) => () => void;
  openExternal?: (url: string) => Promise<boolean>;
  openPath?: (target: string) => Promise<string>;
  pickFolder?: () => Promise<string | null>;
}

declare global {
  interface Window {
    desktop?: DesktopApi;
  }
}

export {};
