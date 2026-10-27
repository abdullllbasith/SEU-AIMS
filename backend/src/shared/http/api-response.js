export function sendSuccess(res, data, { statusCode = 200 } = {}) {
  return res.status(statusCode).json({
    success: true,
    data,
  });
}

export function sendError(res, { statusCode = 500, code = 'INTERNAL_ERROR', message = 'Internal error', requestId } = {}) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      ...(requestId ? { requestId } : {}),
    },
  });
}
