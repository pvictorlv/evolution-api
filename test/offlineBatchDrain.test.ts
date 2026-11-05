import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, mock } from 'node:test';

import { watchOfflineDrain } from '../src/api/integrations/channel/whatsapp/offlineBatchDrain.ts';

const offlineMessage = { attrs: { offline: '1' } };
const liveMessage = { attrs: {} };

const setup = (options = {}) => {
  const ws = new EventEmitter();
  const sent: any[] = [];
  const socket = {
    ws,
    sendNode: async (node: any) => {
      sent.push(node);
    },
  };
  const events = { gaveUp: 0, drained: -1 };
  const watcher = watchOfflineDrain(socket, {
    silenceMs: 5000,
    onGiveUp: (attempts) => {
      events.gaveUp = attempts;
    },
    onDrained: (attempts) => {
      events.drained = attempts;
    },
    ...options,
  });
  return { ws, sent, events, watcher };
};

describe('watchOfflineDrain', () => {
  beforeEach(() => {
    mock.timers.reset();
    mock.timers.enable({ apis: ['setTimeout'] });
  });

  it('asks for the next batch when the offline delivery goes quiet', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(5000);

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: '100' } }] });
  });

  it('waits while offline stanzas keep arriving', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(4000);
    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(4000);
    ws.emit('CB:receipt', offlineMessage);
    mock.timers.tick(4000);

    assert.equal(sent.length, 0);
  });

  it('does not count a live message as offline delivery', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(4000);
    ws.emit('CB:message', liveMessage);
    mock.timers.tick(1000);

    assert.equal(sent.length, 1);
  });

  it('keeps asking until the server says the queue ended', () => {
    const { ws, sent, events } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    ws.emit('CB:ib,,offline', {});
    mock.timers.tick(60000);

    assert.equal(sent.length, 2);
    assert.equal(events.drained, 2);
  });

  it('does nothing on a healthy connection, where the queue ends in one batch', () => {
    const { ws, sent, events } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    ws.emit('CB:message', offlineMessage);
    ws.emit('CB:ib,,offline', {});
    mock.timers.tick(60000);

    assert.equal(sent.length, 0);
    assert.equal(events.drained, 0);
  });

  it('never asks without an offline preview', () => {
    const { ws, sent } = setup();

    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(60000);

    assert.equal(sent.length, 0);
  });

  it('gives up at the limit', () => {
    const { ws, sent, events } = setup({ maxRequests: 3 });

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(60000);

    assert.equal(sent.length, 3);
    assert.equal(events.gaveUp, 3);
  });

  it('stops when the socket closes', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', {});
    ws.emit('close');
    mock.timers.tick(60000);

    assert.equal(sent.length, 0);
  });

  it('stops when a request fails', async () => {
    const ws = new EventEmitter();
    let calls = 0;
    const socket = {
      ws,
      sendNode: async () => {
        calls += 1;
        throw new Error('socket gone');
      },
    };
    watchOfflineDrain(socket);

    ws.emit('CB:ib,,offline_preview', {});
    mock.timers.tick(5000);
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(60000);

    assert.equal(calls, 1);
  });
});
