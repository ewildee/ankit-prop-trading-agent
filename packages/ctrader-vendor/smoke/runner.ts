// §10.3 7-step smoke runner. Phase 2.1 (ANKA-12) ships only the orchestration:
// each step detects its prerequisites (env, refresh-token presence) and emits a
// typed evidence record. Live transport (WSS connect, ProtoBuf encode/decode,
// order place/close, reconnect) is implemented in ANKA-13/14/15 and slots into
// the same step boundary.

import { runProtobufCoverage } from '../src/protobuf-coverage.ts';
import { RefreshTokenStore } from '../src/secret-store.ts';
import {
  SMOKE_STEP_NUMBERS,
  type SmokeOutcome,
  type SmokeReport,
  type SmokeStepId,
  type SmokeStepResult,
} from '../src/types.ts';

export interface SmokeRunnerEnv {
  readonly CTRADER_CLIENT_ID?: string;
  readonly CTRADER_CLIENT_SECRET?: string;
  readonly CTRADER_REDIRECT_URI?: string;
  readonly BROKER_ACCT_FTMO_TRIAL_1?: string;
  readonly SECRETS_ENCRYPTION_KEY?: string;
  readonly CTRADER_HOST?: string;
}

export interface SmokeRunnerOptions {
  readonly env: SmokeRunnerEnv;
  readonly secretsRootDir?: string;
  readonly clock?: () => number;
}

interface StepCtx {
  readonly env: SmokeRunnerEnv;
  readonly accountId: string;
  readonly tokenStore: RefreshTokenStore | null;
  readonly missingCreds: ReadonlyArray<string>;
}

interface StepRun {
  readonly id: SmokeStepId;
  readonly run: (
    ctx: StepCtx,
  ) => Promise<{ outcome: SmokeOutcome; evidence: Record<string, unknown>; error?: string }>;
}

const HOST_DEFAULT = 'wss://demo.ctraderapi.com:5035/';
const REQUIRED_CREDS: ReadonlyArray<keyof SmokeRunnerEnv> = [
  'CTRADER_CLIENT_ID',
  'CTRADER_CLIENT_SECRET',
  'CTRADER_REDIRECT_URI',
  'BROKER_ACCT_FTMO_TRIAL_1',
  'SECRETS_ENCRYPTION_KEY',
];

const STEPS: ReadonlyArray<StepRun> = [
  {
    id: 'app-auth',
    run: async (ctx) => {
      if (ctx.missingCreds.length > 0) {
        return { outcome: 'skipped-no-creds', evidence: { missing: ctx.missingCreds } };
      }
      // Live ProtoOAApplicationAuthReq lands in ANKA-13 (transport).
      return {
        outcome: 'not-implemented',
        evidence: {
          host: ctx.env.CTRADER_HOST ?? HOST_DEFAULT,
          message: 'ProtoOAApplicationAuthReq scaffolded; transport lands in ANKA-13',
        },
      };
    },
  },
  {
    id: 'account-auth',
    run: async (ctx) => {
      if (ctx.missingCreds.length > 0) {
        return { outcome: 'skipped-no-creds', evidence: { missing: ctx.missingCreds } };
      }
      if (!ctx.tokenStore || !(await ctx.tokenStore.exists(ctx.accountId))) {
        return {
          outcome: 'skipped-needs-oauth',
          evidence: {
            accountId: ctx.accountId,
            unblockAction:
              'run `bun run ctrader:oauth` (lands in ANKA-13) to seed refresh_token.enc',
          },
        };
      }
      return {
        outcome: 'not-implemented',
        evidence: { accountId: ctx.accountId, message: 'ProtoOAAccountAuthReq scaffolded' },
      };
    },
  },
  {
    id: 'symbols-list',
    run: async () => ({
      outcome: 'skipped-needs-prior-step',
      evidence: { dependsOn: 'account-auth' },
    }),
  },
  {
    id: 'spot-stream',
    run: async () => ({
      outcome: 'skipped-needs-prior-step',
      evidence: { dependsOn: 'symbols-list', requiredDurationMs: 60_000 },
    }),
  },
  {
    id: 'order-roundtrip',
    run: async () => ({
      outcome: 'skipped-needs-prior-step',
      evidence: { dependsOn: 'spot-stream', volumeLots: 0.01 },
    }),
  },
  {
    id: 'reconnect',
    run: async () => ({
      outcome: 'skipped-needs-prior-step',
      evidence: { dependsOn: 'order-roundtrip', backoffMs: '1000..30000' },
    }),
  },
  {
    id: 'protobuf-coverage',
    run: async () => ({
      outcome: 'skipped-needs-prior-step',
      evidence: {
        dependsOn: 'app-auth',
        messages: [
          'ProtoOAApplicationAuthReq',
          'ProtoOAAccountAuthReq',
          'ProtoOADealListReq',
          'ProtoOAExecutionEvent',
          'ProtoOAAmendPositionSLTPReq',
          'ProtoOAClosePositionReq',
        ],
      },
    }),
  },
];

export async function runSmoke(opts: SmokeRunnerOptions): Promise<SmokeReport> {
  const clock = opts.clock ?? (() => Date.now());
  const startedAt = new Date(clock()).toISOString();
  const env = opts.env;
  const accountId = env.BROKER_ACCT_FTMO_TRIAL_1 ?? '';

  const missingCreds = REQUIRED_CREDS.filter((k) => !env[k] || String(env[k]).length === 0);

  const tokenStore =
    env.SECRETS_ENCRYPTION_KEY && env.SECRETS_ENCRYPTION_KEY.length === 64
      ? new RefreshTokenStore({
          rootDir: opts.secretsRootDir ?? 'data/secrets',
          encryptionKeyHex: env.SECRETS_ENCRYPTION_KEY,
        })
      : null;

  const ctx: StepCtx = { env, accountId, tokenStore, missingCreds };

  const steps: SmokeStepResult[] = [];
  for (const step of STEPS) {
    const t0 = clock();
    let outcome: SmokeOutcome;
    let evidence: Record<string, unknown>;
    let error: string | undefined;
    try {
      const r = await step.run(ctx);
      outcome = r.outcome;
      evidence = r.evidence;
      error = r.error;
    } catch (e) {
      outcome = 'fail';
      evidence = {};
      error = e instanceof Error ? e.message : String(e);
    }
    const result: SmokeStepResult = {
      id: step.id,
      stepNumber: SMOKE_STEP_NUMBERS[step.id],
      outcome,
      durationMs: clock() - t0,
      evidence,
      ...(error !== undefined && { error }),
    };
    steps.push(result);
  }

  const verdict: SmokeReport['verdict'] = steps.some((s) => s.outcome === 'fail')
    ? 'fail'
    : steps.every((s) => s.outcome === 'pass')
      ? 'pass'
      : 'gated';

  return {
    startedAt,
    finishedAt: new Date(clock()).toISOString(),
    host: env.CTRADER_HOST ?? HOST_DEFAULT,
    accountId,
    steps,
    verdict,
  };
}
