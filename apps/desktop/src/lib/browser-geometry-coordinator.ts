import { browserGuestRectKey, normalizeBrowserGuestRect, type BrowserGuestRect } from "./browser-guest-rect";

export type GuestGeometryState = {
  rect: BrowserGuestRect | null;
  visible: boolean;
  generation: number;
  transitionGeneration: number;
  pendingFrame: number | null;
};

export type GuestGeometryCoordinator = {
  state: GuestGeometryState;
  schedule: (input: Omit<BrowserGuestRect, "visible"> & { visible?: boolean }) => void;
  invalidate: () => void;
  hide: () => void;
  dispose: () => void;
};

export function createGuestGeometryCoordinator({
  sessionId,
  publish,
  raf = (callback) => requestAnimationFrame(callback),
  cancel = (frame) => cancelAnimationFrame(frame),
}: {
  sessionId?: string;
  publish: (rect: BrowserGuestRect) => Promise<unknown> | unknown;
  raf?: (callback: FrameRequestCallback) => number;
  cancel?: (frame: number) => void;
}): GuestGeometryCoordinator {
  let disposed = false;
  let state: GuestGeometryState = { rect: null, visible: false, generation: 0, transitionGeneration: 0, pendingFrame: null };
  let pending: BrowserGuestRect | null = null;
  let lastKey = "";
  const flush = () => {
    state = { ...state, pendingFrame: null };
    if (disposed || !pending) return;
    const next = pending;
    pending = null;
    const key = browserGuestRectKey(next);
    if (key === lastKey) return;
    lastKey = key;
    const generation = state.generation;
    state = { ...state, rect: next, visible: next.visible };
    void Promise.resolve(publish(next)).finally(() => {
      if (disposed || generation !== state.generation) return;
    });
  };
  const schedule = (input: Omit<BrowserGuestRect, "visible"> & { visible?: boolean }) => {
    if (disposed) return;
    const next = normalizeBrowserGuestRect({ ...input, visible: input.visible !== false, sessionId });
    if (!next) return;
    pending = next;
    if (state.pendingFrame !== null) return;
    const frame = raf(flush); // requestAnimationFrame coalesces geometry publishes to one per frame.
    state = { ...state, pendingFrame: frame };
  };
  const hide = () => {
    if (disposed) return;
    state = { ...state, generation: state.generation + 1, transitionGeneration: state.transitionGeneration + 1 };
    pending = { x: 0, y: 0, width: 0, height: 0, visible: false, sessionId };
    if (state.pendingFrame === null) state = { ...state, pendingFrame: raf(flush) };
  };
  const invalidate = () => {
    if (disposed) return;
    state = { ...state, generation: state.generation + 1, transitionGeneration: state.transitionGeneration + 1 };
    pending = null;
    if (state.pendingFrame !== null) { cancel(state.pendingFrame); state = { ...state, pendingFrame: null }; }
  };
  const dispose = () => {
    if (disposed) return;
    hide();
    disposed = true;
    if (state.pendingFrame !== null) cancel(state.pendingFrame);
  };
  return { get state() { return state; }, schedule, invalidate, hide, dispose };
}
