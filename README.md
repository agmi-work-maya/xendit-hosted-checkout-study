# Xendit Payment Request demo

Express server + static HTML client calling Xendit's
[Create Payment Request](https://docs.xendit.co/apidocs/create-payment-request) (`POST /payment_requests`).

## Run
```
npm install
cp .env.example .env   # add your test secret key
npm start              # http://localhost:3000
```

## Sessions API (hosted checkout)
`/checkout.html` posts to `/api/sessions`, which calls Xendit's
[Create Session](https://docs.xendit.co/apidocs/create-session) (`POST /sessions`, `mode: PAYMENT_LINK`)
and redirects the customer to `payment_link_url`. `result.html?kind=session` reads status via `GET /api/sessions/:ref`.
`payment_session.*` webhooks are handled by the same `/webhooks/xendit` endpoint.

## Payment Request flow
1. Browser POSTs `/api/payment-requests` → server calls Xendit with the secret key (Basic auth).
2. If Xendit returns a redirect action URL, the browser is sent there.
3. Customer returns to `/result.html`, which asks the server for the authoritative status.
4. Xendit webhooks hit `POST /webhooks/xendit` (verified via `x-callback-token`); expose locally with a tunnel such as ngrok.

Note: request fields (including the Sessions payload) (`channel_code`, `channel_properties`, `api-version`) were written without access
to the live docs; check them against the page above and adjust `server/index.js` per channel.
