# Vendored Spotware OpenAPI proto definitions

Source: <https://github.com/spotware/openapi-proto-messages>
License: MIT (see upstream `LICENSE`)
Pinned commit: `3fd8bddfbe0cfc2ecfda079623dc4e498af11e66` (2025-11-13)

Files in this directory are an **unmodified** copy of the upstream `.proto`
sources at the pinned commit. They are loaded at runtime by `protobufjs@8.0.1`
via `Root.loadSync()`; we do not pre-generate static JS, so any drift between
this directory and `protobufjs`'s view is impossible.

To refresh, edit `scripts/refresh-proto.ts`, bump the pinned SHA, run it, and
re-run `bun run smoke:ctrader` to verify Step 7 (protobuf coverage) still
round-trips every message we use.

Reason this is vendored (BLUEPRINT §10.3): single-maintainer supply-chain risk
on the upstream npm wrappers (`@reiryoku/ctrader-layer`, `ctrader-ts`). Pinning
the source of truth — Spotware's own `.proto` files — and parsing them with
`protobufjs` keeps us insulated from any of those wrappers' lifecycle.
