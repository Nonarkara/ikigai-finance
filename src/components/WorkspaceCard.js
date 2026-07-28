'use client';

import { useEffect, useState } from 'react';
import { HEADCOUNT_BANDS, REVENUE_BANDS, STAGES } from '@/lib/referenceProfile';

const EMPTY = {
  name: '', descriptor: '', sector: '', city: '',
  headcount_band: '', revenue_band: '', stage: '', why_we_track: '',
};

export default function WorkspaceCard() {
  const [workspace, setWorkspace] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/workspace')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setWorkspace(data);
        setDraft({ ...EMPTY, ...data });
      });
    return () => { cancelled = true; };
  }, []);

  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setError('');
    if (!draft.name.trim()) {
      setError('Company name is required.');
      return;
    }
    setSaving(true);
    const response = await fetch('/api/workspace', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!response.ok) {
      setError((await response.json()).error || 'Save failed.');
      return;
    }
    const updated = await response.json();
    setWorkspace(updated);
    setDraft({ ...EMPTY, ...updated });
    setEditing(false);
  }

  function cancel() {
    setDraft({ ...EMPTY, ...workspace });
    setEditing(false);
    setError('');
  }

  if (!workspace) {
    return (
      <section className="workspace">
        <div className="section-head">
          <div><div className="eyebrow">02 · YOUR COMPANY</div><h2>Workspace</h2></div>
        </div>
        <p className="empty">Loading workspace…</p>
      </section>
    );
  }

  const showContact = false; // workspace never has contact fields by design

  return (
    <section className="workspace">
      <div className="section-head">
        <div><div className="eyebrow">02 · YOUR COMPANY</div><h2>Workspace</h2></div>
        {!editing && <button className="secondary" onClick={() => setEditing(true)}>Edit</button>}
      </div>

      {!editing ? (
        <article className="workspace-card">
          <div className="workspace-name">
            <h3>{workspace.name || 'Untitled company'}</h3>
            <p>{workspace.descriptor || 'Add a one-line description so the workspace has a clear identity.'}</p>
          </div>
          <dl className="workspace-meta">
            <div><dt>Sector</dt><dd>{workspace.sector || '—'}</dd></div>
            <div><dt>City</dt><dd>{workspace.city || '—'}</dd></div>
            <div><dt>Headcount</dt><dd>{workspace.headcount_band || '—'}</dd></div>
            <div><dt>Revenue</dt><dd>{workspace.revenue_band || '—'}</dd></div>
            <div><dt>Stage</dt><dd>{workspace.stage || '—'}</dd></div>
          </dl>
          {workspace.why_we_track && (
            <blockquote className="workspace-why">
              <span className="eyebrow">Why we are tracking this</span>
              <p>{workspace.why_we_track}</p>
            </blockquote>
          )}
        </article>
      ) : (
        <article className="workspace-card workspace-card--editing">
          <Field label="Company name *">
            <input value={draft.name} onChange={(e) => setField('name', e.target.value)} maxLength={120} required />
          </Field>
          <Field label="One-line descriptor">
            <input value={draft.descriptor} onChange={(e) => setField('descriptor', e.target.value)} maxLength={280} placeholder="What we do, in 80 characters" />
          </Field>
          <Field label="Sector">
            <input value={draft.sector} onChange={(e) => setField('sector', e.target.value)} maxLength={120} />
          </Field>
          <Field label="City">
            <input value={draft.city} onChange={(e) => setField('city', e.target.value)} maxLength={120} />
          </Field>
          <Field label="Headcount band">
            <select value={draft.headcount_band} onChange={(e) => setField('headcount_band', e.target.value)}>
              <option value="">Unknown</option>
              {HEADCOUNT_BANDS.map((band) => <option key={band} value={band}>{band}</option>)}
            </select>
          </Field>
          <Field label="Revenue band">
            <select value={draft.revenue_band} onChange={(e) => setField('revenue_band', e.target.value)}>
              <option value="">Unknown</option>
              {REVENUE_BANDS.map((band) => <option key={band} value={band}>{band}</option>)}
            </select>
          </Field>
          <Field label="Stage">
            <select value={draft.stage} onChange={(e) => setField('stage', e.target.value)}>
              <option value="">Unknown</option>
              {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
            </select>
          </Field>
          <Field label="Why we are tracking this">
            <textarea value={draft.why_we_track} onChange={(e) => setField('why_we_track', e.target.value)} maxLength={280} rows={3} />
          </Field>
          {error && <div className="error">{error}</div>}
          <div className="workspace-actions">
            <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="secondary" onClick={cancel} disabled={saving}>Cancel</button>
          </div>
        </article>
      )}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
