function acceptsEventStream(req) {
  return String(req?.headers?.accept || '').toLowerCase().includes('text/event-stream');
}

function createAiTrainingEventStream(req, res) {
  if (!acceptsEventStream(req)) {
    return {
      enabled: false,
      send: () => {},
      end: () => {},
    };
  }

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  let closed = false;
  const markClosed = () => { closed = true; };
  req.on('aborted', markClosed);
  res.on('close', markClosed);

  const send = (payload) => {
    if (closed || res.writableEnded) return false;
    res.write(`event: ${payload?.type || 'progress'}\n`);
    res.write(`data: ${JSON.stringify(payload || {})}\n\n`);
    return true;
  };

  send({
    type: 'stream_started',
    label: '已建立 Agent 实时执行通道',
    created_at: new Date().toISOString(),
  });

  return {
    enabled: true,
    send,
    end: () => {
      if (!closed && !res.writableEnded) res.end();
    },
  };
}

module.exports = {
  acceptsEventStream,
  createAiTrainingEventStream,
};
