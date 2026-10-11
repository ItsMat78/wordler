import type { APIRoute } from 'astro';

// Submitting moved to the home page; keep old links working.
export const GET: APIRoute = ({ redirect }) => redirect('/', 301);
