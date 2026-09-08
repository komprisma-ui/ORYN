'use client';

import { useState } from 'react';

const nav = [
  ['⌂','Dashboard'], ['◉','Inbox'], ['♙','Customers'], ['◆','Leads'], ['↗','Sales'], ['↻','Follow Up'], ['✦','AI'], ['⚡','Automation'], ['▥','Analytics']
];
const customers = [
  {name:'Budi Santoso', initial:'B', status:'Hot Lead', channel:'WhatsApp', time:'2m', score:91},
  {name:'Nina Marlina', initial:'N', status:'Active', channel:'WhatsApp', time:'8m', score:78},
  {name:'Andi Pratama', initial:'A', status:'New', channel:'Web Chat', time:'15m', score:62},
  {name:'Siti Aisyah', initial:'S', status:'Follow Up', channel:'WhatsApp', time:'32m', score:84},
];

export default function Home() {
  const [active, setActive] = useState('Dashboard');
  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="logoMark">◢</div><div><div className="brandName">ORYN</div><div className="brandTag">Intelligent Customer Operations</div></div></div>
      <div className="workspace"><span className="dot"/> PT ORYN Demo <span>⌄</span></div>
      <nav>{nav.map(([icon,label])=><button key={label} className={active===label?'nav active':'nav'} onClick={()=>setActive(label)}><span>{icon}</span>{label}</button>)}</nav>
      <div className="sidebarBottom"><button className="nav"><span>⚙</span>Settings</button><div className="user"><div className="avatar">YS</div><div><b>Yudhistira</b><small>Owner</small></div><span>⋮</span></div></div>
    </aside>
    <section className="content">
      <header className="topbar"><div><div className="crumb">ORYN / {active}</div><h1>{active}</h1></div><div className="topActions"><button className="iconBtn">⌕</button><button className="iconBtn">♢</button><button className="primary">＋ New Customer</button></div></header>
      <div className="dashboard">
        <section className="hero"><div><div className="eyebrow">GOOD MORNING, YUDHISTIRA</div><h2>Semua pelanggan.<br/><span>Satu kendali.</span></h2><p>Kelola percakapan, follow-up, penjualan, dan insight pelanggan dalam satu pusat operasi yang diperkuat AI.</p><button className="heroBtn">Buka ORYN Inbox →</button></div><div className="heroOrb"><div className="orbCore">◢</div></div></section>
        <div className="stats">
          <Stat label="Total Pelanggan" value="1,248" delta="+12%" icon="♙"/><Stat label="Chat Masuk" value="86" delta="+18%" icon="◉"/><Stat label="Follow Up" value="32" delta="+8%" icon="↻"/><Stat label="Penjualan" value="18" delta="+23%" icon="↗"/>
        </div>
        <div className="grid2">
          <section className="card"><div className="cardHead"><div><h3>AI Insight</h3><p>Prioritas yang ditemukan ORYN hari ini</p></div><span className="aiBadge">✦ AI</span></div><div className="insight"><div className="insightIcon">🔥</div><div><b>7 pelanggan berpotensi tinggi belum ditindaklanjuti.</b><p>Lead score rata-rata 87. Sebagian besar aktif dalam 24 jam terakhir.</p></div><button>Review →</button></div><div className="miniRows"><div><span>Response time</span><b>4m 12s <i>↓ 18%</i></b></div><div><span>Conversion rate</span><b>14.8% <i>↑ 3.2%</i></b></div></div></section>
          <section className="card"><div className="cardHead"><div><h3>Follow Up Hari Ini</h3><p>Prioritas berdasarkan AI</p></div><button className="textBtn">Lihat semua →</button></div>{customers.slice(0,3).map((c,i)=><div className="follow" key={c.name}><div className="avatar small">{c.initial}</div><div className="grow"><b>{c.name}</b><span>{['Follow-up harga paket Premium','Kirim katalog terbaru','Cek keputusan pembelian'][i]}</span></div><strong>{['10:00','13:30','16:00'][i]}</strong></div>)}</section>
        </div>
        <section className="card"><div className="cardHead"><div><h3>Percakapan Terbaru</h3><p>Aktivitas pelanggan yang membutuhkan perhatian</p></div><button className="textBtn">Buka Inbox →</button></div><div className="table">{customers.map(c=><div className="row" key={c.name}><div className="avatar">{c.initial}</div><div className="grow"><b>{c.name}</b><span>{c.channel} · {c.time} lalu</span></div><span className={'pill '+c.status.toLowerCase().replace(' ','-')}>{c.status}</span><span className="score">AI {c.score}</span><button className="more">⋮</button></div>)}</div></section>
      </div>
    </section>
  </main>
}
function Stat({label,value,delta,icon}:{label:string,value:string,delta:string,icon:string}){return <div className="stat"><div className="statIcon">{icon}</div><span>{label}</span><strong>{value}</strong><small>↗ {delta} vs minggu lalu</small></div>}
