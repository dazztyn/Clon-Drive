import { useRef, useState } from 'react';
import { api, errorMessage } from './api.js';

export const STATUS_LABEL = {
  pending: 'En cola',
  uploading: 'Guardando en S3',
  ready: 'Listo',
  failed: 'Error al guardar',
  cancelled: 'Cancelado',
};
const FINAL = ['ready', 'failed', 'cancelled', 'error'];
const POLL_MS = 1000;

// Cada subida pasa por: sending (HTTP con progreso) → pending → uploading → ready/failed,
// o termina en cancelled/error. onChange se llama cuando hay que recargar la carpeta.
export function useUploads(onChange) {
  const [uploads, setUploads] = useState([]);
  const nextKey = useRef(0);

  const update = (key, patch) =>
    setUploads((list) => list.map((u) => (u.key === key ? { ...u, ...patch } : u)));

  async function poll(key, id) {
    for (;;) {
      await new Promise((r) => setTimeout(r, POLL_MS));
      const { data } = await api.get(`/files/${id}`);
      update(key, { status: data.file.status });
      if (FINAL.includes(data.file.status)) return onChange();
    }
  }

  async function send(file, folderId, key, controller) {
    const form = new FormData();
    form.append('file', file);
    try {
      const { data } = await api.post('/files', form, {
        params: folderId ? { folderId } : undefined,
        signal: controller.signal,
        onUploadProgress: (e) => update(key, { progress: e.total ? e.loaded / e.total : 0 }),
      });
      update(key, { fileId: data.id, status: data.status, progress: 1 });
      onChange();
      await poll(key, data.id);
    } catch (err) {
      if (err.code === 'ERR_CANCELED') update(key, { status: 'cancelled' });
      else update(key, { status: 'error', error: errorMessage(err) });
    }
  }

  function start(files, folderId) {
    for (const file of files) {
      const key = nextKey.current++;
      const controller = new AbortController();
      setUploads((list) => [...list, { key, name: file.name, progress: 0, status: 'sending', controller }]);
      send(file, folderId, key, controller);
    }
  }

  async function cancel(upload) {
    if (upload.status === 'sending') return upload.controller.abort();
    try {
      await api.post(`/files/${upload.fileId}/cancel`);
      update(upload.key, { status: 'cancelled' });
      onChange();
    } catch (err) {
      // 409: el worker ya lo tomó; el polling mostrará cómo termina
      update(upload.key, { error: errorMessage(err) });
    }
  }

  const clearFinished = () => setUploads((list) => list.filter((u) => !FINAL.includes(u.status)));

  return { uploads, start, cancel, clearFinished, isFinal: (u) => FINAL.includes(u.status) };
}
