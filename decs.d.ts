// Additional typings for serverless

declare module "@serverless-rewrite/serverless/lib/serverless-error" {
  class ServerlessError extends Error {
    constructor(message: string, code?: string, options?: {});
    code: string;
    decoratedMessage: string;
  }
  export = ServerlessError;
}
