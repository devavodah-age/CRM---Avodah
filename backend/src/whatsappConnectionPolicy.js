function sanitizeErrorMessage(value) {
  if (!value) return null;
  return String(value).replace(/[\r\n]+/g, ' ').slice(0, 500);
}

function reconnectDelay(attempt, random = Math.random) {
  const safeAttempt = Math.max(1, Number(attempt) || 1);
  const baseDelay = Math.min(8000 * Math.pow(2, safeAttempt - 1), 120000);
  return Math.round(baseDelay * (0.85 + random() * 0.3));
}

module.exports = { sanitizeErrorMessage, reconnectDelay };
