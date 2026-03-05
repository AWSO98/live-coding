const Database = require('better-sqlite3');
const path     = require('path');
const crypto   = require('crypto');

const db = new Database(path.join('/app/data', 'foro.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS categorias (
    id          INTEGER PRIMARY KEY,
    slug        TEXT UNIQUE NOT NULL,
    nombre      TEXT NOT NULL,
    descripcion TEXT NOT NULL,
    icono       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS mensajes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL,
    categoria_id INTEGER NOT NULL DEFAULT 1,
    texto        TEXT NOT NULL,
    visibilidad  TEXT NOT NULL DEFAULT 'publico',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id)      REFERENCES usuarios(id),
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
  );

  CREATE TABLE IF NOT EXISTS mensaje_invitados (
    mensaje_id INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    PRIMARY KEY (mensaje_id, user_id),
    FOREIGN KEY (mensaje_id) REFERENCES mensajes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)    REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    used INTEGER DEFAULT 0,
    used_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (used_by) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS global_state (
    id              INTEGER PRIMARY KEY,
    failed_attempts INTEGER DEFAULT 0
  );
`);

// ── Categorías seed ───────────────────────────────────────────────────────────
const CATEGORIAS = [
  { id:1,  slug:'general',      nombre:'General',      descripcion:'Conversaciones de todo tipo',              icono:'💬' },
  { id:2,  slug:'videojuegos',  nombre:'Videojuegos',  descripcion:'PC, consolas, móvil y retro',              icono:'🎮' },
  { id:3,  slug:'consultas',    nombre:'Consultas',    descripcion:'Pregunta lo que quieras al foro',          icono:'❓' },
  { id:4,  slug:'electronica',  nombre:'Electrónica',  descripcion:'Hardware, gadgets y cacharros',            icono:'💡' },
  { id:5,  slug:'deportes',     nombre:'Deportes',     descripcion:'Fútbol, baloncesto, F1 y más',             icono:'⚽' },
  { id:6,  slug:'viajes',       nombre:'Viajes',       descripcion:'Destinos, rutas y consejos viajeros',      icono:'✈️' },
  { id:7,  slug:'estudios',     nombre:'Estudios',     descripcion:'Oposiciones, universidad, idiomas',        icono:'📚' },
  { id:8,  slug:'trabajo',      nombre:'Trabajo',      descripcion:'Empleo, autónomos, empresas',              icono:'💼' },
  { id:9,  slug:'motor',        nombre:'Motor',        descripcion:'Coches, motos, furgonetas y más',          icono:'🚗' },
];

const insertCat = db.prepare(`
  INSERT OR IGNORE INTO categorias (id, slug, nombre, descripcion, icono)
  VALUES (@id, @slug, @nombre, @descripcion, @icono)
`);
const seedCats = db.transaction(() => CATEGORIAS.forEach(c => insertCat.run(c)));
seedCats();

// ── Estado global ─────────────────────────────────────────────────────────────
if (!db.prepare('SELECT id FROM global_state WHERE id=1').get())
  db.prepare('INSERT INTO global_state (id, failed_attempts) VALUES (1,0)').run();

// ── Códigos de invitación ─────────────────────────────────────────────────────
function generateCode() {
  return Array.from({length:4}, () => crypto.randomBytes(2).toString('hex').toUpperCase()).join('-');
}

const existing = db.prepare('SELECT COUNT(*) as n FROM invite_codes').get().n;
if (existing === 0) {
  console.log('[DB] Generando 50 codigos...');
  const ins = db.prepare('INSERT INTO invite_codes (code) VALUES (?)');
  const run = db.transaction(() => {
    const out = [];
    for (let i=0; i<50; i++) {
      let code, t=0;
      do { code=generateCode(); t++; } while (db.prepare('SELECT id FROM invite_codes WHERE code=?').get(code) && t<100);
      ins.run(code); out.push(code);
    }
    return out;
  });
  run().forEach(c => console.log(' ', c));
} else {
  const av = db.prepare('SELECT COUNT(*) as n FROM invite_codes WHERE used=0').get().n;
  console.log(`[DB] Codigos disponibles: ${av}/${existing}`);
}

module.exports = { db, generateCode, CATEGORIAS };
