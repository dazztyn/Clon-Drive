import { Router } from 'express';
import { pool } from './db.js';
import { requireAuth } from './auth.js';

export const foldersRouter = Router();
foldersRouter.use(requireAuth);

const parseId = (value) => (/^\d+$/.test(String(value)) ? Number(value) : null);

// Responde 404/403 y devuelve null si la carpeta no existe o no es del usuario.
// shortcut: solo el dueño tiene acceso; en la fase 6 se suman los shares por carpeta ancestra.
async function getOwnFolder(rawId, user, res) {
  const id = parseId(rawId);
  const { rows } = id
    ? await pool.query('SELECT id, name, parent_id, owner_id FROM folders WHERE id = $1', [id])
    : { rows: [] };
  if (!rows[0]) {
    res.status(404).json({ error: 'Carpeta no encontrada' });
    return null;
  }
  if (rows[0].owner_id !== user.id) {
    res.status(403).json({ error: 'No tienes acceso a esta carpeta' });
    return null;
  }
  return rows[0];
}

// Dentro de una carpeta, el contenido es del dueño de la carpeta; en la raíz, del usuario.
async function listContents(folderId, userId) {
  const where = folderId ? 'parent_id = $1' : 'owner_id = $1 AND parent_id IS NULL';
  const fileWhere = folderId ? 'folder_id = $1' : 'owner_id = $1 AND folder_id IS NULL';
  const param = folderId ?? userId;
  const [folders, files] = await Promise.all([
    pool.query(`SELECT id, name, created_at FROM folders WHERE ${where} ORDER BY lower(name)`, [param]),
    pool.query(
      `SELECT id, name, mime, size, status, created_at FROM files
       WHERE ${fileWhere} AND status <> 'cancelled' ORDER BY lower(name)`,
      [param]
    ),
  ]);
  return { folders: folders.rows, files: files.rows };
}

foldersRouter.get('/root/contents', async (req, res) => {
  res.json({ folder: null, path: [], ...(await listContents(null, req.user.id)) });
});

foldersRouter.get('/:id/contents', async (req, res) => {
  const folder = await getOwnFolder(req.params.id, req.user, res);
  if (!folder) return;
  // Ruta desde la raíz hasta esta carpeta, para el breadcrumb
  const { rows: path } = await pool.query(
    `WITH RECURSIVE path AS (
       SELECT id, name, parent_id, 0 AS depth FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id, f.name, f.parent_id, p.depth + 1 FROM folders f JOIN path p ON f.id = p.parent_id
     )
     SELECT id, name FROM path ORDER BY depth DESC`,
    [folder.id]
  );
  res.json({ folder: { id: folder.id, name: folder.name }, path, ...(await listContents(folder.id, req.user.id)) });
});

foldersRouter.post('/', async (req, res) => {
  const { name, parentId = null } = req.body ?? {};
  const cleanName = typeof name === 'string' ? name.trim() : '';
  if (!cleanName || cleanName.length > 255) {
    return res.status(400).json({ error: 'El nombre de la carpeta debe tener entre 1 y 255 caracteres' });
  }
  if (parentId !== null && !(await getOwnFolder(parentId, req.user, res))) return;
  const { rows } = await pool.query(
    'INSERT INTO folders (name, parent_id, owner_id) VALUES ($1, $2, $3) RETURNING id, name, parent_id, created_at',
    [cleanName, parentId, req.user.id]
  );
  res.status(201).json({ folder: rows[0] });
});
