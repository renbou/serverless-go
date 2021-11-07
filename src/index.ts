import * as os from "os";
import * as path from "path";
import AwsProvider = require("serverless/plugins/aws/provider/awsProvider");
import ServerlessPlugin = require("serverless/classes/Plugin");
import ServerlessUtils = require("serverless/classes/Utils");
import Serverless = require("serverless");
import ServerlessError = require("serverless/lib/serverless-error");
import pMap from "p-map";
import { execFile as callbackExecFile } from "child_process";
import { promisify } from "util";

const execFile = promisify(callbackExecFile);

const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";

class GolangPlugin implements ServerlessPlugin {
  hooks: ServerlessPlugin.Hooks;
  serverless: Serverless;
  log: ServerlessUtils.Log;
  progress: ServerlessUtils.ProgressEmitter;
  provider: AwsProvider;

  constructor(
    serverless: Serverless,
    _: Serverless.Options,
    { log, progress }: PluginOptions
  ) {
    this.serverless = serverless;
    this.log = log;
    this.progress = progress;

    // Bind to provider == aws
    this.provider = this.serverless.getProvider("aws");

    const build = this.build.bind(this);
    const repackageBootstrap = this.repackageBootstrap.bind(this);
    this.hooks = {
      // Compiles all packages/files and adjust sls config
      "before:package:createDeploymentArtifacts": build,
      // Fixes naming - renames packaged artifact to bootstrap
      "after:package:createDeploymentArtifacts": repackageBootstrap,
    };
  }

  async build() {
    const service = this.serverless.service;

    await pMap(service.getAllFunctions(), this.buildFunction, {
      concurrency: os.cpus().length,
    });

    if (service.provider.runtime === GO_RUNTIME) {
      service.provider.runtime = AWS_RUNTIME;
    }
  }

  async buildFunction(functionName: string) {
    const service = this.serverless.service;
    const slsFunctionDefinition = service.getFunction(functionName);
    // Make sure we have a valid handler-function definition
    if (
      !Object.prototype.hasOwnProperty.call(slsFunctionDefinition, "handler")
    ) {
      throw new ServerlessError(
        `Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`
      );
    }
    const slsFunction = <Serverless.FunctionDefinitionHandler>(
      slsFunctionDefinition
    );

    // Skip non-go runtimes
    const runtime = slsFunction.runtime || service.provider.runtime;
    if (runtime !== GO_RUNTIME) {
      return;
    }

    // Begin and wait for compilation of handler
    const packagePath = slsFunction.handler;
    const artifactPath = this.artifactPath(packagePath);
    try {
      await execFile("go", this.buildArgs(packagePath, artifactPath), {
        env: this.buildEnv(process.env),
      });
    } catch (e) {
      return new ServerlessError(
        `Unable to compile ${functionName}: ${(<Error>e).message}`
      );
    }

    // Modify function package definition so that our artifact is included
    slsFunction.package = slsFunction.package || {};
    slsFunction.package.individually = true;
    slsFunction.package.patterns = slsFunction.package.patterns || [];
    slsFunction.package.patterns = new Array<string>().concat(
      slsFunction.package.patterns || [],
      artifactPath
    );
    // We will later move the compiled artifact and set it as the runtime bootstrap
    slsFunction.handler = BOOTSTRAP_PATH;
    slsFunction.runtime = AWS_RUNTIME;
  }

  async repackageBootstrap() {}

  buildArgs(artifactPath: string, packagePath: string) {
    return ["build", `-ldflags="-s -w"`, "-o", artifactPath, packagePath];
  }

  buildEnv(env: { [key: string]: any }) {
    const defaultEnv = {
      GOOS: "linux",
      GOARCH: "amd64",
      CGO_ENABLED: "0",
    };
    return Object.assign({}, env, defaultEnv);
  }

  artifactPath(packagePath: string) {
    return path.join(this.artifactDirectory(), packagePath);
  }

  artifactDirectory() {
    // TODO: Better naming + user config?
    return ".bin";
  }
}

export = GolangPlugin;
