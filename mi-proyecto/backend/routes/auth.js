// backend/routes/auth.js
const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const { db }  = require('../database');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_cambiame';

// ── REGISTRO ──────────────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { username, email, password, confirmPassword, inviteCode } = req.body;

  // ── Validación de campos ──
  if (!username || !email || !password || !confirmPassword || !inviteCode) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Las contraseñas no coinciden' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'El usuario debe tener entre 3 y 30 caracteres' });
  }
  if (!username.toLowerCase().includes('jeje')) {
    return res.status(400).json({ error: 'El nombre de usuario debe contener "jeje" en algún lugar (ej: jeje_pepito, el_jeje, superjeje)' });
  }

  // ── Validar código de invitación ──
  const ahora = Math.floor(Date.now() / 1000);
  const RESERVA_TTL = 15 * 60;

  const codeRow = db.prepare(
    'SELECT id, used, reserved, reserved_at FROM invite_codes WHERE code = ?'
  ).get(inviteCode.trim().toUpperCase());

  // Mismo mensaje para inexistente, usado o expirado (anti-enumeración)
  if (!codeRow || codeRow.used === 1) {
    return res.status(400).json({ error: 'Código de invitación inválido' });
  }
  // Si estaba reservado, verificar que no haya expirado
  if (codeRow.reserved === 1 && codeRow.reserved_at !== null) {
    const edad = ahora - codeRow.reserved_at;
    if (edad > RESERVA_TTL) {
      // Expirado — liberar y rechazar
      db.prepare('UPDATE invite_codes SET reserved=0, reserved_at=NULL WHERE id=?').run(codeRow.id);
      return res.status(400).json({ error: 'El código de invitación ha expirado. Solicita uno nuevo.' });
    }
  }

  try {
    const hashedPassword = bcrypt.hashSync(password, 12);

    // Transacción: crear usuario + marcar código como usado de forma atómica
    // Si falla cualquiera de los dos pasos, ninguno se guarda
    const registerTransaction = db.transaction(() => {
      const userResult = db.prepare(
        'INSERT INTO usuarios (username, email, password) VALUES (?, ?, ?)'
      ).run(username, email, hashedPassword);

      const newUserId = userResult.lastInsertRowid;

      db.prepare(
        'UPDATE invite_codes SET used=1, reserved=0, reserved_at=NULL, used_by=? WHERE id=?'
      ).run(newUserId, codeRow.id);

      return newUserId;
    });

    registerTransaction();

    res.status(201).json({ message: 'Cuenta creada correctamente. Ya puedes iniciar sesión.' });

  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'El usuario o email ya existe' });
    }
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

// ── LOGIN ─────────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  try {
    const user = db.prepare(
      'SELECT * FROM usuarios WHERE username = ?'
    ).get(username);

    // ⚠️ Mismo mensaje para "no existe" y "contraseña incorrecta"
    // Evita user enumeration attack
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username }
    });

  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

module.exports = router;
