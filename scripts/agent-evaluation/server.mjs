import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { evaluate, doctor } from './evaluate.mjs';

export async function serve({
  allowCloud = false,
  credential,
  port = 0,
  evaluateRun = evaluate,
  inspect = doctor,
} = {}) {
  const nonce = randomBytes(24).toString('hex');
  const versions = await inspect();
  let snapshot = { turn: null, items: [] };
  let busy = false;
  let reportPath = null;
  let controller;
  let active;
  let closing = false;
  const rendererSamples = [];
  const server = createServer(
    (req, res) =>
      void handle(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(500);
        res.end();
      }),
  );
  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const origin = 'http://127.0.0.1:' + server.address().port;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      req.headers.host !== new URL(origin).host ||
      (req.headers.origin && req.headers.origin !== origin)
    ) {
      res.writeHead(403).end();
      return;
    }
    if (req.method === 'GET' && url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'",
      );
      res.end(await readFile(new URL('./prototype.html', import.meta.url)));
      return;
    }
    if (req.method === 'GET' && ['/prototype.js', '/prototype.css'].includes(url.pathname)) {
      res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : 'text/css');
      res.end(await readFile(new URL('.' + url.pathname, import.meta.url)));
      return;
    }
    if (url.searchParams.get('token') !== nonce) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && url.pathname === '/state') {
      const visible = structuredClone(snapshot);
      if (visible.turn?.endedAt === null)
        visible.turn.elapsedMs = Math.max(0, Date.now() - visible.turn.acceptedAt);
      res.end(
        JSON.stringify({
          snapshot: visible,
          busy,
          reportPath,
          allowCloud,
          doctor: versions,
          rendererSamples,
        }),
      );
      return;
    }
    if (req.method === 'POST' && url.pathname === '/render') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 2048) {
          res.writeHead(413).end();
          return;
        }
      }
      let sample;
      try {
        sample = JSON.parse(raw);
      } catch {
        res.writeHead(400).end();
        return;
      }
      const fields = ['revision', 'deliveryMs', 'renderTaskMs', 'nextFrameMs'];
      if (
        !sample ||
        sample.turnId !== snapshot.turn?.id ||
        !fields.every(
          (key) => Number.isFinite(sample[key]) && sample[key] >= 0 && sample[key] <= 300000,
        )
      ) {
        res.writeHead(400).end();
        return;
      }
      if (!rendererSamples.some((row) => row.revision === sample.revision)) {
        rendererSamples.push(Object.fromEntries(fields.map((key) => [key, sample[key]])));
        if (rendererSamples.length > 128) rendererSamples.shift();
      }
      res.writeHead(204).end();
      return;
    }
    if (req.method === 'POST' && url.pathname === '/interrupt') {
      controller?.abort();
      res.writeHead(202).end('{}');
      return;
    }
    if (req.method === 'POST' && url.pathname === '/run') {
      if (busy || closing) {
        res.writeHead(409).end();
        return;
      }
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) {
          res.writeHead(413).end();
          return;
        }
      }
      let args;
      try {
        args = JSON.parse(raw);
      } catch {
        res.writeHead(400).end();
        return;
      }
      if (
        !args ||
        !['codex', 'opencode', 'pi'].includes(args.engine) ||
        !['fixture', 'xkiro'].includes(args.mode) ||
        (args.mode === 'xkiro' && !allowCloud)
      ) {
        res.writeHead(403).end();
        return;
      }
      const scenario = args.scenario ?? 'text';
      if (
        ![
          'text',
          'read',
          'stale-edit',
          'browser',
          'website',
          'provider-failure',
          'partial-failure',
        ].includes(scenario)
      ) {
        res.writeHead(400).end();
        return;
      }
      busy = true;
      rendererSamples.length = 0;
      snapshot = {
        turn: { acceptedAt: Date.now(), endedAt: null, elapsedMs: 0, phase: 'preparing' },
        items: [],
      };
      reportPath = null;
      controller = new AbortController();
      res.writeHead(202).end('{}');
      active = Promise.resolve()
        .then(() =>
          evaluateRun({
            acceptedAt: snapshot.turn.acceptedAt,
            engine: args.engine,
            mode: args.mode,
            model: args.mode === 'fixture' ? 'nexus-fixture' : args.model,
            scenario,
            prompt: String(args.prompt ?? 'Reply with exactly: Nexus evaluation ready.').slice(
              0,
              8192,
            ),
            image: !!args.image,
            cancelAfterMs: args.cancel ? 750 : undefined,
            credential,
            signal: controller.signal,
            onUpdate: (value) => {
              snapshot = value;
            },
          }),
        )
        .then((result) => {
          reportPath = result.reportPath;
          snapshot = result.snapshot;
        })
        .catch(() => {
          snapshot = { turn: { outcome: 'failed', phase: 'failed' }, items: snapshot.items };
        })
        .finally(() => {
          busy = false;
          controller = null;
        });
      return;
    }
    res.writeHead(404).end();
  }
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  const address = 'http://127.0.0.1:' + server.address().port + '/#' + nonce;
  return {
    address,
    async close() {
      closing = true;
      controller?.abort();
      await active;
      server.closeAllConnections();
      await new Promise((r) => server.close(r));
    },
  };
}
