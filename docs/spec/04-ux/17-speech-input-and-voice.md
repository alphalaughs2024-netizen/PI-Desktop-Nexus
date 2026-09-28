# Speech input and voice conversation

- Two compact icon controls sit beside existing composer actions: microphone
  for Dictate and audio lines for Voice mode. Each has an accessible label and
  tooltip; no extra toolbar labels are shown.
- Dictate records up to 60 seconds. Done transcribes and inserts plain,
  editable text at the current draft selection. It does not submit. Cancel
  discards audio. A failed or empty result leaves the draft unchanged.
- Voice mode opens a compact floating conversation dock above the composer.
  It does not dim, blur, or block the chat or workspace. Done transcribes the
  spoken turn and sends it through the current session's normal prompt and
  queue rules. The dock shows recording, transcription, waiting, and speaking
  states. The user can stop spoken output, speak again, or end the mode.
  Listening resumes after playback ends. Existing agent permission
  policies continue to apply.
- A session switch or unmount ends capture and playback. Late speech results
  cannot appear in a different chat.
- Settings > Models > Speech selects local or hosted transcription. Local is the
  default and requires no key. Hosted has endpoint, model, and environment
  variable name fields. Reply voice selects an installed system voice.
- Local model files live in application data. Audio is held only during the
  active recording/transcription request; it is not saved to chat history or
  a workspace file. Hosted mode sends audio to the configured endpoint.
- Main accepts only bounded 16 kHz mono PCM WAV recordings. The microphone
  permission allows audio for the main window only, independently of plugin
  grants. HTTPS is required for hosted endpoints except loopback HTTP.

See [ADR 0244](../../adr/0244-local-first-speech-input.md).
