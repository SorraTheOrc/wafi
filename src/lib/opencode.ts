let client: any | undefined;

export function isEnabled() {
  return Boolean(process.env.OPENCODE_ENABLED);
}

export async function getClient(): Promise<any | undefined> {
  if (client) return client;
  if (!isEnabled()) return undefined;

  try {
    const mod = await import('opencode');
    const OpenCode = mod?.OpenCode ?? mod?.default ?? mod;
    const oc = new OpenCode({});
    client = {
      serve: async () => oc.serve(),
      ask: async (agent: string, prompt: string) => {
        const res = await oc.ask(agent, prompt);
        return { markdown: res?.markdown ?? String(res) };
      },
    };
    return client;
  } catch (e) {
    return undefined;
  }
}
