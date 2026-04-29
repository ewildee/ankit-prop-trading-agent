function camelToScreaming(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

export function deriveEnvName(path: readonly (string | number)[], prefix = ''): string {
  const name = path
    .map((segment) => camelToScreaming(String(segment)))
    .filter(Boolean)
    .join('_');
  return `${prefix}${name}`;
}

export const pathToEnvName = deriveEnvName;
