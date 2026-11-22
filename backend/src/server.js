import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { pool } from './db.js';
import { s3, sqs, BUCKET, QUEUE_URL } from './aws.js';
import { authRouter } from './auth.js';
import { foldersRouter } from './folders.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', async (req, res) => {
  const checks = await Promise.allSettled([
    pool.query('SELECT 1'),
    s3.send(new HeadBucketCommand({ Bucket: BUCKET })),
    sqs.send(new GetQueueAttributesCommand({ QueueUrl: QUEUE_URL, AttributeNames: ['QueueArn'] })),
  ]);
  const [db, bucket, queue] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'error'));
  const ok = checks.every((c) => c.status === 'fulfilled');
  res.status(ok ? 200 : 503).json({ ok, db, bucket, queue });
});

app.use('/auth', authRouter);
app.use('/folders', foldersRouter);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));

// Express 5 manda aquí también los errores de las rutas async
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Error interno del servidor' : err.message });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`API en http://localhost:${PORT}`));