'use client';

import { useEffect, useState } from 'react';
import {
  PROFILE_TYPES, HEADCOUNT_BANDS, REVENUE_BANDS, STAGES,
} from '@/lib/referenceProfile';

const TYPE_LABELS = {
  competitor: 'Competitor',
  client: 'Client',
  partner: 'Partner',
  prospect: 'Prospect',
};

const EMPTY_DRAFT = {
  type: 'competitor', name: '', descriptor: '', sector: '', city: '',
  headcount_band: '', revenue_band: '', stage: '', why_we_track: '',
  tags: [],
  contact_name: '', contact_email: '', contact_role: '',
};

const EMPTY_MOVE = { date: new Date().toISOString().slice(0, 10), oneLiner: '', sourceUrl: '' };

export default function ReferenceProfiles() {
  const [profiles, setProfiles] = useState([]);
  const [mode, setMode] = useState('loading');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const response = await fetch('/api/reference-profiles');
    if (!response.ok) return;
    const data = await response.json();
    setProfiles(data.profiles || []);
    setMode(data.mode || 'live');
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const response = await fetch('/api/reference-profiles');
      if (cancelled || !response.ok) return;
      const data = await response.json();
      if (cancelled) return;
      setProfiles(data.profiles || []);
      setMode(data.mode || 'live');
    })();
    return () => { cancelled = true; };
  }, []);

  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (!draft.name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true);
    const response = await fetch('/api/reference-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setSubmitting(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.details ? body.details.join('; ') : body.error || 'Create failed.');
      return;
    }
    setDraft(EMPTY_DRAFT);
    setShowForm(false);
    load();
  }

  const filtered = filter === 'all' ? profiles : profiles.filter((p) => p.type === filter);
  const counts = PROFILE_TYPES.reduce((acc, type) => {
    acc[type] = profiles.filter((p) => p.type === type).length;
    return acc;
  }, { all: profiles.length });

  return (
    <section className="profiles">
      <div className="section-head">
        <div><div className="eyebrow">03 · REFERENCE PROFILES</div><h2>Competitors, clients, partners, prospects</h2></div>
        {!showForm && <button onClick={() => setShowForm(true)}>Add profile</button>}
      </div>
      <p className="section-hint">Read-only context. Reference profiles do not own their own data, OAuth credentials, or finance ledger. You fill them in by hand so the cockpit has a stable comparison surface.</p>

      <nav className="filter-chips" aria-label="Filter reference profiles by type">
        <button className={`chip ${filter === 'all' ? 'chip--active' : ''}`} onClick={() => setFilter('all')}>
          All <span>{counts.all}</span>
        </button>
        {PROFILE_TYPES.map((type) => (
          <button key={type} className={`chip chip--${type} ${filter === type ? 'chip--active' : ''}`} onClick={() => setFilter(type)}>
            {TYPE_LABELS[type]} <span>{counts[type]}</span>
          </button>
        ))}
      </nav>

      {showForm && (
        <form className="profile-form" onSubmit={submit}>
          <div className="field-row">
            <Field label="Type *">
              <div className="type-chips">
                {PROFILE_TYPES.map((type) => (
                  <label key={type} className={`type-chip type-chip--${type} ${draft.type === type ? 'type-chip--active' : ''}`}>
                    <input type="radio" name="type" value={type} checked={draft.type === type} onChange={() => setField('type', type)} />
                    {TYPE_LABELS[type]}
                  </label>
                ))}
              </div>
            </Field>
          </div>
          <div className="field-row field-row--two">
            <Field label="Name *">
              <input value={draft.name} onChange={(e) => setField('name', e.target.value)} required maxLength={120} />
            </Field>
            <Field label="One-line descriptor">
              <input value={draft.descriptor} onChange={(e) => setField('descriptor', e.target.value)} maxLength={280} />
            </Field>
          </div>
          <div className="field-row field-row--three">
            <Field label="Sector">
              <input value={draft.sector} onChange={(e) => setField('sector', e.target.value)} maxLength={120} />
            </Field>
            <Field label="City">
              <input value={draft.city} onChange={(e) => setField('city', e.target.value)} maxLength={120} />
            </Field>
            <Field label="Stage">
              <select value={draft.stage} onChange={(e) => setField('stage', e.target.value)}>
                <option value="">Unknown</option>
                {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </Field>
          </div>
          <div className="field-row field-row--three">
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
            <Field label="Tags (comma-separated)">
              <input
                value={draft.tags.join(', ')}
                onChange={(e) => setField('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
                placeholder="analytics, b2b"
              />
            </Field>
          </div>
          <Field label="Why we are tracking this *">
            <textarea value={draft.why_we_track} onChange={(e) => setField('why_we_track', e.target.value)} maxLength={280} rows={2} placeholder="Why does this entity matter to us?" />
          </Field>
          {draft.type !== 'competitor' && (
            <div className="field-row field-row--three">
              <Field label="Contact name">
                <input value={draft.contact_name} onChange={(e) => setField('contact_name', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Contact email">
                <input type="email" value={draft.contact_email} onChange={(e) => setField('contact_email', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Contact role">
                <input value={draft.contact_role} onChange={(e) => setField('contact_role', e.target.value)} maxLength={120} />
              </Field>
            </div>
          )}
          {draft.type === 'competitor' && (
            <p className="form-hint">Competitors are reference-only — no contact fields are stored.</p>
          )}
          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>{submitting ? 'Saving…' : 'Save profile'}</button>
            <button type="button" className="secondary" onClick={() => { setShowForm(false); setDraft(EMPTY_DRAFT); setError(''); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="profile-grid">
        {mode === 'synthetic' && profiles.length > 0 && (
          <p className="section-hint">Demo data — these rows live in the bundle, not in D1. Configure your D1 binding to make them real.</p>
        )}
        {filtered.length === 0 && !showForm && (
          <p className="empty">No profiles in this view yet. {filter === 'all' ? 'Add the first one above.' : `Add a ${TYPE_LABELS[filter].toLowerCase()}.`}</p>
        )}
        {filtered.map((profile) => (
          <ProfileCard key={profile.id} profile={profile} onChanged={load} />
        ))}
      </div>
    </section>
  );
}

function ProfileCard({ profile, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [move, setMove] = useState(EMPTY_MOVE);
  const [postingMove, setPostingMove] = useState(false);

  const moves = Array.isArray(profile.moves) ? profile.moves
    : (() => { try { return JSON.parse(profile.moves || '[]'); } catch { return []; } })();
  const tags = Array.isArray(profile.tags) ? profile.tags
    : (() => { try { return JSON.parse(profile.tags || '[]'); } catch { return []; } })();

  function setField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function save() {
    setError('');
    setSaving(true);
    const response = await fetch(`/api/reference-profiles/${profile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.details ? body.details.join('; ') : body.error || 'Save failed.');
      return;
    }
    setEditing(false);
    onChanged();
  }

  async function destroy() {
    if (typeof window !== 'undefined' && !window.confirm(`Remove ${profile.name}?`)) return;
    const response = await fetch(`/api/reference-profiles/${profile.id}`, { method: 'DELETE' });
    if (response.ok) onChanged();
  }

  async function postMove(event) {
    event.preventDefault();
    if (!move.oneLiner.trim()) return;
    setPostingMove(true);
    const response = await fetch(`/api/reference-profiles/${profile.id}/moves`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(move),
    });
    setPostingMove(false);
    if (!response.ok) return;
    setMove(EMPTY_MOVE);
    onChanged();
  }

  return (
    <article className={`profile-card profile-card--${profile.type}`}>
      <div className="profile-card-head">
        <div>
          <span className={`type-pill type-pill--${profile.type}`}>{TYPE_LABELS[profile.type] || profile.type}</span>
          <h3>{profile.name}</h3>
          {profile.descriptor && <p>{profile.descriptor}</p>}
        </div>
        {!editing && (
          <div className="profile-actions">
            <button className="secondary" onClick={() => { setDraft(profile); setEditing(true); }}>Edit</button>
            <button className="secondary" onClick={destroy}>Remove</button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          <dl className="profile-meta">
            <div><dt>Sector</dt><dd>{profile.sector || '—'}</dd></div>
            <div><dt>City</dt><dd>{profile.city || '—'}</dd></div>
            <div><dt>Headcount</dt><dd>{profile.headcount_band || '—'}</dd></div>
            <div><dt>Revenue</dt><dd>{profile.revenue_band || '—'}</dd></div>
            <div><dt>Stage</dt><dd>{profile.stage || '—'}</dd></div>
          </dl>
          {tags.length > 0 && (
            <div className="profile-tags">
              {tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}
            </div>
          )}
          {profile.why_we_track && (
            <blockquote className="profile-why">
              <span className="eyebrow">Why we are tracking this</span>
              <p>{profile.why_we_track}</p>
            </blockquote>
          )}
          {profile.type !== 'competitor' && (profile.contact_name || profile.contact_email) && (
            <div className="profile-contact">
              <span className="eyebrow">Primary contact</span>
              <p>{profile.contact_name || '—'}{profile.contact_role ? `, ${profile.contact_role}` : ''}</p>
              {profile.contact_email && <p><a href={`mailto:${profile.contact_email}`}>{profile.contact_email}</a></p>}
            </div>
          )}
          <div className="profile-moves">
            <div className="moves-head">
              <span className="eyebrow">Recent moves</span>
              <form className="add-move" onSubmit={postMove}>
                <input
                  type="date"
                  value={move.date}
                  onChange={(e) => setMove((current) => ({ ...current, date: e.target.value }))}
                  aria-label="Move date"
                />
                <input
                  value={move.oneLiner}
                  onChange={(e) => setMove((current) => ({ ...current, oneLiner: e.target.value }))}
                  placeholder="Hired ex-Axiom CTO 2026-05"
                  maxLength={240}
                />
                <button type="submit" disabled={postingMove || !move.oneLiner.trim()}>Add</button>
              </form>
            </div>
            {moves.length === 0
              ? <p className="empty">No moves logged yet.</p>
              : (
                <ol className="moves-list">
                  {moves.slice().reverse().map((m, i) => (
                    <li key={`${m.date}-${i}`}>
                      <span className="move-date">{m.date || '—'}</span>
                      <span className="move-text">{m.oneLiner}</span>
                      {m.sourceUrl && <a className="move-source" href={m.sourceUrl} target="_blank" rel="noreferrer">source</a>}
                    </li>
                  ))}
                </ol>
              )
            }
          </div>
        </>
      ) : (
        <div className="profile-edit">
          <Field label="Type">
            <div className="type-chips">
              {PROFILE_TYPES.map((type) => (
                <label key={type} className={`type-chip type-chip--${type} ${draft.type === type ? 'type-chip--active' : ''}`}>
                  <input type="radio" name="type" value={type} checked={draft.type === type} onChange={() => setField('type', type)} />
                  {TYPE_LABELS[type]}
                </label>
              ))}
            </div>
          </Field>
          <div className="field-row field-row--two">
            <Field label="Name *">
              <input value={draft.name} onChange={(e) => setField('name', e.target.value)} required maxLength={120} />
            </Field>
            <Field label="One-line descriptor">
              <input value={draft.descriptor} onChange={(e) => setField('descriptor', e.target.value)} maxLength={280} />
            </Field>
          </div>
          <div className="field-row field-row--three">
            <Field label="Sector">
              <input value={draft.sector} onChange={(e) => setField('sector', e.target.value)} maxLength={120} />
            </Field>
            <Field label="City">
              <input value={draft.city} onChange={(e) => setField('city', e.target.value)} maxLength={120} />
            </Field>
            <Field label="Stage">
              <select value={draft.stage} onChange={(e) => setField('stage', e.target.value)}>
                <option value="">Unknown</option>
                {STAGES.map((stage) => <option key={stage} value={stage}>{stage}</option>)}
              </select>
            </Field>
          </div>
          <div className="field-row field-row--three">
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
            <Field label="Tags (comma-separated)">
              <input
                value={Array.isArray(draft.tags) ? draft.tags.join(', ') : (() => { try { return JSON.parse(draft.tags || '[]').join(', '); } catch { return ''; } })()}
                onChange={(e) => setField('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))}
              />
            </Field>
          </div>
          <Field label="Why we are tracking this *">
            <textarea value={draft.why_we_track} onChange={(e) => setField('why_we_track', e.target.value)} maxLength={280} rows={2} />
          </Field>
          {draft.type !== 'competitor' && (
            <div className="field-row field-row--three">
              <Field label="Contact name">
                <input value={draft.contact_name} onChange={(e) => setField('contact_name', e.target.value)} maxLength={120} />
              </Field>
              <Field label="Contact email">
                <input type="email" value={draft.contact_email} onChange={(e) => setField('contact_email', e.target.value)} maxLength={200} />
              </Field>
              <Field label="Contact role">
                <input value={draft.contact_role} onChange={(e) => setField('contact_role', e.target.value)} maxLength={120} />
              </Field>
            </div>
          )}
          {error && <div className="error">{error}</div>}
          <div className="form-actions">
            <button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <button className="secondary" onClick={() => { setDraft(profile); setEditing(false); setError(''); }}>Cancel</button>
          </div>
        </div>
      )}
    </article>
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
