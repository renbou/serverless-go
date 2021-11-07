"use strict";
const os = require("os");
const path = require("path");
const AdmZip = require("adm-zip");
const ServerlessError = require("serverless/lib/serverless-error");
const child_process_1 = require("child_process");
const util_1 = require("util");
const promises_1 = require("fs/promises");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";
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
        this.log(`Building ${functions.length} functions with ${this.concurrency} parallel processes`);
        await this.pMap(functions, this.buildFunction.bind(this));
        if (service.provider.runtime === GO_RUNTIME) {
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
        // Modify function package definition so that each function is properly packaged
        slsFunction.package = slsFunction.package || {};
        slsFunction.package.individually = true;
        slsFunction.package.patterns = slsFunction.package.patterns || [];
        slsFunction.package.patterns = new Array().concat("!./**", slsFunction.package.patterns || [], artifactPath);
        // We will later add the compiled artifact and set it as the runtime bootstrap
        slsFunction.runtime = AWS_RUNTIME;
    }
    async packageBootstrap() {
        const service = this.serverless.service;
        this.log("Packaging each function as runtime bootstrap");
        await this.pMap(service.getAllFunctions(), this.packageFunction.bind(this));
    }
    async packageFunction(functionName) {
        const service = this.serverless.service;
        // Already validated everything during build
        const slsFunction = (service.getFunction(functionName));
        if (!this.isGoRuntime(slsFunction)) {
            return;
        }
        // Artifact path definitely exists after packaging step
        const artifactZipPath = slsFunction.package.artifact;
        const artifactPath = this.artifactPath(functionName);
        const artifactZip = new AdmZip(artifactZipPath);
        // Package the handler as bootstrap
        const data = await (0, promises_1.readFile)(artifactPath);
        artifactZip.deleteFile(artifactPath);
        artifactZip.addFile(BOOTSTRAP_PATH, data, "", 0x755 << 16);
        artifactZip.writeZip(artifactZipPath);
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
