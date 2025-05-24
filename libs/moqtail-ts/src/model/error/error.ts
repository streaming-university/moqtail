/**
 * Base class for all moqtail-TS errors.
 */
export class MoqtailError extends Error {
  constructor(cause?: string) {
    super(cause)
    this.name = this.constructor.name
  }
}

/**
 * Not enough bytes in buffer to satisfy a read.
 */
export class NotEnoughBytesError extends MoqtailError {
  constructor(
    public context: string,
    public needed: number,
    public available: number,
  ) {
    super(`[${context}] not enough bytes: needed ${needed}, available ${available}`)
  }
}

/**
 * Cannot cast between two incompatible types.
 */
export class CastingError extends MoqtailError {
  constructor(
    public context: string,
    public fromType: string,
    public toType: string,
    public details: string,
  ) {
    super(`[${context}] cannot cast from ${fromType} to ${toType}, [${details}]`)
  }
}

/**
 * Value too large to encode as varint.
 */
export class VarIntOverflowError extends MoqtailError {
  constructor(
    public context: string,
    public value: number,
  ) {
    super(`[${context}] value ${value} too large to encode as varint`)
  }
}

/**
 * Length exceeds maximum allowed by protocol.
 */
export class LengthExceedsMaxError extends MoqtailError {
  constructor(
    public context: string,
    public max: number,
    public len: number,
  ) {
    super(`[${context}] length ${len} exceeds maximum of ${max}, protocol violation`)
  }
}

/**
 * Key/value formatting error.
 */
export class KeyValueFormattingError extends MoqtailError {
  constructor(public context: string) {
    super(`[${context}] key value formatting error`)
  }
}

/**
 * Invalid discriminant or type tag.
 */
export class InvalidTypeError extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Invalid type: [${context}], [${details}]`)
  }
}

/**
 * Invalid UTF-8 encountered in a string or bytes field.
 */
export class InvalidUTF8Error extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Invalid UTF8: [${context}], [${details}]`)
  }
}

/**
 * Generic protocol violation.
 */
export class ProtocolViolationError extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Protocol violation: [${context}], [${details}]`)
  }
}

/**
 * Track naming error.
 */
export class TrackNameError extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Track naming error: [${context}], [${details}]`)
  }
}

/**
 * Track alias error.
 */
export class TrackAliasError extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Track alias error: [${context}], [${details}]`)
  }
}

/**
 * Operation timed out.
 */
export class TimeoutError extends MoqtailError {
  constructor(public context: string) {
    super(`Timeout: [${context}]`)
  }
}

/**
 * Internal error.
 */
export class InternalError extends MoqtailError {
  constructor(
    public context: string,
    public details: string,
  ) {
    super(`Internal error: [${context}], [${details}]`)
  }
}

/**
 * Connection terminated.
 */
export class TerminationError extends MoqtailError {
  constructor(
    public context: string,
    public terminationCode: number,
  ) {
    super(`Connection terminated with code ${terminationCode}: ${context}`)
  }
}
