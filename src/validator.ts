import Serverless = require("serverless");
import ServerlessService = require("serverless/classes/Service");
import { GO_RUNTIME } from "./constants";
import Logger from "./logger";

// Validator makes validating serverless config easier
class Validator {
  #service: ServerlessService;
  #logger: Logger;

  constructor(service: ServerlessService, logger: Logger) {
    this.#service = service;
    this.#logger = logger;
  }

  validateFunction(functionName: string) {
    const slsFunction = this.#service.getFunction(functionName);
    const runtime = slsFunction.runtime || this.#service.provider.runtime;
    // Skip non-go runtimes
    if (runtime !== GO_RUNTIME) {
      return null;
    }

    // Make sure we have a valid handler-function definition
    if (!Object.prototype.hasOwnProperty.call(slsFunction, "handler")) {
      this.#logger.error(
        `Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`
      );
      return null;
    }

    if (
      [slsFunction.package?.exclude, slsFunction.package?.include].some(Boolean)
    ) {
      this.#logger.error(
        `${functionName} package references exclude or include, which are deprecated`
      );
    }

    return <Serverless.FunctionDefinitionHandler>slsFunction;
  }
}

export default Validator;
