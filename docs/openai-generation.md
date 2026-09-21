# OpenAI artwork generation

The MVP sends 1–3 consented photographs to OpenAI from the server. The browser converts every photograph to JPEG and sends the exact encoded main-photo dimensions and byte size in `input.photo`. The main photograph establishes the selected person and pose; references support identity. The provider generates text-free artwork; card identity, frame, logo, footer and foil are deterministic browser rendering.

Set `OPENAI_API_KEY` in the server environment, along with the existing `DRAW_HMAC_SECRET` and `IP_HASH_SALT`. Restart the server after changing configuration. The key is never returned to the browser. GET `/api/generate` reports `{configured, model}`. An absent key produces `PROVIDER_NOT_CONFIGURED`; no mock image is substituted.

POST `/api/generate` accepts multipart fields `requestId`, `input` (CardInput JSON), `series` (`classic`, `aura`, `animation`), `subject` (normalized x, y, w, h, confidence JSON), and 1–3 repeated `photos` JPEG files. The signed `bp_anon` cookie issued by `/api/preview` is required. Main metadata must match the JPEG. Per-file limit is 10 MB; total multipart limit is 30.1 MB; dimensions are 64–8192 pixels and at most 32 MP. Uploaded names are discarded before forwarding. Card declarations and player fields use existing validation.

The server calls `https://api.openai.com/v1/images/edits`, with `model=gpt-image-2`, `quality=high`, `size=1024x1536`, `output_format=png`, `n=1`, and repeated `image[]`. There are no automatic paid retries. Timeout is four minutes; a timeout cannot guarantee the upstream provider has canceled billing. A new request after failure is an explicit user operation.

The server reserves quota before the call, returns `{artwork: PNG data URL, job}` only after a valid provider response, and releases the reservation on failure. The browser calls the existing `complete` action only after successful local rendering. Timing-based preview polling cannot advance live jobs. Provider failures cannot be restored via the old mock success path. Local `render-failed` can be restored with existing artwork and completed without another provider call.

Request IDs bind to the input, series, subject and image bytes. Concurrent/repeated matching IDs share one promise; changed payloads or other sessions are rejected. At most four upstream calls and eight cached results/failures are retained per process. Completed cache entries expire after 30 minutes, or earlier under capacity pressure. A known ID with missing artwork is rejected, never silently regenerated. Output JSON is bounded to 24 MB. Raw photographs are not persisted to disk or logged; artwork is temporarily cached in process memory. OpenAI processing is subject to that account's provider retention settings.

This remains an internal single-process preview. Quota, identity, deduplication and artwork cache are volatile, and reset on restart; multiple replicas do not share them. The existing preview job retention also bounds request tombstones. Before public/billable use, move these records and distributed locking to durable shared storage and configure platform request-size/runtime limits. In particular, hosting environments may impose upload limits lower than the application's 30.1 MB cap.

Verification uses mocked provider HTTP responses only. No live provider call or paid generation is part of automated tests.

## Integration verification (2026-09-21)
- `npm run check`: 261 tests across 19 files, type checking and configuration validation passed.
- `npm run build`: production build passed, including `/api/generate` and `/debug/mvp-material`.
- `node scripts/check-mvp-flow.mjs`: missing-key blocking, actual browser person detection, three-photo multipart, AURA/ANIMATION distinct requests/templates, dynamic foil pixel changes and 1000×1400 export passed. Forced serialization failure plus lost `render-failed` response restored cached artwork without another provider request. Provider transport is mocked; these results do not establish real model visual quality.
- `node scripts/check-person-photo.mjs public/assets/mvp/demo-photo.jpg`: eight people found in back-facing dunk photo; consent revocation during decode prevented detection; no page errors.
- Browser checks: 390px input page has no horizontal overflow; all five material comparison cards rendered without errors.
- Real local HTTP: unconfigured status, unsigned POST 401, signed unconfigured POST 503 confirmed. No real OpenAI request was made.

The material viewer is `/debug/mvp-material`; it intentionally uses the same original photo in every template and labels itself as a template/material check. The AURA/ANIMATION artistic transformation is performed by the provider during generation. Material protection is a conservative central/typography mask, not per-person silhouette segmentation. Downloads capture the resting material state as a static PNG; pointer/tilt motion is available in the webpage.

OpenAI request format reference: https://developers.openai.com/api/reference/resources/images/methods/edit
