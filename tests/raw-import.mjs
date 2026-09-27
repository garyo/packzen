// Teach the node test runner Vite's `?raw` imports (file contents as a
// default-exported string). Loaded with `node --import`; the same file then
// serves as the hooks module in Node's loader thread.
import { register } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';

if (isMainThread) register(import.meta.url);

export async function resolve(specifier, context, next) {
  if (!specifier.endsWith('?raw')) return next(specifier, context);
  const { url } = await next(specifier.slice(0, -'?raw'.length), context);
  return { url: `${url}?raw`, shortCircuit: true };
}

export async function load(url, context, next) {
  if (!url.endsWith('?raw')) return next(url, context);
  const text = await readFile(new URL(url.slice(0, -'?raw'.length)), 'utf8');
  return {
    format: 'module',
    source: `export default ${JSON.stringify(text)};`,
    shortCircuit: true,
  };
}
