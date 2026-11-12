type StanzaNode = { attrs?: Record<string, string>; content?: unknown };
type StanzaListener = (node: StanzaNode) => void;

export interface OfflineDrainSocket {
  ws: { on(event: string, listener: StanzaListener): unknown; isOpen?: boolean };
  sendNode(node: { tag: string; attrs: Record<string, string>; content: unknown[] }): Promise<unknown>;
}

export interface OfflinePreview {
  count: number | null;
  message: number | null;
  receipt: number | null;
  notification: number | null;
}

export interface OfflineDrainOptions {
  silenceMs?: number;
  firstStanzaMs?: number;
  maxUnanswered?: number;
  maxRequests?: number;
  batchSize?: number;
  onPreview?: (preview: OfflinePreview) => void;
  onRequest?: (attempt: number) => void;
  onGiveUp?: (attempts: number) => void;
  onDrained?: (attempts: number) => void;
  onRequestFailed?: (error: unknown) => void;
}

const OFFLINE_STANZAS = ['CB:message', 'CB:notification', 'CB:receipt', 'CB:call', 'CB:status'];

const toCount = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export const readOfflinePreview = (node: StanzaNode): OfflinePreview => {
  const children = Array.isArray(node?.content) ? (node.content as StanzaNode[]) : [];
  const preview = children.find((child) => (child as { tag?: string })?.tag === 'offline_preview');
  const attrs = preview?.attrs ?? {};
  return {
    count: toCount(attrs.count),
    message: toCount(attrs.message),
    receipt: toCount(attrs.receipt),
    notification: toCount(attrs.notification),
  };
};

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
  const {
    silenceMs = 5000,
    firstStanzaMs = 15000,
    maxUnanswered = 5,
    maxRequests = 500,
    batchSize = 100,
    onPreview,
    onRequest,
    onGiveUp,
    onDrained,
    onRequestFailed,
  } = options;

  let draining = false;
  let sawOfflineStanza = false;
  let requests = 0;
  let unanswered = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    draining = false;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const arm = (delay: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(requestNextBatch, delay);
  };

  function requestNextBatch() {
    timer = null;
    if (!draining) return;
    if (socket.ws.isOpen === false) {
      stop();
      return;
    }

    if (unanswered >= maxUnanswered || requests >= maxRequests) {
      stop();
      onGiveUp?.(requests);
      return;
    }

    requests += 1;
    unanswered += 1;
    onRequest?.(requests);
    socket
      .sendNode({ tag: 'ib', attrs: {}, content: [{ tag: 'offline_batch', attrs: { count: String(batchSize) } }] })
      .catch((error) => {
        stop();
        onRequestFailed?.(error);
      });
    arm(silenceMs);
  }

  socket.ws.on('CB:ib,,offline_preview', (node) => {
    const preview = readOfflinePreview(node);
    onPreview?.(preview);
    requests = 0;
    unanswered = 0;
    sawOfflineStanza = false;
    if (preview.count !== null && preview.count <= batchSize) {
      stop();
      return;
    }
    draining = true;
    arm(firstStanzaMs);
  });

  for (const stanza of OFFLINE_STANZAS) {
    socket.ws.on(stanza, (node) => {
      if (!draining || node?.attrs?.offline === undefined) return;
      sawOfflineStanza = true;
      unanswered = 0;
      arm(silenceMs);
    });
  }

  socket.ws.on('CB:ib,,offline', () => {
    const wasDraining = draining;
    stop();
    if (wasDraining) onDrained?.(requests);
  });

  socket.ws.on('close', stop);

  return {
    stop,
    get state() {
      return { draining, sawOfflineStanza, requests, unanswered };
    },
  };
};
