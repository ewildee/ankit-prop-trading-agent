import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  PersonaConfig,
  type PersonaConfig as PersonaConfigType,
  type PersonaId,
} from '@ankit-prop/contracts';

const SERVICE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export type LoadPersonaConfigOptions = {
  readonly personaId?: PersonaId;
  readonly strategyRoot?: string;
  readonly configPath?: string;
};

export async function loadPersonaConfig(
  opts: LoadPersonaConfigOptions = {},
): Promise<PersonaConfigType> {
  const configPath = opts.configPath ?? resolvePersonaConfigPath(opts.personaId, opts.strategyRoot);
  const file = Bun.file(configPath);
  if (!(await file.exists())) {
    throw new Error(`trader persona config missing: ${configPath}`);
  }
  const imported = (await import(`${pathToFileURL(configPath).href}?v=${crypto.randomUUID()}`, {
    with: { type: 'yaml' },
  })) as { default: unknown };
  return PersonaConfig.parse(imported.default);
}

export function resolvePersonaConfigPath(
  personaId = 'v_ankit_classic',
  strategyRoot?: string,
): string {
  return join(strategyRoot ?? join(SERVICE_ROOT, 'strategy'), personaId, 'params.yaml');
}
