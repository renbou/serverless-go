"use strict";
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _Builder_instances, _a, _Builder_baseArtifactDirectory, _Builder_executableName, _Builder_env, _Builder_defaultEnv, _Builder_defaultArgs, _Builder_artifactPath, _Builder_buildArgs, _Builder_buildEnv;
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const util_1 = require("util");
const path = require("path");
const execFile = (0, util_1.promisify)(child_process_1.execFile);
// Builder allows building various golang packages as different "modules"
// which all compile into an executable file with the same name for each module.
// Useful to us since we need to compile all packages into "bootstrap"
class Builder {
    constructor(baseArtifactDirectory, executableName, env) {
        _Builder_instances.add(this);
        // Base directory for all modules
        _Builder_baseArtifactDirectory.set(this, void 0);
        // Name of the executable which will be built into modules artifact directory
        _Builder_executableName.set(this, void 0);
        // Environment under which all compilation takes place. Includes process.env
        _Builder_env.set(this, void 0);
        __classPrivateFieldSet(this, _Builder_baseArtifactDirectory, baseArtifactDirectory, "f");
        __classPrivateFieldSet(this, _Builder_executableName, executableName, "f");
        __classPrivateFieldSet(this, _Builder_env, __classPrivateFieldGet(Builder, _a, "m", _Builder_buildEnv).call(Builder, process.env, env || {}), "f");
    }
    // Build builds a single golang package as module. Returns artifact directory for the module
    async build(module, packagePath) {
        const [artifactDirectory, artifactPath] = __classPrivateFieldGet(this, _Builder_instances, "m", _Builder_artifactPath).call(this, module);
        return execFile("go", __classPrivateFieldGet(this, _Builder_instances, "m", _Builder_buildArgs).call(this, artifactPath, packagePath), {
            env: __classPrivateFieldGet(this, _Builder_env, "f"),
        })
            .then(() => {
            return artifactDirectory;
        })
            .catch((e) => {
            throw new Error(`build ${packagePath} to ${module}: ${e} (try clearing ${__classPrivateFieldGet(this, _Builder_baseArtifactDirectory, "f")}?)`);
        });
    }
}
_a = Builder, _Builder_baseArtifactDirectory = new WeakMap(), _Builder_executableName = new WeakMap(), _Builder_env = new WeakMap(), _Builder_instances = new WeakSet(), _Builder_artifactPath = function _Builder_artifactPath(module) {
    const directory = path.join(__classPrivateFieldGet(this, _Builder_baseArtifactDirectory, "f"), module);
    return [directory, path.join(directory, __classPrivateFieldGet(this, _Builder_executableName, "f"))];
}, _Builder_buildArgs = function _Builder_buildArgs(artifactPath, packagePath) {
    return __classPrivateFieldGet(Builder, _a, "f", _Builder_defaultArgs).concat(artifactPath, packagePath);
}, _Builder_buildEnv = function _Builder_buildEnv(...envs) {
    return Object.assign({}, __classPrivateFieldGet(Builder, _a, "f", _Builder_defaultEnv), ...envs);
};
_Builder_defaultEnv = { value: {
        GOOS: "linux",
        GOARCH: "amd64",
        CGO_ENABLED: "0",
    } };
_Builder_defaultArgs = { value: ["build", "-ldflags=-s -w", "-o"] };
exports.default = Builder;
