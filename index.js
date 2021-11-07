"use strict";
const os = require("os");
const path = require("path");
const ServerlessError = require("serverless/lib/serverless-error");
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = require("fs/promises");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";
const FAKE_FILE = ".tmp";
class GolangPlugin {
    constructor(serverless, _) {
        this.serverless = serverless;
        this.log = (message, options) => this.serverless.cli.log(message, "GolangPlugin", options);
        // Bind to provider == aws
        this.provider = this.serverless.getProvider("aws");
        // Set up options
        this.concurrency = os.cpus().length;
        // Add custom runtime to defined runtimes. This is so that strict validation doesn't fail
        // @ts-ignore
        this.serverless.configSchemaHandler.schema.definitions.awsLambdaRuntime.enum.push("go");
        // Get serverless' builtin packager. This WILL break -> requires upkeep.
        // from serverless/lib/plugins/index.js
        this.packagePlugin = (this.serverless.pluginManager.plugins[4]);
        const build = this.build.bind(this);
        this.hooks = {
            // Compile all packages/files and adjust sls config
            "before:package:createDeploymentArtifacts": build,
        };
    }
    async build() {
        const service = this.serverless.service;
        const functions = service.getAllFunctions();
        await (0, promises_1.writeFile)(this.artifactPath(FAKE_FILE), "");
        this.log(`Building ${functions.length} functions with ${this.concurrency} parallel processes`);
        try {
            await this.pMap(functions, this.buildFunction.bind(this));
        }
        catch (e) {
            throw e;
        }
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
        const slsFunction = (slsFunctionDefinition);
        // Make sure we have a valid handler-function definition
        if (!Object.prototype.hasOwnProperty.call(slsFunctionDefinition, "handler")) {
            throw new ServerlessError(`Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`);
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
        }
        catch (e) {
            return new ServerlessError(`Unable to compile ${functionName}: ${e.message}`);
        }
        // Package the function using builtin service!
        slsFunction.package = slsFunction.package || {};
        slsFunction.package.individually = true;
        slsFunction.package.patterns = slsFunction.package.patterns || [];
        slsFunction.package.artifact = await this.packagePlugin.zip({
            include: slsFunction.package.patterns.concat("!./**", artifactPath),
            zipFileName: `${functionName}.zip`,
        });
        slsFunction.runtime = AWS_RUNTIME;
    }
    isGoRuntime(slsFunction) {
        const service = this.serverless.service;
        const runtime = slsFunction.runtime || service.provider.runtime;
        return runtime == GO_RUNTIME;
    }
    buildArgs(artifactPath, packagePath) {
        return ["build", `-ldflags=-s -w`, "-o", artifactPath, packagePath];
    }
    buildEnv(env) {
        const defaultEnv = {
            GOOS: "linux",
            GOARCH: "amd64",
            CGO_ENABLED: "0",
        };
        return Object.assign({}, env, defaultEnv);
    }
    osPath(path) {
        if (process.platform === "win32") {
            return path.replace(/\\/g, "/");
        }
        return path;
    }
    artifactPath(functionName) {
        return path.join(this.artifactDirectory(), functionName);
    }
    artifactDirectory() {
        // TODO: Better naming + user config?
        return ".bin";
    }
    async pMap(iterable, mapper) {
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
module.exports = GolangPlugin;
