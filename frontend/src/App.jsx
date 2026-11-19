import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import AuthForm from './AuthForm.jsx';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(getToken()));

  // Si hay un token guardado, se valida contra la API antes de mostrar la app
  useEffect(() => {
    if (!getToken()) return;
    api
      .get('/auth/me')
      .then(({ data }) => setUser(data.user))
      .catch((err) => {
        if (err.response?.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleAuth({ token, user }) {
    setToken(token);
    setUser(user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  if (loading) return <p className="muted center">Cargando…</p>;
  if (!user) return <AuthForm onAuth={handleAuth} />;

  return (
    <div className="layout">
      <header className="topbar">
        <strong>Clon Drive</strong>
        <div className="row">
          <span>{user.username}</span>
          <button type="button" onClick={logout}>Cerrar sesión</button>
        </div>
      </header>
      <main className="content">
        <h2>Mi unidad</h2>
        <p className="muted">Aquí van las carpetas y archivos (fase 3).</p>
      </main>
    </div>
  );
}
