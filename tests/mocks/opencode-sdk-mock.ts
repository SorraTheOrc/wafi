export function createOpencodeSdkMock() {
  const sampleEvents = [
    {
      // canonical session.created should map to agent.started
      type: 'session.created',
      payload: {
        session: { id: 's-1', status: 'running' },
        agent: { name: 'map' },
        token: 'abc',
        secret: 'starter',
        message: { content: 'booting' },
        timestamp: '2024-01-01T00:00:00Z',
      },
    },
    {
      // canonical message.updated should map to message.returned
      type: 'message.updated',
      payload: { agent: { name: 'forge' }, message: { content: 'done' }, secret: 'x' },
    },
    {
      // canonical session.deleted should map to agent.stopped
      type: 'session.deleted',
      payload: { agent: { name: 'map' }, reason: 'complete' },
    },
    // keep legacy aliases to ensure backward compatibility
    { type: 'agent.started', payload: { agent: { name: 'legacy-start' } } },
    { type: 'message.returned', payload: { agent: { name: 'legacy-msg' }, message: { content: 'hi' } } },
    { type: 'agent.stopped', payload: { agent: { name: 'legacy-stop' } } },
  ];

  const subscribe = async (_options: any, cb: (payload: any) => void) => {
    for (const event of sampleEvents) {
      cb(event);
    }
    return () => {};
  };

  return { _sdk: { event: { subscribe } } } as const;
}
