import * as path from "path";
import { existsSync, createWriteStream } from "fs";
import * as fs from "fs/promises";
import archiver = require("archiver");
import ServerlessPlugin = require("serverless/classes/Plugin");
import ServerlessError = require("@serverless-rewrite/serverless/lib/serverless-error");
import { CONCURRENCY, SERVERLESS_DIR } from "./constants";

// Stub for serverless frameworks's builtin package plugin,
// which will help us do all of the needed package deps resolution. Nice!
interface ServerlessPackagePluginStub extends ServerlessPlugin {
  resolveFilePathsFromPatterns(params: {
    include: string[];
    exclude: string[];
  }): Promise<string[]>;

  getIncludes(patterns: string[]): string[];
  getExcludes(patterns: string[], excludeLayers: boolean): string[];
}
// Error code thrown by resolveFilePathsFromPatterns if no files were matched
const NO_MATCHED_FILES_CODE = "NO_MATCHED_FILES";

// Packager allows packaging the already built artifact of a module
// into a single zip file. It handles the artifact itself specially,
// Making sure it ends up in the root of the built zip. Useful to us
// for packaging bootstrap for aws provided runtime.
class Packager {
  // Builtin serverless framework packager plugin which
  // we will shamelessly exploit for its functionality
  #packagePlugin: ServerlessPackagePluginStub;
  // Path of the serverless framework service directory where we will leave our zips
  #serverlessDir: string;
  // Name of executable which we will package "specially"
  #executableName: string;

  static #defaultPatterns = ["!**/node_modules/**"];

  constructor(
    serviceDir: string,
    executableName: string,
    packagePlugin: ServerlessPackagePluginStub
  ) {
    this.#serverlessDir = path.join(serviceDir, SERVERLESS_DIR);
    this.#executableName = executableName;
    this.#packagePlugin = packagePlugin;
  }

  // Package will package an artifact directory with additional files defined by
  // packagePatterns and return the path to module's zip.
  async package(
    module: string,
    artifactDirectory: string,
    packagePatterns: string[] | undefined
  ) {
    const patterns = Packager.#defaultPatterns.concat(packagePatterns || []);
    let artifactFiles = await this.#packagePlugin
      .resolveFilePathsFromPatterns({
        include: this.#packagePlugin.getIncludes(patterns),
        exclude: this.#packagePlugin.getExcludes(patterns, true),
      })
      .catch((e) => {
        // Handle no matched files error from package resolver
        if (e instanceof ServerlessError && e.code == NO_MATCHED_FILES_CODE) {
          return [];
        }
        throw e;
      });

    return await this.packageWithFiles(
      artifactFiles,
      `${module}.zip`,
      artifactDirectory
    );
  }

  // packageWithFiles will package the custom executable built in artifactDirectory
  // along with the specified files into serverless' directory as zipFileName
  async packageWithFiles(
    files: string[],
    zipFileName: string,
    artifactDirectory: string
  ) {
    const archive = archiver.create("zip", {
      statConcurrency: CONCURRENCY,
    });

    await this.#ensureServerlessDir();
    const zipFilePath = path.join(this.#serverlessDir, zipFileName);
    const outputStream = createWriteStream(zipFilePath);

    return new Promise<string>((resolve, reject) => {
      outputStream.on("close", () => resolve(zipFilePath));
      outputStream.on("error", reject);
      archive.on("error", reject);

      outputStream.on("open", () => {
        archive.pipe(outputStream);

        // First package all additional files
        Promise.all(files.map((file) => this.#zipFile(archive, file)))
          .then(() =>
            // Package custom executable
            this.#zipFile(
              archive,
              path.join(artifactDirectory, this.#executableName),
              this.#executableName
            )
          )
          // Finish up the process. This will result in a "close event" on the outputStream,
          // which will then resolve the Promise, so everything should be ok
          .then(() => archive.finalize())
          .catch(reject);
      });
    });
  }

  async #zipFile(
    archive: archiver.Archiver,
    filePath: string,
    zipPath?: string
  ) {
    zipPath = zipPath || filePath;

    const stat = await fs.stat(filePath);
    archive.append(await fs.readFile(filePath), {
      name: zipPath,
      stats: stat,
      mode: stat.mode,
      // Make sure zip files with same content end up having same hash
      date: new Date(0),
    });
  }

  async #ensureServerlessDir() {
    if (!existsSync(this.#serverlessDir)) {
      return fs.mkdir(this.#serverlessDir);
    }
    return;
  }
}

export { ServerlessPackagePluginStub };
export default Packager;
