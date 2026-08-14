export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'AUTHORIZATION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'TOOL_EXECUTION_FAILED'
  | 'AGENT_EXECUTION_FAILED'
  | 'TRANSACTION_ERROR'
  | 'WORKFLOW_ERROR'
  | 'PROVIDER_ERROR'
  | 'CONFIGURATION_ERROR';

const statusByCode: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 422,
  AUTHENTICATION_REQUIRED: 401,
  AUTHORIZATION_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  TIMEOUT: 504,
  NETWORK_ERROR: 502,
  TOOL_EXECUTION_FAILED: 502,
  AGENT_EXECUTION_FAILED: 500,
  TRANSACTION_ERROR: 409,
  WORKFLOW_ERROR: 422,
  PROVIDER_ERROR: 502,
  CONFIGURATION_ERROR: 500,
};

export class PlatformError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly status: number;
  readonly safeMetadata: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      status?: number;
      safeMetadata?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'PlatformError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? statusByCode[code];
    this.safeMetadata = options.safeMetadata ?? {};
  }
}

export function asPlatformError(error: unknown): PlatformError {
  if (error instanceof PlatformError) return error;
  return new PlatformError('AGENT_EXECUTION_FAILED', 'The operation could not be completed.', {
    cause: error,
  });
}
