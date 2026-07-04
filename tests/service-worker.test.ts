import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildServiceWorkerSource, findPrecacheAssetPaths } from '../scripts/generate-sw.js';

// ---------------------------------------------------------------------------
// Test harness: run the generated service-worker source in a sandboxed
// context with mock `self`/`caches`/`fetch`, and pull out the registered
// event listeners so we can drive them directly like the browser would.
// ---------------------------------------------------------------------------

interface FakeCache {
  store: Map<string, unknown>;
  match(request: Request | string): Promise<unknown>;
  put(request: Request | string, response: unknown): Promise<void>;
}

function makeFakeCache(): FakeCache {
  const store = new Map<string, unknown>();
  const keyOf = (request: Request | string) =>
    typeof request === 'string' ? request : request.url;
  return {
    store,
    async match(request) {
      return store.get(keyOf(request));
    },
    async put(request, response) {
      store.set(keyOf(request), response);
    },
  };
}

function makeSandbox({
  fetchImpl,
  addAllShouldFail = false,
}: {
  fetchImpl: typeof fetch;
  addAllShouldFail?: boolean;
}) {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  const cache = makeFakeCache();

  const caches = {
    open: async () => cache,
    match: async (request: Request | string) => cache.match(request),
    keys: async () => [],
    delete: async () => true,
  };

  // cache.addAll used by 'install' — allow forcing a rejection to exercise
  // the swallowed-failure path (S7).
  (cache as any).addAll = async (urls: string[]) => {
    if (addAllShouldFail) {
      throw new Error('simulated addAll failure');
    }
    for (const u of urls) cache.store.set(u, new Response(`precached:${u}`));
  };

  const self: any = {
    location: { origin: 'https://packzen.test' },
    addEventListener(type: string, cb: (event: any) => void) {
      (listeners[type] ||= []).push(cb);
    },
    skipWaiting() {},
    clients: { claim() {} },
  };

  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];
  const consoleWarns: string[] = [];

  const sandboxConsole = {
    log: (...args: unknown[]) => consoleLogs.push(args.join(' ')),
    error: (...args: unknown[]) => consoleErrors.push(args.join(' ')),
    warn: (...args: unknown[]) => consoleWarns.push(args.join(' ')),
  };

  const context = vm.createContext({
    self,
    caches,
    fetch: fetchImpl,
    Response,
    Headers,
    URL,
    console: sandboxConsole,
  });

  return { context, listeners, cache, consoleLogs, consoleErrors, consoleWarns };
}

function runServiceWorkerSource(source: string, opts: Parameters<typeof makeSandbox>[0]) {
  const sandbox = makeSandbox(opts);
  vm.runInContext(source, sandbox.context, { filename: 'sw.js' });
  return sandbox;
}

function makeFakeFetchEvent(request: Request) {
  let responder: ((p: Promise<Response> | Response) => void) | undefined;
  const responsePromise = new Promise<Response>((resolve) => {
    responder = resolve as any;
  });
  const event = {
    request,
    respondWith(p: Promise<Response> | Response) {
      responder!(p as any);
    },
  };
  return { event, responsePromise };
}

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ---------------------------------------------------------------------------
// S1: a slow-but-successful API GET must not be turned into a synthetic 503
// ---------------------------------------------------------------------------

