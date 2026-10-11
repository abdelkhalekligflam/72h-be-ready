# PayPal Sandbox Preview

This branch is intended only for Preview deployment testing.

1. Configure PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_ENV=sandbox in Vercel Preview environment.
2. Open the Preview deployment URL (not the production domain).
3. Test EN, FR, and bundle orders using a PayPal Sandbox buyer account.
4. Verify completed capture responses, EUR amounts, and that no real payment or delivery occurs.
5. Keep production checkout disabled until the handbook safety review and secure file fulfillment are complete.

Never commit API secrets or real buyer data.
