import { useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../state/AuthProvider.jsx';

export function LoginPage() {
  const { login, status, user } = useAuth();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (status === 'authenticated' && user) {
    return <Navigate to={location.state?.from || '/'} replace />;
  }

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await login({ identifier, password });
    } catch {
      setError('Invalid credentials');
    }
  }

  return (
    <section>
      <h1>Sign in</h1>
      <p>Use your account email. Registration numbers are academic identity, not login.</p>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input
            name="identifier"
            type="email"
            autoComplete="username"
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            required
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
          />
        </label>
        {error ? <p role="alert">{error}</p> : null}
        <button type="submit">Sign in</button>
      </form>
      <p>
        <a href="/forgot-password">Forgot password</a>
      </p>
    </section>
  );
}
