import * as os from "os";
import Serverless = require("serverless");
import AwsProvider = require("serverless/plugins/aws/provider/awsProvider");
import ServerlessService = require("serverless/classes/Service");
import ServerlessPlugin = require("serverless/classes/Plugin");
import ServerlessError = require("serverless/lib/serverless-error");
import pMap = require("./pmap");
import Builder from "./builder";
import Packager, { ServerlessPackagePluginStub } from "./packager";
import Logger from "./logger";
import * as Const from "./constants";
import Validator from "./validator";

class GolangPlugin implements ServerlessPlugin {
  service: ServerlessService;
  options: Serverless.Options;
  provider: AwsProvider;

  concurrency: number;
  builder: Builder;
  packager: Packager;
  logger: Logger;
  validator: Validator;

  hooks: ServerlessPlugin.Hooks;

  constructor(serverless: Serverless, options: Serverless.Options) {
    this.service = serverless.service;
    this.options = options;

    // Bind to provider == aws
    this.provider = serverless.getProvider("aws");

    // Add custom runtime to defined runtimes. This is so that strict validation doesn't fail
    // @ts-ignore
    serverless.configSchemaHandler.schema.definitions.awsLambdaRuntime.enum.push(
      "go"
    );

    // Set up build options and instances
    this.concurrency = os.cpus().length;
    this.builder = new Builder(Const.ARTIFACT_BASE, Const.BOOTSTRAP_PATH);
    // Get serverless' builtin packager. This WILL break -> requires upkeep.
    // from serverless/lib/plugins/index.js
    this.packager = new Packager(
      Const.BOOTSTRAP_PATH,
      <ServerlessPackagePluginStub>serverless.pluginManager.plugins[4]
    );
    this.logger = new Logger("GolangPlugin", serverless.cli.log);
    this.validator = new Validator(this.service, this.logger);

    this.hooks = {
      // Compile all packages/files and adjust sls config
      "before:package:createDeploymentArtifacts": this.build.bind(this),
      // Compile a single specific package/function
      "before:deploy:function:packageFunction": this.buildSingle.bind(this),
    };
  }

  async build() {
    const functions = this.service.getAllFunctions();
    await this.buildFunctions(functions);
    if (this.service.provider.runtime === Const.GO_RUNTIME) {
      // Set global runtime if it was set to go previously
      this.service.provider.runtime = Const.AWS_RUNTIME;
    }
  }

  async buildSingle() {
    return this.buildFunctions([this.options.function!]);
  }

  async buildFunctions(functions: string[]) {
    this.logger.info(
      `Building ${functions.length} functions with ${this.concurrency} parallel processes`
    );

    await pMap(functions, this.buildFunction.bind(this), {
      concurrency: this.concurrency,
    });
  }

  async buildFunction(functionName: string) {
    const slsFunction = this.validator.validateFunction(functionName);
    if (slsFunction === null) {
      return;
    }

    this.logger.debug(`Building Golang function ${functionName}`);
    const artifactDirectory = await this.builder
      .build(functionName, slsFunction.handler)
      .catch((e) => {
        throw new ServerlessError(`Unable to compile ${functionName}: ${e}`);
      });

    // Actually package all artifacts. This will strip artifactDirectory,
    // thus the artifact itself will end up at BOOTSTRAP_PATH
    const artifact = await this.packager.package(
      functionName,
      artifactDirectory,
      slsFunction.package?.patterns
    );

    slsFunction.package = Object.assign(slsFunction.package || {}, {
      individually: true, // For good measure make sure we don't get this packaged with anything  else
      runtime: Const.AWS_RUNTIME, // Actual runtime which will be used in aws
      patterns: ["!./**"], // Exclude everything for all other plugins
      artifact, // Our hand-made customly-built artifact
    });
  }
}

export = GolangPlugin;
