import type { ReflectorStage } from '../stages.ts';

export function createReflectorStub(): ReflectorStage {
  return {
    reflect() {},
  };
}
