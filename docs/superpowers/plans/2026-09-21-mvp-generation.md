# MVP Generation Implementation Plan
> For agentic workers: use subagent-driven-development; execute in current authorized feature workspace.
**Goal:** Real per-input OpenAI artwork in fixed templates with dynamic foil.
**Architecture:** Server generation service uses signed preview sessions and reservations; browser uploads decoded photographs, renders returned text-free artwork into deterministic template, overlays real-time material.
**Tech Stack:** Next 16, React 19, TypeScript, Canvas, WebGL, OpenAI HTTP API.
**Spec:** ../specs/2026-09-21-mvp-generation.md
## Global constraints
No mock success; no browser secrets; 1–3 photos; full subject allowed without face; no fabricated name; no paid automatic retries.
## Task 1 — Provider and route
Create server image-generation service and /api/generate GET status/POST multipart. Own server and route tests, env example and backend docs. POST fields requestId,input(JSON CardInput),series(classic|aura|animation),subject(JSON normalized x,y,w,h,confidence), photos(File[] JPEG). Response {artwork:string data URL,job:JobView}. Service reserves real jobs using existing preview lifecycle, binds request fingerprint, caches in-flight/success, rejects mismatching reuse, releases failure. UI calls complete only after rendering. GET {configured,model}. Add tests for validation, unconfigured, ownership, concurrency/idempotency, provider failure and no fake output.
## Task 2 — Fixed templates and dynamic material
Create render/mvp-card.ts and components/MvpCardView.tsx plus isolated CSS. Export type CardSeries='classic'|'aura'|'animation'; renderMvpCard({artwork:CanvasImageSource,data:CardData,series,tier,includeMaterial?:boolean}):Promise<HTMLCanvasElement>. MvpCardView props {front,back?,tier,series?,interactive?,forceStatic?}. Keep legacy modules compatible. Fixed 5:7 artwork/frame/logo/name treatment and spatial protection. Dynamic distinct silver bands, gold concentric rings, prism facets; pointer/tilt and reduced-motion handling; deterministic material export. Add focused tests and inspect browser.
## Task 3 — UI integration
Root owns Studio.tsx and upload client helper. Replace mock job polling with multipart generation, keep fields and people selection, add reference photos up to3 and series selection. Keep cache for render retry; missing-key and real failures visible; updated consent/privacy. Use deterministic renderer and new material view in results; sample cards explicitly marked examples. Update share copy. Browser check missing-key and mocked network success using two distinct inputs plus export; run typecheck, tests and production build.
## Review
Review server/renderer deliverables then full flow, fix findings, document no-key live verification limitation.
