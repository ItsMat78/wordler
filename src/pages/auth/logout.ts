import type { APIRoute } from 'astro';
import { SESSION_COOKIE } from '../../lib/session';

// POST only, so a stray link or prefetch can't log anyone out.
export const POST: APIRoute = ({ cookies, redirect }) => {
  cookies.delete(SESSION_COOKIE, { path: '/' });
  return redirect('/');
};
