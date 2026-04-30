export { createInProcessReplayGateway } from './gateway/in-process.ts';
export type { LoadPersonaConfigOptions } from './persona-config/loader.ts';
export { loadPersonaConfig, resolvePersonaConfigPath } from './persona-config/loader.ts';
export { runDecision } from './pipeline/runner.ts';
export type {
  AnalystStage,
  AnalystStageInput,
  GatewayStage,
  GatewayStageInput,
  JudgeStage,
  JudgeStageInput,
  PipelineContext,
  PipelineDeps,
  ReflectorStage,
  ReflectorStageInput,
  TraderStage,
  TraderStageInput,
} from './pipeline/stages.ts';
export { createAnalystStub } from './pipeline/stubs/analyst.stub.ts';
export { createJudgeStub } from './pipeline/stubs/judge.stub.ts';
export { createReflectorStub } from './pipeline/stubs/reflector.stub.ts';
export { createTraderStub } from './pipeline/stubs/trader.stub.ts';
export type { TraderReplayInput, TraderReplayResult } from './replay-adapter/from-eval-harness.ts';
export { runTraderReplay } from './replay-adapter/from-eval-harness.ts';
