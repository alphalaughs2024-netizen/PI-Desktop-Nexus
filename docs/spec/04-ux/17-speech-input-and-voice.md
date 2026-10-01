# Speech input and voice conversation

- Two compact icon controls sit beside existing composer actions: microphone
  for Dictate and audio lines for Voice mode. Each has an accessible label and
  tooltip; no extra toolbar labels are shown.
- Dictate records up to 60 seconds. Reaching that limit finishes capture and
  transcribes automatically. Done transcribes and inserts plain,
  editable text at the current draft selection. It does not submit. Cancel
  discards audio. A failed or empty result leaves the draft unchanged.
- Voice mode opens a composer-aligned conversation bar above the composer in
  both home and active chats. It presents a microphone state, status, animated
  waveform, recording timer, and compact controls for finishing a turn,
  stopping spoken output, speaking again, and ending the mode. A disclosure
  reveals the latest transcript and reply without expanding the bar by default.
  The bar follows composer height changes and remains usable in narrow panes;
  reduced-motion preference stops waveform animation. The transcript reserves
  the bar's measured height so the newest assistant reply is not covered.
  Emerald Afterglow and Twilight Mountains use theme-matched bar materials,
  controls, and waveform colors.
  The Composer model menu remains above the bar while open so its model list
  and controls are visible and clickable.
  It does not dim, blur, or block the chat or workspace. Done transcribes the
  spoken turn and sends it through the current session's normal prompt and
  queue rules. The dock shows recording, transcription, waiting, and speaking
  states. The user can stop spoken output, speak again, or end the mode.
  Listening resumes after playback ends. Existing agent permission
  policies continue to apply.
- A session switch or unmount ends capture and playback. Late speech results
  cannot appear in a different chat. Cancellation also aborts an owned Parakeet
  download or worker request and an owned hosted request; it does not merely
  hide the result. A failed assistant turn returns Voice mode to its ready state.
- Settings > Models > Speech selects local or hosted transcription. Local is the
  default and requires no key. Local model selection applies to dictation and
  voice mode: Parakeet v2 INT8 is the English default, Parakeet v3 INT8 handles
  25 European languages, and Whisper Tiny remains a lightweight fallback.
  Hosted has endpoint, model, and environment
  variable name fields. Voice replies are on by default for existing settings.
  Turning them off keeps voice input and text replies, skips speech synthesis,
  and resumes listening when the reply completes. The reply voice selector is
  unavailable while voice replies are off.
- Local model files live in application data and are downloaded on first use.
  First use shows request-specific download progress, then model-loading and
  transcription states. Parakeet archives stream directly into extraction of the
  four catalogued model files without storing a second archive copy. Preparation
  requires at least 850 MB free space and has a 15-minute deadline; insufficient
  space and failed downloads produce errors without a cloud fallback.
  Parakeet recognition runs in a dedicated worker so model loading and decoding
  do not block Electron main. Audio is held only during the
  active recording/transcription request; it is not saved to chat history or
  a workspace file. Each speech request has its own identity, progress, and
  cancellation. Only the main renderer can invoke speech IPC; one transcription
  runs at a time. Parakeet decoding has a 90-second deadline; worker failures,
  timeout, cancellation, window reload, and shutdown release owned pending work.
  A new request can restart the worker, and late events from the prior worker
  cannot settle it. Native Sherpa libraries are unpacked alongside their
  dependencies in packaged builds. Whisper cancellation suppresses late output;
  its native inference cannot be preempted. Hosted mode sends audio to the
  configured endpoint.
- Main accepts only bounded 16 kHz mono PCM WAV recordings. The microphone
  permission allows audio for the main window only, independently of plugin
  grants. Quiet speech above the peak silence threshold still reaches the
  selected model. HTTPS is required for hosted endpoints except loopback HTTP.
- The main window's Chromium permission handlers also permit sanitized clipboard
  writes, preserving prompt, response, and code Copy actions. Clipboard reads,
  camera access, and clipboard/microphone requests from other WebContents remain
  denied. Speech permissions do not replace the existing copy capability.

See [ADR 0244](../../adr/0244-local-first-speech-input.md).
