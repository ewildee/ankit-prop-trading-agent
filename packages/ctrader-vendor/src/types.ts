// §10.3 7-step smoke harness — typed evidence shape consumed by smoke/runner.ts
// and rendered into ADR-0012 (`.dev/decisions.md`) once the gate runs live.

export const SMOKE_STEP_IDS = [
  'app-auth',
  'account-auth',
  'symbols-list',
  'spot-stream',
  'order-roundtrip',
  'reconnect',
  'protobuf-coverage',
] as const;
export type SmokeStepId = (typeof SMOKE_STEP_IDS)[number];

export const SMOKE_OUTCOMES = [
  'pass',
  'fail',
  'skipped-no-creds',
  'skipped-needs-oauth',
  'skipped-needs-prior-step',
  'not-implemented',
] as const;
export type SmokeOutcome = (typeof SMOKE_OUTCOMES)[number];

export interface SmokeStepResult {
  readonly id: SmokeStepId;
  readonly stepNumber: number;
  readonly outcome: SmokeOutcome;
  readonly durationMs: number;
  readonly evidence: Readonly<Record<string, unknown>>;
  readonly error?: string;
}

export interface SmokeReport {
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly host: string;
  readonly accountId: string;
  readonly steps: ReadonlyArray<SmokeStepResult>;
  readonly verdict: 'pass' | 'fail' | 'gated';
}

export const SMOKE_STEP_NUMBERS: Readonly<Record<SmokeStepId, number>> = {
  'app-auth': 1,
  'account-auth': 2,
  'symbols-list': 3,
  'spot-stream': 4,
  'order-roundtrip': 5,
  reconnect: 6,
  'protobuf-coverage': 7,
};
