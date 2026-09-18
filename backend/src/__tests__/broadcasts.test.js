const { renderMessage } = require('../broadcasts');

describe('disparos', () => {
  it('personaliza variáveis por lead', () => {
    expect(renderMessage('Olá {nome}, da {empresa}! Seu número é {telefone}.', {
      name: 'Maria Silva', company_name: 'Acme', phone: '5511999999999',
    })).toBe('Olá Maria, da Acme! Seu número é 5511999999999.');
  });

  it('tolera campos opcionais vazios', () => {
    expect(renderMessage('Olá {nome} {empresa}', { name: 'João' })).toBe('Olá João ');
  });
});
