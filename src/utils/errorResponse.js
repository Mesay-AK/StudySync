// Maps a caught error to a safe, descriptive client-facing response instead
// of a flat generic string. Validation/cast/duplicate-key errors are safe to
// describe specifically since they're about the request's own input, not
// internal state - anything else logs the full error server-side and falls
// back to a per-endpoint message that's honest without leaking internals.
// Every response uses the same { message } shape so the frontend never has
// to guess which key an endpoint used.
export const sendError = (res, error, fallbackMessage = 'Something went wrong. Please try again.', fallbackStatus = 500) => {
  console.error(error);

  if (error?.name === 'ValidationError' && error.errors) {
    const details = Object.values(error.errors).map((e) => e.message);
    return res.status(400).json({ message: details.join(' ') || 'Validation failed.' });
  }

  if (error?.name === 'CastError') {
    return res.status(400).json({ message: `Invalid ${error.path || 'ID'}.` });
  }

  if (error?.code === 11000) {
    const field = Object.keys(error.keyPattern || error.keyValue || {})[0] || 'value';
    return res.status(409).json({ message: `That ${field} is already in use.` });
  }

  return res.status(fallbackStatus).json({ message: fallbackMessage });
};
