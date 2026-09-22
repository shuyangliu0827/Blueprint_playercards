# Screenshot demo's actual source

https://github.com/kongyo2/cards-css
Demo: https://kongyo2.github.io/cards-css/
Installed exact npm version: @kongyo2/cards-css 0.5.0 (package-lock.json pins integrity).
MIT © kongyo2. See LICENSE.

The unmodified engine is consumed through the package, including all 14 effects and seeded procedural textures. The stylesheet is a derived photo-friendly adaptation: scripts/build-photo-foil.mjs replaces 43 pointer-centred radial illumination gradients with full-width linear illumination fields, preserving pattern textures, palettes and intrinsic oil rings. The generated stylesheet is src/styles/cards-css-photo.css.

Our wrapper uses bounded brightness and contrast, full-card geometry, persistent reflection, soft-light compositing and a subdued wide glare band. Strength controls texture opacity and saturation. These adaptations are in src/styles/cards-css-adapter.css and src/render/cards-css.ts.

The previously vendored simeydotme recipes are retained as provenance of the first iteration, but no longer imported by the application.
