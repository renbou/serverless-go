"use strict";
const os = require("os");
const path = require("path");
const ServerlessError = require("serverless/lib/serverless-error");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";
// Error code thrown by resolveFilePathsFromPatterns if no files were matched
const NO_MATCHED_FILES_CODE = "NO_MATCHED_FILES";
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
        this.log(`Building ${functions.length} functions with ${this.concurrency} parallel processes`);
        await this.pMap(functions, this.buildFunction.bind(this));
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
        const [artifactDirectory, artifactPath] = this.artifactLocation(functionName);
        try {
            await execFile("go", this.buildArgs(artifactPath, packagePath), {
                env: this.buildEnv(process.env),
            });
        }
        catch (e) {
            throw new ServerlessError(`Unable to compile ${functionName}: ${e}`);
        }
        // Package the function using builtin service!
        slsFunction.package = slsFunction.package || {};
        slsFunction.package.individually = true;
        slsFunction.package.patterns = slsFunction.package.patterns || [];
        if ([slsFunction.package.exclude, slsFunction.package.include].some(Boolean)) {
            this.log(`${functionName} package references exclude or include, which are deprecated`, {
                bold: true,
                color: "red",
            });
        }
        const artifactFilePaths = await this.functionArtifactPaths(functionName, slsFunction);
        // Actually package all artifacts. This will strip artifactDirectory,
        // thus the artifact itself will end up at BOOTSTRAP_PATH
        slsFunction.package.artifact = await this.packagePlugin.zipFiles(artifactFilePaths, `${functionName}.zip`, artifactDirectory);
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
    artifactLocation(functionName) {
        const directory = this.artifactDirectory(functionName);
        return [directory, path.join(BOOTSTRAP_PATH)];
    }
    artifactDirectory(functionName) {
        return path.join(".bin", functionName);
    }
    async functionArtifactPaths(functionName, slsFunction) {
        const [artifactDirectory, artifactPath] = this.artifactLocation(functionName);
        let artifactFilePaths = await this.packagePlugin
            .resolveFilePathsFromPatterns({
            include: ["!./**", ...slsFunction.package.patterns],
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
        artifactFilePaths = artifactFilePaths.map((filePath) => path.join(artifactDirectory, filePath));
        artifactFilePaths.push(artifactPath);
        return artifactFilePaths;
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
