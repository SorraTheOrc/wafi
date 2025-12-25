import { CliError, ErrorPayload } from '../types.js';

export function logStdout(message: string) {
  process.stdout.write(message + '\n');
}

export function logStderr(message: string) {
  process.stderr.write(message + '\n');
}

export function emitJson(payload: unknown) {
  logStdout(JSON.stringify(payload));
}

export function handleError(err: unknown, jsonMode: boolean): number {
  if (err instanceof CliError) {
    if (jsonMode) {
      const payload: { error: ErrorPayload } = { error: { message: err.message, code: err.exitCode } };
      emitJson(payload);
    } else {
      logStderr(err.message);
    }
    return err.exitCode;
  }

  const commanderCode = (err as any)?.code as string | undefined;
  const commanderExit = (err as any)?.exitCode as number | undefined;
  const commanderMessage = (err as any)?.message as string | undefined;
  if (commanderCode === 'commander.helpDisplayed' || commanderCode === 'commander.version' || commanderMessage === '(outputHelp)') {
    return commanderExit ?? 0;
  }
  if (typeof commanderExit === 'number') {
    return commanderExit;
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  if (jsonMode) {
    emitJson({ error: { message, code: 1 } });
  } else {
    logStderr(message);
  }
  return 1;
}
