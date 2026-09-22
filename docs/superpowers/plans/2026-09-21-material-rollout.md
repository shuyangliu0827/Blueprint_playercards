# 14-material online rollout

Goal: Replace public five-material presentation and issuance with the approved 14-material recipes; draw ORIGINAL 98%, AURA 1%, ANIMATION 1%, independent of equal-weight material selection; deploy to existing Vercel site.

- [x] Add versioned collectible configuration, deterministic independent material/series buckets, archived-version compatibility and probability boundary tests.
- [x] Bind AI artwork style to server draw, never client-selected series. Preserve retry identity.
- [x] Replace Studio sample selector, public descriptions and result metadata with 14 materials; remove series choice and issued-card material switching.
- [x] Capture approved CSS material for PNG/share exports, replace old review routes with new gallery. Keep historical code only where needed for archived results and layout.
- [x] Run checks, production build and browser flow checks with mocked provider (no paid generation), deploy existing linked Vercel project and verify public URLs.

Default recipe parameters are the user's approved JSON in docs/cards-css-materials.md. First draw has same probabilities as subsequent draws, because all 14 outcomes have foil. Old v0.1.0 request envelopes retain legacy draw behavior. No new database or unrelated application changes.
