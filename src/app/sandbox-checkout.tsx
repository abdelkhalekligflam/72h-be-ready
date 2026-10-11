'use client';

import { useEffect, useRef, useState } from 'react';

type Edition = 'en' | 'fr' | 'bundle';
type PayPalSDK = { Buttons: (options: {
  createOrder: () => Promise<string>;
  onApprove: (data: { orderID: string }) => Promise<void>;
  onError: () => void;
  onCancel: () => void;
}) => { render: (element: HTMLElement) => Promise<void>; close?: () => void } };
declare global { interface Window { paypal?: PayPalSDK } }

export default function SandboxCheckout({ edition, language, onClose }: { edition: Edition; language: 'en' | 'fr'; onClose: () => void }) {
  const container = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let active = true;
    let buttons: ReturnType<PayPalSDK['Buttons']> | undefined;
    const script = document.createElement('script');
    script.async = true;
    script.onload = async () => {
      if (!active) return;
      if (!window.paypal || !container.current) { setStatus('error'); setMessage('PayPal SDK loaded without Buttons. Check browser extensions or PayPal SDK response.'); return; }
      try {
        buttons = window.paypal.Buttons({
          createOrder: async () => {
            const response = await fetch('/api/paypal/create-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ edition })
            });
            const result = await response.json();
            if (!response.ok || !result.id) throw new Error(result.error || 'Unable to create order');
            return result.id as string;
          },
          onApprove: async ({ orderID }) => {
            const response = await fetch('/api/paypal/capture-order', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orderId: orderID })
            });
            const result = await response.json();
            if (active) setMessage(response.ok && result.status === 'COMPLETED'
              ? (language === 'en' ? 'Sandbox payment successful. No real money charged and no files delivered.' : 'Paiement Sandbox réussi. Aucun débit réel et aucun fichier livré.')
              : (result.error || 'Payment verification failed'));
          },
          onError: () => { if (active) setMessage('PayPal Sandbox test failed. Please try again.'); },
          onCancel: () => { if (active) setMessage('Sandbox test cancelled.'); }
        });
        await buttons.render(container.current);
        if (active) setStatus('ready');
      } catch (error) {
        if (active) { setStatus('error'); setMessage('PayPal SDK render failed: ' + (error instanceof Error ? error.message : String(error))); }
      }
    };
    script.onerror = () => { if (active) { setStatus('error'); setMessage('PayPal SDK script failed to load. Check the browser console/network and Preview configuration.'); } };
    fetch('/api/paypal/config', { cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error('Sandbox config unavailable (' + response.status + ')'); return response.json(); })
      .then(({ clientId }) => {
        if (!active) return;
        if (typeof clientId !== 'string' || !clientId.trim()) throw new Error('Missing PayPal client ID');
        script.src = 'https://www.paypal.com/sdk/js?client-id=' + encodeURIComponent(clientId.trim()) + '&currency=EUR&intent=capture&components=buttons';
        document.body.appendChild(script);
      })
      .catch(error => { if (active) { setStatus('error'); setMessage('PayPal configuration error: ' + (error instanceof Error ? error.message : String(error))); } });
    return () => {
      active = false;
      try { buttons?.close?.(); } catch { /* SDK cleanup */ }
      script.remove();
    };
  }, [edition, language]);

  return <section style={{ maxWidth: 580, margin: '30px auto', padding: 26, border: '1px solid #565656', borderRadius: 16 }} aria-label="PayPal Sandbox checkout">
    <p style={{ fontWeight: 700, marginBottom: 12 }}>PAYPAL SANDBOX · {edition.toUpperCase()}</p>
    <p style={{ marginBottom: 18 }}>{language === 'en' ? 'TEST MODE ONLY — No real charges. Free workbook included with the final edition, not delivered in tests.' : 'MODE TEST UNIQUEMENT — Aucun débit réel. Carnet bonus inclus dans la future édition, non livré pendant les tests.'}</p>
    {status === 'loading' && <p>Loading PayPal Sandbox…</p>}
    <div ref={container} />
    {message && <p role="status" style={{ marginTop: 14 }}>{message}</p>}
    <button type="button" onClick={onClose} style={{ marginTop: 20, textDecoration: 'underline' }}>{language === 'en' ? 'Close test checkout' : 'Fermer le paiement de test'}</button>
  </section>;
}
