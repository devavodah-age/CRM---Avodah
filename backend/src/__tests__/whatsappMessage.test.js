const { extractMessageText } = require('../whatsappMessage');

describe('WhatsApp message extraction', () => {
  it('extrai texto simples e resposta citada', () => {
    expect(extractMessageText({ conversation: 'Olá' })).toBe('Olá');
    expect(extractMessageText({ extendedTextMessage: { text: 'Resposta' } })).toBe('Resposta');
  });

  it('desembrulha mensagens efêmeras e editadas', () => {
    expect(extractMessageText({
      ephemeralMessage: { message: { conversation: 'Temporária' } },
    })).toBe('Temporária');
    expect(extractMessageText({
      editedMessage: { message: { conversation: 'Editada' } },
    })).toBe('Editada');
  });

  it('preserva legendas e identifica mídia sem legenda', () => {
    expect(extractMessageText({ imageMessage: { caption: 'Foto do produto' } })).toBe('Foto do produto');
    expect(extractMessageText({ audioMessage: {} })).toBe('[Áudio]');
    expect(extractMessageText({ documentMessage: { fileName: 'contrato.pdf' } })).toBe('[Documento: contrato.pdf]');
  });
});
