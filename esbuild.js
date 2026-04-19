const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  for (const entry of await fs.promises.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.promises.copyFile(s, d);
  }
}

const production = process.argv.includes("--production");

esbuild
  .build({
    entryPoints: ["src/extension/extension.ts"],
    bundle: true,
    outfile: "dist-ext/extension.js",
    external: ["vscode"],
    format: "cjs",
    platform: "node",
    target: "node18",
    sourcemap: !production,
    minify: production,
  })
  .then(() => copyDir("packs", "dist-ext/packs"))
  .catch(() => process.exit(1));
