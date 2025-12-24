import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { getAgentFromProc } from '../src/commands/ooda.js';

// Mock FS reads for /proc
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<any>('node:fs');
  return {
    ...actual,
    readFileSync: (path: string, enc: string) => {
      if (path === '/proc/123/environ') return 'BD_ACTOR=patch\0OTHER=1\0';
      if (path === '/proc/124/cmdline') return 'node\0waif\0startWork\0--actor\0map\0\0';
      throw new Error('not found');
    },
  };
});

describe('proc-based agent detection', () => {
  it('reads BD_ACTOR from environ', () => {
    expect(getAgentFromProc('123')).toBe('patch');
  });

  it('reads actor from cmdline fallback', () => {
    expect(getAgentFromProc('124')).toBe('map');
  });
});
