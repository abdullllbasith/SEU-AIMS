import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { loginErrorMessage } from './login-errors.js';

export function LoginPage() {
  const { login, status, user } = useAuth();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login({ identifier, password });
    } catch (caught) {
      setError(loginErrorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-card">
      <header className="auth-card__header">
        <h1>Sign in</h1>
        <p className="auth-card__purpose">
          Use your account email. Registration numbers are academic identity, not login.
        </p>
      </header>

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
        <label>
          Password
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
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
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="auth-card__footer">
        <Link to="/forgot-password">Forgot password</Link>
      </p>
    </section>
  );
}
