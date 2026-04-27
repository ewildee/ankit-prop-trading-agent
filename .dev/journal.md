# Journal

_Append-only, newest first. Never edit past entries._

## 2026-04-27 18:21 Europe/Amsterdam — v0.0.2

**What was done**

- Executed ANKA-5 onboarding scaffold (BLUEPRINT §0.1).
- Rewrote `.env.example` as the canonical §17.5 + §0.1 template covering
  cTrader app creds, IC demo account, FTMO slot, OpenRouter, alerting,
  telemetry, encryption key, and operating mode.
- Wrote committed templates: `config/accounts.example.yaml` (§17.1) and
  `config/supervisor.example.yaml` (§17.2). Both use only `*_env`
  references — secrets never live in YAML.
- Wrote operator-canonical copies at `~/.config/ankit-prop/accounts.config.yaml`
  and `~/.config/ankit-prop/supervisor.config.yaml` (gitignored host scope).
- Generated a fresh `SECRETS_ENCRYPTION_KEY` via
  `crypto.randomBytes(32).toString('hex')` and seeded `./.env` with
  it; left every other secret blank for the operator to drop in.
- Verified gitignore: `.env` and host `*.config.yaml` ignored, in-repo
  `config/*.example.yaml` whitelisted (via `git check-ignore -v`).

**Findings**

- §0.1 mandates one-pass interview with the operator; the issue
  description further constrains us to never ask for secret values via
  comments. Resolved by splitting: ask non-secret config knobs through a
  single `ask_user_questions` interaction, and use it to confirm the
  operator has populated the secret slots in `./.env` directly.
- OpenRouter probe and cTrader `application_auth` flow are deferred to a
  follow-up heartbeat once the operator returns secret-populated `.env`.
  They require the actual creds and cannot be shadow-tested.

**Decisions**

- Host-scope configs (`~/.config/ankit-prop/*.config.yaml`) are
  generated as `*_env`-only references (no inlined secrets); operator
  edits `.env` to swap real values without touching YAML.
- Bumped umbrella root to `0.0.2` to mark the onboarding-scaffold
  release independently of the in-flight `proc-supervisor` /
  `shared-contracts` work-in-progress.

**Open endings**

- ANKA-5 awaits operator response on the `ask_user_questions`
  interaction. After response: run OpenRouter health probe + cTrader
  OAuth verification, mark T-task closed, return ANKA-5 to `done`.
- Existing untracked supervisor/contracts files (Phase 1 prep, T002) are
  left for that session to commit; not in scope for ANKA-5.

## 2026-04-27 18:16 Europe/Amsterdam — v0.0.1

**What was done**

- Bootstrapped the umbrella monorepo per BLUEPRINT §17 + §0.2 (ANKA-2 Phase 0).
- Wrote root config: `package.json` (Bun workspaces, pinned Biome 2.4.13 + TS 6.0.3, all required scripts), `tsconfig.json` (TS 6 strict, bundler resolution, `bun` types), `biome.json`, `bunfig.toml`, `.gitignore`, `.env.example` per §17.5.
- Created `.dev/` skeleton: `progress.md`, `journal.md`, `decisions.md`, `ideas/`, `discussion/`, `specs/`.
- Seeded `TODOS.md` and `CHANGELOG.md` at v0.0.1.
- Added placeholder package.json files for the four packages and five services from §17 so Bun workspaces resolve cleanly on first `bun install`.
- Added GitHub Actions CI gate (`.github/workflows/ci.yml`) running lint + typecheck + test on push/PR.

**Findings**

- Bun 1.3.13 is the host runtime; matches BLUEPRINT §5.2 pin.
- `https://bun.com/llms.txt` confirms native HTTP/SQLite/cron/glob/spawn/password/test/shell — no npm dependency required for those layers (§5.1).

**Decisions**

- Defer all real package code to later phases. Phase 0 only delivers the skeleton, scripts, and a green CI gate, exactly per the issue's acceptance bullets.
- Workspace placeholders use `private: true` and a no-op `start` script so the supervisor wire-up can land cleanly in Phase 1 without retro-fitting names.
- Co-locate Bun's `bun:test` smoke spec in `packages/shared-contracts/` so `bun test` has at least one assertion to run on first `bun install`.

**Adaptations**

- None. Followed the §17 layout verbatim.

**Open endings**

- Phase 1 (`@triplon/proc-supervisor`) requires the real supervisor implementation; tracked in `TODOS.md` as `T002`.
- `@triplon/config` is a private-registry dependency and is not installed yet; first phase that needs config wiring will pull it in.
