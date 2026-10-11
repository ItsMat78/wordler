import type { APIRoute } from 'astro';
import { STATE_COOKIE } from '../../lib/session';

// Step 1 of Discord OAuth: send the browser to Discord with a one-time state.
export const GET: APIRoute = ({ locals, url, cookies, redirect }) => {
  const env = locals.runtime.env;
  const state = crypto.randomUUID();
  const next = url.searchParams.get('next') ?? '/';

  cookies.set(STATE_COOKIE, JSON.stringify({ state, next: next.startsWith('/') ? next : '/' }), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/auth',
    maxAge: 600,
  });

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `${url.origin}/auth/callback`,
    response_type: 'code',
    scope: 'identify',
    state,
    prompt: 'none',
  });
  return redirect(`https://discord.com/oauth2/authorize?${params}`);
};
