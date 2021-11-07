import * as path from "path";
import ServerlessPlugin = require("serverless/classes/Plugin");
import ServerlessError = require("serverless/lib/serverless-error");

// Stub for serverless frameworks's builtin package plugin, which also
// exports a zipping function. Handy!
interface ServerlessPackagePluginStub extends ServerlessPlugin {
  resolveFilePathsFromPatterns(params: {
    include: string[];
    exclude: string[];
  }): Promise<string[]>;

  zipFiles(
    files: string[],
    zipFileName: string,
    prefix: string
  ): Promise<string>;
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
  // Name of executable which we will package "specially"
  #executableName: string;

  static #defaultPatterns = ["!./**"];

  constructor(
    executableName: string,
    packagePlugin: ServerlessPackagePluginStub
  ) {
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
    let artifactFiles = await this.#packagePlugin
      .resolveFilePathsFromPatterns({
        include: Packager.#defaultPatterns.concat(packagePatterns || []),
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
    artifactFiles = artifactFiles.map((filePath) =>
      path.join(artifactDirectory, filePath)
    );
    artifactFiles.push(path.join(artifactDirectory, this.#executableName));

    return await this.#packagePlugin.zipFiles(
      artifactFiles,
      `${module}.zip`,
      artifactDirectory
    );
  }
}

export { ServerlessPackagePluginStub };
export default Packager;
