import { useEffect, useState } from 'react';
import { api, errorMessage } from './api.js';

const formatSize = (bytes) =>
  bytes == null ? '' : bytes < 1024 ** 2 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function Drive() {
  const [folderId, setFolderId] = useState(null); // null = Mi unidad
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get(folderId ? `/folders/${folderId}/contents` : '/folders/root/contents')
      .then(({ data }) => active && setData(data))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [folderId, reloadKey]);

  function open(id) {
    setError('');
    setFolderId(id);
  }

  async function createFolder(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/folders', { name: newName, parentId: folderId });
      setNewName('');
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  const path = data?.path ?? [];
  const isEmpty = data && data.folders.length === 0 && data.files.length === 0;

  return (
    <>
      <nav aria-label="Ruta" className="breadcrumb">
        {folderId === null ? (
          <h2 aria-current="page">Mi unidad</h2>
        ) : (
          <button type="button" className="link" onClick={() => open(null)}>Mi unidad</button>
        )}
        {path.map((f, i) => (
          <span key={f.id} className="row">
            <span aria-hidden="true">›</span>
            {i === path.length - 1 ? (
              <h2 aria-current="page">{f.name}</h2>
            ) : (
              <button type="button" className="link" onClick={() => open(f.id)}>{f.name}</button>
            )}
          </span>
        ))}
      </nav>

      <form className="row toolbar" onSubmit={createFolder}>
        <input
          aria-label="Nombre de la nueva carpeta"
          placeholder="Nombre de la carpeta"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          maxLength={255}
        />
        <button type="submit" disabled={!newName.trim()}>Crear carpeta</button>
      </form>

      {error && <p className="error" role="alert">{error}</p>}
      {!data && !error && <p className="muted">Cargando…</p>}
      {isEmpty && <p className="muted">Esta carpeta está vacía.</p>}

      {data && !isEmpty && (
        <ul className="items">
          {data.folders.map((f) => (
            <li key={`d${f.id}`}>
              <button type="button" className="item" onClick={() => open(f.id)}>
                <span aria-hidden="true">📁</span> {f.name}
              </button>
            </li>
          ))}
          {data.files.map((f) => (
            <li key={`f${f.id}`} className="item">
              <span aria-hidden="true">📄</span> {f.name}
              <span className="muted">{formatSize(f.size)}{f.status !== 'ready' && ` · ${f.status}`}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