test('S1: slow API GET that resolves after >2s still returns the real response', async () => {
  const source = buildServiceWorkerSource({
    version: 'test',
    commitHash: 'abc123',
    precacheAssets: [],
  });

  const realResponse = new Response(JSON.stringify({ items: ['tent', 'stove'] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

  const fetchImpl = (async () => {
    // Simulate slow hotel wifi: resolves well past the old 2s timeout.
    return delay(2500, realResponse);
  }) as typeof fetch;

  const sandbox = runServiceWorkerSource(source, { fetchImpl });
  const fetchListeners = sandbox.listeners.fetch;
  assert.equal(fetchListeners.length, 1, 'expected exactly one fetch listener registered');

  const request = new Request('https://packzen.test/api/trips/123/items', { method: 'GET' });
  const { event, responsePromise } = makeFakeFetchEvent(request);

  fetchListeners[0](event);
  const response = await responsePromise;

  assert.equal(response.status, 200, 'the slow-but-real response must win, not a synthetic 503');
  const body = await response.json();
  assert.deepEqual(body, { items: ['tent', 'stove'] });
});

test('S1: a genuinely failed API GET with no cache still falls back to a synthetic 503', async () => {
  const source = buildServiceWorkerSource({
    version: 'test',
    commitHash: 'abc123',
    precacheAssets: [],
  });

  const fetchImpl = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;

  const sandbox = runServiceWorkerSource(source, { fetchImpl });
  const request = new Request('https://packzen.test/api/trips/123/items', { method: 'GET' });
  const { event, responsePromise } = makeFakeFetchEvent(request);

  sandbox.listeners.fetch[0](event);
  const response = await responsePromise;

  assert.equal(response.status, 503);
});

test('S1: static assets are still served cache-first (unchanged behavior)', async () => {
  const source = buildServiceWorkerSource({
    version: 'test',
    commitHash: 'abc123',
    precacheAssets: [],
  });

  let networkFetchCount = 0;
  const fetchImpl = (async () => {
    networkFetchCount += 1;
    return new Response('body', { status: 200 });
  }) as typeof fetch;

  const sandbox = runServiceWorkerSource(source, { fetchImpl });
  const request = new Request('https://packzen.test/_astro/chunk.abc123.js', { method: 'GET' });
  sandbox.cache.store.set(request.url, new Response('cached-chunk', { status: 200 }));

  const { event, responsePromise } = makeFakeFetchEvent(request);
  sandbox.listeners.fetch[0](event);
  const response = await responsePromise;

  const text = await response.text();
  assert.equal(text, 'cached-chunk', 'cached static asset should be returned immediately');
});

// ---------------------------------------------------------------------------
// S7: precache list includes hashed asset entries; total precache failure
// is surfaced instead of silently swallowed.
// ---------------------------------------------------------------------------

test('S7: buildServiceWorkerSource embeds hashed /_astro asset paths in PRECACHE_URLS', () => {
  const precacheAssets = ['/_astro/client.D0tpiZvq.js', '/_astro/index.NPsBXKxg.js'];
  const source = buildServiceWorkerSource({
    version: 'test',
    commitHash: 'abc123',
    precacheAssets,
  });

  for (const asset of precacheAssets) {
    assert.ok(source.includes(`"${asset}"`), `expected PRECACHE_URLS to contain ${asset}`);
  }
  // Base app-shell routes must still be present alongside the hashed assets.
  assert.ok(source.includes('"/"'));
  assert.ok(source.includes('"/dashboard/"'));
});

test('S7: findPrecacheAssetPaths recursively discovers hashed .js/.css files under dist/_astro', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');

  const distDir = mkdtempSync(join(tmpdir(), 'sw-precache-test-'));
  const astroDir = join(distDir, '_astro');
  const nestedDir = join(astroDir, 'astro_scripts');
  mkdirSync(nestedDir, { recursive: true });
  writeFileSync(join(astroDir, 'client.D0tpiZvq.js'), '// js');
  writeFileSync(join(astroDir, 'index.NPsBXKxg.css'), '/* css */');
  writeFileSync(join(astroDir, 'logo.abc123.png'), 'not-an-asset-we-precache');
  writeFileSync(join(nestedDir, 'nested.hash.js'), '// nested js');

  try {
    const paths = findPrecacheAssetPaths(distDir);
    assert.ok(paths.includes('/_astro/client.D0tpiZvq.js'));
    assert.ok(paths.includes('/_astro/index.NPsBXKxg.css'));
    assert.ok(paths.includes('/_astro/astro_scripts/nested.hash.js'));
    assert.ok(
      !paths.some((p) => p.endsWith('.png')),
      'non-JS/CSS assets should not be included in this pass'
    );
  } finally {
    rmSync(distDir, { recursive: true, force: true });
  }
});

test('S7: findPrecacheAssetPaths returns [] when dist/_astro does not exist (pre-build state)', () => {
  const paths = findPrecacheAssetPaths('/nonexistent/dist/dir/for/test');
  assert.deepEqual(paths, []);
});

test('S7: a total precache failure is surfaced via console.error, not silently swallowed', async () => {
  const source = buildServiceWorkerSource({
    version: 'test',
    commitHash: 'abc123',
    precacheAssets: ['/_astro/client.js'],
  });

  const fetchImpl = (async () => new Response('ok', { status: 200 })) as typeof fetch;
  const sandbox = runServiceWorkerSource(source, { fetchImpl, addAllShouldFail: true });

  const installListeners = sandbox.listeners.install;
  assert.equal(installListeners.length, 1);

  let waitUntilPromise: Promise<unknown> = Promise.resolve();
  const installEvent = {
    waitUntil(p: Promise<unknown>) {
      waitUntilPromise = p;
    },
  };
  installListeners[0](installEvent);
  await waitUntilPromise;

  assert.ok(
    sandbox.consoleErrors.some((line) => line.includes('Precache failed')),
    'expected the precache failure to be logged via console.error'
  );
});
