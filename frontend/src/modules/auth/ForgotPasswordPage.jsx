import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiRequest } from '../../services/api-client.js';

export function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    await apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ identifier }),
    });
    setDone(true);
  }

  return (
    <section>
      <h1>Reset password</h1>
      {done ? (
        <p>If an account exists, a reset message was sent.</p>
      ) : (
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>
          <button type="submit">Send reset</button>
        </form>
      )}
      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </section>
  );
}
