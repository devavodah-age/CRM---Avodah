vi.mock('../../db', () => ({
  default: {},
  query: vi.fn(),
}));

const { validateAutomation } = require('../automations');

describe('validação de automações', () => {
  const valid = {
    name: 'Boas-vindas',
    trigger_type: 'new_lead',
    trigger_config: {},
    actions: [{ type: 'send_whatsapp', message: 'Olá, {nome}!' }],
  };

  it('aceita um fluxo completo', () => {
    expect(validateAutomation(valid)).toBeNull();
  });

  it('rejeita ações sem configuração', () => {
    expect(validateAutomation({ ...valid, actions: [{ type: 'send_whatsapp', message: '' }] }))
      .toContain('mensagem');
    expect(validateAutomation({ ...valid, actions: [{ type: 'move_stage', stage: '' }] }))
      .toContain('etapa');
  });

  it('rejeita tipos desconhecidos', () => {
    expect(validateAutomation({ ...valid, trigger_type: 'qualquer_coisa' })).toContain('Gatilho');
    expect(validateAutomation({ ...valid, actions: [{ type: 'delete_everything' }] })).toContain('Ação');
  });
});
