# Final frontend/render/photo/export review

## Resolution check — all three findings resolved

Scoped source re-review confirms:

- `CardView` now keeps its canvas mounted and hides it during static fallback. Renderer initialization no longer encounters the missing-canvas state during recovery or a material change. The coordinator independently verified forced-static → dynamic recovery with valid contexts for all five materials; unavailable-WebGL material-switch browser coverage remained in progress at this check.
- `start()` and `newCard()` clear the pending request, job and result. The failed-task alternative explicitly invokes `newCard()` and says “换一张重新制作”; recovery keeps the existing task. Both identified navigation paths therefore stop replaying completed/failed identifiers for newly edited input.
- Thumbnail nicknames now render horizontally at a fixed in-canvas position, with measured font shrinking into a 150-pixel region. The former vertical overflow and footer collision are removed.

The coordinator reports mobile end-to-end success for all four exports, retry/refund/restore with the same draw, and one deduplicated referral visitor. This resolution check made no implementation changes and did not expand into another broad review. The original findings below are retained as review history, **not open issues**.

Scope: `Studio`, `CardView`, browser photo adapters, mock/real generator interfaces, rendering/sharing modules, visual config validation and build configuration. Backend fixes were deliberately excluded. Requirements checked against the supplied original prompt and `docs/delivery-plan.md`; confirmation gates and reuse of old visual examples were treated as authorized exceptions. This review changed no implementation files.

## Original findings — resolved

1. **P1 — Static fallback cannot reliably return to a renderer.** `src/components/CardView.tsx:11,16`: the fallback branch removes the canvas. When `forceStatic` becomes false, the effect calls `setFallback(false)` but immediately returns because `canvas.current` is still null. The subsequent canvas mount does not rerun the effect, so the debug page's “恢复动态 WebGL” control leaves an uninitialized transparent canvas. The same sequence occurs when changing a material after an unavailable-WebGL/low-FPS fallback. Keep the canvas mounted behind the static image, or explicitly initialize after the new canvas is committed. Verify dynamic → forced static → dynamic and unavailable WebGL → material switch.

2. **P1 — Navigation reuses immutable request IDs for changed input.** `src/components/Studio.tsx:21,25-28,32`: `pendingRequest` is cleared only by `newCard()`. The failed-task “返回修改” action only changes the screen, so submitting modified input replays the existing failed job and immediately fails again. A completed result → “返回首页” → “做我的篮球卡” also retains the completed request. Changing nickname/photo and submitting then receives the old complete job; `prepareResult()` synthesizes a different card using the new input but the old card ID, skips completion accounting, and retains the old pose/mirror even if position/hand changed. Make recovery retain an immutable input/photo snapshot, and make an explicit new-generation path clear the request ID before accepting changed input. Verify both navigation sequences and that edited input never regenerates an already completed identifier.

3. **P2 — Valid long English nicknames are clipped in the thumbnail export.** `src/render/sharing.ts:7`: the nickname is drawn vertically at `y = 220 + i * 68` on an 800-pixel-high canvas. A valid 14-letter nickname extends to y=1104 before glyph height; its last five characters cannot appear, and shorter long names overlap the footer at y=650. Fit/wrap the whole nickname inside a bounded text region, with separate Latin/CJK treatment if necessary. Verify the exported PNG using a valid 14-character Latin nickname and a six-character Chinese nickname.

## Checked without another blocking finding

- Material implementation uses one WebGL1 quad with shader normal/noise/specular/dispersion controls; pointer/orientation-to-uniform mapping is pure and platform listeners are separate.
- Both card faces use config-driven text/layout and retain the full card ID binding with reject/shrink rather than ellipsis. Front/back required text remains program-drawn.
- Photo decoding, face detection/model loading, face crop, generation mock and exports operate in the browser; API submission sends metadata rather than image content.
- Card/poster/thumbnail/comparison dimensions are 1500×2100, 1080×1440, 1000×800 and 2400×1600. Poster QR receives the same-origin signed referral URL. Comparison is triggered explicitly.
- Client analytics distinguish presented asset, download trigger and share intent; no fake actual-save event is emitted.
- HMAC/probability implementation is imported only by server code; frontend imports of draw/job types erase at build time. Config checking is part of the build script.

Existing passing build/tests were accepted for routine validation. Findings above come from concrete component state transitions and canvas coordinate analysis; the coordinator is performing browser end-to-end checks in parallel.

Root browser follow-up: no-WebGL material switch to gold passed; all five force-static → dynamic contexts initialize. scripts/render-regressions.mjs completed successfully.
