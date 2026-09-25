// Stands in for Supabase's API gateway: one origin, routed by path prefix,
// exactly like https://<project>.supabase.co. Storage and Realtime aren't
// part of this stack, so their paths answer 503.
import http from 'node:http';
import { readFileSync } from 'node:fs';

const routes = [
  { prefix: '/auth/v1', port: Number(process.env.E2E_AUTH_PORT) },
  { prefix: '/rest/v1', port: Number(process.env.E2E_POSTGREST_PORT) },
];

http
  .createServer((req, res) => {
    // Email templates for the Auth server (it fetches them by URL, like the
    // Supabase dashboard's template settings).
    if (req.url.startsWith('/__templates/')) {
      const name = req.url.slice('/__templates/'.length).replace(/[^a-z.]/g, '');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(readFileSync(new URL(`./templates/${name}`, import.meta.url)));
      return;
    }
    const route = routes.find((r) => req.url.startsWith(r.prefix));
    if (!route) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ message: 'Not available in the e2e stack' }));
      return;
    }
    const upstream = http.request(
      { host: '127.0.0.1', port: route.port, path: req.url.slice(route.prefix.length) || '/', method: req.method, headers: { ...req.headers, host: `127.0.0.1:${route.port}` } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, { ...up.headers, 'access-control-allow-origin': '*' });
        up.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  })
  .listen(Number(process.env.E2E_GATEWAY_PORT), '127.0.0.1');
