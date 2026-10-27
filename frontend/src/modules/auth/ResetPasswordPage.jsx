import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../services/api-client.js';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [nextPassword, setNextPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const token = params.get('token');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, nextPassword }),
      });
      setDone(true);
    } catch {
      setError('Invalid or expired reset token. Request a new link from the forgot-password page.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <header className="auth-card__header">
        <h1>Choose a new password</h1>
        <p className="auth-card__purpose">Use at least 10 characters. You will sign in with your email afterward.</p>
      </header>

      {done ? (
        <p className="auth-card__status" role="status">
          Password updated.{' '}
          <Link to="/login">Sign in</Link>
        </p>
      ) : (
        <form className="auth-card__form" onSubmit={onSubmit} aria-busy={submitting}>
          {!token ? (
            <p className="form-error" role="alert">
              This reset link is missing a token. Open the link from your email, or{' '}
              <Link to="/forgot-password">request a new one</Link>.
            </p>
          ) : null}

          <label>
            New password
            <input
              name="nextPassword"
              type="password"
              autoComplete="new-password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              minLength={10}
              required
              disabled={submitting || !token}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={submitting || !token}>
            {submitting ? 'Updating…' : 'Update password'}
          </button>
        </form>
      )}

      {!done ? (
        <p className="auth-card__footer">
          <Link to="/login">Back to sign in</Link>
        </p>
      ) : null}
    </section>
  );
}
