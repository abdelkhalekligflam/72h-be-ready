# 72H — Digital delivery implementation contract

## Product-to-file mapping

| Edition | Price | Deliverables |
| --- | --- | --- |
| en | EUR 9.90 | English handbook PDF + English emergency planning workbook PDF |
| fr | EUR 9.90 | French handbook PDF + French emergency planning workbook PDF |
| bundle | EUR 16.90 | Both handbook PDFs + both workbook PDFs |

## Current implementation

- PayPal sandbox order creation includes a server-generated edition custom_id and a server-controlled EUR price.
- PayPal sandbox capture checks completed status, EUR currency, edition identifier, and the exact edition price.
- The checkout UI explicitly says no files are delivered in sandbox.
- Live checkout remains disabled.

## Required before delivering files or enabling Live

1. Complete editorial, translation, safety, and legal review of the final handbook PDFs. Do not deliver draft or unreviewed PDFs.
2. Upload all four approved PDFs to **private** object storage (e.g. a private Supabase Storage bucket), never to /public or a public GitHub repository.
3. Add durable server-side order storage keyed by PayPal order/capture ID, including edition, amount, currency, payment state, recipient, and delivery status. Enforce uniqueness and idempotency.
4. Verify payment server-side with PayPal and validate capture payee, completed status, amount, currency, and edition. Implement verified webhook handling for asynchronous updates, refunds, and disputes.
5. Issue short-lived, edition-scoped download links only after verified payment; do not trust edition, filenames, or price supplied by browser requests.
6. Add success/download page and optional transactional email, plus retry and support path.
7. Test all three products, failed/cancelled/refunded payments, duplicate callbacks, link expiry, unauthorized downloads, and email delivery in sandbox.
8. Verify PayPal Business account eligibility, seller identity, applicable taxes, consumer refund/digital-content requirements, privacy and terms before live launch.

Do not add PAYPAL_CLIENT_SECRET to source code. Sandbox and live credentials must be separated.
