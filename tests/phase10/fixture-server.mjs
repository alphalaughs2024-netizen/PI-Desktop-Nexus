import { createServer } from "node:http";

const pages = {
  "/ready.html": "<!doctype html><title>Phase 10 Ready</title><main style='font:24px sans-serif;padding:40px'><h1>Phase 10 Ready Fixture</h1><p id='status'>ready</p><div style='height:1800px;padding-top:20px'>scroll target</div></main>",
  "/navigation.html": "<!doctype html><title>Phase 10 Navigation</title><main style='font:24px sans-serif;padding:40px'><h1>Navigation Fixture</h1><a href='/ready.html'>Ready page</a></main>",
  "/delayed.html": "<!doctype html><title>Phase 10 Delayed</title><script>setTimeout(()=>document.body.innerHTML='<main style=\"font:24px sans-serif;padding:40px\"><h1>Delayed Ready</h1></main>',1200)</script><main style='font:24px sans-serif;padding:40px'><h1>Loading…</h1></main>",
  "/broken.html": "<!doctype html><title>Phase 10 Broken</title><script>setTimeout(()=>window.close(),50)</script><main>broken</main>",
};

export function startFixtureServer() {
  const server = createServer((request, response) => {
    const body = pages[request.url] ?? pages["/ready.html"];
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(body);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, baseURL: `http://127.0.0.1:${address.port}` });
    });
  });
}
