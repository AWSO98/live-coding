const express        = require('express');
const { db }         = require('../database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const MAX_LEN        = 500;
const JEJE_THRESHOLD = 100;

function contarMensajes(userId) {
  return db.prepare('SELECT COUNT(*) as n FROM mensajes WHERE user_id=?').get(userId).n;
}

// ── GET /api/messages — todos los mensajes visibles (portada) ─────────────────
// Query param opcional: ?categoria=slug
router.get('/', authMiddleware, (req, res) => {
  try {
    const userId   = req.user.id;
    const tuConteo = contarMensajes(userId);
    const esJeje   = tuConteo >= JEJE_THRESHOLD;
    const catSlug  = req.query.categoria || null;

    let query = `
      SELECT m.id, m.user_id, m.texto, m.visibilidad, m.created_at,
             u.username, c.id as cat_id, c.slug as cat_slug,
             c.nombre as cat_nombre, c.icono as cat_icono
      FROM mensajes m
      JOIN usuarios  u ON m.user_id      = u.id
      JOIN categorias c ON m.categoria_id = c.id
    `;
    const params = [];
    if (catSlug) {
      query += ' WHERE c.slug = ?';
      params.push(catSlug);
    }
    query += ' ORDER BY m.created_at DESC LIMIT 300';

    const todos = db.prepare(query).all(...params);

    const mensajes = todos
      .filter(m => {
        if (m.visibilidad !== 'privado') return true;
        if (m.user_id === userId) return true;
        return !!db.prepare('SELECT 1 FROM mensaje_invitados WHERE mensaje_id=? AND user_id=?').get(m.id, userId);
      })
      .map(m => {
        const bloqueado = m.visibilidad === 'jeje' && !esJeje && m.user_id !== userId;
        return {
          id:          m.id,
          user_id:     m.user_id,
          username:    m.username,
          texto:       bloqueado ? null : m.texto,
          bloqueado,
          visibilidad: m.visibilidad,
          created_at:  m.created_at,
          categoria: { id: m.cat_id, slug: m.cat_slug, nombre: m.cat_nombre, icono: m.cat_icono },
          invitados: m.visibilidad === 'privado' && m.user_id === userId
            ? db.prepare(`SELECT u.username FROM mensaje_invitados mi JOIN usuarios u ON mi.user_id=u.id WHERE mi.mensaje_id=?`).all(m.id).map(r=>r.username)
            : undefined
        };
      });

    res.json({ mensajes, tu_conteo: tuConteo, es_jeje: esJeje });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener mensajes' });
  }
});

// ── GET /api/messages/categorias — lista de categorías con contadores ─────────
router.get('/categorias', authMiddleware, (req, res) => {
  try {
    const cats = db.prepare(`
      SELECT c.id, c.slug, c.nombre, c.descripcion, c.icono,
             COUNT(m.id) as total_mensajes,
             MAX(m.created_at) as ultimo_mensaje,
             (SELECT u.username FROM mensajes m2 JOIN usuarios u ON m2.user_id=u.id
              WHERE m2.categoria_id=c.id ORDER BY m2.created_at DESC LIMIT 1) as ultimo_autor
      FROM categorias c
      LEFT JOIN mensajes m ON m.categoria_id = c.id
      GROUP BY c.id
      ORDER BY c.id
    `).all();
    res.json({ categorias: cats });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener categorías' });
  }
});

// ── POST /api/messages ────────────────────────────────────────────────────────
router.post('/', authMiddleware, (req, res) => {
  const { texto, visibilidad='publico', invitados=[], categoria_id=1 } = req.body;

  if (!texto || texto.trim()==='') return res.status(400).json({ error: 'El mensaje no puede estar vacío' });
  if (texto.length > MAX_LEN)      return res.status(400).json({ error: `Máximo ${MAX_LEN} caracteres` });
  if (!['publico','jeje','privado'].includes(visibilidad)) return res.status(400).json({ error: 'Visibilidad no válida' });
  if (visibilidad==='privado' && (!Array.isArray(invitados)||invitados.length===0))
    return res.status(400).json({ error: 'Los mensajes privados necesitan al menos un usuario invitado' });
  if (invitados.length > 20) return res.status(400).json({ error: 'Máximo 20 usuarios invitados' });

  // Verificar que la categoría existe
  const cat = db.prepare('SELECT id FROM categorias WHERE id=?').get(Number(categoria_id));
  if (!cat) return res.status(400).json({ error: 'Categoría no válida' });

  try {
    const tx = db.transaction(() => {
      const result = db.prepare(
        'INSERT INTO mensajes (user_id, categoria_id, texto, visibilidad) VALUES (?,?,?,?)'
      ).run(req.user.id, Number(categoria_id), texto.trim(), visibilidad);
      const msgId = result.lastInsertRowid;
      const invResueltos = [];
      if (visibilidad==='privado') {
        const ins = db.prepare('INSERT OR IGNORE INTO mensaje_invitados (mensaje_id,user_id) VALUES (?,?)');
        for (const nick of invitados) {
          const u = db.prepare('SELECT id FROM usuarios WHERE username=?').get(nick.trim());
          if (!u) throw { code:'USER_NOT_FOUND', username: nick.trim() };
          ins.run(msgId, u.id); invResueltos.push(nick.trim());
        }
      }
      return { msgId, invResueltos };
    });
    const { msgId, invResueltos } = tx();
    const catInfo = db.prepare('SELECT id,slug,nombre,icono FROM categorias WHERE id=?').get(Number(categoria_id));
    res.status(201).json({
      id:msgId, user_id:req.user.id, username:req.user.username,
      texto:texto.trim(), visibilidad, invitados:invResueltos,
      bloqueado:false, created_at:new Date().toISOString(),
      categoria: catInfo
    });
  } catch (err) {
    if (err.code==='USER_NOT_FOUND') return res.status(400).json({ error: `Usuario no encontrado: "${err.username}"` });
    res.status(500).json({ error: 'Error al publicar mensaje' });
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
    db.prepare('DELETE FROM mensajes WHERE id=?').run(msgId);
    res.json({ message: 'Eliminado' });
  } catch { res.status(500).json({ error: 'Error al eliminar' }); }
});

// ── GET /api/messages/usuarios — autocompletado ───────────────────────────────
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
