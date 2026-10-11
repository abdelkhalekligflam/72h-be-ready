'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
type Receipt = { edition: 'en'|'fr'|'bundle'; files: string[]; status: string };
const labels: Record<string,string> = { handbook_en:'English handbook',workbook_en:'English workbook',handbook_fr:'French handbook',workbook_fr:'French workbook' };
export default function RecoverPage() {
  const [orderId,setOrderId]=useState('');
  const [email,setEmail]=useState('');
  const [token,setToken]=useState('');
  const [receipt,setReceipt]=useState<Receipt|null>(null);
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=> {
    const hash = window.location.hash;
    const value = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash).get('token');
    if (!value || !/^[a-f0-9]{64}$/.test(value)) return;
    window.history.replaceState(null,'',window.location.pathname);
    setToken(value);
    fetch('/api/orders/receipt',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:value})})
      .then(async r=>{const data=await r.json();if(!r.ok) throw new Error(data.error || 'Receipt unavailable');setReceipt(data);})
      .catch(e=>setMessage(e instanceof Error ? e.message : 'Receipt unavailable'));
  },[]);
  const requestLink=async()=>{
    setBusy(true);setMessage('');
    try {
      const r=await fetch('/api/orders/recover',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:orderId.trim().toUpperCase(),email:email.trim()})});
      const data=await r.json();setMessage(data.message || data.error || 'Request failed');
    }catch{setMessage('Network error. Please try again.');}finally{setBusy(false);}
  };
  const download=async(file:string)=>{
    setBusy(true);setMessage('');
    try{
      const r=await fetch('/api/orders/download',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,file})});
      const data=await r.json();if(!r.ok || !data.url)throw new Error(data.error || 'Download failed');
      window.open(data.url,'_blank','noopener,noreferrer');
    }catch(e){setMessage(e instanceof Error?e.message:'Download failed');}finally{setBusy(false);}
  };
  const keys=receipt?.edition==='bundle'?['handbook_en','workbook_en','handbook_fr','workbook_fr']:receipt?.edition==='en'?['handbook_en','workbook_en']:['handbook_fr','workbook_fr'];
  return <main style={{minHeight:'100vh',background:'#101010',color:'#f7f3ef',padding:'64px 20px',fontFamily:'Arial,sans-serif'}}><section style={{maxWidth:600,margin:'0 auto',lineHeight:1.6}}><Link href="/" style={{color:'#ff625b'}}>← 72H — BE READY</Link><h1 style={{fontSize:40}}>Recover your downloads</h1><p style={{color:'#c7c1bc'}}>Sandbox test only. Recovery emails require verified email service configuration. Never share your download link.</p>{receipt?<><p>Verified order: {receipt.edition.toUpperCase()}</p>{keys.map(file=><button key={file} disabled={busy} onClick={()=>download(file)} style={{display:'block',width:'100%',padding:15,margin:'12px 0',borderRadius:8,border:'1px solid #777',background:'#242424',color:'#fff',textAlign:'left'}}>Download · {labels[file]}</button>)}</>:!token?<div style={{display:'grid',gap:22,marginTop:30}}><label>PayPal order ID<input value={orderId} onChange={e=>setOrderId(e.target.value)} maxLength={32} style={{display:'block',boxSizing:'border-box',width:'100%',padding:14,marginTop:8,color:'#fff',background:'#242424',border:'1px solid #777',borderRadius:10,fontSize:16}}/></label><label>PayPal payer email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} maxLength={254} style={{display:'block',boxSizing:'border-box',width:'100%',padding:14,marginTop:8,color:'#fff',background:'#242424',border:'1px solid #777',borderRadius:10,fontSize:16}}/></label><button disabled={busy||!orderId||!email} onClick={requestLink} style={{padding:14,background:'#e34843',color:'white',border:0,borderRadius:8}}>Send secure recovery link</button></div>:null}{message&&<p role="status" style={{marginTop:22}}>{message}</p>}</section></main>;
}
