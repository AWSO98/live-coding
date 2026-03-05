// backend/app.js
const express = require('express');
const cors    = require('cors');

const authRoutes    = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const codeRoutes    = require('./routes/codes');

const app = express();

app.use(cors({ origin: 'http://localhost:8080' }));
app.use(express.json());

// ── Rutas ─────────────────────────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/codes',    codeRoutes);

// Ruta de salud
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

// ── Error handler global ── nunca exponer stack traces ────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[API] Escuchando en puerto ${PORT}`));
