import { doctor, evaluate } from './evaluate.mjs';
import { serve } from './server.mjs';
const args = process.argv.slice(2);
const command = args.shift() ?? 'doctor';
const flag = (name) => {
  const position = args.indexOf('--' + name);
  return position < 0 ? undefined : args[position + 1];
};
try {
  if (command === 'doctor') console.log(JSON.stringify(await doctor(), null, 2));
  else if (command === 'run') {
    const mode = flag('source') ?? 'fixture';
    if (mode === 'xkiro' && !args.includes('--allow-cloud'))
      throw new Error('CLOUD_TRIAL_REQUIRES_EXPLICIT_ALLOW_CLOUD');
    const result = await evaluate({
      engine: flag('engine') ?? 'codex',
      mode,
      model: mode === 'fixture' ? 'nexus-fixture' : (flag('model') ?? 'qwen/qwen3.8-max:free'),
      scenario: flag('scenario') ?? 'text',
      image: args.includes('--image'),
      cancelAfterMs: flag('cancel-after') ? Number(flag('cancel-after')) : undefined,
      prompt: flag('prompt'),
      onUpdate: (s) =>
        process.stderr.write(s.turn.phase + ' ' + Math.round(s.turn.elapsedMs) + 'ms\n'),
    });
    console.log(
      JSON.stringify(
        {
          reportPath: result.reportPath,
          outcome: result.report.timeline.turn.outcome,
          failure: result.report.failure,
          requests: result.report.requests,
        },
        null,
        2,
      ),
    );
    if (result.report.timeline.turn.outcome === 'failed') process.exitCode = 1;
  } else if (command === 'serve') {
    const server = await serve({ allowCloud: args.includes('--allow-cloud') });
    console.log('Evaluation prototype: ' + server.address);
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.once(signal, () => void server.close().then(() => process.exit(0)));
  } else throw new Error('Use doctor, run, or serve.');
} catch (error) {
  console.error(String(error.message).slice(0, 400));
  process.exitCode = 1;
}
