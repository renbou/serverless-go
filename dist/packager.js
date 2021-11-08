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
var _a, _Packager_packagePlugin, _Packager_executableName, _Packager_defaultPatterns;
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const ServerlessError = require("serverless/lib/serverless-error");
// Error code thrown by resolveFilePathsFromPatterns if no files were matched
const NO_MATCHED_FILES_CODE = "NO_MATCHED_FILES";
// Packager allows packaging the already built artifact of a module
// into a single zip file. It handles the artifact itself specially,
// Making sure it ends up in the root of the built zip. Useful to us
// for packaging bootstrap for aws provided runtime.
class Packager {
    constructor(executableName, packagePlugin) {
        // Builtin serverless framework packager plugin which
        // we will shamelessly exploit for its functionality
        _Packager_packagePlugin.set(this, void 0);
        // Name of executable which we will package "specially"
        _Packager_executableName.set(this, void 0);
        __classPrivateFieldSet(this, _Packager_executableName, executableName, "f");
        __classPrivateFieldSet(this, _Packager_packagePlugin, packagePlugin, "f");
    }
    // Package will package an artifact directory with additional files defined by
    // packagePatterns and return the path to module's zip.
    async package(module, artifactDirectory, packagePatterns) {
        let artifactFiles = await __classPrivateFieldGet(this, _Packager_packagePlugin, "f")
            .resolveFilePathsFromPatterns({
            include: __classPrivateFieldGet(Packager, _a, "f", _Packager_defaultPatterns).concat(packagePatterns || []),
            exclude: [],
        })
            .catch((e) => {
            // Handle no matched files error from package resolver
            if (e instanceof ServerlessError && e.code == NO_MATCHED_FILES_CODE) {
                return [];
            }
            throw e;
        });
        // Append fake prefix which will be later removed.
        // Dirty hack to make our actual artifact end up in the correct path.
        artifactFiles = artifactFiles.map((filePath) => path.join(artifactDirectory, filePath));
        artifactFiles.push(path.join(artifactDirectory, __classPrivateFieldGet(this, _Packager_executableName, "f")));
        return await __classPrivateFieldGet(this, _Packager_packagePlugin, "f").zipFiles(artifactFiles, `${module}.zip`, artifactDirectory);
    }
}
_a = Packager, _Packager_packagePlugin = new WeakMap(), _Packager_executableName = new WeakMap();
_Packager_defaultPatterns = { value: ["!./**"] };
exports.default = Packager;
