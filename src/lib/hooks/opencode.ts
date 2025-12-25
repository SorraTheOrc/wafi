// Skeleton: OpenCode hooks registration and emitter

export async function registerHooks(options: {primingPayload?: string}) {
  // TODO: call OpenCode runtime to register a plugin or webhook that listens for session.start and pre-compact
  console.log('registerHooks called', options)
}

export async function emitTestEvent() {
  // TODO: emit a test OpenCode event for health checks
  console.log('emitTestEvent called')
}
