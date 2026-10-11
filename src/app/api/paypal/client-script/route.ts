import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export async function GET() {
  if (process.env.PAYPAL_ENV !== 'sandbox' || !process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return new NextResponse('Sandbox unavailable', { status: 503 });
  }
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const url = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId) + '&currency=EUR&intent=capture&components=buttons';
  return NextResponse.redirect(url, { status: 307, headers: { 'Cache-Control': 'no-store' } });
}
