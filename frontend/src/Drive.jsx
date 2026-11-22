import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api.js';
import { useUploads, STATUS_LABEL } from './useUploads.js';

const formatSize = (bytes) =>
  bytes == null ? '' : bytes < 1024 ** 2 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 ** 2).toFixed(1)} MB`;

export default function Drive() {
  const [folderId, setFolderId] = useState(null); // null = Mi unidad
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [newName, setNewName] = useState('');
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);
  const { uploads, start, cancel, clearFinished, isFinal } = useUploads(() => setReloadKey((k) => k + 1));

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

  function onDragOver(e) {
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault(); // sin esto el navegador abre el archivo en vez de soltarlo aquí
    setDragging(true);
  }

  function onDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) start(e.dataTransfer.files, folderId);
  }

  function onPick(e) {
    start(e.target.files, folderId);
    e.target.value = ''; // permite volver a elegir el mismo archivo
  }

  const path = data?.path ?? [];
  const isEmpty = data && data.folders.length === 0 && data.files.length === 0;

  return (
    <section
      className={dragging ? 'dropzone dragging' : 'dropzone'}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
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
        <button type="button" className="primary" onClick={() => fileInput.current.click()}>
          Subir archivos
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={onPick} />
      </form>
      <p className="muted hint">También puedes arrastrar archivos y soltarlos aquí.</p>

      {uploads.length > 0 && (
        <section className="uploads" aria-label="Subidas">
          <div className="row">
            <strong>Subidas</strong>
            <button type="button" className="link" onClick={clearFinished}>Limpiar terminadas</button>
          </div>
          <ul>
            {uploads.map((u) => (
              <li key={u.key}>
                <span className="name">{u.name}</span>
                {u.status === 'sending' ? (
                  <progress value={u.progress} max={1} aria-label={`Progreso de ${u.name}`} />
                ) : (
                  <span className={u.status === 'error' || u.status === 'failed' ? 'error' : 'muted'}>
                    {u.status === 'error' ? u.error : STATUS_LABEL[u.status]}
                  </span>
                )}
                {u.status === 'sending' && <span className="muted">{Math.round(u.progress * 100)}%</span>}
                {!isFinal(u) && u.status !== 'uploading' && (
                  <button type="button" onClick={() => cancel(u)}>Cancelar</button>
                )}
                {u.error && u.status !== 'error' && <span className="error">{u.error}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

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
              <span className="muted">
                {formatSize(f.size)}
                {f.status !== 'ready' && ` · ${STATUS_LABEL[f.status]}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
