import { describe, expect, it } from 'vitest';
import { classify } from '../src/commands/ooda.js';

describe('ooda classify', () => {
  it('marks busy for keywords and bd ids', () => {
    expect(classify('Map busy wf-cvz')).toEqual({ status: 'Busy', reason: 'keyword' });
    expect(classify('agent running')).toEqual({ status: 'Busy', reason: 'keyword' });
    expect(classify('map-wf-cvz.1')).toEqual({ status: 'Busy', reason: 'keyword' });
  });

  it('marks free for idle/empty titles', () => {
    expect(classify('idle')).toEqual({ status: 'Free', reason: 'idle-title' });
    expect(classify('   ')).toEqual({ status: 'Free', reason: 'idle-title' });
  });

  it('uses process signals when no keywords', () => {
    expect(classify('doing stuff', 'R', '0.0')).toEqual({ status: 'Busy', reason: 'process-state' });
    expect(classify('doing stuff', 'S', '1.2')).toEqual({ status: 'Busy', reason: 'process-cpu' });
    expect(classify('doing stuff', 'S', '0.0')).toEqual({ status: 'Free', reason: 'process-idle' });
  });

  it('falls back to free', () => {
    expect(classify('unknown title')).toEqual({ status: 'Free', reason: 'fallback' });
  });
});
