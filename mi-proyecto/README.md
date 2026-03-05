# 🐴 ForoJejes

**El foro de los que mandan**

Foro de mensajes con acceso por código de invitación, sistema de visibilidad +Jeje, mensajes privados y organización por secciones temáticas.

---

## Estructura del proyecto

```
forojejes/
├── backend/
│   ├── app.js                  ← Entrada principal Express
│   ├── database.js             ← SQLite + seed de categorías y códigos
│   ├── package.json
│   ├── Dockerfile
│   ├── middleware/
│   │   └── auth.js             ← Verificación JWT
│   └── routes/
│       ├── auth.js             ← /api/auth/register + /api/auth/login
│       ├── messages.js         ← /api/messages (CRUD + categorías)
│       └── codes.js            ← /api/codes/request + /api/codes/status
├── frontend/
│   ├── index.html              ← Portada: subforos + últimos mensajes
│   ├── subforo.html            ← Vista de una sección concreta
│   ├── login.html              ← Acceso
│   ├── register.html           ← Registro con código de invitación
│   ├── script.js               ← Lógica de la portada
│   └── subforo.js              ← Lógica de la vista de sección
├── docker-compose.yml
├── nginx.conf
└── README.md
```

---

## Arrancar el proyecto

```bash
docker-compose up --build
```

- Frontend: http://localhost:8080
- API:      http://localhost:3000/api/health

---

## Funcionalidades

### Acceso
- Registro solo con **código de invitación** (50 códigos generados al arrancar)
- Cada 20 intentos fallidos de obtener código se libera uno nuevo
- El nickname **debe contener "jeje"** (validado en backend y frontend)
- Contraseñas hasheadas con bcrypt (12 rounds)
- Autenticación JWT con expiración de 8h

### Secciones del foro
| Sección | Slug |
|---|---|
| 💬 General | `general` |
| 🎮 Videojuegos | `videojuegos` |
| ❓ Consultas | `consultas` |
| 💡 Electrónica | `electronica` |
| ⚽ Deportes | `deportes` |
| ✈️ Viajes | `viajes` |
| 📚 Estudios | `estudios` |
| 💼 Trabajo | `trabajo` |
| 🚗 Motor | `motor` |

### Visibilidad de mensajes
| Tipo | Quién lo ve |
|---|---|
| 🌐 Público | Todos los usuarios registrados |
| 🔥 +Jeje | Solo usuarios con ≥ 100 mensajes publicados (aparece bloqueado para el resto) |
| 🔒 Privado | El autor + los nicknames que elija (invisibles para los demás) |

---

## Seguridad implementada
- Prepared statements en todas las queries (anti SQLi)
- Contraseñas con bcrypt 12 rounds
- JWT en todas las rutas protegidas
- textContent en lugar de innerHTML (anti XSS)
- Mensajes bloqueados decididos en backend (nunca en cliente)
- Mismo mensaje de error para usuario inexistente y contraseña incorrecta (anti user enumeration)
- Transacciones atómicas en registro

## ⚠️ Pendiente para producción
- Rate limiting en /api/codes/request y /api/auth/login
- HTTPS (certificado SSL)
- Cambiar JWT_SECRET por variable de entorno segura
- El endpoint /api/messages/usuarios permite enumerar usuarios letra a letra
