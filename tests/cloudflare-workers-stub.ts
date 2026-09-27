// The node test runner's `cloudflare:workers` (see loader-hooks.mjs). Tests
// set the bindings they need on `env`; background work just runs unawaited.
export const env = {} as Cloudflare.Env;

export function waitUntil(_promise: Promise<unknown>): void {}
