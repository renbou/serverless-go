"use strict";
const os = require("os");
const ServerlessError = require("serverless/lib/serverless-error");
const pMap = require("./pmap");
const builder_1 = require("./builder");
const packager_1 = require("./packager");
const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const ARTIFACT_BASE = ".bin";
const BOOTSTRAP_PATH = "bootstrap";
class GolangPlugin {
    constructor(serverless, _) {
        this.serverless = serverless;
        this.log = (message, options) => this.serverless.cli.log(message, "GolangPlugin", options);
        // Bind to provider == aws
        this.provider = this.serverless.getProvider("aws");
        // Add custom runtime to defined runtimes. This is so that strict validation doesn't fail
        // @ts-ignore
        this.serverless.configSchemaHandler.schema.definitions.awsLambdaRuntime.enum.push("go");
        // Set up build options and instances
        this.concurrency = os.cpus().length;
        this.builder = new builder_1.default(ARTIFACT_BASE, BOOTSTRAP_PATH);
        // Get serverless' builtin packager. This WILL break -> requires upkeep.
        // from serverless/lib/plugins/index.js
        this.packager = new packager_1.default(BOOTSTRAP_PATH, this.serverless.pluginManager.plugins[4]);
        const build = this.build.bind(this);
        this.hooks = {
            // Compile all packages/files and adjust sls config
            "before:package:createDeploymentArtifacts": build,
        };
    }
    async build() {
        const service = this.serverless.service;
        const functions = service.getAllFunctions();
        this.log(`Building ${functions.length} functions with ${this.concurrency} parallel processes`);
        await pMap(functions, this.buildFunction.bind(this), {
            concurrency: this.concurrency,
        });
        if (service.provider.runtime === GO_RUNTIME) {
            // Set global runtime if it was set to go previously
            service.provider.runtime = AWS_RUNTIME;
        }
    }
    async buildFunction(functionName) {
        const service = this.serverless.service;
        const slsFunctionDefinition = service.getFunction(functionName);
        // Skip non-go runtimes
        if (!this.isGoRuntime(slsFunctionDefinition)) {
            return;
        }
        // Make sure we have a valid handler-function definition
        if (!Object.prototype.hasOwnProperty.call(slsFunctionDefinition, "handler")) {
            throw new ServerlessError(`Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`);
        }
        const slsFunction = (slsFunctionDefinition);
        this.log(`Building Golang function ${functionName}`, {
            color: "white",
        });
        const artifactDirectory = await this.builder
            .build(functionName, slsFunction.handler)
            .catch((e) => {
            throw new ServerlessError(`Unable to compile ${functionName}: ${e}`);
        });
        // Package the function using builtin service!
        if ([slsFunction.package?.exclude, slsFunction.package?.include].some(Boolean)) {
            this.log(`${functionName} package references exclude or include, which are deprecated`, {
                bold: true,
                color: "red",
            });
        }
        // Actually package all artifacts. This will strip artifactDirectory,
        // thus the artifact itself will end up at BOOTSTRAP_PATH
        const artifact = await this.packager.package(functionName, artifactDirectory, slsFunction.package?.patterns);
        slsFunction.package = Object.assign(slsFunction.package || {}, {
            // For good measure make sure we don't get this packaged with anything  else
            individually: true,
            // Actual runtime which will be used in aws
            runtime: AWS_RUNTIME,
            // Exclude everything for all other plugins
            patterns: ["!./**"],
            // Our hand-made customly-built artifact
            artifact,
        });
    }
    isGoRuntime(slsFunction) {
        const service = this.serverless.service;
        const runtime = slsFunction.runtime || service.provider.runtime;
        return runtime == GO_RUNTIME;
    }
}
module.exports = GolangPlugin;
