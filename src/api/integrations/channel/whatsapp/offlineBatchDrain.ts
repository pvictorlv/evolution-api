type StanzaListener = (node: { attrs?: Record<string, string> }) => void;

export interface OfflineDrainSocket {
  ws: { on(event: string, listener: StanzaListener): unknown };
  sendNode(node: { tag: string; attrs: Record<string, string>; content: unknown[] }): Promise<unknown>;
}

export interface OfflineDrainOptions {
  silenceMs?: number;
  maxRequests?: number;
  batchSize?: string;
  onRequest?: (attempt: number) => void;
  onGiveUp?: (attempts: number) => void;
  onDrained?: (attempts: number) => void;
}

const OFFLINE_STANZAS = ['CB:message', 'CB:notification', 'CB:receipt', 'CB:call'];

/**
 * Baileys answers `offline_preview` with a single `offline_batch` request. With more than one batch
 * pending, the server delivers the first and waits for another request: until the queue ends it sends
 * neither `<ib><offline>` nor live messages, so the socket stays `open` and deaf. Each reconnect then
 * delivers only one more batch, which left a connection 20 hours behind.
 *
 * This asks for the next batch whenever the offline delivery goes quiet without having finished.
 * See https://github.com/WhiskeySockets/Baileys/issues/2810.
 */
export const watchOfflineDrain = (socket: OfflineDrainSocket, options: OfflineDrainOptions = {}) => {
  const { silenceMs = 5000, maxRequests = 50, batchSize = '100', onRequest, onGiveUp, onDrained } = options;

  let draining = false;
  let requests = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    draining = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const requestNextBatch = () => {
    timer = null;
    if (!draining) return;

    if (requests >= maxRequests) {
      stop();
      onGiveUp?.(requests);
      return;
    }

    requests += 1;
    onRequest?.(requests);
    socket
      .sendNode({ tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: batchSize } }] })
      .catch(stop);
    arm();
  };

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(requestNextBatch, silenceMs);
  };

  socket.ws.on('CB:ib,,offline_preview', () => {
    draining = true;
    arm();
  });

  for (const stanza of OFFLINE_STANZAS) {
    socket.ws.on(stanza, (node) => {
      if (draining && node?.attrs?.offline !== undefined) arm();
    });
  }

  socket.ws.on('CB:ib,,offline', () => {
    const wasDraining = draining;
    stop();
    if (wasDraining) onDrained?.(requests);
  });

  socket.ws.on('close', stop);

  return { stop };
};
