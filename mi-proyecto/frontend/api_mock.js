// api_mock.js — Backend simulado para uso sin servidor (file://)
// Se inyecta automáticamente cuando no hay conexión real disponible

(function() {
  const MOCK_STORAGE_KEY = 'forojejes_mock_db';
  const JWT_MOCK = 'mock_token_forojejes';
  const JEJE_THRESHOLD = 100;
  const RESERVA_TTL = 15 * 60 * 1000; // 15 min en ms

  // ── Base de datos en memoria / localStorage ────────────────────────────────
  function loadDB() {
    try {
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function saveDB(db) {
    try { localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(db)); } catch {}
  }

  function getDB() {
    let db = loadDB();
    if (!db) {
      // BD inicial
      const codes = [];
      for (let i = 0; i < 50; i++) {
        codes.push({ id: i+1, code: randomCode(), used: false, reserved: false, reserved_at: null, used_by: null });
      }
      db = {
        usuarios: [],
        mensajes: [],
        invite_codes: codes,
        categorias: [
          {id:1,slug:'general',     nombre:'General',     descripcion:'Conversaciones de todo tipo',         icono:'💬'},
          {id:2,slug:'videojuegos', nombre:'Videojuegos', descripcion:'PC, consolas, móvil y retro',          icono:'🎮'},
          {id:3,slug:'consultas',   nombre:'Consultas',   descripcion:'Pregunta lo que quieras al foro',     icono:'❓'},
          {id:4,slug:'electronica', nombre:'Electrónica', descripcion:'Hardware, gadgets y cacharros',        icono:'💡'},
          {id:5,slug:'deportes',    nombre:'Deportes',    descripcion:'Fútbol, baloncesto, F1 y más',         icono:'⚽'},
          {id:6,slug:'viajes',      nombre:'Viajes',      descripcion:'Destinos, rutas y consejos viajeros',  icono:'✈️'},
          {id:7,slug:'estudios',    nombre:'Estudios',    descripcion:'Oposiciones, universidad, idiomas',    icono:'📚'},
          {id:8,slug:'trabajo',     nombre:'Trabajo',     descripcion:'Empleo, autónomos, empresas',          icono:'💼'},
          {id:9,slug:'motor',       nombre:'Motor',       descripcion:'Coches, motos, furgonetas y más',      icono:'🚗'},
        ],
        next_id: { usuarios: 1, mensajes: 1 }
      };
      saveDB(db);
    }
    return db;
  }

  function randomCode() {
    const hex = () => Math.random().toString(16).slice(2,6).toUpperCase().padEnd(4,'0').slice(0,4);
    return `${hex()}-${hex()}-${hex()}-${hex()}`;
  }

  function mockResponse(status, body) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // ── Verificar token mock ───────────────────────────────────────────────────
  function verifyToken(request) {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    // Token formato: mock_USER_ID
    if (!token.startsWith('mock_')) return null;
    const userId = parseInt(token.split('_')[1]);
    const db = getDB();
    return db.usuarios.find(u => u.id === userId) || null;
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handlers = {

    // GET /api/health
    'GET /api/health': () => mockResponse(200, { status: 'ok' }),

    // GET /api/codes/request
    'GET /api/codes/request': () => {
      const db = getDB();
      const now = Date.now();
      // Liberar expiradas
      db.invite_codes.forEach(c => {
        if (c.reserved && !c.used && c.reserved_at && (now - c.reserved_at) > RESERVA_TTL) {
          c.reserved = false; c.reserved_at = null;
        }
      });
      // Buscar libre
      const libres = db.invite_codes.filter(c => !c.used && !c.reserved);
      if (libres.length > 0) {
        const elegido = libres[Math.floor(Math.random() * libres.length)];
        elegido.reserved = true;
        elegido.reserved_at = now;
        saveDB(db);
        return mockResponse(200, {
          code: elegido.code,
          message: 'Código reservado. Tienes 15 minutos para completar el registro.',
          expira_en: '15 minutos'
        });
      }
      // Generar nuevo
      const newCode = randomCode();
      const newId = db.invite_codes.length + 1;
      db.invite_codes.push({ id: newId, code: newCode, used: false, reserved: true, reserved_at: now, used_by: null });
      saveDB(db);
      return mockResponse(200, {
        code: newCode,
        message: 'Nuevo código generado. Tienes 15 minutos.',
        expira_en: '15 minutos'
      });
    },

    // GET /api/codes/status
    'GET /api/codes/status': () => {
      const db = getDB();
      const now = Date.now();
      const total = db.invite_codes.length;
      const usados = db.invite_codes.filter(c => c.used).length;
      const reservados = db.invite_codes.filter(c => c.reserved && !c.used && c.reserved_at && (now - c.reserved_at) <= RESERVA_TTL).length;
      const libres = total - usados - reservados;
      return mockResponse(200, { total_codes: total, libres, reservados, usados, next_code_in: null });
    },

    // POST /api/auth/register
    'POST /api/auth/register': async (req) => {
      const body = await req.json();
      const { username, email, password, confirmPassword, inviteCode } = body;
      if (!username || !email || !password || !confirmPassword || !inviteCode)
        return mockResponse(400, { error: 'Todos los campos son obligatorios' });
      if (password !== confirmPassword)
        return mockResponse(400, { error: 'Las contraseñas no coinciden' });
      if (password.length < 8)
        return mockResponse(400, { error: 'La contraseña debe tener al menos 8 caracteres' });
      if (username.length < 3 || username.length > 30)
        return mockResponse(400, { error: 'El usuario debe tener entre 3 y 30 caracteres' });
      if (!username.toLowerCase().includes('jeje'))
        return mockResponse(400, { error: 'El nombre de usuario debe contener "jeje"' });

      const db = getDB();
      const now = Date.now();

      // Validar código
      const codeRow = db.invite_codes.find(c => c.code === inviteCode.trim().toUpperCase());
      if (!codeRow || codeRow.used)
        return mockResponse(400, { error: 'Código de invitación inválido' });
      if (codeRow.reserved && codeRow.reserved_at && (now - codeRow.reserved_at) > RESERVA_TTL)
        return mockResponse(400, { error: 'El código ha expirado. Solicita uno nuevo.' });

      // Verificar duplicados
      if (db.usuarios.find(u => u.username.toLowerCase() === username.toLowerCase()))
        return mockResponse(409, { error: 'El usuario o email ya existe' });
      if (db.usuarios.find(u => u.email.toLowerCase() === email.toLowerCase()))
        return mockResponse(409, { error: 'El usuario o email ya existe' });

      // Crear usuario (contraseña en texto plano en mock — solo para demo local)
      const newUser = { id: db.next_id.usuarios++, username, email, password, created_at: new Date().toISOString() };
      db.usuarios.push(newUser);
      codeRow.used = true; codeRow.reserved = false; codeRow.reserved_at = null; codeRow.used_by = newUser.id;
      saveDB(db);
      return mockResponse(201, { message: 'Cuenta creada correctamente. Ya puedes iniciar sesión.' });
    },

    // POST /api/auth/login
    'POST /api/auth/login': async (req) => {
      const body = await req.json();
      const { username, password } = body;
      if (!username || !password)
        return mockResponse(400, { error: 'Usuario y contraseña son obligatorios' });
      const db = getDB();
      const user = db.usuarios.find(u => u.username === username && u.password === password);
      if (!user)
        return mockResponse(401, { error: 'Credenciales incorrectas' });
      const token = `mock_${user.id}_${Date.now()}`;
      return mockResponse(200, { token, user: { id: user.id, username: user.username } });
    },

    // GET /api/messages/categorias
    'GET /api/messages/categorias': (req) => {
      const user = verifyToken(req);
      if (!user) return mockResponse(401, { error: 'No autorizado' });
      const db = getDB();
      const cats = db.categorias.map(cat => {
        const msgs = db.mensajes.filter(m => m.categoria_id === cat.id);
        const sorted = [...msgs].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
        const last = sorted[0];
        const lastUser = last ? db.usuarios.find(u => u.id === last.user_id) : null;
        return { ...cat, total_mensajes: msgs.length, ultimo_mensaje: last?.created_at || null, ultimo_autor: lastUser?.username || null };
      });
      return mockResponse(200, { categorias: cats });
    },

    // GET /api/messages/usuarios
    'GET /api/messages/usuarios': (req, url) => {
      const user = verifyToken(req);
      if (!user) return mockResponse(401, { error: 'No autorizado' });
      const q = (url.searchParams.get('q') || '').toLowerCase();
      if (!q || q.length < 2) return mockResponse(200, { usuarios: [] });
      const db = getDB();
      const usuarios = db.usuarios.filter(u => u.id !== user.id && u.username.toLowerCase().startsWith(q)).map(u => u.username).slice(0, 10);
      return mockResponse(200, { usuarios });
    },

    // GET /api/messages
    'GET /api/messages': (req, url) => {
      const user = verifyToken(req);
      if (!user) return mockResponse(401, { error: 'No autorizado' });
      const db = getDB();
      const catSlug = url.searchParams.get('categoria');
      const tuConteo = db.mensajes.filter(m => m.user_id === user.id).length;
      const esJeje = tuConteo >= JEJE_THRESHOLD;

      let msgs = [...db.mensajes].sort((a,b) => new Date(b.created_at) - new Date(a.created_at));

      if (catSlug) {
        const cat = db.categorias.find(c => c.slug === catSlug);
        if (cat) msgs = msgs.filter(m => m.categoria_id === cat.id);
      }

      const visibles = msgs
        .filter(m => {
          if (m.visibilidad !== 'privado') return true;
          if (m.user_id === user.id) return true;
          return (m.invitados || []).includes(user.id);
        })
        .map(m => {
          const cat = db.categorias.find(c => c.id === m.categoria_id) || db.categorias[0];
          const autor = db.usuarios.find(u => u.id === m.user_id);
          const bloqueado = m.visibilidad === 'jeje' && !esJeje && m.user_id !== user.id;
          return {
            id: m.id, user_id: m.user_id, username: autor?.username || '?',
            texto: bloqueado ? null : m.texto,
            bloqueado, visibilidad: m.visibilidad, created_at: m.created_at,
            categoria: { id: cat.id, slug: cat.slug, nombre: cat.nombre, icono: cat.icono },
            invitados: m.visibilidad === 'privado' && m.user_id === user.id
              ? (m.invitados || []).map(uid => db.usuarios.find(u => u.id === uid)?.username).filter(Boolean)
              : undefined
          };
        });

      return mockResponse(200, { mensajes: visibles, tu_conteo: tuConteo, es_jeje: esJeje });
    },

    // POST /api/messages
    'POST /api/messages': async (req) => {
      const user = verifyToken(req);
      if (!user) return mockResponse(401, { error: 'No autorizado' });
      const body = await req.json();
      const { texto, visibilidad = 'publico', invitados = [], categoria_id = 1 } = body;
      if (!texto || !texto.trim()) return mockResponse(400, { error: 'El mensaje no puede estar vacío' });
      if (texto.length > 500) return mockResponse(400, { error: 'Máximo 500 caracteres' });
      if (!['publico','jeje','privado'].includes(visibilidad)) return mockResponse(400, { error: 'Visibilidad no válida' });
      if (visibilidad === 'privado' && invitados.length === 0) return mockResponse(400, { error: 'Añade al menos un usuario invitado' });
      const db = getDB();
      const cat = db.categorias.find(c => c.id === Number(categoria_id)) || db.categorias[0];

      // Resolver nicknames a IDs
      let invitadoIds = [];
      for (const nick of invitados) {
        const u = db.usuarios.find(u => u.username === nick);
        if (!u) return mockResponse(400, { error: `Usuario no encontrado: "${nick}"` });
        invitadoIds.push(u.id);
      }

      const msg = {
        id: db.next_id.mensajes++,
        user_id: user.id,
        categoria_id: cat.id,
        texto: texto.trim(),
        visibilidad,
        invitados: invitadoIds,
        created_at: new Date().toISOString()
      };
      db.mensajes.unshift(msg);
      saveDB(db);
      return mockResponse(201, {
        id: msg.id, user_id: user.id, username: user.username,
        texto: msg.texto, visibilidad, bloqueado: false, created_at: msg.created_at,
        categoria: { id: cat.id, slug: cat.slug, nombre: cat.nombre, icono: cat.icono },
        invitados
      });
    },

    // DELETE /api/messages/:id
    'DELETE /api/messages': (req, url) => {
      const user = verifyToken(req);
      if (!user) return mockResponse(401, { error: 'No autorizado' });
      const parts = url.pathname.split('/');
      const id = parseInt(parts[parts.length - 1]);
      const db = getDB();
      const idx = db.mensajes.findIndex(m => m.id === id);
      if (idx === -1) return mockResponse(404, { error: 'Mensaje no encontrado' });
      if (db.mensajes[idx].user_id !== user.id) return mockResponse(403, { error: 'No puedes borrar mensajes de otros' });
      db.mensajes.splice(idx, 1);
      saveDB(db);
      return mockResponse(200, { message: 'Eliminado' });
    },
  };

  // ── Interceptar fetch ──────────────────────────────────────────────────────
  const originalFetch = window.fetch.bind(window);

  window.fetch = async function(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url, location.href);

    // Solo interceptar llamadas a localhost:3000
    if (url.hostname !== 'localhost' || url.port !== '3000') {
      return originalFetch(input, init);
    }

    const method = request.method.toUpperCase();
    const path = url.pathname;

    // Simular latencia de red (80-200ms)
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));

    try {
      // Enrutar
      if (method === 'GET' && path === '/api/health') return handlers['GET /api/health']();
      if (method === 'GET' && path === '/api/codes/request') return handlers['GET /api/codes/request']();
      if (method === 'GET' && path === '/api/codes/status') return handlers['GET /api/codes/status']();
      if (method === 'POST' && path === '/api/auth/register') return handlers['POST /api/auth/register'](request);
      if (method === 'POST' && path === '/api/auth/login') return handlers['POST /api/auth/login'](request);
      if (method === 'GET' && path === '/api/messages/categorias') return handlers['GET /api/messages/categorias'](request, url);
      if (method === 'GET' && path === '/api/messages/usuarios') return handlers['GET /api/messages/usuarios'](request, url);
      if (method === 'GET' && path === '/api/messages') return handlers['GET /api/messages'](request, url);
      if (method === 'POST' && path === '/api/messages') return handlers['POST /api/messages'](request);
      if (method === 'DELETE' && path.startsWith('/api/messages/')) return handlers['DELETE /api/messages'](request, url);

      return mockResponse(404, { error: 'Ruta no encontrada' });
    } catch (err) {
      console.error('[MOCK API] Error:', err);
      return mockResponse(500, { error: 'Error interno del mock' });
    }
  };

  console.log('[ForoJejes] 🟢 Mock API activo — funcionando sin servidor');
})();
