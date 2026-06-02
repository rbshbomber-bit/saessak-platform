const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const root = process.cwd();
const port = Number(process.env.PORT || 8090);
const apiProxyOrigin = process.env.API_PROXY_ORIGIN || 'https://saessak-platform.vercel.app';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function proxyApi(req, res) {
  const target = new URL(req.url, apiProxyOrigin);
  const headers = { ...req.headers, host: target.host };
  delete headers.connection;

  const proxyReq = https.request(target, {
    method: req.method,
    headers,
  }, proxyRes => {
    res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', err => {
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      ok: false,
      error: 'API proxy failed',
      detail: err.message,
      target: target.href,
    }));
  });

  req.pipe(proxyReq);
}

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);

  if (urlPath.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  const relPath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(root, relPath));

  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, {
      'Content-Type': types[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
    });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`Preview server running at http://127.0.0.1:${port}/`);
  console.log(`API proxy target: ${apiProxyOrigin}`);
});
