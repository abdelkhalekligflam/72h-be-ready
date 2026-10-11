import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  if (process.env.PAYPAL_ENV !== 'sandbox' || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return NextResponse.json({ error: 'Sandbox unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ clientId: process.env.PAYPAL_CLIENT_ID, environment: 'sandbox' }, { headers: { 'Cache-Control': 'no-store' } });
}
