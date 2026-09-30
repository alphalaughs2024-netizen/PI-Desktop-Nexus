const token = location.hash.slice(1);
const form = document.querySelector('#trial');
const status = document.querySelector('#status');
const itemNodes = new Map();
let currentTurn;
let renderedRevision;
let sampleTurn;
function renderItems(snapshot) {
  if (currentTurn !== snapshot.turn?.id) {
    currentTurn = snapshot.turn?.id;
    itemNodes.clear();
    document.querySelector('#items').replaceChildren();
  }
  for (const item of snapshot.items) {
    let node = itemNodes.get(item.id);
    if (!node) {
      const details = document.createElement('details');
      details.open = item.type === 'assistant';
      const summary = document.createElement('summary');
      const text = document.createElement('pre');
      details.append(summary, text);
      document.querySelector('#items').append(details);
      node = { summary, text };
      itemNodes.set(item.id, node);
    }
    node.summary.textContent =
      (item.label ?? item.type) +
      ' · ' +
      (item.status ?? 'running') +
      (item.truncated ? ' · output truncated' : '');
    if (node.text.textContent !== item.text) node.text.textContent = item.text ?? '';
  }
}
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const args = Object.fromEntries(data);
  args.image = data.has('image');
  args.cancel = data.has('cancel');
  status.textContent = 'Preparing trial';
  try {
    const response = await fetch('/run?token=' + token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!response.ok) status.textContent = 'Trial refused: ' + response.status;
  } catch {
    status.textContent = 'Evaluation server unavailable';
  }
});
document
  .querySelector('#interrupt')
  .addEventListener('click', () => fetch('/interrupt?token=' + token, { method: 'POST' }));
async function refresh() {
  try {
    const response = await fetch('/state?token=' + token);
    if (!response.ok) throw new Error();
    const state = await response.json();
    const receivedAt = Date.now();
    const renderStart = performance.now();
    const turn = state.snapshot.turn;
    status.textContent = turn
      ? `${turn.phase} · ${((turn.elapsedMs ?? 0) / 1000).toFixed(1)}s total`
      : 'Ready';
    form.querySelector('button').disabled = state.busy;
    document.querySelector('#interrupt').disabled = !state.busy;
    form.querySelector('option[value=xkiro]').disabled = !state.allowCloud;
    document.querySelector('#versions').textContent = Object.entries(state.doctor.engines)
      .map(
        ([name, e]) =>
          `${name}: ${e.installed ?? 'unavailable'}${e.matches ? '' : ' (pin mismatch)'}`,
      )
      .join(' · ');
    renderItems(state.snapshot);
    document.querySelector('#timeline').textContent = JSON.stringify(
      { snapshot: state.snapshot, rendererSamples: state.rendererSamples },
      null,
      2,
    );
    document.querySelector('#report').textContent = state.reportPath
      ? 'Metadata report: ' + state.reportPath
      : '';
    if (turn?.id && (sampleTurn !== turn.id || renderedRevision !== state.snapshot.revision)) {
      sampleTurn = turn.id;
      renderedRevision = state.snapshot.revision;
      const sample = {
        turnId: turn.id,
        revision: state.snapshot.revision,
        deliveryMs: Math.max(0, receivedAt - state.snapshot.updatedAt),
        renderTaskMs: performance.now() - renderStart,
      };
      const frameStart = performance.now();
      requestAnimationFrame(() => {
        sample.nextFrameMs = performance.now() - frameStart;
        void fetch('/render?token=' + token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sample),
        }).catch(() => {});
      });
    }
  } catch {
    status.textContent = 'Evaluation server unavailable';
  }
  setTimeout(refresh, 250);
}
refresh();
