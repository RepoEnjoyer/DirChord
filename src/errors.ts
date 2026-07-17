export class DirChordError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DirChordError';
    this.code = code;
  }
}

export function asHelpfulError(error: unknown): DirChordError {
  if (error instanceof DirChordError) return error;
  if (error instanceof Error) {
    return new DirChordError('UNEXPECTED', error.message, { cause: error });
  }
  return new DirChordError('UNEXPECTED', 'An unknown error occurred.');
}
