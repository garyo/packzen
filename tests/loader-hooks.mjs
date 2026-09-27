// Module hooks for the node test runner, loaded with `node --import`; the same
// file then serves as the hooks module in Node's loader thread. They teach it
// Vite's `?raw` imports (file contents as a default-exported string) and stand
// in for the Workers runtime's `cloudflare:workers` module.
import { register } from 'node:module';
import { isMainThread } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';

if (isMainThread) register(import.meta.url);

const CLOUDFLARE_WORKERS_STUB = new URL('./cloudflare-workers-stub.ts', import.meta.url).href;

export async function resolve(specifier, context, next) {
  if (specifier === 'cloudflare:workers') {
    return { url: CLOUDFLARE_WORKERS_STUB, shortCircuit: true };
  }
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
