import test from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../src/lib/api';

// scheduleSignInRedirect reads window.location; a plain object is enough.
const fakeLocation = { pathname: '/trips/abc', search: '?view=bags', href: '' };
(globalThis as any).window = { location: fakeLocation };

type FetchCall = { url: string; init: RequestInit };

function json(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** An api whose fetch replies from `responses` in order and records every call. */
function scriptedApi(
  responses: Array<Response | Error | 'hang'>,
  options: { token?: string | null; timeoutMs?: number; tokenDelayMs?: number } = {}
) {
  const calls: FetchCall[] = [];
  const api = createApi({
    getToken: async () => {
      if (options.tokenDelayMs) await new Promise((r) => setTimeout(r, options.tokenDelayMs));
      return options.token === undefined ? 'tok' : options.token;
    },
    timeoutMs: options.timeoutMs ?? 1000,
    fetch: (url, init) => {
      calls.push({ url, init });
      const next = responses.shift();
      if (next === undefined) throw new Error(`unexpected fetch #${calls.length}`);
      if (next === 'hang') {
        // Like real fetch: reject once the signal aborts (or at once if it already has).
        return new Promise<Response>((_, reject) => {
          const abort = () => reject(new Error('aborted'));
          if (init.signal?.aborted) abort();
          init.signal?.addEventListener('abort', abort);
        });
      }
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  });
  return { api, calls };
}

test('api: DELETE that 404s on the retry after a 5xx is a success', async () => {
  const { api, calls } = scriptedApi([json(503), json(404, { error: 'Not found' })]);
  const result = await api.delete('/api/trips/t/items', { body: JSON.stringify({ id: 'x' }) });
  assert.equal(result.success, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.body, JSON.stringify({ id: 'x' }), 'DELETE body survives the retry');
});

test('api: DELETE 404 without any retry (already cascaded) is a success', async () => {
  const { api } = scriptedApi([json(404)]);
  assert.equal((await api.delete('/api/categories/c')).success, true);
});

test('api: non-DELETE 404 is still a failure', async () => {
  const { api } = scriptedApi([json(404, { error: 'Trip not found' })]);
  const result = await api.patch('/api/trips/t', { name: 'x' });
  assert.deepEqual(result, { success: false, error: 'Trip not found', statusCode: 404 });
});

test('api: no session token sends nothing, reports 401, and redirects back here', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { api, calls } = scriptedApi([], { token: null });
  const result = await api.post('/api/trips', { name: 'x' });
  assert.equal(calls.length, 0);
  assert.equal(result.success, false);
  assert.equal(result.statusCode, 401);

  t.mock.timers.tick(1000);
  assert.equal(
    fakeLocation.href,
    `/sign-in?redirect_url=${encodeURIComponent('/trips/abc?view=bags')}`,
    'the redirect keeps the query string'
  );
});

test('api: writes carry the Bearer token and X-Source-ID; GETs have no source id', async () => {
  const { api, calls } = scriptedApi([json(200, { id: 1 }), json(200, [])]);
  await api.patch('/api/trips/t', { name: 'x' });
  await api.get('/api/trips');
  const writeHeaders = calls[0].init.headers as Record<string, string>;
  const readHeaders = calls[1].init.headers as Record<string, string>;
  assert.equal(writeHeaders.Authorization, 'Bearer tok');
  assert.ok(writeHeaders['X-Source-ID']);
  assert.equal(readHeaders['X-Source-ID'], undefined);
});

test('api: a timed-out non-POST is retried once', async () => {
  const { api, calls } = scriptedApi(['hang', json(200, { ok: true })], { timeoutMs: 10 });
  const result = await api.get<{ ok: boolean }>('/api/trips');
  assert.deepEqual(result, { success: true, data: { ok: true } });
  assert.equal(calls.length, 2);
});

test('api: time spent waiting for the session token does not count toward the timeout', async () => {
  const { api, calls } = scriptedApi([json(200, [])], { timeoutMs: 10, tokenDelayMs: 30 });
  assert.equal((await api.get('/api/trips')).success, true);
  assert.equal(calls.length, 1);
});

test('api: a request that times out twice reports the timeout', async () => {
  const { api } = scriptedApi(['hang', 'hang'], { timeoutMs: 10 });
  const result = await api.patch('/api/trips/t', {});
  assert.equal(result.success, false);
  assert.equal(result.error, 'Request timed out');
});

test('api: POST is never retried, on 5xx or network error', async () => {
  const server = scriptedApi([json(500, { error: 'boom' })]);
  const serverResult = await server.api.post('/api/trips', {});
  assert.equal(server.calls.length, 1);
  assert.equal(serverResult.statusCode, 500);

  const network = scriptedApi([new Error('offline')]);
  const networkResult = await network.api.post('/api/trips', {});
  assert.equal(network.calls.length, 1);
  assert.equal(networkResult.success, false);
});

test('api: a caller abort is not retried', async () => {
  const controller = new AbortController();
  const { api, calls } = scriptedApi(['hang']);
  const pending = api.get('/api/trips', { signal: controller.signal });
  controller.abort();
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(calls.length, 1);
});

test('api: 403 is returned as-is (no retry)', async () => {
  const { api, calls } = scriptedApi([json(403, { error: 'Limit reached' })]);
  const result = await api.post('/api/trips', {});
  assert.deepEqual(result, { success: false, error: 'Limit reached', statusCode: 403 });
  assert.equal(calls.length, 1);
});
