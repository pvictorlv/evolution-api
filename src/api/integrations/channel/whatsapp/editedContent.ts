import type { proto } from 'baileys';

/**
 * Content of a media edit. WhatsApp Web sends the new caption alone, without the
 * file, and the receiver reads nothing but the caption. Null means the type has
 * no caption to edit.
 */
export const editedCaptionContent = (messageType: string | undefined, caption: string): proto.IMessage | null => {
  switch (messageType) {
    case 'imageMessage':
      return { imageMessage: { caption } };
    case 'videoMessage':
      return { videoMessage: { caption } };
    case 'documentMessage':
    case 'documentWithCaptionMessage':
      return { documentWithCaptionMessage: { message: { documentMessage: { caption } } } };
    default:
      return null;
  }
};
