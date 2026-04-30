import {
  composeRailVerdict,
  type GatewayDecision,
  type JudgeOutput,
  RailDecision,
  type TraderOutput,
} from '@ankit-prop/contracts';
import type { GatewayStage } from '../pipeline/stages.ts';

export function createInProcessReplayGateway(): GatewayStage {
  return {
    decide(input): GatewayDecision {
      return decideInProcess(input.traderOutput, input.judgeOutput, input.context.decidedAt);
    },
  };
}

function decideInProcess(
  traderOutput: TraderOutput,
  judgeOutput: JudgeOutput | null,
  decidedAt: string,
): GatewayDecision {
  if (judgeOutput?.verdict !== 'APPROVE' && judgeOutput !== null) {
    return {
      status: 'not_submitted',
      reason: 'judge_reject',
      traderOutput,
      railVerdict: null,
    };
  }
  if (traderOutput.action === 'HOLD') {
    return {
      status: 'not_submitted',
      reason: 'hold',
      traderOutput,
      railVerdict: null,
    };
  }
  if (judgeOutput === null) {
    return {
      status: 'not_submitted',
      reason: 'judge_reject',
      traderOutput,
      railVerdict: null,
    };
  }

  // Replay-only cheat: the real hard rails still live in svc:gateway. The
  // runner only reaches this allow path after explicit risk context is present.
  const railVerdict = composeRailVerdict(
    [
      RailDecision.parse({
        rail: 'idempotency',
        outcome: 'allow',
        reason: 'replay gateway double allow',
        detail: { replayOnly: true },
        decidedAt,
      }),
    ],
    decidedAt,
  );
  return {
    status: 'submitted',
    traderOutput,
    railVerdict,
    submittedAt: decidedAt,
  };
}
