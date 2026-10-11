import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
type Edition = 'en' | 'fr' | 'bundle';
const prices: Record<Edition, string> = { en: '9.90', fr: '9.90', bundle: '16.90' };
const names: Record<Edition, string> = { en: '72H BE READY — English + Workbook', fr: '72H SOYEZ PRÊT — Français + Carnet', bundle: '72H BE READY — EN + FR + Both Workbooks' };
function config() {
  if (process.env.PAYPAL_ENV !== 'sandbox') throw new Error('Checkout is only enabled in sandbox');
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) throw new Error('PayPal sandbox credentials are missing');
  return { id, secret, base: 'https://api-m.sandbox.paypal.com' };
}
async function token() {
  const { id, secret, base } = config();
  const response = await fetch(base + '/v1/oauth2/token', {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(id + ':' + secret).toString('base64'), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store'
  });
  if (!response.ok) throw new Error('PayPal authentication failed');
  const json = await response.json();
  return json.access_token as string;
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const edition = body?.edition as Edition;
    if (!Object.prototype.hasOwnProperty.call(prices, edition)) return NextResponse.json({ error: 'Invalid edition' }, { status: 400 });
    const { base } = config();
    const accessToken = await token();
    const response = await fetch(base + '/v2/checkout/orders', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json', 'PayPal-Request-Id': crypto.randomUUID() },
      body: JSON.stringify({ intent: 'CAPTURE', purchase_units: [{ custom_id: edition, description: names[edition], amount: { currency_code: 'EUR', value: prices[edition] } }] }),
      cache: 'no-store'
    });
    const order = await response.json();
    if (!response.ok || !order.id) return NextResponse.json({ error: 'Sandbox order could not be created' }, { status: 502 });
    return NextResponse.json({ id: order.id });
  } catch {
    return NextResponse.json({ error: 'Sandbox checkout is unavailable' }, { status: 503 });
  }
}
