import { defineMiddleware } from 'astro:middleware';
import { readSession, SESSION_COOKIE } from './lib/session';

// Who's logged in, for every page. Pages read `Astro.locals.user`.
export const onRequest = defineMiddleware(async (context, next) => {
  // Forms only post from this site: block cross-site POSTs (CSRF).
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    if (context.request.headers.get('origin') !== context.url.origin) {
      return new Response('Cross-site request blocked.', { status: 403 });
    }
  }
  const env = context.locals.runtime?.env;
  context.locals.user = env
    ? await readSession(context.cookies.get(SESSION_COOKIE)?.value, env.SESSION_SECRET)
    : null;
  return next();
});
