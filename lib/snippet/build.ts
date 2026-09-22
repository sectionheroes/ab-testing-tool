// pnpm build:snippet – bundles lib/snippet/src/index.ts into the theme app extension asset. Fails above 8 KB gzip.
import { gzipSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { build } from "esbuild";

const OUT = "extensions/sh-ab-embed/assets/shab.js";
const BUDGET = 8 * 1024;

const result = await build({
  entryPoints: ["lib/snippet/src/index.ts"],
  bundle: true,
  format: "iife",
  target: "es2018",
  minify: true,
  legalComments: "none",
  write: false,
  logLevel: "warning",
});
const code = result.outputFiles[0].text;
const raw = Buffer.byteLength(code);
const gz = gzipSync(Buffer.from(code), { level: 9 }).length;
writeFileSync(OUT, code);
console.log(`shab.js: ${raw} B raw, ${gz} B gzip (budget ${BUDGET} B gzip, ${((gz / BUDGET) * 100).toFixed(0)}%) → ${OUT}`);
if (gz > BUDGET) {
  console.error(`snippet exceeds the ${BUDGET} B gzip budget by ${gz - BUDGET} B`);
  process.exit(1);
}
