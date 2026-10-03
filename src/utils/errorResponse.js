import logger from "./logger.js";

// Maps a caught error to a safe, descriptive client-facing response instead
// of a flat generic string. Validation/cast/duplicate-key errors are safe to
// describe specifically since they're about the request's own input, not
// internal state - anything else logs the full error server-side and falls
// back to a per-endpoint message that's honest without leaking internals.
//
// Every response has an English `message`. Errors whose text contains values
// (field names, numbers) ALSO carry a stable `code` + `params`, so the
// frontend can build the sentence in the user's language instead of showing
// English it can't translate.
export const errorBody = (message, code, params) => ({
  message,
  ...(code ? { code } : {}),
  ...(params ? { params } : {}),
});

// Mongoose validator kinds -> our codes. Anything unrecognised is "INVALID".
const VALIDATION_CODES = {
  required: "REQUIRED",
  enum: "ENUM",
  min: "MIN",
  max: "MAX",
  minlength: "MIN_LENGTH",
  maxlength: "MAX_LENGTH",
};

// Only short, plain values are echoed back (they end up in the message).
const safeValue = (value) =>
  (typeof value === "string" || typeof value === "number") && String(value).length <= 60 ? String(value) : undefined;

const describeValidationError = (e) => {
  const code = e.name === "CastError" ? "INVALID" : VALIDATION_CODES[e.kind] || "INVALID";
  const props = e.properties || {};
  const params = { field: e.path };
  if (code === "ENUM" && safeValue(e.value) !== undefined) params.value = safeValue(e.value);
  if (code === "MIN" || code === "MIN_LENGTH") params.limit = props.min ?? props.minlength;
  if (code === "MAX" || code === "MAX_LENGTH") params.limit = props.max ?? props.maxlength;
  return { code, params };
};

export const sendError = (res, error, fallbackMessage = 'Something went wrong. Please try again.', fallbackStatus = 500) => {
  (res.req?.log || logger).error({ err: error }, "Request failed");

  if (error?.name === 'ValidationError' && error.errors) {
    const errors = Object.values(error.errors);
    return res.status(400).json({
      ...errorBody(errors.map((e) => e.message).join(' ') || 'Validation failed.', 'VALIDATION_FAILED'),
      errors: errors.map(describeValidationError),
    });
  }

  if (error?.name === 'CastError') {
    const field = error.path || 'ID';
    return res.status(400).json(errorBody(`Invalid ${field}.`, 'INVALID_FIELD', { field }));
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
    return res.status(409).json(errorBody(`That ${field} is already in use.`, 'ALREADY_IN_USE', { field }));
  }

  return res.status(fallbackStatus).json({ message: fallbackMessage });
};
