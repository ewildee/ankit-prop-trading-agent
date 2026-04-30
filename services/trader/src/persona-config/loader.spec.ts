import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PersonaConfig } from '@ankit-prop/contracts';
import { loadPersonaConfig, resolvePersonaConfigPath } from './loader.ts';

describe('loadPersonaConfig', () => {
  test('loads the checked-in v_ankit_classic params.yaml', async () => {
    const config = await loadPersonaConfig({ personaId: 'v_ankit_classic' });

    expect(() => PersonaConfig.parse(config)).not.toThrow();
    expect(config.personaId).toBe('v_ankit_classic');
    expect(config.instrument).toBe('XAUUSD');
    expect(config.actionCadence).toBe('bar_close');
  });

  test('rejects extra keys, missing fields, and out-of-range values', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'trader-persona-loader-'));
    try {
      const valid = await Bun.file(resolvePersonaConfigPath('v_ankit_classic')).text();
      const cases = [
        ['extra.yaml', `${valid}\nunexpectedTopLevel: true\n`],
        ['missing.yaml', valid.replace('instrument: XAUUSD\n', '')],
        ['out-of-range.yaml', valid.replace('minConfidence: 0.6', 'minConfidence: 1.5')],
      ] as const;

      for (const [name, text] of cases) {
        const path = join(dir, name);
        await writeFile(path, text);
        await expect(loadPersonaConfig({ configPath: path })).rejects.toThrow();
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
