// backend/routes/codes.js
const express = require('express');
const { db, generateCode } = require('../database');

const router = express.Router();

// ── GET /api/codes/request ────────────────────────────────────────────────────
// El usuario pulsa "Obtener código" en la página de registro.
// Devuelve un código disponible O incrementa el contador de intentos fallidos.
//
// ⚠️ VULNERABILIDAD POTENCIAL — Rate limiting:
// Sin protección, un bot puede llamar este endpoint miles de veces y agotar
// todos los códigos antes de que lleguen usuarios reales.
// Investiga: express-rate-limit, o un simple throttle por IP.
router.get('/request', (req, res) => {
  // Buscar un código disponible (no usado)
  const available = db.prepare(
    'SELECT code FROM invite_codes WHERE used = 0 ORDER BY RANDOM() LIMIT 1'
  ).get();

  if (available) {
    // Hay códigos: devolver uno (sin marcarlo como usado aún — se marca al registrarse)
    return res.json({
      code: available.code,
      message: 'Código de invitación generado. Úsalo para registrarte.'
    });
  }

  // No hay códigos disponibles: incrementar contador de intentos fallidos
  db.prepare(
    'UPDATE global_state SET failed_attempts = failed_attempts + 1 WHERE id = 1'
  ).run();

  const state = db.prepare('SELECT failed_attempts FROM global_state WHERE id = 1').get();
  const attempts = state.failed_attempts;

  // Cada 20 intentos fallidos, generar un nuevo código
  if (attempts % 20 === 0) {
    let newCode;
    let tries = 0;
    do {
      newCode = generateCode();
      tries++;
      if (tries > 100) {
        return res.status(500).json({ error: 'Error interno al generar código' });
      }
    } while (db.prepare('SELECT id FROM invite_codes WHERE code = ?').get(newCode));

    db.prepare('INSERT INTO invite_codes (code) VALUES (?)').run(newCode);

    console.log(`[CODES] Intento #${attempts}: nuevo código generado → ${newCode}`);

    return res.json({
      code: newCode,
      message: `¡Eres el visitante #${attempts}! Has desbloqueado un código especial.`
    });
  }

  // Informar cuántos intentos faltan para el próximo código
  const remaining = 20 - (attempts % 20);
  return res.status(503).json({
    error: 'No hay códigos disponibles en este momento.',
    hint: `Faltan ${remaining} intentos para que se libere un nuevo código.`,
    attempts_so_far: attempts
  });
});

// ── GET /api/codes/status ─────────────────────────────────────────────────────
// Info pública del estado del sistema (no expone los códigos)
router.get('/status', (req, res) => {
  const total     = db.prepare('SELECT COUNT(*) as n FROM invite_codes').get().n;
  const available = db.prepare('SELECT COUNT(*) as n FROM invite_codes WHERE used = 0').get().n;
  const state     = db.prepare('SELECT failed_attempts FROM global_state WHERE id = 1').get();
  const remaining = 20 - (state.failed_attempts % 20);

  res.json({
    total_codes: total,
    available: available,
    used: total - available,
    // Si no hay disponibles, indicar cuántos intentos faltan
    next_code_in: available === 0 ? remaining : null
  });
});

module.exports = router;
