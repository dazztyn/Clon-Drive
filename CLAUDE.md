# Clon Drive — Taller 2 Cloud Computing

Clon de Google Drive. Monorepo con `backend/` (Node + Express) y `frontend/` (React + Vite), levantado con Docker Compose.

## Requisitos del enunciado (todos obligatorios, "debe funcionar al 100%")

Funcionales:
1. Subir archivos: imágenes (.png, .jpeg, .jpg, .raw, .webp), audio, video y documentos (.docx, .pptx, .pdf, etc.).
2. Drag & drop.
3. Crear carpetas.
4. Multiusuario.
5. Cancelar una carga en curso.
6. Descargar archivos individuales (no hace falta descargar carpetas).
7. Permisos por archivo y por carpeta: **lectura** o **edición** (edición = renombrar y eliminar).
8. Compartir internamente usando el nombre de usuario único (sin URLs públicas).
9. El frontend tiene que ser React. El backend es libre, pero hay que justificarlo en la presentación.

Técnicos:
- **LocalStack** para el bucket (S3).
- Proyecto contenerizado (Docker).
- **Colas** para la carga de archivos.

Presentación (Canva/PPT): arquitectura de software, arquitectura de sistema (uso de cada servicio), visuales, alcance (qué hace y qué no), división de tareas, metodología. **No se permite Scrum**: usamos Kanban.

## Stack

| Pieza | Elección |
|---|---|
| Frontend | React + Vite, axios (barra de progreso y `AbortController` para cancelar) |
| API | Node 24 + Express 5 |
| Worker | Mismo código del backend, otro proceso: `node src/worker.js` |
| BD | PostgreSQL con `pg` (sin ORM). El esquema va en un `.sql` que corre al iniciar el contenedor |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` |
| Archivos | S3 en LocalStack (`@aws-sdk/client-s3`) |
| Cola | SQS en LocalStack (`@aws-sdk/client-sqs`) |
| Subida al API | `multer` con `diskStorage` en un volumen compartido entre API y worker |

## Arquitectura

```
Navegador (React) ──HTTP──> API (Express) ──> Postgres
                               │  guarda el archivo temporal en el volumen compartido
                               └──> SQS (mensaje con fileId)
Worker <── SQS ── lee el temporal ──> S3 (LocalStack) ──> marca el archivo como 'ready' en Postgres
```

### Flujo de carga
1. El front hace `POST /files` (multipart, con `folderId`) usando axios, con progreso y `AbortController`.
2. La API guarda el temporal, inserta `files` con `status='pending'`, envía `{fileId}` a SQS y responde `202`.
3. El worker recibe el mensaje y vuelve a leer el estado en la BD. Si es `cancelled`, borra el temporal y descarta el mensaje. Si no, lo marca `uploading`, lo sube a S3 como `users/<ownerId>/<fileId>`, lo marca `ready` y borra el temporal.
4. Cancelar tiene dos casos:
   - Durante la transferencia HTTP: el front aborta la petición y la API borra el archivo parcial.
   - Ya en cola: `POST /files/:id/cancel` solo se acepta si el estado es `pending` y lo cambia a `cancelled`.
5. Si algo falla, el estado queda en `failed`.

## Modelo de datos

```sql
users   (id, username UNIQUE, password_hash, created_at)
folders (id, name, parent_id NULL -> folders, owner_id -> users, created_at)
files   (id, name, folder_id NULL -> folders, owner_id, s3_key, mime, size,
         status: pending|uploading|ready|cancelled|failed, created_at)
shares  (id, resource_type: file|folder, resource_id, user_id -> users,
         role: read|edit, UNIQUE(resource_type, resource_id, user_id))
