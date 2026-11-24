import { Readable } from 'node:stream';
import viteConfig from '../../vite.config.js';

// Se reutilizan las mismas validaciones que en el servidor local.
const routes = new Map();
const middleware = { use: (path, handler) => routes.set(path, handler) };
for (const plugin of viteConfig.plugins || []) {
  if (typeof plugin.configureServer === 'function') plugin.configureServer({ middlewares: middleware });
}

export const config = { path: ["/api/tickets", "/api/users", "/api/users/:id"] };

export default async function handler(request) {
  const parsed = new URL(request.url);
  const path = parsed.pathname;
  const route = path === '/api/tickets' ? '/api/tickets'
    : (path === '/api/users' || path.startsWith('/api/users/')) ? '/api/users' : null;
  if (!route) return Response.json({ ok: false, message: 'Ruta no encontrada.' }, { status: 404 });
  const query = parsed.searchParams.toString();
  const body = Buffer.from(await request.arrayBuffer());
  if (body.length > 16384) return Response.json({ ok: false, message: 'Solicitud demasiado grande.' }, { status: 413 });
  const req = Readable.from(body.length ? [body] : []);
  req.url = (path.slice(route.length) || '/') + (query ? '?' + query : '');
  req.method = request.method;
  req.headers = Object.fromEntries(request.headers.entries());
  req.headers.host ||= parsed.host;
  return await new Promise((resolve) => {
    const headers = {};
    const res = { statusCode: 200, setHeader(name, value) { headers[name] = value; }, end(result = '') { resolve(new Response(String(result), { status: this.statusCode, headers })); } };
    Promise.resolve(routes.get(route)(req, res)).catch(() => resolve(Response.json({ok:false,message:'Error interno del servidor.'},{status:500})));
  });
}
