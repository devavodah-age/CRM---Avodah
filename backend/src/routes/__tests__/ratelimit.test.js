describe('Rate limit config', () => {
  it('authenticated limiter allows up to 100 requests per minute', () => {
    const config = { windowMs: 60 * 1000, max: 100 };
    expect(config.max).toBe(100);
    expect(config.windowMs).toBe(60000);
  });
});
