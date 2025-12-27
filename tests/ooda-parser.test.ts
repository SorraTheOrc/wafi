import { describe, it, expect } from 'vitest';
import { mapToInternalEvent, redactSensitive, stableStringify } from '../src/lib/ooda-ingester.js';

describe('ooda ingester parser and redaction', () => {
  it('parses valid payload to internal model', () => {
    const input = { type: 'agent.started', payload: { agent: { name: 'map' }, message: { content: 'hi' }, ts: '2024-01-01T00:00:00Z' } };
    const mapped = mapToInternalEvent(input);
    expect(mapped.agent).toBe('map');
    expect(mapped.event).toBe('agent.started');
    expect(mapped.timestamp).toBe('2024-01-01T00:00:00Z');
    expect(mapped.message).toBe('hi');
  });

  it('skips invalid JSON lines via stableStringify on objects', () => {
    const obj = { b: 2, a: 1 };
    const str = stableStringify(obj);
    expect(str).toBe('{"a":1,"b":2}');
  });

  it('redacts sensitive keys recursively', () => {
    const input = {
      token: 'secret-token',
      nested: {
        password: 'p',
        inner: { secretKey: 'v', other: 'ok' },
      },
    };
    const redacted = redactSensitive(input);
    expect(redacted.token).toBe('[REDACTED]');
    expect(redacted.nested.password).toBe('[REDACTED]');
    expect(redacted.nested.inner.secretKey).toBe('[REDACTED]');
    expect(redacted.nested.inner.other).toBe('ok');
  });
});
