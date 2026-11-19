import { useState } from 'react';
import { api, errorMessage } from './api.js';

export default function AuthForm({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isLogin = mode === 'login';

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data } = await api.post(`/auth/${mode}`, { username, password });
      onAuth(data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function toggleMode() {
    setMode(isLogin ? 'register' : 'login');
    setError('');
  }

  return (
    <main className="auth">
      <form className="card" onSubmit={submit}>
        <h1>Clon Drive</h1>
        <h2>{isLogin ? 'Iniciar sesión' : 'Crear cuenta'}</h2>
        <label>
          Usuario
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isLogin ? 'current-password' : 'new-password'}
            minLength={isLogin ? undefined : 6}
            required
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={busy}>
          {isLogin ? 'Entrar' : 'Registrarme'}
        </button>
        <p className="muted">
          {isLogin ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
          <button type="button" className="link" onClick={toggleMode}>
            {isLogin ? 'Crea una' : 'Inicia sesión'}
          </button>
        </p>
      </form>
    </main>
  );
}
