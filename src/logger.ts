import Serverless = require("serverless");

type ServerlessLog = InstanceType<typeof Serverless>["cli"]["log"];

// Logger util class based on available serverless.cli.log in order to
// make logging more declarative and simple.
class Logger {
  #namespace: string;
  #serverlessLog: ServerlessLog;

  static logStyles = {
    error: {
      bold: true,
      color: "red",
    },
    info: {},
    debug: {
      color: "white",
    },
  };

  constructor(namespace: string, serverlessLog: ServerlessLog) {
    this.#namespace = namespace;
    this.#serverlessLog = serverlessLog;
  }

  #logMessage(level: keyof typeof Logger.logStyles, message: string) {
    return this.#serverlessLog(
      message,
      this.#namespace,
      Logger.logStyles[level]
    );
  }

  error(message: string) {
    return this.#logMessage("error", message);
  }

  info(message: string) {
    return this.#logMessage("info", message);
  }

  debug(message: string) {
    return this.#logMessage("debug", message);
  }
}

export default Logger;
