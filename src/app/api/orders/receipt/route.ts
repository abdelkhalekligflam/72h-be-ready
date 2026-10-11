import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (process.env.PAYPAL_ENV !== 'sandbox') return NextResponse.json({ error: 'Preview test only' }, { status: 403 });
  const { token } = await request.json().catch(() => ({ token: null }));
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: 'Invalid receipt token' }, { status: 400 });
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Receipt service unavailable' }, { status: 503 });
  const hash = createHash('sha256').update(token).digest('hex');
  const res = await fetch(url.replace(/\/$/, '') + '/rest/v1/digital_orders?download_token_hash=eq.' + hash + '&select=edition,amount_eur,currency,payment_status,fulfillment_status,download_token_expires_at&limit=1', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }, cache: 'no-store'
  });
  if (!res.ok) return NextResponse.json({ error: 'Receipt lookup failed' }, { status: 502 });
  const rows = await res.json();
  const order = rows?.[0];
  if (!order || !order.download_token_expires_at || new Date(order.download_token_expires_at).getTime() <= Date.now()) return NextResponse.json({ error: 'Receipt expired or not found' }, { status: 404 });
  if (order.payment_status !== 'COMPLETED') return NextResponse.json({ error: 'Payment not verified' }, { status: 403 });
  if (!['en', 'fr', 'bundle'].includes(order.edition)) return NextResponse.json({ error: 'Invalid purchased edition' }, { status: 422 });
  if (order.fulfillment_status === 'REVOKED') return NextResponse.json({ error: 'Delivery unavailable. Contact support.' }, { status: 403 });
  const files = order.edition === 'bundle' ? ['English handbook','English workbook','French handbook','French workbook'] : order.edition === 'en' ? ['English handbook','English workbook'] : ['French handbook','French workbook'];
  return NextResponse.json({ edition: order.edition, amount: order.amount_eur, currency: order.currency, status: order.payment_status, files, downloadsEnabled: order.fulfillment_status !== 'REVOKED', note: 'Sandbox test receipt. Private PDF downloads are available while the receipt token is valid.' }, { headers: { 'Cache-Control': 'no-store' } });
}
