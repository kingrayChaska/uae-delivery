// A TLS-terminating reverse proxy in front of the app — the way it runs in
// production (Vercel's edge, a load balancer, nginx). The browser talks real
// HTTPS; the app receives plain HTTP with X-Forwarded-Proto: https. This is
// what makes Secure cookies, HSTS and the HTTP->HTTPS redirect behave
// exactly as they will in production.
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';

const dir = process.env.E2E_LOGS;
https
  .createServer({ key: readFileSync(`${dir}/tls.key`), cert: readFileSync(`${dir}/tls.crt`) }, (req, res) => {
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: Number(process.env.E2E_APP_PORT),
        path: req.url,
        method: req.method,
        headers: { ...req.headers, 'x-forwarded-proto': 'https', 'x-forwarded-host': req.headers.host, 'x-forwarded-for': '127.0.0.1' },
      },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (error) => {
      // A browser aborting mid-response (normal during navigation) surfaces
      // here after headers were already sent — writing them again throws
      // and would take the whole proxy down. Only respond if we still can.
      console.error('upstream error', req.method, req.url, error.code ?? error.message);
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    req.on('aborted', () => upstream.destroy());
    req.pipe(upstream);
  })
  .on('clientError', (error, socket) => {
    console.error('client error', error.code ?? error.message);
    socket.destroy();
  })
  .listen(Number(process.env.E2E_TLS_PORT), '127.0.0.1');

// Never die silently: anything unexpected is logged, and the proxy keeps
// serving the rest of the suite.
process.on('uncaughtException', (error) => console.error('uncaught', error));
