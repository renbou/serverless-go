import { execFile as callbackExecFile } from "child_process";
import { promisify } from "util";
import path = require("path");
const execFile = promisify(callbackExecFile);

type Environment = { [key: string]: any };

// Builder allows building various golang packages as different "modules"
// which all compile into an executable file with the same name for each module.
// Useful to us since we need to compile all packages into "bootstrap"
class Builder {
  // Base directory for all modules
  #baseArtifactDirectory: string;
  // Name of the executable which will be built into modules artifact directory
  #executableName: string;
  // Environment under which all compilation takes place. Includes process.env
  #env: Environment;

  static #defaultEnv = {
    GOOS: "linux",
    GOARCH: "amd64",
    CGO_ENABLED: "0",
  };

  static #defaultArgs = ["build", "-ldflags=-s -w", "-o"];

  constructor(
    baseArtifactDirectory: string,
    executableName: string,
    env?: Environment
  ) {
    this.#baseArtifactDirectory = baseArtifactDirectory;
    this.#executableName = executableName;
    this.#env = Builder.#buildEnv(process.env, env || {});
  }

  // Build builds a single golang package as module. Returns artifact directory for the module
  async build(module: string, packagePath: string) {
    const [artifactDirectory, artifactPath] = this.#artifactPath(module);
    return execFile("go", this.#buildArgs(artifactPath, packagePath), {
      env: this.#env,
    })
      .then(() => {
        return artifactDirectory;
      })
      .catch((e) => {
        throw new Error(
          `build ${packagePath} to ${module}: ${e} (try clearing ${
            this.#baseArtifactDirectory
          }?)`
        );
      });
  }

  #artifactPath(module: string) {
    const directory = path.join(this.#baseArtifactDirectory, module);
    return [directory, path.join(directory, this.#executableName)];
  }

  #buildArgs(artifactPath: string, packagePath: string) {
    return Builder.#defaultArgs.concat(artifactPath, packagePath);
  }

  static #buildEnv(...envs: Environment[]) {
    return Object.assign({}, Builder.#defaultEnv, ...envs);
  }
}

export default Builder;
