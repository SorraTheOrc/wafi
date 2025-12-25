export type PrdResult = {
  out: string;
  stub: boolean;
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
