import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { beforeEach, describe, it, mock } from 'node:test';

import { readOfflinePreview, watchOfflineDrain } from '../src/api/integrations/channel/whatsapp/offlineBatchDrain.ts';

const offlineMessage = { attrs: { offline: '1' } };
const liveMessage = { attrs: {} };
const preview = (count?: number) => ({
  tag: 'ib',
  attrs: {},
  content: [{ tag: 'offline_preview', attrs: count === undefined ? {} : { count: String(count), message: '40' } }],
});

const setup = (options = {}) => {
  const ws: EventEmitter & { isOpen?: boolean } = new EventEmitter();
  ws.isOpen = true;
  const sent: any[] = [];
  const socket = {
    ws,
    sendNode: async (node: any) => {
      sent.push(node);
    },
  };
  const events = { gaveUp: -1, drained: -1, previews: [] as any[] };
  const watcher = watchOfflineDrain(socket, {
    silenceMs: 5000,
    firstStanzaMs: 15000,
    onPreview: (p) => events.previews.push(p),
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

  it('reports the queue size the server announced', () => {
    const { ws, events } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));

    assert.equal(events.previews[0].count, 2350);
    assert.equal(events.previews[0].message, 40);
  });

  it('does nothing when the announced queue fits in one batch', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', preview(80));
    mock.timers.tick(120000);

    assert.equal(sent.length, 0);
  });

  it('gives the first batch a longer window before asking again', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));
    mock.timers.tick(14000);
    assert.equal(sent.length, 0);
    mock.timers.tick(1000);

    assert.equal(sent.length, 1);
    assert.deepEqual(sent[0], { tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: '100' } }] });
  });

  it('asks for the next batch when the delivery goes quiet mid-queue', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));
    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(5000);

    assert.equal(sent.length, 1);
  });

  it('waits while offline stanzas keep arriving, status updates included', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));
    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(4000);
    ws.emit('CB:status', offlineMessage);
    mock.timers.tick(4000);
    ws.emit('CB:receipt', offlineMessage);
    mock.timers.tick(4000);

    assert.equal(sent.length, 0);
  });

  it('does not count a live message as offline delivery', () => {
    const { ws, sent } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));
    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(4000);
    ws.emit('CB:message', liveMessage);
    mock.timers.tick(1000);

    assert.equal(sent.length, 1);
  });

  it('keeps asking batch after batch until the server says the queue ended', () => {
    const { ws, sent, events } = setup();

    ws.emit('CB:ib,,offline_preview', preview(2350));
    for (let batch = 0; batch < 10; batch += 1) {
      ws.emit('CB:message', offlineMessage);
      mock.timers.tick(5000);
    }
    ws.emit('CB:ib,,offline', {});
    mock.timers.tick(60000);

    assert.equal(sent.length, 10);
    assert.equal(events.drained, 10);
  });

  it('gives up after a few requests the server never answers', () => {
    const { ws, sent, events } = setup({ maxUnanswered: 3 });

    ws.emit('CB:ib,,offline_preview', preview(2350));
    ws.emit('CB:message', offlineMessage);
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(5000);
    mock.timers.tick(60000);

    assert.equal(sent.length, 3);
    assert.equal(events.gaveUp, 3);
  });

  it('does nothing on a healthy connection, where the queue ends in one batch', () => {
    const { ws, sent, events } = setup();

    ws.emit('CB:ib,,offline_preview', preview());
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

  it('stops when the socket closes or is discarded', () => {
    const closed = setup();
    closed.ws.emit('CB:ib,,offline_preview', preview(2350));
    closed.ws.emit('close');

    const discarded = setup();
    discarded.ws.emit('CB:ib,,offline_preview', preview(2350));
    discarded.watcher.stop();

    const notOpen = setup();
    notOpen.ws.emit('CB:ib,,offline_preview', preview(2350));
    notOpen.ws.isOpen = false;

    mock.timers.tick(60000);

    assert.equal(closed.sent.length, 0);
    assert.equal(discarded.sent.length, 0);
    assert.equal(notOpen.sent.length, 0);
  });

  it('stops when a request fails', async () => {
    const ws = new EventEmitter();
    let calls = 0;
    let failure: unknown = null;
    const socket = {
      ws,
      sendNode: async () => {
        calls += 1;
        throw new Error('socket gone');
      },
    };
    watchOfflineDrain(socket, { onRequestFailed: (error) => (failure = error) });

    ws.emit('CB:ib,,offline_preview', preview(2350));
    mock.timers.tick(15000);
    await new Promise((resolve) => setImmediate(resolve));
    mock.timers.tick(60000);

    assert.equal(calls, 1);
    assert.ok(failure);
  });

  it('reads a preview without counts as unknown', () => {
    assert.deepEqual(readOfflinePreview({}), { count: null, message: null, receipt: null, notification: null });
  });

  it('treats an empty count as unknown, so the watcher still drains', () => {
    const empty = { content: [{ tag: 'offline_preview', attrs: { count: '' } }] };
    assert.equal(readOfflinePreview(empty).count, null);
  });
});
