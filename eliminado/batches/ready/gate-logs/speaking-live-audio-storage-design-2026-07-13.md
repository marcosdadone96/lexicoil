# Sprechen Live — audio persistence design (research only)

**Date:** 2026-07-13  
**Status:** design proposal — **do not implement yet**  
**Context:** After a real-voice Sprechen session, users should replay **real** conversation audio (user + partner), not only the Partner:/Kandidat: transcript.

---

## 1. What Gemini Live returns (format + weight)

Official Live API (and this lab’s client) use **raw little-endian 16-bit PCM mono**:

| Direction | MIME / rate | Bytes/sec | MB/min |
|-----------|-------------|-----------|--------|
| **User → API** | `audio/pcm;rate=16000` | 16 000 × 2 = **32 000** | **~1.92 MB/min** of *streamed* mic time |
| **API → client** | PCM @ **24 kHz** (always) | 24 000 × 2 = **48 000** | **~2.88 MB/min** of *played* partner audio |

**Session wall-clock ≠ PCM minutes.** Push-to-talk only uploads while the button is held; partner audio only while the model speaks. A 5‑minute exam with sparse talk might be ~1–3 min of PCM total.

**Both sides raw, continuous talk:** ≈ **4.8 MB/min** (1.92 + 2.88).  
**Typical PTT exam (guess):** ~**2–6 MB** for 3–8 min wall sessions (highly usage-dependent).

No codec from Live itself — only PCM chunks over the WebSocket (`inlineData` base64).

---

## 2. Storage options in current infra

### A. Netlify Blobs (already used: vocab cache, speaking session state, TTS cache)

- **Hard limit:** individual object ≤ **5 GB** (PCM sessions are fine size-wise).
- **Fit:** same `@netlify/blobs` path as `vocab-cache` / `tts` — low ops friction.
- **Risks:** Blobs are metered via **Netlify credits** (bandwidth + requests), not a simple $/GB line item. Multi‑MB binary blobs + repeated playback inflate **egress**. Not ideal as a long-term media CDN for hundreds of users without retention caps.
- **Verdict:** **OK for MVP / lab / low volume** with retention + delete-on-expiry. **Revisit** before “every Pro user keeps forever.”

### B. Alternatives (if Blobs cost/ops become painful)

| Option | Pros | Cons |
|--------|------|------|
| **R2 / S3 / GCS** + signed URLs | Cheap storage, CDN-friendly | New vendor, IAM, billing |
| **Client-only** (IndexedDB / download WAV) | No server PII storage | Lost on clear data; no cross-device |
| **Supabase Storage** (auth already) | User-scoped buckets, RLS | Extra product surface |

**Recommendation for v1:** Netlify Blobs with **TTL + user delete**, keyed by `userId/sessionId`. Plan migration to object storage if retained audio grows past ~tens of GB.

---

## 3. Transcode: needed?

| Keep raw PCM/WAV | Encode Opus/WebM or AAC/MP3 |
|------------------|-----------------------------|
| Trivial to assemble from lab buffers | ~5–15× smaller typical speech |
| Browser can play WAV via AudioContext or `<audio>` | Better for long-term storage + mobile data |
| Heavy on disk/egress | Needs encode step (client `MediaRecorder`/`AudioEncoder`, or serverless ffmpeg) |

**Recommendation:** **Yes, transcode before persist** — preferably **client-side Opus in WebM** (or AAC) after the session ends, then upload one blob. Avoid storing dual raw PCM streams long-term.

Complexity: medium (mix user+partner timelines into one stereo or interleaved mono with timestamps, then encode). Cost: mostly **CPU on device**; serverless ffmpeg adds function time + dependency.

---

## 4. Privacy / retention

`privacy.html` (June 2026) covers account, learning data, AI text processing (Anthropic), etc. It does **not** mention:

- Recording / storing the user’s **real microphone voice**
- Gemini Live as an audio processor
- Retention period for biometric-adjacent voice data

Hören audio is **TTS / synthetic**, not user voice — different risk class.

**Required before shipping replay storage:**

1. Explicit **consent** before first Live mic session (“we may store this recording so you can replay it”).
2. Privacy policy update: voice recordings, purpose (practice replay), processors (Google Gemini Live for realtime; storage vendor), retention (e.g. **30–90 days** or until user deletes), deletion rights.
3. Server-side: encrypted-at-rest via blob provider defaults; **no public keys**; auth-gated playback URLs; optional auto-purge job.

---

## 5. Cost sketch (storage only, rough)

Assumptions: **100 active users**, each keeps **4 sessions** of **~5 min wall**, compressed to **~0.4–0.8 MB/min** conversation audio → **~2–4 MB/session**.

| Metric | Low | Mid | High |
|--------|-----|-----|------|
| Size/session | 2 MB | 3 MB | 6 MB (less compression / both sides) |
| Total retained | 100×4×2 = **0.8 GB** | **1.2 GB** | **2.4 GB** |
| Object storage @ ~$0.015/GB·mo | **~$0.01–0.04/mo** | | |
| Raw PCM instead (~5 MB/min × 3 min speak) | easily **5–15×** larger | | |

**API cost** (Live tokens) dominates storage cost at this scale. Storage is cheap if compressed + retained limited; **egress** on frequent replay matters more on Netlify Blobs.

---

## 6. Proposed architecture (not built)

```
[Live WS session]
  → client buffers PCM in + PCM out with timestamps
  → on soft-close: mix → encode Opus/WebM (or WAV for lab)
  → POST /api/speaking-session-audio (auth)
       → Netlify Blobs: speaking-audio/{userId}/{sessionId}.webm
       → metadata in existing speaking session blob / DB: audioKey, durationMs, consentAt
[Review UI]
  → transcript (existing Partner:/Kandidat:)
  → <audio controls src="signed-or-authed URL">
  → delete session → delete blob + metadata
```

**Lab path first:** optional “save audio locally” download (WAV) to validate UX without Blobs; then production upload path.

**Out of scope for first build:** multi-device sync of huge archives, public sharing links, server-side real-time mux during the call.

---

## Evidence pointers

- Lab client already sends `audio/pcm;rate=16000` and plays 24 kHz PCM (`lab/speaking-live-mic.html`).
- Google Live docs: raw 16-bit PCM in/out; `usageMetadata` on server messages.
- Netlify Blobs: max object 5 GB; used today for small JSON/caches — not yet for multi-MB media.
- Privacy: `/privacy` — no user-voice retention policy yet.