```
`parent_id` y `folder_id` en `NULL` significan la raíz del usuario.

`shares.resource_id` no tiene FK porque puede apuntar a `folders` o a `files`. Al eliminar un archivo o una carpeta (incluidos sus descendientes), hay que borrar sus `shares` a mano.

### Reglas de permisos
- El **dueño** puede hacer todo, incluido compartir.
- Para el resto, el permiso sale de un `share` sobre el recurso **o sobre cualquier carpeta ancestra** (CTE recursiva). Si hay varios, gana `edit` sobre `read`.
- `read` permite ver y descargar. `edit` permite además renombrar y eliminar, como define el enunciado.
- Solo el dueño puede compartir y crear contenido dentro de sus carpetas. Esto es una decisión de alcance: hay que mencionarla en la presentación.
- Al eliminar una carpeta se borran en cascada sus hijos y los objetos en S3.

## API (planeada)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Devuelven `{token, user}` |
| GET | `/auth/me` | Usuario actual |
| GET | `/folders/root/contents`, `/folders/:id/contents` | Carpetas y archivos de un nivel |
| POST | `/folders` | `{name, parentId}` |
| PATCH / DELETE | `/folders/:id` | Renombrar / eliminar (requiere edit) |
| POST | `/files` | Multipart. Responde 202 con `{id, status}` |
| GET | `/files/:id` | Estado y metadatos (el front consulta hasta que quede `ready`) |
| POST | `/files/:id/cancel` | Cancela si está `pending` |
| GET | `/files/:id/download` | Stream desde S3 con `Content-Disposition` en RFC 5987 |
| PATCH / DELETE | `/files/:id` | Renombrar / eliminar (requiere edit) |
| POST | `/shares` | `{resourceType, resourceId, username, role}` (solo el dueño) |
| GET | `/shares/with-me` | Lo que me compartieron |
| DELETE | `/shares/:id` | Quitar acceso |

Todas las rutas salvo `/health` y `/auth/*` requieren `Authorization: Bearer <token>`.

## Plan por fases (Kanban)

- [x] **0. Base**: Express con `/health`, React + Vite, Docker Compose (backend y frontend).
- [x] **1. Infra**: LocalStack 4.12 (S3 + SQS) y Postgres 17 en compose, con `healthcheck`. [infra/localstack/init.sh](infra/localstack/init.sh) crea el bucket `clon-drive` y la cola `uploads`. [db/init.sql](db/init.sql) tiene el esquema completo. El servicio `worker` ([backend/src/worker.js](backend/src/worker.js)) ya lee la cola, pero por ahora solo registra los mensajes y los borra. Los clientes están en [backend/src/db.js](backend/src/db.js) y [backend/src/aws.js](backend/src/aws.js). `GET /health` revisa la BD, el bucket y la cola, y responde 503 si alguno falla. Backend y worker esperan a que Postgres y LocalStack estén `healthy`.
- [x] **2. Auth**: [backend/src/auth.js](backend/src/auth.js) tiene `POST /auth/register` (201, o 409 si el usuario existe), `POST /auth/login` (401 si las credenciales fallan) y `GET /auth/me`, y exporta el middleware `requireAuth`, que deja `req.user = {id, username}`. El usuario tiene entre 3 y 30 caracteres `[a-zA-Z0-9_.-]` y la contraseña entre 6 y 72 (el límite de bcrypt). El JWT dura 7 días. `server.js` tiene un 404 JSON y un manejador de errores que siempre responde `{error}`. En el front, [frontend/src/api.js](frontend/src/api.js) es la instancia de axios que agrega el token guardado en `localStorage`, y [frontend/src/AuthForm.jsx](frontend/src/AuthForm.jsx) es el login y registro. Ya se eliminó la plantilla de Vite.
- [x] **3. Carpetas**: [backend/src/folders.js](backend/src/folders.js) tiene `GET /folders/root/contents`, `GET /folders/:id/contents` y `POST /folders`. El contenido viene como `{folder, path, folders, files}`: `path` es la ruta desde la raíz (sale de una CTE recursiva) y `files` excluye los `cancelled`. Un id inválido o inexistente da 404 y una carpeta ajena da 403. `getOwnFolder` es el único punto que revisa el acceso: hoy solo deja pasar al dueño, y en la fase 6 se le suman los shares. Se permiten nombres repetidos, como en Drive. En el front, [frontend/src/Drive.jsx](frontend/src/Drive.jsx) lista, crea y navega con breadcrumb. La carpeta actual vive en el estado de React, no en la URL, así que el botón "atrás" del navegador no navega entre carpetas.
- [ ] **4. Carga con cola**: `POST /files`, SQS, worker, estados y cancelación. En el front: drag & drop nativo, progreso y botón cancelar.
- [ ] **5. Descarga**, renombrar y eliminar.
- [ ] **6. Permisos y compartir**: tabla `shares`, resolución por ancestros y vista "Compartido conmigo".
- [ ] **7. Pulido y demo**: errores 404/403/413 bien mapeados, prueba completa con 2 o 3 usuarios, y la presentación.

Las fases 1, 2 y el layout del frontend se pueden trabajar en paralelo. Desde la fase 3 en adelante, todo depende de la 2.

## Comandos

```bash
docker compose up -d --build   # levanta todo
docker compose down            # baja todo
docker compose logs -f backend # logs de un servicio
docker compose down -v         # baja todo y BORRA la BD (necesario si cambias db/init.sql)
curl localhost:3001/health     # {"ok":true,"db":"ok","bucket":"ok","queue":"ok"}
```
Para desarrollar sin Docker: levanta solo la infraestructura con `docker compose up -d postgres localstack`, copia `backend/.env.example` a `backend/.env` y corre `npm run dev` en `backend/` (puerto 3001) y en `frontend/` (puerto 5173).

Servicios: API en 3001, frontend en 5173, LocalStack en 4566 y Postgres en 5432 (usuario, clave y BD: `clondrive`).

## Convenciones

- Código (variables, funciones, rutas) en inglés. Textos de la UI y commits en español.
- Las variables de entorno se documentan en el `.env.example` de cada carpeta. Nunca se commitea un `.env`.
- `VITE_API_URL` es `http://localhost:3001`: la usa el navegador, no un contenedor.
- La API responde errores como `{ error: "mensaje" }` con el status correcto: 400, 401, 403, 404, 409 o 413.
- Toda ruta que toque un recurso verifica el permiso en el backend. Nunca hay que confiar en el front para eso.

## Riesgos a vigilar

- Desde marzo de 2026, las imágenes nuevas de LocalStack piden `LOCALSTACK_AUTH_TOKEN`. Usamos la community `4.12`, que está congelada y arranca sin token. **No hay que cambiarla a `latest`.**
- LocalStack community no guarda datos: si se reinicia el contenedor, se pierden los archivos de S3 pero Postgres conserva las filas. Para dejar todo limpio usa `docker compose down -v`, y no reinicies LocalStack durante la demo.
- `SQS_QUEUE_URL` usa el host `localstack:4566` (en Docker) o `localhost:4566` (fuera de Docker). La URL que devuelve LocalStack por defecto (`sqs.us-east-1.localhost.localstack.cloud`) no resuelve desde otro contenedor.
- `JWT_SECRET` está fijo en `docker-compose.yml` porque es un secreto de desarrollo. Sin esa variable, la API no arranca.
- Si una petición devuelve 401 a mitad de sesión (por ejemplo, porque el token expiró), el front todavía no cierra la sesión solo. Solo valida el token al cargar la página. Hay que resolverlo en la fase 7.
- Con LocalStack caído, `/health` tarda unos 12 s en responder 503 porque el SDK reintenta.
- `init.sh` tiene que tener saltos de línea LF. Lo asegura `.gitattributes`, pero si alguien lo edita en Windows hay que revisarlo.
- En Docker Desktop para Windows, los bind mounts no propagan cambios para hot reload. Por eso hoy los contenedores se reconstruyen con `--build`.
- Los archivos grandes de video nunca se cargan en RAM: se usa `diskStorage` y se sube a S3 por stream.
