#!/usr/bin/env bun
// `bun run smoke:ctrader` entry — reads env, runs the §10.3 harness, prints
// the JSON report. Exit codes: 0 = pass, 1 = fail, 2 = gated (creds or OAuth
// missing). Gated is non-zero on purpose so CI / supervisor can route an
// operator-action alert.

import { runSmoke, type SmokeRunnerEnv } from './runner.ts';

const report = await runSmoke({ env: process.env as SmokeRunnerEnv });
console.log(JSON.stringify(report, null, 2));

process.exit(report.verdict === 'pass' ? 0 : report.verdict === 'fail' ? 1 : 2);
