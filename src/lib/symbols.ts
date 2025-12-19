import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type SymbolsConfig = {
  issueType: Record<string, string>;
  status: Record<string, string>;
  fallback?: {
    issueType?: string;
    status?: string;
  };
};

const DEFAULT_SYMBOLS_PATH = resolve('config', 'symbols.json');

let cached: SymbolsConfig | null = null;

export function getDefaultSymbols(): SymbolsConfig {
  if (cached) return cached;

  try {
    const raw = readFileSync(DEFAULT_SYMBOLS_PATH, 'utf8');
    cached = JSON.parse(raw) as SymbolsConfig;
  } catch (error) {
    // Fall back to an empty symbols configuration if the file cannot be read or parsed.
    // This avoids uncaught exceptions while still returning a valid SymbolsConfig shape.
    // eslint-disable-next-line no-console
    console.warn(
      `Failed to load default symbols from "${DEFAULT_SYMBOLS_PATH}":`,
      error
    );
    cached = {
      issueType: {},
      status: {},
      fallback: {},
    };
  }
  return cached;
}
