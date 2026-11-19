import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const { JWT_SECRET } = process.env;
if (!JWT_SECRET) throw new Error('Falta JWT_SECRET');

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;

const sign = (user) => jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
const publicUser = ({ id, username }) => ({ id, username });

export function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const { sub, username } = jwt.verify(token, JWT_SECRET);
    req.user = { id: sub, username };
    next();
  } catch {
    res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

export const authRouter = Router();

authRouter.post('/register', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || !USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 30 caracteres: letras, números, punto, guion o guion bajo' });
  }
  if (typeof password !== 'string' || password.length < 6 || password.length > 72) {
    return res.status(400).json({ error: 'La contraseña debe tener entre 6 y 72 caracteres' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username',
      [username, hash]
    );
    res.status(201).json({ token: sign(rows[0]), user: publicUser(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese nombre de usuario ya existe' });
    throw err;
  }
});

authRouter.post('/login', async (req, res) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Faltan usuario o contraseña' });
  }
  const { rows } = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  // Se consulta la BD por si el usuario fue borrado después de emitir el token
  const { rows } = await pool.query('SELECT id, username FROM users WHERE id = $1', [req.user.id]);
  if (!rows[0]) return res.status(401).json({ error: 'Sesión inválida o expirada' });
  res.json({ user: rows[0] });
});
