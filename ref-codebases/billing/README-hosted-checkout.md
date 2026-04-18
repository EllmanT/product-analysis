# Hosted Checkout (Public Payments Page)

This app supports a **Stripe-like hosted checkout** flow so external systems can trigger subscription payments by `plan_id` without implementing payment logic themselves.

## Overview

1. **External system** calls the Billing API to create a checkout session (server-to-server).
2. Billing returns a **public URL** (`/pay/{publicId}`).
3. **User** is redirected to that page, selects a payment method, and completes payment.
4. Billing **redirects the user** back to the external system’s `callback_url` with the result.

## API

### Create checkout session

`POST /api/checkout-sessions`

Headers:

- `X-API-Key: axb_...`

Body:

```json
{
  "plan_id": 123,
  "callback_url": "https://origin-system.example.com/billing/callback",
  "external_reference": "order_abc_123",
  "customer": {
    "name": "Jane Doe",
    "email": "jane@example.com"
  },
  "metadata": {
    "source": "pos",
    "device_id": "DEV-1001"
  }
}
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "0d6f1e0a-....",
    "status": "open",
    "url": "https://billing.example.com/pay/0d6f1e0a-...."
  }
}
```

### Retrieve checkout session (optional server verification)

`GET /api/checkout-sessions/{public_id}`

Use this from the originating system to verify the result after the user is redirected back.

## Public routes

- `GET /pay/{publicId}`: hosted payments page (choose method)
- `POST /pay/{publicId}/zimswitch/start`: starts OPPWA Copy & Pay widget
- `GET /pay/{publicId}/zimswitch/widget`: shows payment widget
- `GET /pay/{publicId}/zimswitch/return`: OPPWA return URL
- `GET /pay/{publicId}/ecocash`: EcoCash number input form
- `POST /pay/{publicId}/ecocash/start`: initiates EcoCash debit push
- `GET /pay/{publicId}/ecocash/wait`: waiting page (user approves on phone)
- `GET /pay/{publicId}/complete`: status/completion page (auto-redirects when finalized)

## Callback redirect

On success, the user is redirected to:

`{callback_url}?checkout_session_id={public_id}&status=succeeded&subscription_id={id}`

If the payment fails, `status=failed` is sent.

For security, **do not trust the redirect alone**. Always verify using:

`GET /api/checkout-sessions/{public_id}` with your API key.

## How completion works

Payments are recorded against an **invoice** created for the plan price.

When a payment is recorded, the `PaymentCompleted` event fires and a listener:

- marks the checkout session `succeeded`
- creates the subscription
- links the invoice to the new subscription

