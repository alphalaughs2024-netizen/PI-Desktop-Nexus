type FrameHandle = number;

/**
 * Coalesces high-frequency updates until the next paint opportunity.
 *
 * A key keeps only the latest value for one streaming target while preserving
 * insertion order between different targets. Terminal events can call
 * flushNow() so a final state never waits behind the frame.
 */
export function createFrameBatcher<T>(
  flush: (values: readonly T[]) => void,
  options: { leading?: boolean; maxWaitMs?: number } = {},
) {
  const pending = new Map<string, T>();
  let handle: FrameHandle | null = null;
  let usesAnimationFrame = false;
  let deadline: ReturnType<typeof setTimeout> | null = null;
  let cooling = false;

  const cancelScheduledFlush = () => {
    if (deadline !== null) clearTimeout(deadline);
    deadline = null;
    if (handle === null) return;
    if (
      usesAnimationFrame &&
      typeof globalThis.cancelAnimationFrame === "function"
    ) {
      globalThis.cancelAnimationFrame(handle);
    } else {
      globalThis.clearTimeout(handle);
    }
    handle = null;
  };

  const run = () => {
    cancelScheduledFlush();
    cooling = false;
    if (pending.size === 0) return;
    const values = [...pending.values()];
    pending.clear();
    flush(values);
  };

  const schedule = () => {
    if (handle !== null) return;
    deadline = setTimeout(run, options.maxWaitMs ?? 60);
    if (typeof globalThis.requestAnimationFrame === "function") {
      usesAnimationFrame = true;
      handle = globalThis.requestAnimationFrame(run);
      return;
    }
    usesAnimationFrame = false;
    handle = globalThis.setTimeout(run, 16) as unknown as FrameHandle;
  };

  return {
    enqueue(key: string, value: T) {
      pending.set(key, value);
      if (options.leading && !cooling && handle === null) {
        cooling = true;
        const values = [...pending.values()]; pending.clear();
        schedule();
        flush(values);
        return;
      }
      schedule();
    },
    flushNow() {
      cancelScheduledFlush();
      run();
    },
    get size() {
      return pending.size;
    },
  };
}
