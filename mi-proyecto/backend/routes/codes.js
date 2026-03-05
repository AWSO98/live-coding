// backend/routes/codes.js
const express = require('express');
const { db, generateCode, RESERVA_TTL } = require('../database');

const router = express.Router();

// ── Helper: liberar reservas expiradas ───────────────────────────────────────
function liberarExpiradas() {
  const ahora = Math.floor(Date.now() / 1000);
  const r = db.prepare(`
    UPDATE invite_codes SET reserved=0, reserved_at=NULL
    WHERE reserved=1 AND used=0 AND reserved_at IS NOT NULL AND (?-reserved_at)>?
  `).run(ahora, RESERVA_TTL);
  if (r.changes > 0) console.log(`[CODES] ${r.changes} reservas expiradas liberadas`);
}

// ── GET /api/codes/request ────────────────────────────────────────────────────
// 1. Libera reservas expiradas
// 2. Busca un código libre y lo RESERVA (15 min) para este usuario
// 3. Si no hay códigos libres, incrementa contador y genera uno nuevo cada 20 intentos
router.get('/request', (req, res) => {
  liberarExpiradas();

  const ahora = Math.floor(Date.now() / 1000);
  const expira = ahora + RESERVA_TTL;

  // Intentar reservar un código libre en una transacción atómica
  const resultado = db.transaction(() => {
    const libre = db.prepare(`
      SELECT id, code FROM invite_codes
      WHERE used=0 AND (reserved=0 OR reserved_at IS NULL OR (?-reserved_at)>?)
      ORDER BY RANDOM() LIMIT 1
    `).get(ahora, RESERVA_TTL);

    if (!libre) return null;

    db.prepare(`
      UPDATE invite_codes SET reserved=1, reserved_at=? WHERE id=?
    `).run(ahora, libre.id);

    return libre.code;
  })();

  if (resultado) {
    return res.json({
      code: resultado,
      message: 'Código de invitación reservado. Tienes 15 minutos para completar el registro.',
      expira_en: '15 minutos'
    });
  }

  // ── No hay códigos libres ─────────────────────────────────────────────────
  db.prepare(`UPDATE global_state SET failed_attempts=failed_attempts+1 WHERE id=1`).run();
  const { failed_attempts: attempts } = db.prepare(`SELECT failed_attempts FROM global_state WHERE id=1`).get();

  // Cada 20 intentos fallidos → generar un código nuevo
  if (attempts % 20 === 0) {
    let newCode, tries = 0;
    do {
      newCode = generateCode(); tries++;
      if (tries > 200) return res.status(500).json({ error: 'Error interno al generar código' });
    } while (db.prepare('SELECT id FROM invite_codes WHERE code=?').get(newCode));

    // Insertar y reservar de inmediato
    db.prepare(`INSERT INTO invite_codes (code, reserved, reserved_at) VALUES (?,1,?)`).run(newCode, ahora);
    console.log(`[CODES] Intento #${attempts}: nuevo código generado → ${newCode}`);

    return res.json({
      code: newCode,
      message: `¡Código desbloqueado en el intento #${attempts}! Tienes 15 minutos para registrarte.`,
      expira_en: '15 minutos'
    });
  }

  const faltan = 20 - (attempts % 20);
  return res.status(503).json({
    error: 'No hay códigos disponibles en este momento.',
    hint: `Faltan ${faltan} ${faltan === 1 ? 'intento' : 'intentos'} para que se libere un nuevo código.`,
    attempts_so_far: attempts
  });
});

// ── GET /api/codes/status ─────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  liberarExpiradas();
  const ahora = Math.floor(Date.now() / 1000);

  const total     = db.prepare('SELECT COUNT(*) as n FROM invite_codes').get().n;
  const usados    = db.prepare('SELECT COUNT(*) as n FROM invite_codes WHERE used=1').get().n;
  const reservados= db.prepare('SELECT COUNT(*) as n FROM invite_codes WHERE used=0 AND reserved=1 AND (?-reserved_at)<=?').get(ahora, RESERVA_TTL).n;
  const libres    = db.prepare('SELECT COUNT(*) as n FROM invite_codes WHERE used=0 AND (reserved=0 OR (?-reserved_at)>?)').get(ahora, RESERVA_TTL).n;
  const { failed_attempts } = db.prepare('SELECT failed_attempts FROM global_state WHERE id=1').get();

  res.json({
    total_codes: total,
    libres,
    reservados,
    usados,
    next_code_in: libres === 0 ? (20 - (failed_attempts % 20)) : null
  });
});

module.exports = router;
