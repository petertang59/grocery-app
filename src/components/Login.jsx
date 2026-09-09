import { useState } from 'react';
import { supabase } from '../supabaseClient';
import './Login.css';

// There's deliberately no sign-up here. Everyone who logs in shares the same
// meals and shopping list, so accounts are created by hand in the Supabase
// dashboard rather than by whoever finds the URL.
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  const signIn = async (e) => {
    e.preventDefault();

    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }

    setSigningIn(true);
    setError('');

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      // Deliberately vague: saying which half was wrong tells an attacker
      // whether an address has an account.
      console.error('Sign-in failed:', signInError);
      setError('That email and password don’t match.');
      setSigningIn(false);
      return;
    }
    // On success the session listener swaps this screen out for the app.
  };

  return (
    <div className="login">
      <form className="login-card" onSubmit={signIn}>
        <span className="login-mark" aria-hidden="true">
          🛒
        </span>
        <h1>Groceries</h1>
        <p className="login-hint">Sign in to see your meals and list.</p>

        <div className="form-group">
          <label htmlFor="loginEmail">Email</label>
          <input
            id="loginEmail"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (error) setError('');
            }}
            autoFocus
          />
        </div>

        <div className="form-group">
          <label htmlFor="loginPassword">Password</label>
          <input
            id="loginPassword"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
          />
        </div>

        {error && <p className="form-error">{error}</p>}

        <button type="submit" className="btn-sign-in" disabled={signingIn}>
          {signingIn ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
