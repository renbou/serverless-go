// Additional typings for serverless

declare namespace ServerlessUtils {
  interface Progress {
    update(message: string): void;
    remove(): void;
  }

  type ProgressOptions = {
    name?: string;
    message?: string;
  };

  interface ProgressEmitter {
    create(options: ProgressOptions): Progress;
  }

  type LogFunction = (message: string, ...fmt: any) => void;
  interface Log {
    error: LogFunction;
    warning: LogFunction;
    notice: LogFunction;
    info: LogFunction;
    debug: LogFunction;
  }
}

interface PluginOptions {
  log: ServerlessUtils.Log;
  progress: ServerlessUtils.ProgressEmitter;
}

declare module "serverless/lib/serverless-error" {
  class ServerlessError extends Error {
    constructor(message: string, code?: string, options?: {});
    code: string;
    decoratedMessage: string;
  }
  export = ServerlessError;
}
