import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { editedCaptionContent } from '../src/api/integrations/channel/whatsapp/editedContent.ts';

describe('editedCaptionContent', () => {
  const document = { documentWithCaptionMessage: { message: { documentMessage: { caption: 'nova' } } } };

  it('carries only the new caption, shaped like the message being edited', () => {
    assert.deepEqual(editedCaptionContent('imageMessage', 'nova'), { imageMessage: { caption: 'nova' } });
    assert.deepEqual(editedCaptionContent('videoMessage', 'nova'), { videoMessage: { caption: 'nova' } });
    assert.deepEqual(editedCaptionContent('documentMessage', 'nova'), document);
    assert.deepEqual(editedCaptionContent('documentWithCaptionMessage', 'nova'), document);
  });

  it('refuses types without a caption', () => {
    for (const type of ['audioMessage', 'stickerMessage', 'locationMessage', 'conversation', undefined]) {
      assert.equal(editedCaptionContent(type, 'nova'), null);
    }
  });
});
