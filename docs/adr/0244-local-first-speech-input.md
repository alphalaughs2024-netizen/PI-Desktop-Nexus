# ADR 0244: Local-first speech input and voice conversation

## Status

Accepted for Nexus speech input.

## Context

Nexus needs editable dictation and a separate voice conversation without making
an OpenAI account or any hosted API key a prerequisite. The renderer is
sandboxed; provider secrets must not cross into it. Browser speech recognition
does not guarantee local processing, so it cannot be the default backend.

## Decision

- The renderer captures microphone audio only after a user action, converts it
  to bounded 16 kHz mono PCM, and sends it over a single allowlisted IPC call.
- Electron main validates the recording and owns transcription. The default
  engine is the open-source Transformers.js runtime with the multilingual
  `Xenova/whisper-tiny` model. It loads lazily and caches downloads in app data.
- A user may select a hosted, OpenAI-compatible multipart transcription
  endpoint. The endpoint and model are settings; an optional API key is read
  from a named process environment variable in main. Its value is never
  persisted or sent to the renderer. HTTPS is required except for loopback.
- Dictation inserts editable text into the current session's draft. Switching
  sessions cancels capture and discards late results.
- Voice mode is a distinct turn-based surface. It sends each spoken turn
  through the existing prompt path and speaks completed assistant replies
  with OS/browser speech synthesis. It does not grant the model microphone
  access or alter agent permissions.
- Main-window microphone permission is audio-only and restricted to its own
  web contents. The permission remains separate from plugin microphone grants.

## Consequences

The first local transcription downloads a model and can take time; subsequent
transcriptions reuse the local cache. Local recognition quality and CPU load
depend on the device. Hosted compatibility depends on the selected service's
support for the transcription multipart response shape. Spoken replies use
installed system voices and may vary by operating system.

## Amendment: Parakeet local models

Parakeet TDT 0.6B v2 INT8 replaces Whisper Tiny as the default local
transcriber. A user can select multilingual Parakeet v3 INT8 or retain Whisper
Tiny for lower resource use. Both dictation and voice mode share this setting.
The Parakeet ONNX models are downloaded into app data on first use and run via
Sherpa ONNX in a dedicated worker thread. The model archives are fetched from
the Sherpa ONNX release catalog; a missing or failed download is reported to
the user rather than silently sending microphone audio to a cloud service.
