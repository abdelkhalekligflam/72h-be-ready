import { NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    if (process.env.PAYPAL_ENV !== 'sandbox') return NextResponse.json({ error: 'Sandbox only' }, { status: 403 });
    const id = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_CLIENT_SECRET;
    if (!id || !secret) return NextResponse.json({ error: 'Sandbox not configured' }, { status: 503 });
    const body = await request.json();
    const orderId = body?.orderId;
    if (typeof orderId !== 'string' || !/^[A-Z0-9]{8,32}$/.test(orderId)) return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
    const base = 'https://api-m.sandbox.paypal.com';
    const auth = await fetch(base + '/v1/oauth2/token', {
      method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', cache: 'no-store'
    });
    if (!auth.ok) return NextResponse.json({ error: 'Authentication failed' }, { status: 502 });
    const { access_token } = await auth.json();
    const orderResponse = await fetch(base + '/v2/checkout/orders/' + orderId, {
      headers: { Authorization: 'Bearer ' + access_token }, cache: 'no-store'
    });
    if (!orderResponse.ok) return NextResponse.json({ error: 'Unable to verify PayPal order' }, { status: 502 });
    const originalOrder = await orderResponse.json();
    if (!Array.isArray(originalOrder.purchase_units) || originalOrder.purchase_units.length !== 1) return NextResponse.json({ error: 'Unexpected order structure' }, { status: 422 });
    const originalUnit = originalOrder.purchase_units[0];
    const prices: Record<string,string> = { en: '9.90', fr: '9.90', bundle: '16.90' };
    const edition = originalUnit?.custom_id;
    if (typeof edition !== 'string' || !Object.prototype.hasOwnProperty.call(prices, edition) ||
        originalUnit?.amount?.currency_code !== 'EUR' || originalUnit?.amount?.value !== prices[edition]) {
      return NextResponse.json({ error: 'Order edition or amount mismatch' }, { status: 422 });
    }
    if (originalOrder.status === 'COMPLETED') return NextResponse.json({ error: 'Order already captured. Contact support with your PayPal order ID.', orderId }, { status: 409 });
    if (originalOrder.status !== 'APPROVED') return NextResponse.json({ error: 'Order not approved for capture' }, { status: 422 });
    const response = await fetch(base + '/v2/checkout/orders/' + orderId + '/capture', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + access_token, 'Content-Type': 'application/json', 'PayPal-Request-Id': 'capture-' + orderId },
      body: '{}', cache: 'no-store'
    });
    const result = await response.json();
    if (!response.ok || result.status !== 'COMPLETED') return NextResponse.json({ error: 'Payment not completed' }, { status: 422 });
    if (!Array.isArray(result.purchase_units) || result.purchase_units.length !== 1 || !Array.isArray(originalOrder.purchase_units) || originalOrder.purchase_units.length !== 1) return NextResponse.json({ error: 'Unexpected order structure' }, { status: 422 });
    const unit = result.purchase_units?.[0];
    const capture = unit?.payments?.captures?.[0];
    if (!Array.isArray(unit?.payments?.captures) || unit.payments.captures.length !== 1 || capture?.status !== 'COMPLETED' || capture?.amount?.currency_code !== 'EUR' || capture?.amount?.value !== prices[edition]) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 422 });
    }
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SECRET_KEY;
    if (!supabaseUrl || !supabaseKey) return NextResponse.json({ error: 'Order storage not configured' }, { status: 503 });
    const captureId = capture?.id;
    if (typeof captureId !== 'string' || !captureId) return NextResponse.json({ error: 'Missing capture reference' }, { status: 422 });
    if (result.id !== orderId || capture?.final_capture === false) return NextResponse.json({ error: 'Unexpected capture details' }, { status: 422 });
    const payerEmail = typeof result.payer?.email_address === 'string' ? result.payer.email_address : null;
    const claimToken = randomBytes(32).toString('hex');
    const claimHash = createHash('sha256').update(claimToken).digest('hex');
    const save = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/digital_orders?on_conflict=paypal_order_id', {
      method: 'POST',
      headers: {
        apikey: supabaseKey,
        Authorization: 'Bearer ' + supabaseKey,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        paypal_order_id: orderId,
        paypal_capture_id: captureId,
        edition,
        amount_eur: prices[edition],
        currency: 'EUR',
        payment_status: 'COMPLETED',
        payer_email: payerEmail,
        fulfillment_status: 'PENDING',
        download_token_hash: claimHash,
        download_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString()
      }),
      cache: 'no-store'
    });
    if (!save.ok) {
      console.error('Sandbox order persistence failed', save.status);
      return NextResponse.json({ error: 'Payment completed, but order recording needs support. Keep your PayPal order ID.', orderId }, { status: 503 });
    }
    return NextResponse.json({ status: 'COMPLETED', edition, sandbox: true, orderId, claimToken, note: 'Sandbox test payment saved. Private PDF test downloads are available for one hour.' });
  } catch {
    return NextResponse.json({ error: 'Sandbox capture unavailable' }, { status: 503 });
  }
}
