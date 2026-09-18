const { sanitizeErrorMessage, reconnectDelay } = require('../whatsappConnectionPolicy');

describe('WhatsApp connection policy', () => {
  it('aplica backoff exponencial com limite de dois minutos', () => {
    expect(reconnectDelay(1, () => 0.5)).toBe(8000);
    expect(reconnectDelay(2, () => 0.5)).toBe(16000);
    expect(reconnectDelay(3, () => 0.5)).toBe(32000);
    expect(reconnectDelay(10, () => 0.5)).toBe(120000);
  });

  it('adiciona jitter de 15% ao atraso', () => {
    expect(reconnectDelay(1, () => 0)).toBe(6800);
    expect(reconnectDelay(1, () => 1)).toBe(9200);
  });

  it('remove quebras de linha e limita mensagens persistidas', () => {
    expect(sanitizeErrorMessage('erro\ncom\r\nlinhas')).toBe('erro com linhas');
    expect(sanitizeErrorMessage('x'.repeat(700))).toHaveLength(500);
    expect(sanitizeErrorMessage(null)).toBeNull();
  });
});
