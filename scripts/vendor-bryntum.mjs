// Copies Bryntum Scheduler's prebuilt browser files into public/vendor/bryntum/ (runs before dev and build).
// The app loads them at runtime (see src/app/(operator)/jobs/[id]/bryntum.ts), so the bundler never processes
// the 4.6 MB module: bundling it pushed `next build` past 8 GB on Render.
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkg = dirname(require.resolve("@bryntum/scheduler/package.json"));
const out = join(process.cwd(), "public", "vendor", "bryntum");

const FILES = [
  "scheduler.module.js",
  "scheduler.css",
  "svalbard-light.css",
  "fontawesome/css/fontawesome.css",
  "fontawesome/css/solid.css",
  "fontawesome/webfonts/fa-solid-900.woff2",
  "fontawesome/webfonts/fa-solid-900.ttf",
];

rmSync(out, { recursive: true, force: true });
for (const file of FILES) {
  mkdirSync(dirname(join(out, file)), { recursive: true });
  cpSync(join(pkg, file), join(out, file));
}
const { version } = require("@bryntum/scheduler/package.json");
console.log(`Bryntum Scheduler ${version}: ${FILES.length} files → public/vendor/bryntum`);
