# Xendit Create Payment Request demo

Express server + static HTML client calling Xendit's
[Create Payment Request](https://docs.xendit.co/apidocs/create-payment-request) endpoint (`POST /payment_requests`).

## Run
```
npm install
cp .env.example .env   # add your test secret key
npm start              # http://localhost:3000
```

## Flow
1. Browser POSTs `/api/payment-requests` → server calls Xendit with the secret key (Basic auth).
2. If Xendit returns a redirect action URL, the browser is sent there.
3. Customer returns to `/result.html`, which asks the server (`GET /api/payment-requests/:ref`) for the authoritative status.
4. Xendit webhooks hit `POST /webhooks/xendit` (verified via `x-callback-token`); expose locally with a tunnel such as ngrok.

Note: the request payload was written without access to the live docs; verify `channel_code`,
`channel_properties` and the `api-version` header against the page above and adjust `server/index.js` per channel.
