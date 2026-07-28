'use client';

import { useState } from 'react';

const ERROR_MESSAGES = {
  restricted: 'This Google account is not on the operator allowlist. The app is intentionally single-owner.',
  google: 'Google sign-in was cancelled or failed. Try again.',
  unverified: 'Google returned an unverified email. Use an account whose address is verified.',
};

export default function LoginForm({ googleEnabled, error }) {
  const [submitError, setSubmitError] = useState('');
  const bannerError = error ? ERROR_MESSAGES[error] || 'Sign in failed.' : '';

  async function submitPassword(event) {
    event.preventDefault();
    setSubmitError('');
    const password = new FormData(event.currentTarget).get('password');
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (response.ok) window.location.assign('/');
    else setSubmitError((await response.json()).error || 'Sign in failed');
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="eyebrow">IKIGAI FINANCE · COMMUNITY</div>
        <h1>Company evidence, before accounting.</h1>
        <p>Sign in to review private receipt and claim evidence captured by your Telegram bot.</p>

        {bannerError && <div className="error" role="alert">{bannerError}</div>}

        {googleEnabled ? (
          <div className="login-google">
            <a className="google-button" href="/api/auth/google">Sign in with Google</a>
            <p className="login-hint">Restricted to the two operators on the project allowlist.</p>
          </div>
        ) : (
          <form action="/api/auth/login" method="post" onSubmit={submitPassword}>
            <label htmlFor="password">Workspace password</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
            {submitError && <div className="error">{submitError}</div>}
            <button type="submit">Enter workspace</button>
            <p className="login-hint">
              Set <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> to enable Google sign-in.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
