"use strict";
const os = require("os");
const path = require("path");
const ServerlessError = require("serverless/lib/serverless-error");
const p_map_1 = require("p-map");
const child_process_1 = require("child_process");
const util_1 = require("util");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const BOOTSTRAP_PATH = "bootstrap";
class GolangPlugin {
    constructor(serverless, _, { log, progress }) {
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
        const functions = service.getAllFunctions();
        const concurrency = os.cpus().length;
        const progress = this.progress.create({
            name: "golang-plugin",
            message: `Building ${functions.length} functions with ${concurrency} parallel processes`,
        });
        await (0, p_map_1.default)(functions, this.buildFunction, {
            concurrency: concurrency,
        });
        progress.remove();
        if (service.provider.runtime === GO_RUNTIME) {
            service.provider.runtime = AWS_RUNTIME;
        }
    }
    async buildFunction(functionName) {
        const service = this.serverless.service;
        const slsFunctionDefinition = service.getFunction(functionName);
        // Make sure we have a valid handler-function definition
        if (!Object.prototype.hasOwnProperty.call(slsFunctionDefinition, "handler")) {
            throw new ServerlessError(`Golang plugin can only be used to build handler-type functions, but ${functionName} doesn't have the "handler" property defined`);
        }
        const slsFunction = (slsFunctionDefinition);
        // Skip non-go runtimes
        const runtime = slsFunction.runtime || service.provider.runtime;
        if (runtime !== GO_RUNTIME) {
            return;
        }
        this.log.info(`Building Golang function ${functionName}`);
        // Begin and wait for compilation of handler
        const packagePath = slsFunction.handler;
        const artifactPath = this.artifactPath(packagePath);
        try {
            await execFile("go", this.buildArgs(packagePath, artifactPath), {
                env: this.buildEnv(process.env),
            });
        }
        catch (e) {
            return new ServerlessError(`Unable to compile ${functionName}: ${e.message}`);
        }
        // Modify function package definition so that our artifact is included
        slsFunction.package = slsFunction.package || {};
        slsFunction.package.individually = true;
        slsFunction.package.patterns = slsFunction.package.patterns || [];
        slsFunction.package.patterns = new Array().concat(slsFunction.package.patterns || [], artifactPath);
        // We will later move the compiled artifact and set it as the runtime bootstrap
        slsFunction.handler = BOOTSTRAP_PATH;
        slsFunction.runtime = AWS_RUNTIME;
    }
    async repackageBootstrap() { }
    buildArgs(artifactPath, packagePath) {
        return ["build", `-ldflags="-s -w"`, "-o", artifactPath, packagePath];
    }
    buildEnv(env) {
        const defaultEnv = {
            GOOS: "linux",
            GOARCH: "amd64",
            CGO_ENABLED: "0",
        };
        return Object.assign({}, env, defaultEnv);
    }
    artifactPath(packagePath) {
        return path.join(this.artifactDirectory(), packagePath);
    }
    artifactDirectory() {
        // TODO: Better naming + user config?
        return ".bin";
    }
}
module.exports = GolangPlugin;
