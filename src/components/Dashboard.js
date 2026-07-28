'use client';

import { useCallback, useEffect, useState } from 'react';
import FinanceWorkspace from './FinanceWorkspace';
import WorkspaceCard from './WorkspaceCard';
import ReferenceProfiles from './ReferenceProfiles';

function money(value, currency) {
  return new Intl.NumberFormat('en', { style: 'currency', currency: currency || 'USD' }).format(value || 0);
}

export default function Dashboard() {
  const [data, setData] = useState({ documents: [], mode: 'loading' });
  const [ownerEmail, setOwnerEmail] = useState(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/documents');
    if (response.ok) setData(await response.json());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [documents] = await Promise.all([
        fetch('/api/documents').then((r) => (r.ok ? r.json() : { documents: [], mode: 'synthetic' })),
      ]);
      if (!cancelled) setData(documents);
    })();
    return () => { cancelled = true; };
  }, []);

  async function review(id, status) {
    if (data.mode === 'synthetic') {
      setData((current) => ({
        ...current,
        documents: current.documents.map((item) => item.id === id ? { ...item, status } : item),
      }));
      return;
    }
    await fetch('/api/documents', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    });
    load();
  }

  const pending = data.documents.filter((item) => item.status === 'needs_review' || item.status === 'pending');
  const approved = data.documents.filter((item) => item.status === 'approved');
  const total = approved.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <main>
      <header className="topbar">
        <div>
          <div className="eyebrow">IKIGAI FINANCE · COMMUNITY</div>
          <h1>Company cockpit</h1>
        </div>
        <div className="topbar-meta">
          <span className={`mode mode--${data.mode}`}>{data.mode === 'synthetic' ? 'SYNTHETIC LOCAL DATA' : data.mode.toUpperCase()}</span>
          <a className="signout" href="/api/auth/logout">Sign out</a>
        </div>
      </header>

      <section className="trust-note">
        <strong>Review-first by design.</strong> OCR creates a proposal. Only a human approval can move evidence forward; bank reconciliation is a separate step.
      </section>

      <section className="metrics" aria-label="Evidence summary">
        <article><span>Needs review</span><strong>{pending.length}</strong></article>
        <article><span>Approved evidence</span><strong>{approved.length}</strong></article>
        <article><span>Approved value</span><strong>{money(total, approved[0]?.currency)}</strong></article>
        <article><span>Storage</span><strong>{data.mode === 'live' ? 'D1 + R2' : 'Demo'}</strong></article>
      </section>

      <FinanceWorkspace />

      <section className="inbox">
        <div className="section-head">
          <div><div className="eyebrow">01 · CAPTURE</div><h2>Documents</h2></div>
          <div className="telegram-hint">Send an image or PDF to your paired Telegram bot.</div>
        </div>
        <div className="document-list">
          {data.documents.length === 0 && (
            <p className="empty">No documents yet. Send a receipt, invoice, or boarding pass to the paired Telegram bot and it will appear here for review.</p>
          )}
          {data.documents.map((item) => (
            <article className="document" key={item.id}>
              <div className="document-main">
                <div className="status-row">
                  <span className={`status status--${item.status}`}>{item.status.replaceAll('_', ' ')}</span>
                  <span>{String(item.type || 'evidence').replaceAll('_', ' ')}</span>
                  {item.confidence != null && <span>{Math.round(item.confidence * 100)}% OCR</span>}
                </div>
                <h3>{item.vendor || 'Unknown issuer'}</h3>
                <p>{item.receipt_date || 'Date needs review'} · {money(item.amount, item.currency)} · {item.category || 'uncategorized'}</p>
                {item.booking_reference && <p>Booking reference: {item.booking_reference}</p>}
              </div>
              <div className="document-actions">
                {item.file_key && <a href={`/api/documents/${item.id}/file`} target="_blank" rel="noreferrer">Original</a>}
                {item.status !== 'approved' && <button onClick={() => review(item.id, 'approved')}>Approve</button>}
                {item.status !== 'rejected' && <button className="secondary" onClick={() => review(item.id, 'rejected')}>Reject</button>}
              </div>
            </article>
          ))}
        </div>
      </section>

      <WorkspaceCard />
      <ReferenceProfiles />
    </main>
  );
}
