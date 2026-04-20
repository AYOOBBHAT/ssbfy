export function sendSuccess(res, data = null, message = 'OK', statusCode = 200) {
  const body = { success: true, message };
  if (data !== null && data !== undefined) {
    body.data = data;
  }
  return res.status(statusCode).json(body);
}

export function sendCreated(res, data, message = 'Created') {
  return sendSuccess(res, data, message, 201);
}
