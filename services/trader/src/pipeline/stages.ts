import type {
  AnalystOutput,
  GatewayDecision,
  JudgeInput,
  JudgeOutput,
  PersonaConfig,
  TraderOutput,
} from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';

type MaybePromise<T> = T | Promise<T>;

export type PipelineContext = {
  readonly runId: string;
  readonly paramsHash: string;
  readonly decidedAt: string;
};

export type AnalystStageInput = {
  readonly bar: Bar;
  readonly persona: PersonaConfig;
  readonly context: PipelineContext;
};

export type TraderStageInput = AnalystStageInput & {
  readonly analystOutput: AnalystOutput;
};

export type JudgeStageInput = {
  readonly judgeInput: JudgeInput;
  readonly bar: Bar;
  readonly persona: PersonaConfig;
  readonly context: PipelineContext;
};

export type GatewayStageInput = {
  readonly bar: Bar;
  readonly persona: PersonaConfig;
  readonly context: PipelineContext;
  readonly analystOutput: AnalystOutput;
  readonly traderOutput: TraderOutput;
  readonly judgeOutput: JudgeOutput | null;
};

export type ReflectorStageInput = GatewayStageInput & {
  readonly gatewayDecision: GatewayDecision;
};

export interface AnalystStage {
  analyze(input: AnalystStageInput): MaybePromise<AnalystOutput>;
}

export interface TraderStage {
  decide(input: TraderStageInput): MaybePromise<TraderOutput>;
}

export interface JudgeStage {
  evaluate(input: JudgeStageInput): MaybePromise<JudgeOutput>;
}

export interface GatewayStage {
  decide(input: GatewayStageInput): MaybePromise<GatewayDecision>;
}

export interface ReflectorStage {
  reflect(input: ReflectorStageInput): MaybePromise<void>;
}

export type PipelineDeps = {
  readonly analyst: AnalystStage;
  readonly trader: TraderStage;
  readonly judge: JudgeStage;
  readonly gateway: GatewayStage;
  readonly reflector: ReflectorStage;
  readonly runId?: string;
  readonly paramsHash?: string;
  readonly now?: () => Date;
  readonly buildJudgeInput?: (
    input: TraderStageInput & { traderOutput: TraderOutput },
  ) => JudgeInput;
};
