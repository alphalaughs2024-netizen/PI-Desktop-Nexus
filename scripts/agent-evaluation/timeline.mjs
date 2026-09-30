import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

// This is an evaluation projection, not a new production protocol.
export class Timeline extends EventEmitter {
  constructor({ now = Date.now } = {}) {
    super();
    this.now = now;
    this.generation = 0;
    this.history = [];
  }
  begin(engine, mode, acceptedAt = this.now()) {
    if (this.turn && this.turn.endedAt === null) throw new Error('TURN_ALREADY_RUNNING');
    this.generation++;
    this.seen = new Set();
    this.items = new Map();
    this.turn = {
      id: randomUUID(),
      generation: this.generation,
      engine,
      mode,
      acceptedAt,
      endedAt: null,
      outcome: null,
      phase: 'preparing',
      phaseAt: acceptedAt,
      phaseMs: {},
      terminalEvents: 0,
      rejectedEvents: 0,
    };
    this.history = [];
    this.revision = 0;
    this.publish('turn.started');
    return this.token();
  }
  token() {
    return { turnId: this.turn.id, generation: this.generation };
  }
  accept(event, token = this.token()) {
    if (
      !this.turn ||
      token.turnId !== this.turn.id ||
      token.generation !== this.generation ||
      this.turn.endedAt !== null
    ) {
      if (this.turn) this.turn.rejectedEvents++;
      return false;
    }
    if (event.eventId) {
      if (this.seen.has(event.eventId)) return false;
      this.seen.add(event.eventId);
      if (this.seen.size > 4096) this.seen.delete(this.seen.values().next().value);
    }
    if (event.kind === 'phase') {
      this.closePhase();
      this.turn.phase = event.phase;
      this.turn.phaseAt = this.now();
    } else if (event.kind === 'item') {
      const previous = this.items.get(event.id) ?? { id: event.id, type: event.type, text: '' };
      const text =
        event.delta !== undefined ? previous.text + event.delta : (event.text ?? previous.text);
      this.items.set(event.id, {
        ...previous,
        ...event,
        text: text.slice(-1024 * 1024),
        truncated: previous.truncated || text.length > 1024 * 1024,
      });
    } else if (event.kind === 'terminal') {
      this.closePhase();
      this.turn.endedAt = this.now();
      this.turn.outcome = event.outcome;
      this.turn.phase = event.outcome;
      this.turn.terminalEvents++;
    }
    this.publish(event.kind);
    return true;
  }
  closePhase() {
    const t = this.turn;
    t.phaseMs[t.phase] = (t.phaseMs[t.phase] ?? 0) + Math.max(0, this.now() - t.phaseAt);
  }
  snapshot() {
    if (!this.turn) return { turn: null, items: [] };
    const t = structuredClone(this.turn);
    const current = this.now();
    t.elapsedMs = Math.max(0, (t.endedAt ?? current) - t.acceptedAt);
    if (t.endedAt === null)
      t.phaseMs[t.phase] = (t.phaseMs[t.phase] ?? 0) + Math.max(0, current - t.phaseAt);
    return {
      turn: t,
      updatedAt: this.updatedAt,
      revision: this.revision,
      items: [...this.items.values()].map((item) => ({ ...item })),
    };
  }
  publish(kind) {
    this.updatedAt = this.now();
    this.revision = (this.revision ?? 0) + 1;
    const event = { kind, at: this.now(), phase: this.turn.phase, generation: this.generation };
    this.history.push(event);
    if (this.history.length > 2048) this.history.shift();
    this.emit('update', this.snapshot());
  }
  evidence() {
    const { turn, items } = this.snapshot();
    return {
      turn,
      items: items.map(({ id, type, label, status, text, truncated }) => ({
        id,
        type,
        label,
        status,
        characters: text?.length ?? 0,
        truncated: !!truncated,
      })),
      events: this.history,
      note: 'No prompts, response text, tool arguments, credentials, or image bytes in this export.',
    };
  }
}

export class StreamBatcher {
  constructor(deliver, { windowMs = 60, schedule = setTimeout, cancel = clearTimeout } = {}) {
    this.deliver = deliver;
    this.windowMs = windowMs;
    this.schedule = schedule;
    this.cancel = cancel;
    this.pending = new Map();
    this.timer = null;
    this.leading = true;
  }
  push(event) {
    if (event.kind !== 'item' || event.delta === undefined) {
      this.flush();
      this.deliver(event);
      return;
    }
    if (this.leading) {
      this.leading = false;
      this.deliver(event);
      this.arm();
      return;
    }
    const prior = this.pending.get(event.id);
    this.pending.set(event.id, { ...event, delta: (prior?.delta ?? '') + event.delta });
    this.arm();
  }
  arm() {
    if (!this.timer)
      this.timer = this.schedule(() => {
        this.timer = null;
        this.flush();
        this.leading = true;
      }, this.windowMs);
  }
  flush() {
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    for (const event of this.pending.values()) this.deliver(event);
    this.pending.clear();
  }
}
