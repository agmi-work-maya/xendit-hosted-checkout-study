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
      'api-version': process.env.XENDIT_API_VERSION || '2024-11-11',
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new XenditError(res.status, data);
  return data;
}

// POST /payment_requests — https://docs.xendit.co/apidocs/create-payment-request
export function createPaymentRequest(payload, idempotencyKey) {
  return request('POST', '/payment_requests', payload, idempotencyKey ? { 'idempotency-key': idempotencyKey } : {});
}

// GET /payment_requests/:id
export function getPaymentRequest(id) {
  return request('GET', `/payment_requests/${encodeURIComponent(id)}`);
}
