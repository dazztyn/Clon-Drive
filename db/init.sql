-- Postgres corre este archivo solo la primera vez (volumen vacío).
-- Si lo cambias: docker compose down -v

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- parent_id NULL = raíz del usuario
CREATE TABLE folders (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  parent_id  INT REFERENCES folders(id) ON DELETE CASCADE,
  owner_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- folder_id NULL = raíz del usuario
CREATE TABLE files (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  folder_id  INT REFERENCES folders(id) ON DELETE CASCADE,
  owner_id   INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  s3_key     TEXT,
  mime       TEXT,
  size       BIGINT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending', 'uploading', 'ready', 'cancelled', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- resource_id apunta a folders o files según resource_type, por eso no tiene FK:
-- al borrar un recurso hay que borrar sus shares a mano.
CREATE TABLE shares (
  id            SERIAL PRIMARY KEY,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('file', 'folder')),
  resource_id   INT NOT NULL,
  user_id       INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('read', 'edit')),
  UNIQUE (resource_type, resource_id, user_id)
);

CREATE INDEX ON folders (owner_id, parent_id);
CREATE INDEX ON files (owner_id, folder_id);
CREATE INDEX ON shares (user_id);
