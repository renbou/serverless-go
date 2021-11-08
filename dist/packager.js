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
var _Packager_instances, _a, _Packager_packagePlugin, _Packager_serverlessDir, _Packager_executableName, _Packager_defaultPatterns, _Packager_zipFile, _Packager_ensureServerlessDir;
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs_1 = require("fs");
const fs = require("fs/promises");
const archiver = require("archiver");
const ServerlessError = require("serverless/lib/serverless-error");
const constants_1 = require("./constants");
// Error code thrown by resolveFilePathsFromPatterns if no files were matched
const NO_MATCHED_FILES_CODE = "NO_MATCHED_FILES";
// Packager allows packaging the already built artifact of a module
// into a single zip file. It handles the artifact itself specially,
// Making sure it ends up in the root of the built zip. Useful to us
// for packaging bootstrap for aws provided runtime.
class Packager {
    constructor(serviceDir, executableName, packagePlugin) {
        _Packager_instances.add(this);
        // Builtin serverless framework packager plugin which
        // we will shamelessly exploit for its functionality
        _Packager_packagePlugin.set(this, void 0);
        // Path of the serverless framework service directory where we will leave our zips
        _Packager_serverlessDir.set(this, void 0);
        // Name of executable which we will package "specially"
        _Packager_executableName.set(this, void 0);
        __classPrivateFieldSet(this, _Packager_serverlessDir, path.join(serviceDir, constants_1.SERVERLESS_DIR), "f");
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
        return await this.packageWithFiles(artifactFiles, `${module}.zip`, artifactDirectory);
    }
    // packageWithFiles will package the custom executable built in artifactDirectory
    // along with the specified files into serverless' directory as zipFileName
    async packageWithFiles(files, zipFileName, artifactDirectory) {
        const archive = archiver.create("zip", {
            statConcurrency: constants_1.CONCURRENCY,
        });
        await __classPrivateFieldGet(this, _Packager_instances, "m", _Packager_ensureServerlessDir).call(this);
        const zipFilePath = path.join(__classPrivateFieldGet(this, _Packager_serverlessDir, "f"), zipFileName);
        const outputStream = (0, fs_1.createWriteStream)(zipFilePath);
        return new Promise((resolve, reject) => {
            outputStream.on("close", () => resolve(zipFilePath));
            outputStream.on("error", reject);
            archive.on("error", reject);
            outputStream.on("open", () => {
                archive.pipe(outputStream);
                // First package all additional files
                Promise.all(files.map((file) => __classPrivateFieldGet(this, _Packager_instances, "m", _Packager_zipFile).call(this, archive, file)))
                    .then(() => 
                // Package custom executable
                __classPrivateFieldGet(this, _Packager_instances, "m", _Packager_zipFile).call(this, archive, path.join(artifactDirectory, __classPrivateFieldGet(this, _Packager_executableName, "f")), __classPrivateFieldGet(this, _Packager_executableName, "f")))
                    // Finish up the process. This will result in a "close event" on the outputStream,
                    // which will then resolve the Promise, so everything should be ok
                    .then(() => archive.finalize())
                    .catch(reject);
            });
        });
    }
}
_a = Packager, _Packager_packagePlugin = new WeakMap(), _Packager_serverlessDir = new WeakMap(), _Packager_executableName = new WeakMap(), _Packager_instances = new WeakSet(), _Packager_zipFile = async function _Packager_zipFile(archive, filePath, zipPath) {
    zipPath = zipPath || filePath;
    const stat = await fs.stat(filePath);
    archive.append(await fs.readFile(filePath), {
        name: zipPath,
        stats: stat,
        mode: stat.mode,
        // Make sure zip files with same content end up having same hash
        date: new Date(0),
    });
}, _Packager_ensureServerlessDir = async function _Packager_ensureServerlessDir() {
    if (!(0, fs_1.existsSync)(__classPrivateFieldGet(this, _Packager_serverlessDir, "f"))) {
        return fs.mkdir(__classPrivateFieldGet(this, _Packager_serverlessDir, "f"));
    }
    return;
};
_Packager_defaultPatterns = { value: ["!./**"] };
exports.default = Packager;
