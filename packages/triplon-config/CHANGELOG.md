# Changelog

All notable changes to `@triplon/config`. Newest first.

## 0.1.1 — 2026-04-29 05:28 Europe/Amsterdam

**Fixed**

- `defineAppConfig().paths.project()` now resolves project config at `config/<name>.config.yaml`, matching BLUEPRINT §17 and the checked-in `config/*.example.yaml` layout.
- Added regression coverage proving `config/symbol-tag-map.config.yaml` overrides the bundled SymbolTagMap example through the package loader.

## 0.1.0 — 2026-04-29 05:12 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-130](/ANKA/issues/ANKA-130).

**Added**

- `defineConfig({ schema, sourceFile })` — Bun-native YAML loader with Zod validation and `ConfigLoadError.path`.
- `deriveEnvName` / `pathToEnvName` — deterministic config path to `SCREAMING_SNAKE` env-var name derivation.
- `config:codegen` — deterministic SymbolTagMap JSON Schema and TypeScript type artifact generation, including `--check` freshness mode.
- `@triplon/config/schemas/symbol-tag-map` — worked `SymbolTagMapSchema` example for `config/symbol-tag-map.example.yaml`.
