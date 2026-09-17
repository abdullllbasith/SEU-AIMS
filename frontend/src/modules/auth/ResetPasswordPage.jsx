import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiRequest } from '../../services/api-client.js';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [nextPassword, setNextPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    try {
      await apiRequest('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: params.get('token'), nextPassword }),
      });
      setDone(true);
    } catch {
      setError('Invalid or expired reset token');
    }
  }

  return (
    <section className="auth-card">
      <h1>Choose a new password</h1>
      {done ? (
        <p>
          Password updated. <Link to="/login">Sign in</Link>
        </p>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            New password
            <input
              type="password"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              minLength={10}
              required
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button type="submit">Update password</button>
        </form>
      )}
    </section>
  );
}
