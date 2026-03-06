-- ============================================================
--  FOROJEJES — Esquema completo + datos de ejemplo
--  Compatible con SQLite 3  (también válido en MySQL/PostgreSQL
--  con cambios menores indicados en comentarios)
--  Generado: 2025-03-06
-- ============================================================

PRAGMA foreign_keys = ON;    -- SQLite: activar claves foráneas
-- SET NAMES utf8mb4;         -- MySQL: descomentar esta línea

-- ============================================================
--  0. LIMPIEZA (útil para reimportar en entorno de desarrollo)
-- ============================================================
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS reacciones;
DROP TABLE IF EXISTS hilo_invitados;
DROP TABLE IF EXISTS respuestas;
DROP TABLE IF EXISTS hilos;
DROP TABLE IF EXISTS invite_codes;
DROP TABLE IF EXISTS global_state;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS categorias;

-- ============================================================
--  1. CATEGORÍAS
-- ============================================================
CREATE TABLE categorias (
    id          INTEGER PRIMARY KEY,
    slug        TEXT    NOT NULL UNIQUE,
    nombre      TEXT    NOT NULL,
    descripcion TEXT    NOT NULL,
    icono       TEXT    NOT NULL
);

-- ============================================================
--  2. USUARIOS
-- ============================================================
CREATE TABLE usuarios (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    -- En MySQL usar: id INT AUTO_INCREMENT PRIMARY KEY
    nick        TEXT     NOT NULL UNIQUE,
    email       TEXT     NOT NULL UNIQUE,
    password    TEXT     NOT NULL,          -- hash bcrypt
    rol         TEXT     NOT NULL DEFAULT 'user'
                         CHECK (rol IN ('user','admin')),
    bio         TEXT,
    foto        TEXT,                       -- ruta o data-URL base64
    registro    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  3. HILOS
-- ============================================================
CREATE TABLE hilos (
    id           INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    categoria_id INTEGER  NOT NULL REFERENCES categorias(id),
    titulo       TEXT,
    texto        TEXT     NOT NULL,
    visibilidad  TEXT     NOT NULL DEFAULT 'publico'
                          CHECK (visibilidad IN ('publico','jeje','privado')),
    creado_en    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  4. HILO INVITADOS  (para hilos privados)
-- ============================================================
CREATE TABLE hilo_invitados (
    hilo_id  INTEGER NOT NULL REFERENCES hilos(id) ON DELETE CASCADE,
    user_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    PRIMARY KEY (hilo_id, user_id)
);

-- ============================================================
--  5. RESPUESTAS
-- ============================================================
CREATE TABLE respuestas (
    id        INTEGER  PRIMARY KEY AUTOINCREMENT,
    hilo_id   INTEGER  NOT NULL REFERENCES hilos(id) ON DELETE CASCADE,
    user_id   INTEGER  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    texto     TEXT     NOT NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  6. REACCIONES  (en hilos y respuestas)
--     target_tipo: 'hilo' o 'respuesta'
-- ============================================================
CREATE TABLE reacciones (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    target_tipo TEXT    NOT NULL CHECK (target_tipo IN ('hilo','respuesta')),
    target_id   INTEGER NOT NULL,           -- id del hilo o respuesta
    emoji       TEXT    NOT NULL,
    creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, target_tipo, target_id, emoji)
);

-- ============================================================
--  7. NOTIFICACIONES
-- ============================================================
CREATE TABLE notificaciones (
    id        INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id   INTEGER  NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    tipo      TEXT     NOT NULL CHECK (tipo IN ('respuesta','reaccion','cita','mencion')),
    texto     TEXT     NOT NULL,
    leida     INTEGER  NOT NULL DEFAULT 0,  -- 0 = no leída, 1 = leída
    hilo_id   INTEGER  REFERENCES hilos(id) ON DELETE SET NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  8. CÓDIGOS DE INVITACIÓN
-- ============================================================
CREATE TABLE invite_codes (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    code        TEXT     NOT NULL UNIQUE,
    usado       INTEGER  NOT NULL DEFAULT 0,
    reservado   INTEGER  NOT NULL DEFAULT 0,
    reservado_en INTEGER,                   -- timestamp Unix
    usado_por   INTEGER  REFERENCES usuarios(id),
    creado_en   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
--  9. ESTADO GLOBAL DEL FORO
-- ============================================================
CREATE TABLE global_state (
    id               INTEGER PRIMARY KEY,
    failed_attempts  INTEGER NOT NULL DEFAULT 0,
    jeje_threshold   INTEGER NOT NULL DEFAULT 100  -- mensajes para ser +Jeje
);

-- ============================================================
--  ÍNDICES
-- ============================================================
CREATE INDEX idx_hilos_categoria  ON hilos(categoria_id);
CREATE INDEX idx_hilos_user       ON hilos(user_id);
CREATE INDEX idx_hilos_creado     ON hilos(creado_en DESC);
CREATE INDEX idx_respuestas_hilo  ON respuestas(hilo_id);
CREATE INDEX idx_respuestas_user  ON respuestas(user_id);
CREATE INDEX idx_reacciones_tgt   ON reacciones(target_tipo, target_id);
CREATE INDEX idx_notif_user       ON notificaciones(user_id, leida);

-- ============================================================
--  DATOS SEED — CATEGORÍAS
-- ============================================================
INSERT INTO categorias (id, slug, nombre, descripcion, icono) VALUES
  (1, 'general',     'General',     'Conversaciones de todo tipo',          '💬'),
  (2, 'videojuegos', 'Videojuegos', 'PC, consolas, móvil y retro',          '🎮'),
  (3, 'consultas',   'Consultas',   'Pregunta lo que quieras al foro',      '❓'),
  (4, 'electronica', 'Electrónica', 'Hardware, gadgets y cacharros',        '💡'),
  (5, 'deportes',    'Deportes',    'Fútbol, baloncesto, F1 y más',         '⚽'),
  (6, 'viajes',      'Viajes',      'Destinos, rutas y consejos viajeros',  '✈️'),
  (7, 'estudios',    'Estudios',    'Oposiciones, universidad, idiomas',    '📚'),
  (8, 'trabajo',     'Trabajo',     'Empleo, autónomos, empresas',          '💼'),
  (9, 'motor',       'Motor',       'Coches, motos, furgonetas y más',      '🚗');

-- ============================================================
--  DATOS SEED — USUARIOS
--  Contraseñas: todas son 'password1234' en bcrypt de ejemplo
--  (sustituir por hashes reales antes de producción)
-- ============================================================
INSERT INTO usuarios (id, nick, email, password, rol, bio, registro, ultimo) VALUES
  (99, 'jeje_admin',   'admin@forojejes.com',  '$2b$10$HASH_ADMIN_PLACEHOLDER',  'admin',
       'Fundador y administrador de ForoJejes. Aquí mando yo.',
       '2025-01-01 00:00:00', '2025-03-06 08:00:00'),
  (1,  'jeje_demo',    'demo@forojejes.com',   '$2b$10$HASH_DEMO_PLACEHOLDER',   'user',
       'Usuario de prueba. Amante de los roguelikes y las patatas bravas.',
       '2025-02-15 10:30:00', '2025-03-06 10:00:00'),
  (2,  'superjeje99',  'super@mail.com',        '$2b$10$HASH_SUPER_PLACEHOLDER',  'user',
       'El Madrid siempre. Fan del PC gaming y de decir verdades incómodas.',
       '2025-01-10 14:20:00', '2025-03-06 09:45:00'),
  (3,  'jeje_maria',   'maria@correo.es',       '$2b$10$HASH_MARIA_PLACEHOLDER',  'user',
       'Jugadora de Elden Ring (cuando no me matan). Bravas siempre, alioli nunca.',
       '2025-01-12 09:00:00', '2025-03-05 16:00:00'),
  (4,  'mr_jeje_boss', 'boss@empresa.com',      '$2b$10$HASH_BOSS_PLACEHOLDER',   'user',
       'Empresario. Paso por aquí cuando puedo.',
       '2025-01-20 18:00:00', '2025-03-04 08:00:00'),
  (5,  'jejecito_lol', 'jeje_lol@gmail.com',    '$2b$10$HASH_LOL_PLACEHOLDER',    'user',
       'DAW/DAM + gaming. El de la ITV que casi no pasa.',
       '2025-02-01 11:15:00', '2025-03-06 10:15:00'),
  (6,  'el_gran_jeje', 'gran@jeje.net',          '$2b$10$HASH_GRAN_PLACEHOLDER',   'user',
       'Veterano del foro. Solo hilo para gente de nivel.',
       '2025-01-05 08:45:00', '2025-03-03 11:00:00');

-- ============================================================
--  DATOS SEED — HILOS
-- ============================================================
INSERT INTO hilos (id, user_id, categoria_id, titulo, texto, visibilidad, creado_en) VALUES
  -- General
  (1,  99, 1, 'Bienvenidos a ForoJejes',
       'Recordad: vuestro nick debe llevar "jeje". ¡A publicar!',
       'publico', '2025-03-01 00:01:00'),
  (2,  2,  1, 'Bravas o alioli ¿qué pides?',
       'Hilo de las patatas bravas. ¿Con brava o con alioli? Yo siempre alioli.',
       'publico', '2025-03-02 18:31:00'),
  (6,  1,  1, 'Mi primer hilo en ForoJejes',
       '¡Qué foro más bueno! Esperemos que crezca mucho.',
       'publico', '2025-03-05 10:42:00'),
  (7,  3,  1, 'Plan finde — ¿apuntáis?',
       '¿Os apuntáis superjeje99 y jeje_demo a una quedada el sábado?',
       'privado', '2025-03-05 15:00:00'),
  (8,  4,  1, '🔒 Chat privado admin',
       'Solo para admins.',
       'privado', '2025-03-04 08:00:00'),
  -- Videojuegos
  (3,  6,  2, '[+JEJE] Los mejores juegos de 2024',
       'Lista definitiva. Solo para +Jeje.',
       'jeje',    '2025-03-03 10:15:00'),
  (4,  3,  2, '¿Alguien juega al Elden Ring?',
       'Estoy atascada en Stormveil. ¿Algún consejo?',
       'publico', '2025-03-03 14:20:00'),
  (9,  1,  2, 'Recomendaciones roguelike',
       'Acabo de terminar Hades. ¿Qué roguelikes me recomendáis?',
       'publico', '2025-03-06 09:00:00'),
  -- Electrónica
  (5,  5,  4, 'Portátil para DAW/DAM 700€',
       'Recomendaciones de portátil, máximo 700€.',
       'publico', '2025-03-04 09:00:00'),
  -- Deportes
  (10, 99, 5, 'Liga 2024/25 — predicciones',
       '¿Quién gana la liga este año?',
       'publico', '2025-03-02 20:00:00'),
  -- Motor
  (11, 5,  9, 'ITV pasada por los pelos',
       'Me han fallado las luces traseras en la ITV.',
       'publico', '2025-03-05 12:00:00');

-- ============================================================
--  DATOS SEED — HILO INVITADOS
-- ============================================================
-- Hilo 7: invitados jeje_demo (1) y superjeje99 (2)
INSERT INTO hilo_invitados (hilo_id, user_id) VALUES (7, 1), (7, 2);
-- Hilo 8: invitado jeje_admin (99)
INSERT INTO hilo_invitados (hilo_id, user_id) VALUES (8, 99);

-- ============================================================
--  DATOS SEED — RESPUESTAS
-- ============================================================
INSERT INTO respuestas (id, hilo_id, user_id, texto, creado_en) VALUES
  -- Hilo 1 — Bienvenidos
  (101,  1,  2, '¡Gracias! Qué foro más guapo.',                                          '2025-03-01 10:00:00'),
  (102,  1,  3, 'Ya era hora. Bienvenidos todos.',                                         '2025-03-01 11:30:00'),
  (103,  1,  1, '¡Genial! Ya estoy aquí.',                                                 '2025-03-01 12:00:00'),
  -- Hilo 2 — Bravas o alioli
  (201,  2,  3, '**Bravas siempre**. El alioli es para los cobardes.',                     '2025-03-02 19:00:00'),
  (202,  2,  5, 'En mi bar las ponen con los dos y es la _mejor decisión_ que han tomado nunca.', '2025-03-02 20:15:00'),
  (203,  2,  1, '[Cita de jeje_maria: "Bravas siempre"] Totalmente de acuerdo.',           '2025-03-02 21:00:00'),
  -- Hilo 3 — +Jeje juegos
  (301,  3, 99, '**Balatro** fue una revelación absoluta.',                                '2025-03-03 11:00:00'),
  -- Hilo 4 — Elden Ring
  (401,  4,  1, 'El truco es esquivar hacia su _izquierda_ cuando ataca con el hacha.',   '2025-03-03 15:00:00'),
  (402,  4,  2, 'Usa el escudo y `paciencia`. No te pongas codicioso.',                   '2025-03-03 16:30:00'),
  (403,  4,  3, '¡Lo conseguí! **Gracias** crack.',                                       '2025-03-03 18:00:00'),
  -- Hilo 5 — Portátil
  (501,  5,  1, 'Mira el `Lenovo IdeaPad 5` o el Acer Aspire 5.',                        '2025-03-04 10:30:00'),
  (502,  5,  2, 'El Asus Vivobook Pro también está muy bien.',                            '2025-03-04 11:00:00'),
  -- Hilo 6 — Mi primer hilo
  (601,  6,  2, 'Bienvenido crack. Aquí se está bien.',                                   '2025-03-05 11:00:00'),
  -- Hilo 7 — Plan finde (privado)
  (701,  7,  2, 'Yo me apunto sin dudarlo.',                                               '2025-03-05 15:30:00'),
  (702,  7,  1, '¿Dónde quedamos exactamente?',                                            '2025-03-05 16:00:00'),
  -- Hilo 9 — Roguelikes
  (901,  9,  5, '**Dead Cells** sin dudar. Es brutal.',                                   '2025-03-06 09:30:00'),
  (902,  9,  2, '_Slay the Spire_ si te van los de cartas.',                              '2025-03-06 10:00:00'),
  -- Hilo 10 — Liga
  (1001, 10, 3, 'Va a ser el **Atleti** el que se lo lleve.',                             '2025-03-02 20:30:00'),
  (1002, 10, 2, '~~Barça~~ ~~Atleti~~ siempre el Madrid. Aprended.',                      '2025-03-02 21:00:00'),
  (1003, 10, 1, 'El Madrid tiene plantilla, hay que respetarlo.',                         '2025-03-02 21:30:00'),
  -- Hilo 11 — ITV
  (1101, 11, 1, 'Mala suerte. Las bombillas LED están baratas en Amazon.',                '2025-03-05 13:00:00'),
  (1102, 11, 4, 'Lo mismo me pasó el año pasado. Ánimo.',                                 '2025-03-05 14:00:00');

-- ============================================================
--  DATOS SEED — REACCIONES
-- ============================================================
INSERT INTO reacciones (user_id, target_tipo, target_id, emoji, creado_en) VALUES
  -- Hilo 2: jeje_demo reacciona 😂
  (1, 'hilo',      2,    '😂', '2025-03-02 21:05:00'),
  -- Respuesta 101: 👍 de jeje_demo y jeje_maria
  (1, 'respuesta', 101,  '👍', '2025-03-01 10:05:00'),
  (3, 'respuesta', 101,  '👍', '2025-03-01 10:10:00'),
  -- Respuesta 102: ❤️ de jeje_demo
  (1, 'respuesta', 102,  '❤️', '2025-03-01 11:35:00'),
  -- Respuesta 201: 👍 de superjeje99, 😂 de jejecito_lol
  (2, 'respuesta', 201,  '👍', '2025-03-02 19:05:00'),
  (5, 'respuesta', 201,  '😂', '2025-03-02 19:20:00'),
  -- Respuesta 401: 👍 de jeje_maria y superjeje99
  (3, 'respuesta', 401,  '👍', '2025-03-03 15:05:00'),
  (2, 'respuesta', 401,  '👍', '2025-03-03 15:10:00'),
  -- Respuesta 403: 🎉 de jeje_demo y superjeje99
  (1, 'respuesta', 403,  '🎉', '2025-03-03 18:05:00'),
  (2, 'respuesta', 403,  '🎉', '2025-03-03 18:10:00'),
  -- Respuesta 601: 🔥 de jeje_demo
  (1, 'respuesta', 601,  '🔥', '2025-03-05 11:05:00'),
  -- Respuesta 1001: 😂 de superjeje99
  (2, 'respuesta', 1001, '😂', '2025-03-02 20:35:00'),
  -- Respuesta 1002: 👍 de jeje_admin
  (99,'respuesta', 1002, '👍', '2025-03-02 21:05:00');

-- ============================================================
--  DATOS SEED — NOTIFICACIONES  (para usuario jeje_demo, id=1)
-- ============================================================
INSERT INTO notificaciones (id, user_id, tipo, texto, leida, hilo_id, creado_en) VALUES
  (1, 1, 'respuesta', 'superjeje99 respondió en tu hilo "Mi primer hilo en ForoJejes"',        0, 6, '2025-03-05 11:00:00'),
  (2, 1, 'reaccion',  'jeje_maria reaccionó con ❤️ a tu respuesta en "Bienvenidos a ForoJejes"', 0, 1, '2025-03-01 11:35:00'),
  (3, 1, 'respuesta', 'jeje_maria respondió en "¿Alguien juega al Elden Ring?" donde participaste', 1, 4, '2025-03-03 18:00:00'),
  (4, 1, 'cita',      'jeje_maria te citó en "Bravas o alioli ¿qué pides?"',                   1, 2, '2025-03-02 21:00:00');

-- ============================================================
--  DATOS SEED — CÓDIGOS DE INVITACIÓN (10 de ejemplo)
-- ============================================================
INSERT INTO invite_codes (code, usado, reservado) VALUES
  ('F9RZ-4MKQ-8BNX-1TWP', 0, 0),
  ('A3KL-9PQR-2MNX-7BVW', 0, 0),
  ('X7YZ-3ABC-5DEF-6GHI', 0, 0),
  ('Q2WE-8RTY-4UIO-1PAS', 0, 0),
  ('M5DF-7GHJ-3KLZ-9XCV', 0, 0),
  ('B1NM-6QWE-2RTY-8UIO', 0, 0),
  ('L4PZ-5XCV-9BNM-3QWE', 0, 0),
  ('R8TY-1UIO-7PAS-4DFG', 0, 0),
  ('N2HJ-6KLZ-8XCV-5BNM', 0, 0),
  ('W3ER-9TYU-1IOP-7ASD', 0, 0);

-- ============================================================
--  ESTADO GLOBAL
-- ============================================================
INSERT INTO global_state (id, failed_attempts, jeje_threshold) VALUES (1, 0, 100);

-- ============================================================
--  FIN DEL SCRIPT
--
--  Para importar en SQLite:
--    sqlite3 foro.db < forojejes.sql
--
--  Para importar en MySQL:
--    - Cambiar INTEGER PRIMARY KEY AUTOINCREMENT → INT AUTO_INCREMENT PRIMARY KEY
--    - Cambiar PRAGMA foreign_keys → SET FOREIGN_KEY_CHECKS=1
--    - Cambiar DATETIME DEFAULT CURRENT_TIMESTAMP → TIMESTAMP DEFAULT NOW()
--    mysql -u root -p forojejes < forojejes.sql
--
--  Para importar en PostgreSQL:
--    - Cambiar INTEGER AUTOINCREMENT → SERIAL
--    - Cambiar PRAGMA → nada (PG activa FK por defecto)
--    psql -U postgres -d forojejes -f forojejes.sql
-- ============================================================
