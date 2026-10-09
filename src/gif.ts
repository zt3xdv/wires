import { readFile } from "fs/promises";
import { resolve } from "path";
import type { Plugin } from "rollup";

export default function copyGifWorker(): Plugin {
  return {
    name: "gif",
    async buildStart() {
      const worker = await readFile(resolve(process.cwd(), "node_modules/gif.js/dist/gif.worker.js"));

      this.emitFile({
        type: "asset",
        fileName: "gif.worker.js",
        source: worker,
      });
    },
  };
}
