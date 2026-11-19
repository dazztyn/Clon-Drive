import 'dotenv/config';
import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { sqs, QUEUE_URL } from './aws.js';

console.log(`Worker escuchando ${QUEUE_URL}`);

// Fase 1: solo registra los mensajes. La subida a S3 llega en la fase 4.
while (true) {
  try {
    const { Messages = [] } = await sqs.send(
      new ReceiveMessageCommand({ QueueUrl: QUEUE_URL, MaxNumberOfMessages: 10, WaitTimeSeconds: 20 })
    );
    for (const msg of Messages) {
      console.log('Mensaje recibido:', msg.Body);
      await sqs.send(new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: msg.ReceiptHandle }));
    }
  } catch (err) {
    console.error('Error leyendo la cola:', err.message);
    await new Promise((r) => setTimeout(r, 5000));
  }
}
