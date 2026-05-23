import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "server", "trainingServer.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external: ["@tensorflow/tfjs"],
  outfile: path.join(root, "server-dist", "training-server.mjs"),
  sourcemap: true,
  logLevel: "info",
});
