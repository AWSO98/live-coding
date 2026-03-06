const express        = require('express');
const { db }         = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const MAX_LEN        = 500;
const JEJE_THRESHOLD = 100;

function contarMensajes(userId) {
  return db.prepare('SELECT COUNT(*) as n FROM mensajes WHERE user_id=? AND parent_id IS NULL').get(userId).n;
}

function puedeVerHilo(hilo, userId, esJeje) {
  if (hilo.visibilidad === 'privado') {
    if (hilo.user_id === userId) return true;
    return !!db.prepare('SELECT 1 FROM mensaje_invitados WHERE mensaje_id=? AND user_id=?').get(hilo.id, userId);
  }
  return true; // publico y jeje siempre se muestra (jeje bloqueado pero visible)
}

// Migración: añadir parent_id y titulo si no existen
try { db.exec('ALTER TABLE mensajes ADD COLUMN parent_id INTEGER DEFAULT NULL REFERENCES mensajes(id)'); } catch {}
try { db.exec('ALTER TABLE mensajes ADD COLUMN titulo TEXT DEFAULT NULL'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_mensajes_parent ON mensajes(parent_id)'); } catch {}

// ── GET /api/messages — hilos raíz (portada o por categoría) ──────────────────
router.get('/', authMiddleware, (req, res) => {
  try {
    const userId   = req.user.id;
    const tuConteo = contarMensajes(userId);
    const esJeje   = tuConteo >= JEJE_THRESHOLD;
    const catSlug  = req.query.categoria || null;

    let query = `
      SELECT m.id, m.user_id, m.texto, m.titulo, m.visibilidad, m.created_at, m.parent_id,
             u.username, c.id as cat_id, c.slug as cat_slug,
             c.nombre as cat_nombre, c.icono as cat_icono,
             (SELECT COUNT(*) FROM mensajes r WHERE r.parent_id = m.id) as num_respuestas,
             (SELECT MAX(r2.created_at) FROM mensajes r2 WHERE r2.parent_id = m.id) as ultima_respuesta
      FROM mensajes m
      JOIN usuarios  u ON m.user_id      = u.id
      JOIN categorias c ON m.categoria_id = c.id
      WHERE m.parent_id IS NULL
    `;
    const params = [];
    if (catSlug) { query += ' AND c.slug = ?'; params.push(catSlug); }
    query += ' ORDER BY COALESCE((SELECT MAX(r3.created_at) FROM mensajes r3 WHERE r3.parent_id=m.id), m.created_at) DESC LIMIT 300';

    const todos = db.prepare(query).all(...params);

    const hilos = todos
      .filter(m => puedeVerHilo(m, userId, esJeje))
      .map(m => {
        const bloqueado = m.visibilidad === 'jeje' && !esJeje && m.user_id !== userId;
        return {
          id: m.id, user_id: m.user_id, username: m.username,
          titulo: bloqueado ? null : (m.titulo || m.texto?.slice(0,60)),
          texto:  bloqueado ? null : m.texto,
          bloqueado, visibilidad: m.visibilidad, created_at: m.created_at,
          num_respuestas: m.num_respuestas || 0,
          ultima_respuesta: m.ultima_respuesta || null,
          categoria: { id: m.cat_id, slug: m.cat_slug, nombre: m.cat_nombre, icono: m.cat_icono },
          invitados: m.visibilidad === 'privado' && m.user_id === userId
            ? db.prepare(`SELECT u.username FROM mensaje_invitados mi JOIN usuarios u ON mi.user_id=u.id WHERE mi.mensaje_id=?`).all(m.id).map(r=>r.username)
            : undefined
        };
      });

    res.json({ mensajes: hilos, tu_conteo: tuConteo, es_jeje: esJeje });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// ── GET /api/messages/:id — hilo completo con respuestas ──────────────────────
router.get('/:id', authMiddleware, (req, res) => {
  const hiloId = parseInt(req.params.id);
  if (isNaN(hiloId)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const userId   = req.user.id;
    const tuConteo = contarMensajes(userId);
    const esJeje   = tuConteo >= JEJE_THRESHOLD;

    const hilo = db.prepare(`
      SELECT m.*, u.username, c.id as cat_id, c.slug as cat_slug, c.nombre as cat_nombre, c.icono as cat_icono
      FROM mensajes m JOIN usuarios u ON m.user_id=u.id JOIN categorias c ON m.categoria_id=c.id
      WHERE m.id=? AND m.parent_id IS NULL
    `).get(hiloId);

    if (!hilo) return res.status(404).json({ error: 'Hilo no encontrado' });
    if (!puedeVerHilo(hilo, userId, esJeje)) return res.status(403).json({ error: 'No tienes acceso a este hilo' });

    const bloqueadoRaiz = hilo.visibilidad === 'jeje' && !esJeje && hilo.user_id !== userId;

    // Obtener respuestas
    const respuestas = db.prepare(`
      SELECT m.*, u.username FROM mensajes m JOIN usuarios u ON m.user_id=u.id
      WHERE m.parent_id=? ORDER BY m.created_at ASC
    `).all(hiloId).map(r => {
      const bloqR = hilo.visibilidad === 'jeje' && !esJeje && r.user_id !== userId;
      return {
        id: r.id, user_id: r.user_id, username: r.username,
        texto: bloqR ? null : r.texto, bloqueado: bloqR,
        visibilidad: hilo.visibilidad, // hereda visibilidad del hilo
        created_at: r.created_at,
        es_propio: r.user_id === userId
      };
    });

    res.json({
      hilo: {
        id: hilo.id, user_id: hilo.user_id, username: hilo.username,
        titulo: bloqueadoRaiz ? null : hilo.titulo,
        texto:  bloqueadoRaiz ? null : hilo.texto,
        bloqueado: bloqueadoRaiz, visibilidad: hilo.visibilidad, created_at: hilo.created_at,
        categoria: { id: hilo.cat_id, slug: hilo.cat_slug, nombre: hilo.cat_nombre, icono: hilo.cat_icono },
        invitados: hilo.visibilidad === 'privado' && hilo.user_id === userId
          ? db.prepare(`SELECT u.username FROM mensaje_invitados mi JOIN usuarios u ON mi.user_id=u.id WHERE mi.mensaje_id=?`).all(hilo.id).map(r=>r.username)
          : undefined,
        es_propio: hilo.user_id === userId
      },
      respuestas,
      tu_conteo: tuConteo, es_jeje: esJeje
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener hilo' });
  }
});

// ── GET /api/messages/categorias ─────────────────────────────────────────────
router.get('/categorias', authMiddleware, (req, res) => {
  try {
    const cats = db.prepare(`
      SELECT c.id, c.slug, c.nombre, c.descripcion, c.icono,
             COUNT(m.id) as total_hilos,
             (SELECT COUNT(*) FROM mensajes r WHERE r.parent_id IN (SELECT id FROM mensajes WHERE categoria_id=c.id)) as total_respuestas,
             MAX(m.created_at) as ultimo_mensaje,
             (SELECT u.username FROM mensajes m2 JOIN usuarios u ON m2.user_id=u.id
              WHERE m2.categoria_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as ultimo_autor
      FROM categorias c LEFT JOIN mensajes m ON m.categoria_id=c.id AND m.parent_id IS NULL
      GROUP BY c.id ORDER BY c.id
    `).all();
    res.json({ categorias: cats });
  } catch (err) { res.status(500).json({ error: 'Error al obtener categorías' }); }
});

// ── POST /api/messages — crear hilo nuevo ────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  const { titulo, texto, visibilidad='publico', invitados=[], categoria_id=1 } = req.body;
  if (!texto || texto.trim()==='') return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  if (texto.length > MAX_LEN) return res.status(400).json({ error: `Máximo ${MAX_LEN} caracteres` });
  if (!['publico','jeje','privado'].includes(visibilidad)) return res.status(400).json({ error: 'Visibilidad no válida' });
  if (visibilidad==='privado' && (!Array.isArray(invitados)||invitados.length===0))
    return res.status(400).json({ error: 'Los mensajes privados necesitan al menos un usuario invitado' });
  const cat = db.prepare('SELECT id FROM categorias WHERE id=?').get(Number(categoria_id));
  if (!cat) return res.status(400).json({ error: 'Categoría no válida' });

  try {
    const tx = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO mensajes (user_id, categoria_id, titulo, texto, visibilidad, parent_id) VALUES (?,?,?,?,?,NULL)'
      ).run(req.user.id, Number(categoria_id), titulo?.trim()||null, texto.trim(), visibilidad);
      const msgId = result.lastInsertRowid;
      if (visibilidad==='privado') {
        const ins = db.prepare('INSERT OR IGNORE INTO mensaje_invitados (mensaje_id,user_id) VALUES (?,?)');
        for (const nick of invitados) {
          const u = db.prepare('SELECT id FROM usuarios WHERE username=?').get(nick.trim());
          if (!u) throw { code:'USER_NOT_FOUND', username: nick.trim() };
          ins.run(msgId, u.id);
        }
      }
      return msgId;
    });
    const msgId = tx();
    const catInfo = db.prepare('SELECT id,slug,nombre,icono FROM categorias WHERE id=?').get(Number(categoria_id));
    res.status(201).json({ id:msgId, titulo:titulo?.trim()||null, texto:texto.trim(), visibilidad, categoria:catInfo, created_at:new Date().toISOString() });
  } catch (err) {
    if (err.code==='USER_NOT_FOUND') return res.status(400).json({ error: `Usuario no encontrado: "${err.username}"` });
    res.status(500).json({ error: 'Error al publicar hilo' });
  }
});

// ── POST /api/messages/:id/reply — responder a un hilo ───────────────────────
router.post('/:id/reply', authMiddleware, (req, res) => {
  const hiloId = parseInt(req.params.id);
  if (isNaN(hiloId)) return res.status(400).json({ error: 'ID inválido' });
  const { texto } = req.body;
  if (!texto || texto.trim()==='') return res.status(400).json({ error: 'La respuesta no puede estar vacía' });
  if (texto.length > MAX_LEN) return res.status(400).json({ error: `Máximo ${MAX_LEN} caracteres` });

  try {
    const userId = req.user.id;
    const tuConteo = contarMensajes(userId);
    const esJeje = tuConteo >= JEJE_THRESHOLD;

    const hilo = db.prepare('SELECT * FROM mensajes WHERE id=? AND parent_id IS NULL').get(hiloId);
    if (!hilo) return res.status(404).json({ error: 'Hilo no encontrado' });
    if (!puedeVerHilo(hilo, userId, esJeje)) return res.status(403).json({ error: 'No tienes acceso a este hilo' });
    if (hilo.visibilidad === 'jeje' && !esJeje && hilo.user_id !== userId)
      return res.status(403).json({ error: 'Necesitas 100 mensajes para responder en hilos +Jeje' });

    const result = db.prepare(
      'INSERT INTO mensajes (user_id, categoria_id, texto, visibilidad, parent_id) VALUES (?,?,?,?,?)'
    ).run(userId, hilo.categoria_id, texto.trim(), hilo.visibilidad, hiloId);

    res.status(201).json({
      id: result.lastInsertRowid, user_id: userId, username: req.user.username,
      texto: texto.trim(), visibilidad: hilo.visibilidad, created_at: new Date().toISOString(),
      es_propio: true
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al responder' });
  }
});

// ── DELETE /api/messages/:id ──────────────────────────────────────────────────
router.delete('/:id', authMiddleware, (req, res) => {
  const msgId = parseInt(req.params.id);
  if (isNaN(msgId)) return res.status(400).json({ error: 'ID inválido' });
  try {
    const msg = db.prepare('SELECT * FROM mensajes WHERE id=?').get(msgId);
    if (!msg) return res.status(404).json({ error: 'Mensaje no encontrado' });
    if (msg.user_id !== req.user.id) return res.status(403).json({ error: 'No puedes borrar mensajes de otros' });
    // Si es un hilo, borrar también sus respuestas
    if (!msg.parent_id) db.prepare('DELETE FROM mensajes WHERE parent_id=?').run(msgId);
    db.prepare('DELETE FROM mensajes WHERE id=?').run(msgId);
    res.json({ message: 'Eliminado' });
  } catch { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ── GET /api/messages/usuarios ────────────────────────────────────────────────
router.get('/usuarios', authMiddleware, (req, res) => {
  const q = (req.query.q||'').trim();
  if (!q||q.length<2) return res.json({ usuarios:[] });
  try {
    const usuarios = db.prepare('SELECT username FROM usuarios WHERE username LIKE ? AND id!=? LIMIT 10')
      .all(`${q}%`, req.user.id).map(u=>u.username);
    res.json({ usuarios });
  } catch { res.status(500).json({ error: 'Error' }); }
});

module.exports = router;
