// Evaluation-only services. All model-visible capability names identify their owner.
import { spawn, execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdir, writeFile, appendFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { stopProcess } from './process.mjs';

export const companionTools = [
  {
    name: 'evaluation_preview',
    description:
      'Harness-owned managed preview server for this evaluation workspace. Start, inspect, or stop it; it survives individual tool calls.',
    parameters: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['start', 'status', 'stop'] } },
      required: ['action'],
      additionalProperties: false,
    },
  },
  {
    name: 'evaluation_browser',
    description:
      'Harness-owned Chromium browser. Capture the workspace preview at a desktop or mobile viewport, including screenshot image, DOM measurements and grouped console diagnostics.',
    parameters: {
      type: 'object',
      properties: { viewport: { type: 'string', enum: ['desktop', 'mobile'] } },
      required: ['viewport'],
      additionalProperties: false,
    },
  },
];
export async function companion(workspace, { mutationProbe = false } = {}) {
  let child;
  let url;
  let browser;
  let closed = false;
  const pending = new Set();
  const logs = [];
  const records = [];
  async function preview(action) {
    if (action === 'stop') {
      await stopProcess(child);
      url = undefined;
      return { running: false };
    }
    if ((action === 'start' && !child?.pid) || (action === 'start' && child.exitCode !== null)) {
      child = spawn(
        process.execPath,
        [fileURLToPath(new URL('./preview-child.mjs', import.meta.url)), workspace],
        { cwd: workspace, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let timer;
      try {
        url = await new Promise((resolveReady, reject) => {
          timer = setTimeout(() => reject(new Error('PREVIEW_START_TIMEOUT')), 10000);
          child.on('error', reject);
          child.on('exit', () => reject(new Error('PREVIEW_EXITED_BEFORE_READY')));
          createInterface({ input: child.stdout }).on('line', (line) => {
            logs.push(line.slice(0, 300));
            if (logs.length > 30) logs.shift();
            try {
              const value = JSON.parse(line);
              if (value.port) resolveReady('http://127.0.0.1:' + value.port);
            } catch {}
          });
          child.stderr.on('data', (chunk) => {
            logs.push(chunk.toString().slice(0, 300));
            if (logs.length > 30) logs.shift();
          });
        });
      } finally {
        clearTimeout(timer);
      }
    }
    return {
      running: !!child?.pid && child.exitCode === null,
      pid: child?.pid,
      url,
      exitCode: child?.exitCode,
      logs: [...logs],
    };
  }
  async function capture(viewport) {
    if (!url || child.exitCode !== null) throw new Error('PREVIEW_NOT_RUNNING');
    if (!browser) {
      const common = execFileSync('git', ['rev-parse', '--git-common-dir'], {
        cwd: fileURLToPath(new URL('../../', import.meta.url)),
        encoding: 'utf8',
      }).trim();
      const library = pathToFileURL(
        join(dirname(resolve(common)), 'node_modules/playwright/index.mjs'),
      );
      const { chromium } = await import(library);
      browser = await chromium.launch({ headless: true });
    }
    const size =
      viewport === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 };
    const context = await browser.newContext({ viewport: size });
    const page = await context.newPage();
    const consoleEntries = new Map();
    const errors = [];
    let droppedConsoleMessages = 0;
    let droppedPageErrors = 0;
    page.on('console', (message) => {
      const key = message.type() + ':' + message.text().slice(0, 500);
      if (consoleEntries.has(key) || consoleEntries.size < 100)
        consoleEntries.set(key, (consoleEntries.get(key) ?? 0) + 1);
      else droppedConsoleMessages++;
    });
    page.on('pageerror', (error) => {
      if (errors.length < 100) errors.push(String(error.message).slice(0, 500));
      else droppedPageErrors++;
    });
    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
      const measurements = await page.evaluate(() => ({
        title: document.title,
        headings: [...document.querySelectorAll('h1,h2')].map((e) => e.textContent),
        overflow: document.documentElement.scrollWidth > innerWidth,
        width: innerWidth,
      }));
      const screenshot = await page.screenshot({ fullPage: false });
      const directory = join(workspace, 'evaluation-artifacts');
      await mkdir(directory, { recursive: true });
      const screenshotPath = join(directory, viewport + '.png');
      await writeFile(screenshotPath, screenshot);
      const diagnostics = {
        viewport: size,
        measurements,
        console: [...consoleEntries].map(([message, count]) => ({ message, count })),
        pageErrors: errors,
        droppedConsoleMessages,
        droppedPageErrors,
        screenshotPath,
      };
      records.push({
        kind: 'browser',
        viewport: size,
        screenshotBytes: screenshot.length,
        overflow: measurements.overflow,
        pageErrors: errors.length + droppedPageErrors,
        droppedConsoleMessages,
        droppedPageErrors,
      });
      return {
        content: [
          { type: 'text', text: JSON.stringify(diagnostics) },
          { type: 'image', data: screenshot.toString('base64'), mimeType: 'image/png' },
        ],
      };
    } finally {
      await context.close();
    }
  }
  const tools = mutationProbe
    ? [
        ...companionTools,
        {
          name: 'evaluation_checkpoint',
          description:
            'Harness fault-injection tool: append exactly one marker in this private evaluation workspace, then wait for cancellation. No arguments.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
        },
      ]
    : companionTools;
  return {
    records,
    tools,
    async execute(name, args, { signal } = {}) {
      if (closed) throw new Error('COMPANION_CLOSED');
      signal?.throwIfAborted();
      if (mutationProbe && name === 'evaluation_checkpoint') {
        await appendFile(join(workspace, 'mutation-marker.txt'), 'applied\n');
        records.push({ kind: 'mutation', applied: true });
        await new Promise((resolveWait) => {
          const done = () => {
            pending.delete(done);
            signal?.removeEventListener('abort', done);
            resolveWait();
          };
          pending.add(done);
          if (signal?.aborted) done();
          else signal?.addEventListener('abort', done, { once: true });
        });
        throw new Error('MUTATION_RESULT_INTERRUPTED');
      }
      if (name === 'evaluation_preview' && ['start', 'status', 'stop'].includes(args.action)) {
        const result = await preview(args.action);
        records.push({
          kind: 'process',
          action: args.action,
          running: result.running,
          pid: result.pid,
          exitCode: result.exitCode,
        });
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }
      if (name === 'evaluation_browser' && ['desktop', 'mobile'].includes(args.viewport))
        return capture(args.viewport);
      throw new Error('INVALID_COMPANION_OPERATION');
    },
    async close() {
      closed = true;
      for (const done of pending) done();
      await browser?.close();
      await stopProcess(child);
      records.push({ kind: 'cleanup', processStopped: !child?.pid || child.exitCode !== null });
    },
  };
}
