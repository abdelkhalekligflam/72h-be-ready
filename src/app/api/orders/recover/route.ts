import { createHash, randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export async function GET() {
  const configured = process.env.PAYPAL_ENV === 'sandbox' && Boolean(process.env.RESEND_API_KEY && process.env.RECOVERY_FROM_EMAIL && process.env.RECOVERY_TEST_EMAIL && process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  return NextResponse.json({ available: configured }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (process.env.PAYPAL_ENV !== 'sandbox') return NextResponse.json({ error: 'Recovery is in test mode only' }, { status: 403 });
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  const mailKey = process.env.RESEND_API_KEY;
  const from = process.env.RECOVERY_FROM_EMAIL;
  const site = process.env.RECOVERY_BASE_URL || (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : '');
  const testEmail = process.env.RECOVERY_TEST_EMAIL?.trim().toLowerCase();
  if (!base || !key || !mailKey || !from || !site || !testEmail) return NextResponse.json({ error: 'Email recovery is not configured yet' }, { status: 503 });
  let siteUrl: URL;
  try { siteUrl = new URL(site); if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || (process.env.VERCEL_URL && siteUrl.hostname !== process.env.VERCEL_URL)) throw new Error('invalid'); }
  catch { return NextResponse.json({ error: 'Recovery URL configuration invalid' }, { status: 503 }); }
  const body = await request.json().catch(() => null);
  const orderId = body?.orderId;
  const email = body?.email;
  if (typeof orderId !== 'string' || !/^[A-Z0-9]{8,32}$/.test(orderId) ||
      typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'Invalid order details' }, { status: 400 });
  // Sandbox: verify the original PayPal payer email, but deliver only to the verified Resend test inbox.
  const generic = NextResponse.json({ message: 'If the order and PayPal payer email match, a test recovery link will be sent to the configured Resend test inbox.' }, { headers: { 'Cache-Control': 'no-store' } });
  const headers = { apikey: key, Authorization: 'Bearer ' + key };
  const params = new URLSearchParams({ paypal_order_id: 'eq.' + orderId, payer_email: 'eq.' + email, select: 'id,payment_status,recovery_requested_at,fulfillment_status,download_token_hash,download_token_expires_at', limit: '1' });
  const found = await fetch(base.replace(/\/$/, '') + '/rest/v1/digital_orders?' + params, { headers, cache: 'no-store' });
  if (!found.ok) return NextResponse.json({ error: 'Recovery service temporarily unavailable' }, { status: 503 });
  const rows = await found.json();
  const order = rows?.[0];
  if (!order || order.payment_status !== 'COMPLETED' || order.fulfillment_status === 'REVOKED') return generic;
  if (order.recovery_requested_at && Date.now() - Date.parse(order.recovery_requested_at) < 15 * 60 * 1000) return generic;
  const token = randomBytes(32).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  const now = new Date().toISOString();
  // Atomic conditional update: only one concurrent request may rotate a receipt within the cooldown window.
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const filter = 'id=eq.' + encodeURIComponent(order.id) + '&or=(recovery_requested_at.is.null,recovery_requested_at.lt.' + encodeURIComponent(cutoff) + ')';
  const update = await fetch(base.replace(/\/$/, '') + '/rest/v1/digital_orders?' + filter, {
    method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ download_token_hash: hash, download_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), recovery_requested_at: now }), cache: 'no-store'
  });
  if (!update.ok) return NextResponse.json({ error: 'Recovery service temporarily unavailable' }, { status: 503 });
  const changed = await update.json();
  if (!Array.isArray(changed) || changed.length !== 1) return generic;
  const link = new URL('/recover', siteUrl.origin);
  link.hash = 'token=' + token;
  const sent = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: 'Bearer ' + mailKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [testEmail], subject: '72H — BE READY | Your secure download link', text: 'Use this link within one hour to retrieve your purchased PDFs:\n' + link.toString() + '\nIf you did not request this, ignore this email.' }), cache: 'no-store'
  });
  if (!sent.ok) {
    console.error('Recovery email failed', sent.status);
    const restore = await fetch(base.replace(/\/$/, '') + '/rest/v1/digital_orders?id=eq.' + encodeURIComponent(order.id) + '&download_token_hash=eq.' + hash, {
      method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ download_token_hash: order.download_token_hash, download_token_expires_at: order.download_token_expires_at, recovery_requested_at: order.recovery_requested_at }), cache: 'no-store'
    });
    if (!restore.ok) console.error('Recovery restoration failed', restore.status);
    return NextResponse.json({ error: 'Email delivery unavailable. Try again later or contact support.' }, { status: 503 });
  }
  return generic;
}
