# Changelog

All notable changes to `@triplon/config`. Newest first.

## 0.1.0 — 2026-04-29 05:12 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-130](/ANKA/issues/ANKA-130).

**Added**

- `defineConfig({ schema, sourceFile })` — Bun-native YAML loader with Zod validation and `ConfigLoadError.path`.
- `deriveEnvName` / `pathToEnvName` — deterministic config path to `SCREAMING_SNAKE` env-var name derivation.
- `config:codegen` — deterministic SymbolTagMap JSON Schema and TypeScript type artifact generation, including `--check` freshness mode.
- `@triplon/config/schemas/symbol-tag-map` — worked `SymbolTagMapSchema` example for `config/symbol-tag-map.example.yaml`.
