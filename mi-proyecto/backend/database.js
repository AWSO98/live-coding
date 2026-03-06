const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
const crypto   = require('crypto');

const db = new Database(path.join('/app/data', 'foro.db'));

// ── Inicializar esquema desde forojejes.sql ───────────────────────────────────
// El archivo SQL está en la raíz del proyecto (un nivel arriba de /backend)
const SQL_PATH = path.join(__dirname, '..', 'forojejes.sql');

const yaInicializado = db.prepare(
  `SELECT COUNT(*) as n FROM sqlite_master WHERE type='table' AND name='usuarios'`
).get().n > 0;

if (!yaInicializado) {
  console.log('[DB] Base de datos vacía — importando forojejes.sql...');
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  db.exec(sql);
  console.log('[DB] Esquema y datos seed importados correctamente.');
} else {
  console.log('[DB] Base de datos ya inicializada, omitiendo import.');
}

// ── Liberar reservas expiradas (> 15 min) al arrancar ────────────────────────
const RESERVA_TTL = 15 * 60; // segundos
const ahora = Math.floor(Date.now() / 1000);

const liberados = db.prepare(`
  UPDATE invite_codes
  SET    reservado = 0, reservado_en = NULL
  WHERE  reservado = 1
    AND  usado = 0
    AND  reservado_en IS NOT NULL
    AND  (? - reservado_en) > ?
`).run(ahora, RESERVA_TTL);

if (liberados.changes > 0)
  console.log(`[DB] ${liberados.changes} reservas expiradas liberadas al arrancar.`);

// ── Códigos de invitación: generar más si se han agotado ─────────────────────
function generateCode() {
  return Array.from({ length: 4 }, () =>
    crypto.randomBytes(2).toString('hex').toUpperCase()
  ).join('-');
}

const libres = db.prepare(`
  SELECT COUNT(*) as n FROM invite_codes
  WHERE usado = 0
    AND (reservado = 0 OR reservado_en IS NULL OR (? - reservado_en) > ?)
`).get(ahora, RESERVA_TTL).n;

const total = db.prepare('SELECT COUNT(*) as n FROM invite_codes').get().n;
console.log(`[DB] Códigos disponibles: ${libres}/${total}`);

if (libres < 10) {
  console.log('[DB] Pocos códigos libres — generando 20 más...');
  const ins = db.prepare('INSERT OR IGNORE INTO invite_codes (code) VALUES (?)');
  db.transaction(() => {
    for (let i = 0; i < 20; i++) {
      let code, t = 0;
      do { code = generateCode(); t++; }
      while (db.prepare('SELECT id FROM invite_codes WHERE code=?').get(code) && t < 100);
      ins.run(code);
    }
  })();
  console.log('[DB] 20 códigos nuevos generados.');
}

// ── Exportar ──────────────────────────────────────────────────────────────────
module.exports = { db, generateCode, RESERVA_TTL };
