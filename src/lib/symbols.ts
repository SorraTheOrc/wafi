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
  const raw = readFileSync(DEFAULT_SYMBOLS_PATH, 'utf8');
  cached = JSON.parse(raw) as SymbolsConfig;
  return cached;
}
