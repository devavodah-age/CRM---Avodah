const { normalizeMessageContent } = require('@whiskeysockets/baileys');

function extractMessageText(message) {
  const content = normalizeMessageContent(message) || message || {};
  return content.conversation
    || content.extendedTextMessage?.text
    || content.imageMessage?.caption
    || (content.imageMessage ? '[Imagem]' : null)
    || (content.audioMessage ? '[Áudio]' : null)
    || content.videoMessage?.caption
    || (content.videoMessage ? '[Vídeo]' : null)
    || (content.documentMessage ? `[Documento: ${content.documentMessage.fileName || 'arquivo'}]` : null)
    || (content.stickerMessage ? '[Sticker]' : null)
    || content.buttonsResponseMessage?.selectedDisplayText
    || content.listResponseMessage?.title
    || content.listResponseMessage?.singleSelectReply?.selectedRowId
    || content.templateButtonReplyMessage?.selectedDisplayText
    || (content.contactMessage ? `[Contato: ${content.contactMessage.displayName || 'contato'}]` : null)
    || (content.contactsArrayMessage ? '[Contatos]' : null)
    || (content.locationMessage ? '[Localização]' : null)
    || (content.liveLocationMessage ? '[Localização ao vivo]' : null)
    || (content.reactionMessage?.text ? `[Reação: ${content.reactionMessage.text}]` : null)
    || '';
}

module.exports = { extractMessageText };
