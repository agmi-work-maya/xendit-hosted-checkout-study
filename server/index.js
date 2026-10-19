import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createSession, getSession, XenditError } from './xendit.js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = process.env.APP_BASE_URL || `http://localhost:${PORT}`;
const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

// reference_id -> { id, status } (demo only; use a database in production)
const sessions = new Map();

app.use(express.json());
app.use(express.static(publicDir));

// Create a hosted-checkout session. The secret key and return URLs stay on the server.
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
    success_return_url: `${BASE}/result.html?ref=${referenceId}`,
    cancel_return_url: `${BASE}/result.html?ref=${referenceId}`,
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

// Authoritative session status, fetched from Xendit
app.get('/api/sessions/:referenceId', async (req, res) => {
  const local = sessions.get(req.params.referenceId);
  if (!local) return res.status(404).json({ error: 'Not found' });
  try {
    const session = await getSession(local.id);
    local.status = session.status;
    res.json({ reference_id: req.params.referenceId, status: session.status, session });
  } catch (err) {
    if (err instanceof XenditError) return res.status(err.status).json({ error: err.message });
    console.error(err);
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
  const local = sessions.get(data?.reference_id);
  if (local && data?.status) local.status = data.status;
  res.status(200).end();
});

app.listen(PORT, () => console.log(`Listening on ${BASE}`));
