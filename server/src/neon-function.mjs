import { app } from './index.mjs';

const BODYLESS_METHODS = new Set(['GET', 'HEAD']);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const payload = BODYLESS_METHODS.has(request.method) ? undefined : Buffer.from(await request.arrayBuffer());
    const injected = await app.inject({
      method: request.method,
      url: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(request.headers.entries()),
      ...(payload ? { payload } : {})
    });

    const headers = new Headers();
    for (const [name, value] of Object.entries(injected.headers)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) headers.append(name, String(item));
      } else {
        headers.set(name, String(value));
      }
    }

    return new Response(injected.rawPayload.length ? injected.rawPayload : null, {
      status: injected.statusCode,
      headers
    });
  }
};
