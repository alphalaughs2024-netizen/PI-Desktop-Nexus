import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { companion } from './companion.mjs';
export const WEBSITE_PROMPT =
  'Build a dependency-free responsive website in index.html matching the attached reference closely. Use native write/edit and the evaluation preview/browser tools. Start the preview, check status in a separate call, inspect desktop and mobile screenshots, adjust only if needed, and report honest findings. Implement Start a session so it changes to Session started. Use accessible markup. Do not run shell commands, fetch network content, install packages, or use other files. Use at most 7 model/tool steps. In your final answer state whether you saw both screenshots and report remaining mismatches.';
export async function websiteReference(directory) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, 'index.html'),
    await readFile(new URL('./fixtures/website.html', import.meta.url)),
  );
  const service = await companion(directory);
  try {
    await service.execute('evaluation_preview', { action: 'start' });
    const capture = await service.execute('evaluation_browser', { viewport: 'desktop' });
    return capture.content.find((part) => part.type === 'image').data;
  } finally {
    await service.close();
  }
}
