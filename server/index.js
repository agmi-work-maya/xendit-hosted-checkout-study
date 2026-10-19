import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createPaymentRequest, getPaymentRequest, createSession, getSession, XenditError } from './xendit.js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// In-memory store of payment statuses updated by webhooks (demo only; use a DB in production)
const payments = new Map();
const sessions = new Map();

app.use(express.json());
app.use(express.static(publicDir));

// Create a payment request. Amount/currency are validated server-side; the secret key never reaches the browser.
app.post('/api/payment-requests', async (req, res) => {
  const { amount, currency = 'IDR', country = 'ID', channel_code, description, phone_number } = req.body ?? {};
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }
  if (!channel_code) return res.status(400).json({ error: 'channel_code is required' });

  const referenceId = `order-${crypto.randomUUID()}`;
  const payload = {
    reference_id: referenceId,
    type: 'PAY',
    country,
    currency,
    request_amount: Number(amount),
    capture_method: 'AUTOMATIC',
    channel_code,
    channel_properties: {
      success_return_url: `${BASE}/result.html?ref=${referenceId}&status=success`,
      failure_return_url: `${BASE}/result.html?ref=${referenceId}&status=failed`,
      ...(phone_number ? { mobile_number: phone_number } : {}),
    },
    description,
  };

  try {
    const pr = await createPaymentRequest(payload, referenceId);
    payments.set(referenceId, { id: pr.id, status: pr.status });
    // Redirect-style channels return a URL the customer must be sent to
    const redirectUrl = pr.actions?.find((a) => a.url)?.url ?? null;
    res.status(201).json({ reference_id: referenceId, payment_request: pr, redirect_url: redirectUrl });
  } catch (err) {
    if (err instanceof XenditError) return res.status(err.status).json({ error: err.message, details: err.body });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

// Poll the status of a payment (webhook-updated status, falling back to Xendit)
app.get('/api/payment-requests/:referenceId', async (req, res) => {
  const local = payments.get(req.params.referenceId);
  if (!local) return res.status(404).json({ error: 'Not found' });
  try {
    const pr = await getPaymentRequest(local.id);
    local.status = pr.status;
    res.json({ reference_id: req.params.referenceId, status: pr.status, payment_request: pr });
  } catch (err) {
    if (err instanceof XenditError) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// Create a hosted-checkout session; the customer picks the payment method on Xendit's page.
app.post('/api/sessions', async (req, res) => {
  const { amount, currency = 'IDR', country = 'ID', description, email, given_names, mobile_number } = req.body ?? {};
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' });
  }

  const referenceId = `session-${crypto.randomUUID()}`;
  const payload = {
    reference_id: referenceId,
    session_type: 'PAY',
    mode: 'PAYMENT_LINK',
    amount: Number(amount),
    currency,
    country,
    description,
    customer: {
      reference_id: `cust-${crypto.randomUUID()}`,
      type: 'INDIVIDUAL',
      ...(email ? { email } : {}),
      ...(mobile_number ? { mobile_number } : {}),
      individual_detail: { given_names: given_names || 'Customer' },
    },
    success_return_url: `${BASE}/result.html?kind=session&ref=${referenceId}`,
    cancel_return_url: `${BASE}/result.html?kind=session&ref=${referenceId}`,
  };

  try {
    const session = await createSession(payload, referenceId);
    sessions.set(referenceId, { id: session.payment_session_id, status: session.status });
    res.status(201).json({ reference_id: referenceId, session, redirect_url: session.payment_link_url ?? null });
  } catch (err) {
    if (err instanceof XenditError) return res.status(err.status).json({ error: err.message, details: err.body });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  }
});

app.get('/api/sessions/:referenceId', async (req, res) => {
  const local = sessions.get(req.params.referenceId);
  if (!local) return res.status(404).json({ error: 'Not found' });
  try {
    const session = await getSession(local.id);
    local.status = session.status;
    res.json({ reference_id: req.params.referenceId, status: session.status, session });
  } catch (err) {
    if (err instanceof XenditError) return res.status(err.status).json({ error: err.message });
    res.status(500).json({ error: 'Internal error' });
  }
});

// Xendit webhook receiver — configure in Dashboard > Settings > Webhooks
app.post('/webhooks/xendit', (req, res) => {
  const expected = process.env.XENDIT_CALLBACK_TOKEN;
  const got = req.get('x-callback-token') || '';
  const ok = expected && got.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
  if (!ok) return res.status(401).end();

  const { event, data } = req.body ?? {};
  console.log('webhook', event, data?.reference_id, data?.status);
  if (event?.startsWith('payment_session.')) {
    const local = sessions.get(data?.reference_id);
    if (local) local.status = data.status;
    return res.status(200).end();
  }
  if (data?.reference_id) payments.set(data.reference_id, { id: data.payment_request_id ?? data.id, status: data.status });
  res.status(200).end();
});

app.listen(PORT, () => console.log(`Listening on ${BASE}`));
