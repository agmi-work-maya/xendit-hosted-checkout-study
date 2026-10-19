# Xendit Create Session demo

Express server + static HTML client calling Xendit's
[Create Session](https://docs.xendit.co/apidocs/create-session) endpoint (`POST /sessions`, `mode: PAYMENT_LINK`).

## Run
```
npm install
cp .env.example .env   # add your test secret key
npm start              # http://localhost:3000
```

## Flow
1. Browser POSTs `/api/sessions` → server calls Xendit with the secret key (Basic auth).
2. Server returns Xendit's `payment_link_url`; the browser redirects to Xendit's hosted checkout.
3. Customer returns to `/result.html`, which asks the server (`GET /api/sessions/:ref`) for the authoritative status.
4. Xendit webhooks hit `POST /webhooks/xendit` (verified via `x-callback-token`); expose locally with a tunnel such as ngrok.

Note: the request payload was written without access to the live docs; verify the field names
(`session_type`, `mode`, `customer`, response `payment_link_url`) against the page above.
