export type PrdPromptSource = 'arg' | 'stdin' | 'file';

export type PrdResult = {
  out: string;
  stub: boolean;
  prompt?: {
    source: PrdPromptSource;
    length: number;
  };
};

export type ErrorPayload = {
  message: string;
  code?: number;
};

export class CliError extends Error {
  exitCode: number;

  constructor(message: string, exitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.exitCode = exitCode;
  }
}
