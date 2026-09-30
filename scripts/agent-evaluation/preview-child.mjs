import { createServer } from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
const root = await realpath(process.argv[2]);
const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== '127.0.0.1:' + server.address().port) {
      res.writeHead(403).end();
      return;
    }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = await realpath(resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname)));
    const child = relative(root, path);
    if (child.startsWith('..') || isAbsolute(child)) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader(
      'Content-Type',
      { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[
        extname(path)
      ] ?? 'application/octet-stream',
    );
    res.end(await readFile(path));
  } catch {
    res.writeHead(404).end();
  }
});
server.listen(0, '127.0.0.1', () => console.log(JSON.stringify({ port: server.address().port })));
