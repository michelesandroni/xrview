/**
 * Build script that:
 * 1. Copies webxr-polyfill.min.js from node_modules into src-tauri/
 * 2. Bundles src/xr-inject.ts → src-tauri/xr-emulator.js via esbuild
 */
import { copyFileSync } from "fs";
import { createRequire } from "module";
import { execSync } from "child_process";

const require = createRequire(import.meta.url);

// 1. Copy webxr-polyfill.min.js
const polyfillSrc = require.resolve("webxr-polyfill/build/webxr-polyfill.min.js");
copyFileSync(polyfillSrc, "src-tauri/webxr-polyfill.min.js");
console.log("✔ copied webxr-polyfill.min.js → src-tauri/");

// 2. Bundle xr-inject.ts
execSync(
  "npx esbuild src/xr-inject.ts --bundle --format=iife --minify --outfile=src-tauri/xr-emulator.js",
  { stdio: "inherit" },
);
console.log("✔ bundled xr-emulator.js → src-tauri/");
