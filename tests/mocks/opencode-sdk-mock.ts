export function createOpencodeSdkMock() {
  const sampleEvents = [
    {
      type: 'agent.started',
      payload: {
        agent: { name: 'map' },
        token: 'abc',
        secret: 'starter',
        message: { content: 'booting' },
        timestamp: '2024-01-01T00:00:00Z',
      },
    },
    {
      type: 'message.returned',
      payload: { agent: { name: 'forge' }, message: { content: 'done' }, secret: 'x' },
    },
    { type: 'agent.stopped', payload: { agent: { name: 'map' }, reason: 'complete' } },
  ];

  const subscribe = async (_options: any, cb: (payload: any) => void) => {
    for (const event of sampleEvents) {
      cb(event);
    }
    return () => {};
  };

  return { _sdk: { event: { subscribe } } } as const;
}
