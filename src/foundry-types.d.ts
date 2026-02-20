/**
 * Minimal Foundry VTT type declarations
 * These provide type hints for Foundry globals that are available at runtime
 */

declare global {
  // jQuery
  const $: any;
  
  // Foundry Application class
  class Application {
    constructor(options?: any);
    static get defaultOptions(): any;
    element: JQuery;
    rendered: boolean;
    render(force?: boolean): Promise<this>;
    getData(): Promise<any>;
    activateListeners(html: JQuery): void;
    close(): Promise<void>;
  }
  
  // Foundry Dialog class
  class Dialog extends Application {
    constructor(data: any, options?: any);
    data: any;
  }
  
  // Foundry Hooks
  const Hooks: {
    once(event: string, callback: (...args: any[]) => void): void;
    on(event: string, callback: (...args: any[]) => void): void;
    call(event: string, ...args: any[]): void;
  };
  
  // Handlebars
  const Handlebars: {
    registerHelper(name: string, fn: Function): void;
  };
  
  // Foundry Game
  const game: {
    settings: {
      register(namespace: string, key: string, options: any): void;
      get(namespace: string, key: string): any;
      set(namespace: string, key: string, value: any): Promise<any>;
    };
    keybindings: {
      register(namespace: string, key: string, options: any): void;
    };
    scenes: any;
    journal: any;
    actors: any;
  };
  
  // Foundry constants
  const CONST: {
    KEYBINDING_PRECEDENCE: {
      PRIORITY: number;
      NORMAL: number;
      DEFERRED: number;
    };
  };
  
  // Foundry UI
  const ui: {
    notifications?: {
      info(message: string): void;
      warn(message: string): void;
      error(message: string): void;
    };
  };
  
  // Foundry FilePicker (legacy global, deprecated in v13)
  class FilePicker {
    static createDirectory(source: string, target: string, options?: any): Promise<any>;
    static browse(source: string, target: string, options?: any): Promise<{
      target: string;
      dirs: string[];
      files: string[];
      gridSize: number | null;
      private: boolean;
      privateDirs: string[];
      extensions: string[];
    }>;
  }
  
  // Foundry v13+ namespaced API
  const foundry: {
    applications?: {
      apps?: {
        FilePicker?: typeof FilePicker;
      };
    };
  };
  
  // JQuery types
  interface JQuery {
    length: number;
    find(selector: string): JQuery;
    on(event: string, handler: (event: any) => void): JQuery;
    val(): any;
    data(key: string): any;
    is(selector: string): boolean;
    map(callback: (index: number, element: any) => any): JQuery;
    get(): any[];
    append(content: any): JQuery;
    html(content?: string): JQuery | string;
    text(content?: string): JQuery | string;
    addClass(className: string): JQuery;
    removeClass(className: string): JQuery;
    toggleClass(className: string, state?: boolean): JQuery;
    parent(): JQuery;
  }
  
  namespace JQuery {
    interface TriggeredEvent {
      currentTarget: any;
      target: any;
      ctrlKey: boolean;
      metaKey: boolean;
      preventDefault(): void;
      stopPropagation(): void;
    }
  }
  
  namespace NodeJS {
    type Timeout = any;
  }
}

export {};
