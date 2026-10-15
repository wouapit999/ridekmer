/**
 * Errors raised by payment adapters. Services map them to user-facing messages and never
 * surface provider secrets or raw responses to customers.
 */
export type PaymentProviderErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_IMPLEMENTED"
  | "UNSUPPORTED_OPERATION"
  | "PROVIDER_UNAVAILABLE"
  | "INVALID_WEBHOOK";

export class PaymentProviderError extends Error {
  constructor(
    public readonly code: PaymentProviderErrorCode,
    message?: string,
    public readonly providerId?: string,
  ) {
    super(message ?? code);
    this.name = "PaymentProviderError";
  }
}

export function notImplemented(providerId: string, operation: string): PaymentProviderError {
  return new PaymentProviderError(
    "NOT_IMPLEMENTED",
    `${providerId}.${operation} is a shell: implement it against the provider's official API documentation and credentials before enabling ${providerId} outside mock mode.`,
    providerId,
  );
}

export function unsupported(providerId: string, operation: string): PaymentProviderError {
  return new PaymentProviderError(
    "UNSUPPORTED_OPERATION",
    `${providerId} does not support ${operation}.`,
    providerId,
  );
}
