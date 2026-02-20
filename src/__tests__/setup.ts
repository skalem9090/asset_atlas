/**
 * Test setup and polyfills
 */

// Polyfill for structuredClone (needed for fake-indexeddb)
if (typeof (globalThis as any).structuredClone === 'undefined') {
  (globalThis as any).structuredClone = (obj: any) => JSON.parse(JSON.stringify(obj));
}

// Mock Foundry VTT globals for testing
(globalThis as any).Dialog = class Dialog {
  constructor(data: any, options: any) {}
  static async wait(data: any, options: any) {
    return null;
  }
};

(globalThis as any).Application = class Application {
  constructor(options: any = {}) {}
  static get defaultOptions() {
    return {};
  }
  async getData() {
    return {};
  }
  render(force: boolean = false) {
    return this;
  }
  activateListeners(html: any) {}
  close() {}
};

(globalThis as any).game = {
  settings: {
    get: (module: string, key: string) => null,
    set: (module: string, key: string, value: any) => Promise.resolve(),
    register: (module: string, key: string, data: any) => {}
  }
};

(globalThis as any).ui = {
  notifications: {
    info: (message: string) => {},
    warn: (message: string) => {},
    error: (message: string) => {}
  }
};

(globalThis as any).Hooks = {
  on: (event: string, callback: Function) => {},
  once: (event: string, callback: Function) => {},
  call: (event: string, ...args: any[]) => {}
};

