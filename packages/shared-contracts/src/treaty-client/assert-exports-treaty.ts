export interface TreatyExportSource {
  readonly sourceText: string;
  readonly modulePath?: string;
}

const TYPE_APP_DECLARATION = /\bexport\s+type\s+App\b/;
const TYPE_APP_REEXPORT = /\bexport\s+type\s*\{[^}]*\bApp\b[^}]*\}/s;
const INLINE_TYPE_APP_REEXPORT = /\bexport\s*\{[^}]*\btype\s+App\b[^}]*\}/s;

export function assertExportsTreaty(target: string | TreatyExportSource): void {
  const sourceText = typeof target === 'string' ? target : target.sourceText;
  const modulePath =
    typeof target === 'string' ? 'service index.ts' : (target.modulePath ?? 'service index.ts');
  const sourceWithoutComments = stripTypescriptComments(sourceText);

  if (
    TYPE_APP_DECLARATION.test(sourceWithoutComments) ||
    TYPE_APP_REEXPORT.test(sourceWithoutComments) ||
    INLINE_TYPE_APP_REEXPORT.test(sourceWithoutComments)
  ) {
    return;
  }

  throw new Error(`${modulePath} must export a type-only Treaty App type`);
}

function stripTypescriptComments(sourceText: string): string {
  return sourceText.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
