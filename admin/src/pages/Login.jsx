import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../services/api';

export default function Login() {
  const { login, submitting, isAuthenticated, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  // Tell the user why they ended up here if RequireAdmin bounced them.
  const denied = location.state?.denied;
  const initialMsg = denied ? 'Admin access required.' : '';

  // Already-logged-in admins shouldn't sit on the login page.
  if (isAuthenticated && isAdmin) {
    const from = location.state?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setError('');
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    try {
      const u = await login({ email: email.trim(), password });
      if (u?.role !== 'admin') {
        setError('This account is not an admin.');
        return;
      }
      const from = location.state?.from?.pathname || '/';
      navigate(from, { replace: true });
    } catch (err) {
      setError(getApiErrorMessage(err));
    }
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <span className="brand-name">SSBFY</span>
          <span className="brand-tag">Admin</span>
        </div>

        {(error || initialMsg) ? (
          <div className="alert alert-error">{error || initialMsg}</div>
        ) : null}

        <div className="form-row">
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={submitting}
            autoComplete="username"
          />
        </div>

        <div className="form-row">
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={submitting}
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={submitting}
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

