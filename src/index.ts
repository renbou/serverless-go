import * as os from "os";
import * as path from "path";
import AwsProvider = require("serverless/plugins/aws/provider/awsProvider");
import ServerlessPlugin = require("serverless/classes/Plugin");
import Serverless = require("serverless");
import ServerlessError = require("serverless/lib/serverless-error");
import { execFile as callbackExecFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile } from "fs/promises";

const execFile = promisify(callbackExecFile);

const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";

// Stub for serverless frameworks's builtin package plugin, which also
// exports a zipping function. Handy!
interface ServerlessPackagePluginStub extends ServerlessPlugin {
  resolveFilePathsFromPatterns(params: {
    include: string[];
    exclude: string[];
  }): Promise<string[]>;

  zipFiles(
    files: string[],
    zipFileName: string,
    prefix: string
  ): Promise<string>;
}
// Error code thrown by resolveFilePathsFromPatterns if no files were matched
const NO_MATCHED_FILES_CODE = "NO_MATCHED_FILES";

class GolangPlugin implements ServerlessPlugin {
  hooks: ServerlessPlugin.Hooks;
  serverless: Serverless;
  packagePlugin: ServerlessPackagePluginStub;
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

    // Get serverless' builtin packager. This WILL break -> requires upkeep.
    // from serverless/lib/plugins/index.js
    this.packagePlugin = <ServerlessPackagePluginStub>(
      this.serverless.pluginManager.plugins[4]
    );

    const build = this.build.bind(this);
    this.hooks = {
      // Compile all packages/files and adjust sls config
      "before:package:createDeploymentArtifacts": build,
    };
  }

  async build() {
    const service = this.serverless.service;
    const functions = service.getAllFunctions();

    this.log(
      `Building ${functions.length} functions with ${this.concurrency} parallel processes`
    );
    await this.pMap(functions, this.buildFunction.bind(this));

    if (service.provider.runtime === GO_RUNTIME) {
      // Set global runtime if it was set to go previously
      service.provider.runtime = AWS_RUNTIME;
    }
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
    const [artifactDirectory, artifactPath] =
      this.artifactLocation(functionName);
    try {
      await execFile("go", this.buildArgs(artifactPath, packagePath), {
        env: this.buildEnv(process.env),
      });
    } catch (e) {
      throw new ServerlessError(`Unable to compile ${functionName}: ${e}`);
    }

    // Package the function using builtin service!
    slsFunction.package = slsFunction.package || {};
    slsFunction.package.individually = true;
    slsFunction.package.patterns = slsFunction.package.patterns || [];

    if (
      [slsFunction.package.exclude, slsFunction.package.include].some(Boolean)
    ) {
      this.log(
        `${functionName} package references exclude or include, which are deprecated`,
        {
          bold: true,
          color: "red",
        }
      );
    }

    const artifactFilePaths = await this.functionArtifactPaths(
      functionName,
      slsFunction
    );

    // Actually package all artifacts. This will strip artifactDirectory,
    // thus the artifact itself will end up at BOOTSTRAP_PATH
    slsFunction.package.artifact = await this.packagePlugin.zipFiles(
      artifactFilePaths,
      `${functionName}.zip`,
      artifactDirectory
    );

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

  artifactLocation(functionName: string) {
    const directory = this.artifactDirectory(functionName);
    return [directory, path.join(directory, BOOTSTRAP_PATH)];
  }

  artifactDirectory(functionName: string) {
    return path.join(".bin", functionName);
  }

  async functionArtifactPaths(
    functionName: string,
    slsFunction: Serverless.FunctionDefinitionHandler
  ) {
    const [artifactDirectory, artifactPath] =
      this.artifactLocation(functionName);
    let artifactFilePaths = await this.packagePlugin
      .resolveFilePathsFromPatterns({
        include: ["!./**", ...slsFunction.package!.patterns!],
        exclude: [],
      })
      .catch((e) => {
        if (e instanceof ServerlessError && e.code == NO_MATCHED_FILES_CODE) {
          // No files matched from defined patterns
          return [];
        }
        // Rethrow
        throw e;
      });

    // Append fake prefix which will be later removed.
    // Dirty hack to make our actual artifact end up in the correct path.
    artifactFilePaths = artifactFilePaths.map((filePath) =>
      path.join(artifactDirectory, filePath)
    );
    artifactFilePaths.push(artifactPath);
    return artifactFilePaths;
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
