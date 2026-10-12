import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api-client.js';

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ identifier }),
      });
      setDone(true);
    } catch (caught) {
      setError(caught?.message || 'Unable to send reset message. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <header className="auth-card__header">
        <h1>Forgot password</h1>
        <p className="auth-card__purpose">
          Enter the email on your account. If it matches an active user, a reset message will be sent.
        </p>
      </header>

      {done ? (
        <p className="auth-card__status" role="status">
          If an account exists for that email, a reset message was sent. Check your inbox, then return to
          sign in.
        </p>
      ) : (
        <form className="auth-card__form" onSubmit={onSubmit} aria-busy={submitting}>
          <label>
            Email
            <input
              name="identifier"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
              disabled={submitting}
            />
          </label>

          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="auth-card__footer">
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  );
}
