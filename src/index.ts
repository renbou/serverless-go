import * as os from "os";
import * as path from "path";
import AdmZip = require("adm-zip");
import AwsProvider = require("serverless/plugins/aws/provider/awsProvider");
import ServerlessPlugin = require("serverless/classes/Plugin");
import ServerlessService = require("serverless/classes/Service");
import ServerlessUtils = require("serverless/classes/Utils");
import Serverless = require("serverless");
import ServerlessError = require("serverless/lib/serverless-error");
import { execFile as callbackExecFile } from "child_process";
import { promisify } from "util";
import { readFile } from "fs/promises";

const execFile = promisify(callbackExecFile);

const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";

class GolangPlugin implements ServerlessPlugin {
  hooks: ServerlessPlugin.Hooks;
  serverless: Serverless;
  provider: AwsProvider;
  log: (message: string, options?: Serverless.LogOptions) => null;

  concurrency: number;
  // @ts-ignore
  pMapInstance: typeof import("p-map").default;

  constructor(serverless: Serverless, _: Serverless.Options) {
    this.serverless = serverless;
    this.log = (message, options?) =>
      this.serverless.cli.log(message, "GolangPlugin", options);

    // Bind to provider == aws
    this.provider = this.serverless.getProvider("aws");

    // Set up options
    this.concurrency = os.cpus().length;

    // Add custom runtime to defined runtimes. This is so that strict validation doesn't fail
    // @ts-ignore
    this.serverless.configSchemaHandler.schema.definitions.awsLambdaRuntime.enum.push(
      "go"
    );
    // Do not run the dev dependency exclusion, since we are excluding everything anyways
    this.serverless.service.package.excludeDevDependencies = false;

    const build = this.build.bind(this);
    const repackageBootstrap = this.packageBootstrap.bind(this);
    this.hooks = {
      // Compiles all packages/files and adjust sls config
      "before:package:createDeploymentArtifacts": build,
      // Fixes naming - renames packaged artifact to bootstrap
      "after:package:createDeploymentArtifacts": repackageBootstrap,
    };
  }

  async build() {
    const service = this.serverless.service;
    const functions = service.getAllFunctions();

    this.log(
      `Building ${functions.length} functions with ${this.concurrency} parallel processes`
    );
    await this.pMap(functions, this.buildFunction.bind(this));
  }

  async buildFunction(functionName: string) {
    const service = this.serverless.service;
    const slsFunctionDefinition = service.getFunction(functionName);

    // Skip non-go runtimes
    if (!this.isGoRuntime(slsFunctionDefinition)) {
      return;
    }

    const slsFunction = <Serverless.FunctionDefinitionHandler>(
      slsFunctionDefinition
    );
    // Make sure we have a valid handler-function definition
    if (
      !Object.prototype.hasOwnProperty.call(slsFunctionDefinition, "handler")
    ) {
      throw new ServerlessError(
        `Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`
      );
    }

    this.log(`Building Golang function ${functionName}`, {
      color: "white",
    });

    // Begin and wait for compilation of handler
    const packagePath = slsFunction.handler;
    const artifactPath = this.artifactPath(functionName);
    try {
      await execFile("go", this.buildArgs(artifactPath, packagePath), {
        env: this.buildEnv(process.env),
      });
    } catch (e) {
      return new ServerlessError(
        `Unable to compile ${functionName}: ${(<Error>e).message}`
      );
    }

    // Modify function package definition so that each function is properly packaged
    slsFunction.package = slsFunction.package || {};
    slsFunction.package.individually = true;
    slsFunction.package.patterns = slsFunction.package.patterns || [];
    slsFunction.package.patterns = new Array<string>().concat(
      "!./**",
      slsFunction.package.patterns || [],
      this.osPath(artifactPath)
    );
  }

  async packageBootstrap() {
    const service = this.serverless.service;

    this.log("Packaging each function as runtime bootstrap");

    await Promise.all(
      service.getAllFunctions().map(this.packageFunction.bind(this))
    );

    if (service.provider.runtime === GO_RUNTIME) {
      // Set global runtime if it was set to go previously
      service.provider.runtime = AWS_RUNTIME;
    }
  }

  async packageFunction(functionName: string) {
    const service = this.serverless.service;
    // Already validated everything during build
    const slsFunction = <Serverless.FunctionDefinitionHandler>(
      service.getFunction(functionName)
    );
    if (!this.isGoRuntime(slsFunction)) {
      return;
    }

    // Artifact path definitely exists after packaging step
    const artifactZipPath = slsFunction.package!.artifact;
    const artifactPath = this.osPath(this.artifactPath(functionName));
    const artifactZip = new AdmZip(artifactZipPath);

    // Package the handler as bootstrap
    const data = await readFile(artifactPath);
    artifactZip.deleteFile(artifactPath);
    artifactZip.addFile(BOOTSTRAP_PATH, data, "", 0x755 << 16);
    artifactZip.writeZip(artifactZipPath);

    // Set required runtime
    slsFunction.runtime = AWS_RUNTIME;
  }

  isGoRuntime(
    slsFunction:
      | Serverless.FunctionDefinitionHandler
      | Serverless.FunctionDefinitionImage
  ) {
    const service = this.serverless.service;
    const runtime = slsFunction.runtime || service.provider.runtime;
    return runtime == GO_RUNTIME;
  }

  buildArgs(artifactPath: string, packagePath: string) {
    return ["build", `-ldflags=-s -w`, "-o", artifactPath, packagePath];
  }

  buildEnv(env: { [key: string]: any }) {
    const defaultEnv = {
      GOOS: "linux",
      GOARCH: "amd64",
      CGO_ENABLED: "0",
    };
    return Object.assign({}, env, defaultEnv);
  }

  osPath(path: string) {
    if (process.platform === "win32") {
      return path.replace(/\//g, "\\");
    }
    return path;
  }

  artifactPath(functionName: string) {
    return path.join(this.artifactDirectory(), functionName);
  }

  artifactDirectory() {
    // TODO: Better naming + user config?
    return ".bin";
  }

  async pMap(iterable: any, mapper: any) {
    await this.importPmap();
    await this.pMapInstance(iterable, mapper, {
      concurrency: this.concurrency,
    });
  }

  // Temporary hack until serverless upgrades from CommonJS
  async importPmap() {
    if (this.pMapInstance === undefined || this.pMapInstance === null) {
      this.pMapInstance = (await import("p-map")).default;
    }
  }
}

export = GolangPlugin;
