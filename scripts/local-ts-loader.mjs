import { stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = process.cwd();

async function existingUrl(path) {
  for (const candidate of [
    path,
    `${path}.ts`,
    `${path}.tsx`,
    `${path}.js`,
    `${path}.mjs`,
    resolve(path, "index.ts"),
    resolve(path, "index.tsx"),
    resolve(path, "index.js"),
  ]) {
    try {
      if ((await stat(candidate)).isFile()) return pathToFileURL(candidate).href;
    } catch {
      // Try the next supported source extension.
    }
  }
  return null;
}

export async function resolveHook(specifier, context, nextResolve) {
  if (specifier.startsWith("next/")) {
    const url = await existingUrl(resolve(root, "node_modules", specifier));
    if (url) return { url, shortCircuit: true };
  }
  if (specifier.startsWith("@/")) {
    const url = await existingUrl(resolve(root, "src", specifier.slice(2)));
    if (url) return { url, shortCircuit: true };
  }
  if (specifier.startsWith(".") && context.parentURL) {
    const path = resolve(fileURLToPath(new URL(".", context.parentURL)), specifier);
    const url = await existingUrl(path);
    if (url) return { url, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export { resolveHook as resolve };
