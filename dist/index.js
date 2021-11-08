"use strict";
const ServerlessError = require("serverless/lib/serverless-error");
const pMap = require("./pmap");
const builder_1 = require("./builder");
const packager_1 = require("./packager");
const logger_1 = require("./logger");
const Const = require("./constants");
const validator_1 = require("./validator");
class GolangPlugin {
    constructor(serverless, options) {
        this.service = serverless.service;
        this.options = options;
        // Bind to provider == aws
        this.provider = serverless.getProvider("aws");
        // Add custom runtime to defined runtimes. This is so that strict validation doesn't fail
        // @ts-ignore
        serverless.configSchemaHandler.schema.definitions.awsLambdaRuntime.enum.push("go");
        // Set up build options and instances
        this.builder = new builder_1.default(Const.ARTIFACT_BASE, Const.BOOTSTRAP_PATH);
        // Get serverless' builtin packager. This WILL break -> requires upkeep.
        // from serverless/lib/plugins/index.js
        this.packager = new packager_1.default(
        // @ts-ignore
        serverless.serviceDir, Const.BOOTSTRAP_PATH, serverless.pluginManager.plugins[4]);
        this.logger = new logger_1.default("GolangPlugin", serverless.cli.log);
        this.validator = new validator_1.default(this.service, this.logger);
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
        return this.buildFunctions([this.options.function]);
    }
    async buildFunctions(functions) {
        this.logger.info(`Building ${functions.length} functions with ${Const.CONCURRENCY} parallel processes`);
        // Make sure we only launch a limited number of compilations concurrently
        const goFunctions = (await pMap(functions, this.buildFunction.bind(this), {
            concurrency: Const.CONCURRENCY,
        })).filter(Boolean);
        this.logger.info(`Packaging functions`);
        // However archives can be built without a limit, since the archiver module
        // underneath limits itself anyways
        await Promise.all(goFunctions.map(([functionName, artifactDirectory]) => this.packageFunction(functionName, artifactDirectory)));
    }
    async buildFunction(functionName) {
        const slsFunction = this.validator.validateFunction(functionName);
        if (slsFunction === null) {
            return null;
        }
        this.logger.debug(`Building Golang function ${functionName}`);
        return [
            functionName,
            await this.builder.build(functionName, slsFunction.handler).catch((e) => {
                throw new ServerlessError(`Unable to compile ${functionName}: ${e}`);
            }),
        ];
    }
    async packageFunction(functionName, artifactDirectory) {
        const slsFunction = this.service.getFunction(functionName);
        // Actually package all artifacts. This will strip artifactDirectory,
        // thus the artifact itself will end up at BOOTSTRAP_PATH
        const artifact = await this.packager.package(functionName, artifactDirectory, slsFunction.package?.patterns);
        slsFunction.package = Object.assign(slsFunction.package || {}, {
            individually: true,
            runtime: Const.AWS_RUNTIME,
            patterns: ["!./**"],
            artifact, // Our hand-made customly-built artifact
        });
    }
}
module.exports = GolangPlugin;
