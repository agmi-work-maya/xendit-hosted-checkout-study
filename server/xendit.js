const BASE_URL = 'https://api.xendit.co';

export class XenditError extends Error {
  constructor(status, body) {
    super(body?.message || `Xendit request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body, extraHeaders = {}) {
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key) throw new Error('XENDIT_SECRET_KEY is not set');

  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      // Basic auth: secret key as username, empty password
      Authorization: 'Basic ' + Buffer.from(`${key}:`).toString('base64'),
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new XenditError(res.status, data);
  return data;
}

// POST /sessions — https://docs.xendit.co/apidocs/create-session
export function createSession(payload, idempotencyKey) {
  return request('POST', '/sessions', payload, idempotencyKey ? { 'idempotency-key': idempotencyKey } : {});
}

// GET /sessions/:id
export function getSession(id) {
  return request('GET', `/sessions/${encodeURIComponent(id)}`);
}
