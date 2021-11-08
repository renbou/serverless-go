import * as os from "os";

const GO_RUNTIME = "go";
const AWS_RUNTIME = "provided.al2";
const ARTIFACT_BASE = ".bin";
const BOOTSTRAP_PATH = "bootstrap";
const PLUGIN_NAMESPACE = "GolangPlugin";
const CONCURRENCY = os.cpus().length;

export {
  GO_RUNTIME,
  AWS_RUNTIME,
  ARTIFACT_BASE,
  BOOTSTRAP_PATH,
  PLUGIN_NAMESPACE,
  CONCURRENCY,
};
