const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const {
  acceptsEventStream,
  createAiTrainingEventStream,
} = require('./aiTrainingEventStream');

function createResponseDouble() {
  const res = new EventEmitter();
  res.headers = {};
  res.writes = [];
  res.writableEnded = false;
  res.status = (value) => {
    res.statusCode = value;
    return res;
  };
  res.setHeader = (name, value) => { res.headers[name] = value; };
  res.flushHeaders = () => { res.flushed = true; };
  res.write = (value) => {
    res.writes.push(String(value));
    return true;
  };
  res.end = () => { res.writableEnded = true; };
  return res;
}

test('event stream is enabled only when the client requests SSE', () => {
  assert.equal(acceptsEventStream({ headers: { accept: 'application/json' } }), false);
  assert.equal(acceptsEventStream({ headers: { accept: 'text/event-stream' } }), true);
});

test('event stream writes progress frames until the response closes', () => {
  const req = new EventEmitter();
  req.headers = { accept: 'text/event-stream' };
  const res = createResponseDouble();
  const stream = createAiTrainingEventStream(req, res);

  assert.equal(stream.enabled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'text/event-stream; charset=utf-8');
  assert.match(res.writes.join(''), /event: stream_started/);

  req.emit('close');
  assert.equal(stream.send({ type: 'tool_started', label: '执行工具' }), true);
  assert.match(res.writes.join(''), /event: tool_started/);

  res.emit('close');
  assert.equal(stream.send({ type: 'tool_completed', label: '工具完成' }), false);
});
