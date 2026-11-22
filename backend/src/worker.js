import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { sqs, s3, QUEUE_URL, BUCKET } from './aws.js';
import { pool } from './db.js';

const UPLOAD_DIR = process.env.UPLOAD_DIR;

// Si lanza error (BD caída), el mensaje no se borra y SQS lo reintenta.
async function processMessage(body) {
  let fileId, tmpName;
  try {
    ({ fileId, tmpName } = JSON.parse(body));
  } catch {
    return console.error('Mensaje inválido, se descarta:', body);
  }
  const tmpPath = path.join(UPLOAD_DIR, path.basename(String(tmpName)));

  // 'uploading' también entra para retomar un reintento; 'cancelled' o un archivo borrado no
  const { rows } = await pool.query(
    "UPDATE files SET status = 'uploading' WHERE id = $1 AND status IN ('pending', 'uploading') RETURNING owner_id, mime",
    [fileId]
  );
  if (!rows[0]) {
    console.log(`Archivo ${fileId}: cancelado o eliminado, se descarta`);
    return fs.promises.rm(tmpPath, { force: true });
  }

  const key = `users/${rows[0].owner_id}/${fileId}`;
  let status = 'ready';
  try {
    const { size } = await fs.promises.stat(tmpPath);
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: fs.createReadStream(tmpPath),
        ContentLength: size,
        ContentType: rows[0].mime,
      })
    );
  } catch (err) {
    console.error(`Archivo ${fileId}: falló la subida a S3:`, err.message);
    status = 'failed';
  }
  await pool.query('UPDATE files SET status = $2, s3_key = $3 WHERE id = $1', [
    fileId,
    status,
    status === 'ready' ? key : null,
  ]);
  await fs.promises.rm(tmpPath, { force: true });
  console.log(`Archivo ${fileId}: ${status}`);
}

console.log(`Worker escuchando ${QUEUE_URL}`);

while (true) {
  try {
    const { Messages = [] } = await sqs.send(
      // 5 min de visibilidad para que un archivo grande no se reentregue a mitad de la subida
      new ReceiveMessageCommand({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 20, VisibilityTimeout: 300 })
    );
    for (const msg of Messages) {
      try {
        await processMessage(msg.Body);
        await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }));
      } catch (err) {
        console.error('Error procesando mensaje, se reintentará:', err.message);
      }
    }
  } catch (err) {
    console.error('Error leyendo la cola:', err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
