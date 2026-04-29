# Changelog

All notable changes to `@triplon/config`. Newest first.

## 0.2.0 — 2026-04-29 09:22 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-165](/ANKA/issues/ANKA-165).

**Added**

- Generated SymbolTagMap loader artifact with `createSymbolTagMapConfig()` and `loadSymbolTagMapConfig(path?)`.
- Codegen support for loader artifacts alongside JSON Schema and generated types.
- Package export `@triplon/config/generated/symbol-tag-map`.

## 0.1.2 — 2026-04-29 05:49 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-149](/ANKA/issues/ANKA-149) after [ANKA-140](/ANKA/issues/ANKA-140) review feedback.

**Fixed**

- `defineAppConfig` honours user > project precedence (BLUEPRINT §17.1).

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
