import fs from 'node:fs/promises';
import { Router } from 'express';
import multer from 'multer';
import { SendMessageCommand } from '@aws-sdk/client-sqs';
import { pool } from './db.js';
import { sqs, QUEUE_URL } from './aws.js';
import { requireAuth } from './auth.js';
import { getOwnFolder, parseId } from './folders.js';

// Disco (volumen compartido con el worker), nunca RAM: los videos pueden pesar GB
const upload = multer({
  dest: process.env.UPLOAD_DIR,
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE) || 1024 ** 3, files: 1 },
});

export const filesRouter = Router();
filesRouter.use(requireAuth);

// shortcut: solo el dueño tiene acceso; en la fase 6 se suman los shares.
async function getOwnFile(rawId, user, res) {
  const id = parseId(rawId);
  const { rows } = id
    ? await pool.query(
        'SELECT id, name, folder_id, owner_id, mime, size, status, created_at FROM files WHERE id = $1',
        [id]
      )
    : { rows: [] };
  if (!rows[0]) {
    res.status(404).json({ error: 'Archivo no encontrado' });
    return null;
  }
  if (rows[0].owner_id !== user.id) {
    res.status(403).json({ error: 'No tienes acceso a este archivo' });
    return null;
  }
  return rows[0];
}

// La carpeta destino va en la query (?folderId=) para validarla antes de recibir el archivo
async function checkTargetFolder(req, res, next) {
  req.folderId = null;
  if (req.query.folderId) {
    const folder = await getOwnFolder(req.query.folderId, req.user, res);
    if (!folder) return;
    req.folderId = folder.id;
  }
  next();
}

filesRouter.post('/', checkTargetFolder, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Falta el archivo (campo "file")' });
  // busboy entrega el nombre en latin1; el navegador lo manda en UTF-8
  const name = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
  let fileId = null;
  try {
    const { rows } = await pool.query(
      'INSERT INTO files (name, folder_id, owner_id, mime, size) VALUES ($1, $2, $3, $4, $5) RETURNING id, status',
      [name, req.folderId, req.user.id, req.file.mimetype, req.file.size]
    );
    fileId = rows[0].id;
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({ fileId, tmpName: req.file.filename }),
      })
    );
    res.status(202).json(rows[0]);
  } catch (err) {
    if (fileId) await pool.query("UPDATE files SET status = 'failed' WHERE id = $1", [fileId]);
    await fs.rm(req.file.path, { force: true });
    throw err;
  }
});

filesRouter.get('/:id', async (req, res) => {
  const file = await getOwnFile(req.params.id, req.user, res);
  if (!file) return;
  const { owner_id, ...rest } = file;
  res.json({ file: rest });
});

filesRouter.post('/:id/cancel', async (req, res) => {
  const file = await getOwnFile(req.params.id, req.user, res);
  if (!file) return;
  // Solo se cancela si el worker todavía no lo tomó (el UPDATE es atómico frente al worker)
  const { rowCount } = await pool.query(
    "UPDATE files SET status = 'cancelled' WHERE id = $1 AND status = 'pending'",
    [file.id]
  );
  if (!rowCount) return res.status(409).json({ error: 'El archivo ya no está en cola y no se puede cancelar' });
  res.json({ id: file.id, status: 'cancelled' });
});
