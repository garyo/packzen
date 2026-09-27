import type { APIRoute } from 'astro';
import { createApi, type ApiClient } from '../src/lib/api';
import { createBilling, type Billing } from '../src/lib/billing';
import * as categories from '../src/pages/api/categories/index';
import * as category from '../src/pages/api/categories/[id]';
import * as masterItems from '../src/pages/api/master-items/index';
import * as masterItem from '../src/pages/api/master-items/[id]';
import * as bagTemplates from '../src/pages/api/bag-templates/index';
import * as bagTemplate from '../src/pages/api/bag-templates/[id]';
import * as trips from '../src/pages/api/trips/index';
import * as trip from '../src/pages/api/trips/[tripId]/index';
import * as tripBags from '../src/pages/api/trips/[tripId]/bags';
import * as tripItems from '../src/pages/api/trips/[tripId]/items';
import { buildApiContext } from './test-helpers';

type RouteModule = { [method: string]: APIRoute | boolean | undefined };

const ROUTES: Array<[RegExp, RouteModule]> = [
  [/^\/api\/categories$/, categories],
  [/^\/api\/categories\/(?<id>[^/]+)$/, category],
  [/^\/api\/master-items$/, masterItems],
  [/^\/api\/master-items\/(?<id>[^/]+)$/, masterItem],
  [/^\/api\/bag-templates$/, bagTemplates],
  [/^\/api\/bag-templates\/(?<id>[^/]+)$/, bagTemplate],
  [/^\/api\/trips$/, trips],
  [/^\/api\/trips\/(?<tripId>[^/]+)$/, trip],
  [/^\/api\/trips\/(?<tripId>[^/]+)\/bags$/, tripBags],
  [/^\/api\/trips\/(?<tripId>[^/]+)\/items$/, tripItems],
];

const STANDARD_PLAN = createBilling('standard');

/**
 * Return a rejection message to make the matching request fail with a 400
 * before it reaches the handler, or undefined to let it through.
 */
export type FailHook = (method: string, endpoint: string, body: any) => string | undefined;

/**
 * The real client `api` (src/lib/api.ts) wired to the real API route handlers
 * over a test database, so client code like backup restore runs end to end.
 */
export function makeHandlerApi(
  db: Parameters<typeof buildApiContext>[0]['db'],
  userId: string,
  options: { failWhen?: FailHook; billing?: Billing } = {}
): ApiClient {
  return createApi({
    getToken: async () => 'test-token',
    fetch: async (endpoint, init) => {
      const method = init.method ?? 'GET';
      const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
      const failure = options.failWhen?.(method, endpoint, body);
      if (failure) return Response.json({ error: failure }, { status: 400 });

      for (const [pattern, module] of ROUTES) {
        const match = endpoint.match(pattern);
        const handler = match && module[method];
        if (match && typeof handler === 'function') {
          return handler(
            buildApiContext({
              db,
              userId,
              billing: options.billing ?? STANDARD_PLAN,
              params: match.groups,
              request: new Request(`http://localhost${endpoint}`, init),
            })
          );
        }
      }
      return Response.json({ error: `No route for ${method} ${endpoint}` }, { status: 404 });
    },
  });
}
