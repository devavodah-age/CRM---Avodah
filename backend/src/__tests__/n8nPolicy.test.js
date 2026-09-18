const { retryDelayMinutes } = require('../n8nPolicy');

describe('n8n retry policy', () => {
  it('usa backoff exponencial limitado a trinta minutos', () => {
    expect(retryDelayMinutes(1)).toBe(1);
    expect(retryDelayMinutes(2)).toBe(2);
    expect(retryDelayMinutes(3)).toBe(4);
    expect(retryDelayMinutes(6)).toBe(30);
    expect(retryDelayMinutes(20)).toBe(30);
  });
});
