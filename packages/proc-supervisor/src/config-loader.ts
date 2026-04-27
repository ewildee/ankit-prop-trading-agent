import { SupervisorCfg } from './types.ts';

export async function loadConfigFromFile(path: string): Promise<SupervisorCfg> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`supervisor config not found: ${path}`);
  }
  const text = await file.text();
  return parseConfig(text);
}

export function parseConfig(text: string): SupervisorCfg {
  let raw: unknown;
  try {
    raw = Bun.YAML.parse(text);
  } catch (err) {
    throw new Error(`supervisor config: invalid YAML: ${(err as Error).message}`);
  }
  const result = SupervisorCfg.safeParse(raw);
  if (!result.success) {
    throw new Error(`supervisor config: validation failed: ${result.error.message}`);
  }
  validateDependsOn(result.data);
  return result.data;
}

function validateDependsOn(cfg: SupervisorCfg): void {
  const known = new Set(cfg.services.map((s) => s.name));
  for (const s of cfg.services) {
    for (const dep of s.dependsOn) {
      if (!known.has(dep)) {
        throw new Error(`supervisor config: service "${s.name}" dependsOn unknown "${dep}"`);
      }
      if (dep === s.name) {
        throw new Error(`supervisor config: service "${s.name}" cannot depend on itself`);
      }
    }
  }
}
