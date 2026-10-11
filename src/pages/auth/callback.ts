import type { APIRoute } from 'astro';
import { upsertUser } from '../../lib/db';
import { SESSION_COOKIE, SESSION_DAYS, STATE_COOKIE, signSession } from '../../lib/session';

// Step 2 of Discord OAuth: swap the code for the user's id, name and avatar,
// save them, and set the signed login cookie.
export const GET: APIRoute = async ({ locals, url, cookies, redirect }) => {
  const env = locals.runtime.env;
  const saved = cookies.get(STATE_COOKIE)?.json() as { state: string; next: string } | undefined;
  cookies.delete(STATE_COOKIE, { path: '/auth' });

  const code = url.searchParams.get('code');
  if (!code || !saved || saved.state !== url.searchParams.get('state')) {
    return new Response('Login expired or was tampered with. Go back and try again.', { status: 400 });
  }

  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: `${url.origin}/auth/callback`,
    }),
  });
  if (!tokenRes.ok) return new Response('Discord turned down the login.', { status: 502 });
  const { access_token } = (await tokenRes.json()) as { access_token: string };

  const meRes = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return new Response('Could not read your Discord profile.', { status: 502 });
  const me = (await meRes.json()) as { id: string; username: string; global_name: string | null; avatar: string | null };

  const allowed = (env.ALLOWED_DISCORD_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(me.id)) {
    return new Response("This leaderboard is invite-only, and your Discord account isn't on the list.", {
      status: 403,
    });
  }

  const user = { discord_id: me.id, name: me.global_name ?? me.username, avatar: me.avatar };
  await upsertUser(env.DB, user);

  cookies.set(SESSION_COOKIE, await signSession(user, env.SESSION_SECRET), {
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 86_400,
  });
  return redirect(saved.next);
};
