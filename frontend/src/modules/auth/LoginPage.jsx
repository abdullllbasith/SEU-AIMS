import { useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';
import { loginErrorMessage } from './login-errors.js';

export function LoginPage() {
  const { login, status, user } = useAuth();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated' && user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    const restrictDomain = import.meta.env.VITE_AUTH_RESTRICT_LOGIN_DOMAIN !== 'false';
    if (restrictDomain && !/^[^\s@]+@seu\.ac\.lk$/i.test(identifier.trim())) {
      setError('Only @seu.ac.lk email addresses can sign in.');
      return;
    }
    setSubmitting(true);
    try {
      await login({ identifier: identifier.trim(), password });
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
          Sign in with your university account email to access your academic workspace.
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
          <div className="auth-card__password-wrap">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={submitting}
            />
            {password.length > 0 && (
              <button
                type="button"
                className="auth-card__password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            )}
          </div>
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
