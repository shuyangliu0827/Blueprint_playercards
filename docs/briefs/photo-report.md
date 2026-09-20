# Photo module report

Implemented the browser-only photo and mock-art pipeline in the assigned files.

- `decodePhoto` validates JPEG/PNG/HEIC inputs from the shared input policy, converts HEIC/HEIF locally, preserves original size and canonical MIME metadata, reports Chinese errors, and exposes explicit object-URL cleanup.
- Detection lazily loads the bundled MediaPipe CPU model and local WASM, limits only its temporary processing image to a 2048px longest edge, returns normalized boxes/confidence/coarse yaw, and never fabricates a face result.
- `classifyFaceAngle` is pure and tested for front, left, right, low-confidence, missing, non-finite, extreme, and labeled-keypoint cases. Box normalization clamps to image bounds and discards empty detections.
- `MockGenerator` creates opaque 1380×1485 dark-blue artwork with route-dependent basketball silhouettes, visible arms and ball, an aspect-preserving unmirrored face crop, and visible top-edge pose/mirror debug text. `RealGenerator` throws `NOT_CONFIGURED`; the v0 evaluator reports `pending-manual` only.

Verification: focused Vitest suite passes (4 tests); TypeScript type check passes. Browser integration still depends on the UI calling `detectFaces` only after explicit consent and presenting a picker when more than one face is returned.
