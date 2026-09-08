'use client';

import { useEffect, useState } from 'react';

type Customer = { id: string; name: string; status: string; channel?: string; leadScore?: number | null; phone?: string | null };
type Dashboard = { customers: number; conversations: number; followUps: number; activeLeads: number; openChats: number; hotLeadsNeedingFollowUp: number };

const nav = [['⌂','Dashboard'],['◉','Inbox'],['♙','Customers'],['◆','Leads'],['↗','Sales'],['↻','Follow Up'],['✦','AI'],['⚡','Automation'],['▥','Analytics']];
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function Home() {
  const [active, setActive] = useState('Dashboard');
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const [d, c] = await Promise.all([fetch(`${API}/api/v1/dashboard`), fetch(`${API}/api/v1/customers?limit=6`)]);
        if (!d.ok || !c.ok) throw new Error('ORYN API belum tersedia');
        setDashboard((await d.json()).data);
        setCustomers((await c.json()).data);
      } catch (e) { setError(e instanceof Error ? e.message : 'Gagal memuat data'); }
    };
    load();
  }, []);

  const stats = dashboard ? [
    ['Total Pelanggan', dashboard.customers.toLocaleString('id-ID'), '♙'],
    ['Chat Aktif', dashboard.openChats.toLocaleString('id-ID'), '◉'],
    ['Follow Up', dashboard.followUps.toLocaleString('id-ID'), '↻'],
    ['Lead Aktif', dashboard.activeLeads.toLocaleString('id-ID'), '↗']
  ] : [];

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logoMark">◢</div><div><div className="brandName">ORYN</div><div className="brandTag">Intelligent Customer Operations</div></div></div>
      <div className="workspace"><span className="dot"/> ORYN Demo <span>⌄</span></div>
      <nav>{nav.map(([icon,label]) => <button key={label} className={active===label?'nav active':'nav'} onClick={()=>setActive(label)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebarBottom"><button className="nav"><span>⚙</span>Settings</button><div className="user"><div className="avatar">O</div><div><b>ORYN Owner</b><small>Owner</small></div><span>⋮</span></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><div className="crumb">ORYN / {active}</div><h1>{active}</h1></div><div className="topActions"><button className="iconBtn">⌕</button><button className="iconBtn">♢</button><button className="primary">＋ New Customer</button></div></header>
      <div className="dashboard">
        {error && <div className="errorBanner">⚠ {error}. Jalankan API ORYN dan refresh halaman.</div>}
        <section className="hero"><div><div className="eyebrow">INTELLIGENT CUSTOMER OPERATIONS</div><h2>Semua pelanggan.<br/><span>Satu kendali.</span></h2><p>Kelola percakapan, follow-up, penjualan, dan insight pelanggan dalam satu pusat operasi yang diperkuat AI.</p><button className="heroBtn" onClick={()=>setActive('Inbox')}>Buka ORYN Inbox →</button></div><div className="heroOrb"><div className="orbCore">◢</div></div></section>
        <div className="stats">{stats.map(([label,value,icon])=><Stat key={label} label={label} value={value} delta="Live" icon={icon}/>)}</div>
        <div className="grid2">
          <section className="card"><div className="cardHead"><div><h3>AI Insight</h3><p>Prioritas yang ditemukan ORYN</p></div><span className="aiBadge">✦ AI</span></div><div className="insight"><div className="insightIcon">🔥</div><div><b>{dashboard?.hotLeadsNeedingFollowUp ?? '—'} pelanggan berpotensi tinggi perlu ditindaklanjuti.</b><p>Prioritas dihitung dari status dan lead score pelanggan.</p></div><button onClick={()=>setActive('Follow Up')}>Review →</button></div><div className="miniRows"><div><span>Chat aktif</span><b>{dashboard?.openChats ?? '—'}</b></div><div><span>Total percakapan</span><b>{dashboard?.conversations ?? '—'}</b></div></div></section>
          <section className="card"><div className="cardHead"><div><h3>Pelanggan Teratas</h3><p>Lead score tertinggi</p></div><button className="textBtn" onClick={()=>setActive('Customers')}>Lihat semua →</button></div>{customers.slice(0,3).map(c=><div className="follow" key={c.id}><div className="avatar small">{c.name.charAt(0)}</div><div className="grow"><b>{c.name}</b><span>{c.status.replaceAll('_',' ')}</span></div><strong>AI {c.leadScore ?? '—'}</strong></div>)}</section>
        </div>
        <section className="card"><div className="cardHead"><div><h3>Pelanggan Terbaru</h3><p>Data langsung dari ORYN API</p></div><button className="textBtn" onClick={()=>setActive('Inbox')}>Buka Inbox →</button></div><div className="table">{customers.map(c=><div className="row" key={c.id}><div className="avatar">{c.name.charAt(0)}</div><div className="grow"><b>{c.name}</b><span>{c.phone ?? 'Kontak belum diisi'}</span></div><span className={'pill '+c.status.toLowerCase().replaceAll('_','-')}>{c.status.replaceAll('_',' ')}</span><span className="score">AI {c.leadScore ?? '—'}</span><button className="more">⋮</button></div>)}{customers.length===0 && <div className="empty">Belum ada pelanggan pada tenant ini.</div>}</div></section>
      </div>
    </section>
  </main>
}
function Stat({label,value,delta,icon}:{label:string,value:string,delta:string,icon:string}){return <div className="stat"><div className="statIcon">{icon}</div><span>{label}</span><strong>{value}</strong><small>• {delta}</small></div>}
