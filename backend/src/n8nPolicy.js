function retryDelayMinutes(attempt) {
  return Math.min(30, Math.pow(2, Math.max(0, Number(attempt) - 1)));
}

module.exports = { retryDelayMinutes };
