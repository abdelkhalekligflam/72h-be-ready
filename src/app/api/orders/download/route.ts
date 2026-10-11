import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BUCKET = '72h-digital-products';
const paths: Record<string, string> = {
  handbook_en: 'handbooks/72H_BE_READY_EN.pdf',
  handbook_fr: 'handbooks/72H_BE_READY_FR.pdf',
  workbook_en: 'workbooks/72H_BE_READY_WORKBOOK_EN.pdf',
  workbook_fr: 'workbooks/72H_BE_READY_WORKBOOK_FR.pdf',
};
const entitlements: Record<string, string[]> = {
  en: ['handbook_en', 'workbook_en'],
  fr: ['handbook_fr', 'workbook_fr'],
  bundle: ['handbook_en', 'workbook_en', 'handbook_fr', 'workbook_fr'],
};

export async function POST(request: Request) {
  // No public live downloads until live payment and delivery security review.
  if (process.env.PAYPAL_ENV !== 'sandbox') return NextResponse.json({ error: 'Sandbox only' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const token = body?.token;
  const file = body?.file;
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token) ||
      typeof file !== 'string' || !Object.prototype.hasOwnProperty.call(paths, file)) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return NextResponse.json({ error: 'Storage not configured' }, { status: 503 });
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  const hash = createHash('sha256').update(token).digest('hex');
  const orderRes = await fetch(url.replace(/\/$/, '') + '/rest/v1/digital_orders?download_token_hash=eq.' + hash + '&select=edition,payment_status,fulfillment_status,download_token_expires_at&limit=1', { headers, cache: 'no-store' });
  if (!orderRes.ok) return NextResponse.json({ error: 'Order verification unavailable' }, { status: 502 });
  const [order] = await orderRes.json();
  if (!order || order.payment_status !== 'COMPLETED' ||
      !order.download_token_expires_at || Date.parse(order.download_token_expires_at) <= Date.now()) {
    return NextResponse.json({ error: 'Receipt expired or payment not verified' }, { status: 403 });
  }
  if (!entitlements[order.edition]?.includes(file)) return NextResponse.json({ error: 'Not included in your edition' }, { status: 403 });
  if (order.fulfillment_status === 'REVOKED') return NextResponse.json({ error: 'Delivery unavailable' }, { status: 403 });
  const signed = await fetch(url.replace(/\/$/, '') + '/storage/v1/object/sign/' + BUCKET + '/' + paths[file], {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }), cache: 'no-store'
  });
  if (!signed.ok) return NextResponse.json({ error: 'File temporarily unavailable' }, { status: 502 });
  const data = await signed.json();
  if (typeof data.signedURL !== 'string') return NextResponse.json({ error: 'Invalid storage response' }, { status: 502 });
  const signedUrl = new URL(data.signedURL, url.replace(/\/$/, '') + '/storage/v1/').toString();
  if (new URL(signedUrl).origin !== new URL(url).origin) return NextResponse.json({ error: 'Invalid storage URL' }, { status: 502 });
  return NextResponse.json({ url: signedUrl, expiresIn: 60 }, { headers: { 'Cache-Control': 'no-store' } });
}
