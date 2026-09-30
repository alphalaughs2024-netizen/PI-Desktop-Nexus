const SAMPLE_RATE = 16_000;
const MAX_RECORDING_MS = 60_000;

function encodeWav(samples: Float32Array): string {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, bytes.length - 8, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, value < 0 ? value * 32768 : value * 32767, true);
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function recordedAudioToWav(blob: Blob): Promise<string> {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.min(SAMPLE_RATE * MAX_RECORDING_MS / 1000, Math.ceil(decoded.duration * SAMPLE_RATE));
    const offline = new OfflineAudioContext(1, Math.max(1, frames), SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const resampled = await offline.startRendering();
    return encodeWav(resampled.getChannelData(0));
  } finally {
    await context.close();
  }
}

export type SpeechRecording = {
  finished: Promise<string>;
  stop: () => Promise<string>;
  cancel: () => void;
};

export async function startSpeechRecording(): Promise<SpeechRecording> {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Microphone recording is unavailable on this device");
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream); } catch (error) {
    stream.getTracks().forEach(track => track.stop()); throw error;
  }
  const chunks: Blob[] = [];
  let canceled = false;
  let timer: number | undefined;
  const close = () => { window.clearTimeout(timer); stream.getTracks().forEach(track => track.stop()); };
  const finished = new Promise<string>((resolve, reject) => {
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onerror = () => { close(); reject(new Error("Microphone recording failed")); };
    recorder.onstop = () => {
      close();
      if (canceled) { resolve(""); return; }
      void recordedAudioToWav(new Blob(chunks, { type: recorder.mimeType })).then(resolve, reject);
    };
  });
  // A device failure can precede the user's Stop; callers still receive the rejection.
  void finished.catch(() => undefined);
  try { recorder.start(250); } catch (error) { close(); throw error; }
  timer = window.setTimeout(() => { if (recorder.state !== "inactive") recorder.stop(); }, MAX_RECORDING_MS);
  return {
    finished,
    stop: () => { if (recorder.state !== "inactive") recorder.stop(); return finished; },
    cancel: () => {
      canceled = true;
      if (recorder.state !== "inactive") recorder.stop();
      close();
    },
  };
}
