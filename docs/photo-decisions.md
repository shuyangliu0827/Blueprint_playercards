# Photo and mock-generator decisions

> Superseded for the current Studio on 2026-09-21: whole-person detection and original-photo composition replace the face-only/MockGenerator path. See [person-subject-update.md](person-subject-update.md). Legacy classes remain available but Studio no longer calls them.

- Photo decoding is browser-only. HEIC/HEIF uses the bundled `heic2any`; JPEG and PNG use the browser decoder, including its EXIF-orientation handling.
- Metadata records the original MIME type, byte size, and orientation-correct decoded dimensions. The original decoded image remains available for artwork. Face detection alone uses a temporary canvas whose longest edge is at most 2048 pixels.
- Photo size, accepted canonical MIME types, and the 1024px short-edge warning threshold come from the validated input configuration. HEIF files are locally decoded as the supported HEIC family and expose canonical `image/heic` metadata.
- MediaPipe loads its runtime and model only from `/wasm` and `/models/face-detector.tflite`, runs on CPU in IMAGE mode, and uses confidence 0.4. The caller is responsible for invoking detection only after explicit face-processing consent.
- Yaw is a coarse nose-to-eye-midpoint estimate. Missing, low-confidence, degenerate, or extreme geometry is `UNCERTAIN`; existing pose routing maps that result to front-facing.
- The mock generator never draws identity fields, card IDs, names, or jersey numbers. The chosen photo face is cover-cropped without aspect distortion, with margin into an oval, and never mirrored; mirroring affects only the synthetic body pose so facial identity is not reversed.
- The generator is intentionally local and deterministic-looking. `RealGenerator` only exposes the future contract and throws `NOT_CONFIGURED`.
- Artwork evaluation is explicitly manual in v0: `ManualArtworkEvaluator` returns `pending-manual` and does not imply an automated model or quality score.
