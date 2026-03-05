// script.js — Portada (índice de subforos + compose rápido)
const API = 'http://localhost:3000/api';

(function requireAuth() {
  if (!localStorage.getItem('token') || !localStorage.getItem('user'))
    window.location.replace('login.html');
})();

const getToken = () => localStorage.getItem('token');
const getUser  = () => JSON.parse(localStorage.getItem('user') || 'null');
const JEJE_THRESHOLD = 100;
let tuConteoGlobal = 0;
let invitados = [];

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}

// ── Auth UI ────────────────────────────────────────────────────────────────
function updateAuthUI(esJeje) {
  const user = getUser();
  const navUser = document.getElementById('nav-user');
  const compose = document.getElementById('compose-wrap');
  const loginPr = document.getElementById('login-prompt');
  const uDisplay = document.getElementById('username-display');
  const jejeBadge = document.getElementById('jeje-badge');

  if (user && getToken()) {
    if (navUser)   navUser.style.display = 'flex';
    if (compose)   compose.style.display = 'block';
    if (loginPr)   loginPr.classList.remove('visible');
    if (uDisplay)  uDisplay.textContent = user.username;
    if (jejeBadge && esJeje) jejeBadge.style.display = 'inline-block';
  } else {
    if (navUser)  navUser.style.display = 'none';
    if (compose)  compose.style.display = 'none';
    if (loginPr)  loginPr.classList.add('visible');
  }
}

// ── Cargar categorías en select y en tabla ────────────────────────────────
async function loadCategorias() {
  const tbody    = document.getElementById('subforos-list');
  const catSelect = document.getElementById('cat-select');
  try {
    const res = await fetch(`${API}/messages/categorias`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Error');
    const { categorias } = await res.json();

    // Poblar select
    if (catSelect) {
      catSelect.innerHTML = '';
      categorias.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = `${c.icono} ${c.nombre}`;
        catSelect.appendChild(opt);
      });
    }

    // Poblar tabla de subforos
    if (!tbody) return;
    tbody.innerHTML = '';
    let totalMsgs = 0;
    categorias.forEach(cat => {
      totalMsgs += cat.total_mensajes;
      const tr = document.createElement('tr');
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', () => {
        window.location.href = `subforo.html?cat=${cat.slug}`;
      });

      const td1 = document.createElement('td');
      td1.innerHTML = `<span style="font-size:22px;vertical-align:middle;margin-right:6px">${cat.icono}</span>
        <span class="sf-nombre">${cat.nombre}</span>
        <span class="sf-desc">${cat.descripcion}</span>`;
      tr.appendChild(td1);

      const td2 = document.createElement('td');
      td2.className = 'num';
      td2.innerHTML = `<span class="sf-count">${cat.total_mensajes}</span>`;
      tr.appendChild(td2);

      const td3 = document.createElement('td');
      if (cat.ultimo_mensaje) {
        td3.innerHTML = `<span class="sf-ultimo">Por: <strong>${cat.ultimo_autor || '—'}</strong><br>${formatDate(cat.ultimo_mensaje)}</span>`;
      } else {
        td3.innerHTML = `<span style="font-size:10px;color:#999;font-style:italic">Sin mensajes aún</span>`;
      }
      tr.appendChild(td3);
      tbody.appendChild(tr);
    });

    const statMsgs = document.getElementById('stat-msgs');
    if (statMsgs) statMsgs.textContent = totalMsgs;

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="color:#cc0000;text-align:center;padding:12px">Error al cargar secciones</td></tr>`;
  }
}

// ── Cargar conteo del usuario ─────────────────────────────────────────────
async function loadUserStats() {
  try {
    const res = await fetch(`${API}/messages`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (!res.ok) return;
    const { tu_conteo, es_jeje } = await res.json();
    tuConteoGlobal = tu_conteo;
    const conteoEl = document.getElementById('tu-conteo');
    const rangoEl  = document.getElementById('stat-rango');
    if (conteoEl) conteoEl.textContent = `${tu_conteo} mensajes`;
    if (rangoEl)  rangoEl.textContent = es_jeje ? '+Jeje 🔥' : `Novato (${JEJE_THRESHOLD - tu_conteo} para +Jeje)`;
    updateAuthUI(es_jeje);
  } catch {}
}

// ── Publicar desde portada ────────────────────────────────────────────────
async function postMessage() {
  const ta      = document.getElementById('msg-input');
  const errEl   = document.getElementById('post-error');
  const okEl    = document.getElementById('post-ok');
  const visEl   = document.querySelector('input[name="visibilidad"]:checked');
  const catSel  = document.getElementById('cat-select');
  if (!ta || !errEl) return;

  const texto       = ta.value.trim();
  const visibilidad = visEl ? visEl.value : 'publico';
  const categoria_id = catSel ? parseInt(catSel.value) : 1;
  errEl.textContent = ''; if (okEl) okEl.textContent = '';

  if (!texto) { errEl.textContent = '⚠ El mensaje no puede estar vacío.'; return; }
  if (visibilidad === 'privado' && invitados.length === 0) {
    errEl.textContent = '⚠ Añade al menos un usuario para mensajes privados.'; return;
  }

  const btn = document.getElementById('btn-post');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const res = await fetch(`${API}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
      body: JSON.stringify({ texto, visibilidad, invitados, categoria_id })
    });
    const d = await res.json();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.replace('login.html'); return; }
      errEl.textContent = '⚠ ' + (d.error || 'Error al publicar.'); return;
    }
    ta.value = '';
    document.getElementById('char-count').textContent = '0 / 500 caracteres';
    invitados = [];
    const tagsWrap = document.getElementById('invitados-tags');
    if (tagsWrap) tagsWrap.innerHTML = '';
    const pubRadio = document.querySelector('input[name="visibilidad"][value="publico"]');
    if (pubRadio) { pubRadio.checked = true; pubRadio.dispatchEvent(new Event('change')); }
    if (okEl) { okEl.textContent = `✓ Mensaje publicado en ${d.categoria.icono} ${d.categoria.nombre}`; setTimeout(()=>okEl.textContent='', 3000); }
    await loadCategorias(); // refrescar contadores
    await loadAllMessages(); // refrescar mensajes mezclados
  } catch { errEl.textContent = '⚠ No se pudo conectar con el servidor.'; }
  finally  { btn.disabled = false; btn.textContent = '📨 ENVIAR MENSAJE'; }
}


// ── Cargar todos los mensajes mezclados (portada) ─────────────────────────
async function loadAllMessages() {
  const tbody  = document.getElementById('all-messages-list');
  const countEl = document.getElementById('all-msg-count');
  const thAct  = document.getElementById('th-actions');
  if (!tbody) return;
  try {
    const res = await fetch(`${API}/messages`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.replace('login.html'); return; }
    if (!res.ok) throw new Error();
    const { mensajes, tu_conteo, es_jeje } = await res.json();
    const user = getUser();
    tuConteoGlobal = tu_conteo;

    if (countEl) countEl.textContent = `(${mensajes.length} mensajes)`;
    const hasOwn = user && mensajes.some(m => m.user_id === user.id);
    if (thAct) thAct.style.display = hasOwn ? 'table-cell' : 'none';

    if (!mensajes.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:#666;font-style:italic">No hay mensajes todavía.</td></tr>';
      return;
    }

    tbody.innerHTML = '';
    mensajes.forEach(msg => {
      const tr = document.createElement('tr');
      if (msg.bloqueado) tr.style.background = '#fff8f0';

      // Icono visibilidad
      const tdIcon = document.createElement('td');
      tdIcon.style.cssText = 'text-align:center;font-size:16px';
      tdIcon.textContent = { publico:'💬', jeje:'🔥', privado:'🔒' }[msg.visibilidad] || '💬';
      tr.appendChild(tdIcon);

      // Texto + autor
      const tdContent = document.createElement('td');
      if (msg.bloqueado) {
        const lockEl = document.createElement('span');
        lockEl.className = 'sf-nombre';
        lockEl.style.cssText = 'color:#cc6600;font-style:italic';
        lockEl.textContent = '[ Contenido +Jeje — necesitas 100 mensajes ]';
        const b = document.createElement('span');
        b.style.cssText = 'display:inline-block;background:#ff6600;color:white;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:2px;margin-left:5px;vertical-align:middle';
        b.textContent = '+JEJE'; lockEl.appendChild(b);
        const meta = document.createElement('div');
        meta.className = 'sf-desc';
        meta.innerHTML = `Por: <strong style="color:#990000">${msg.username}</strong> &nbsp;`;
        const falta = document.createElement('span');
        falta.style.cssText = 'color:#cc6600';
        falta.textContent = `(te faltan ${JEJE_THRESHOLD - tuConteoGlobal} mensajes)`;
        meta.appendChild(falta);
        tdContent.appendChild(lockEl); tdContent.appendChild(meta);
      } else {
        const titleEl = document.createElement('a');
        titleEl.className = 'sf-nombre';
        titleEl.href = `subforo.html?cat=${msg.categoria.slug}`;
        titleEl.textContent = msg.texto.length > 80 ? msg.texto.slice(0, 80) + '…' : msg.texto;
        if (msg.visibilidad === 'jeje') {
          const b = document.createElement('span');
          b.style.cssText = 'display:inline-block;background:#ff6600;color:white;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:2px;margin-left:5px;vertical-align:middle';
          b.textContent = '+JEJE'; titleEl.appendChild(b);
        }
        if (msg.visibilidad === 'privado') {
          const b = document.createElement('span');
          b.style.cssText = 'display:inline-block;background:#660066;color:white;font-size:9px;font-weight:bold;padding:1px 5px;border-radius:2px;margin-left:5px;vertical-align:middle';
          b.textContent = '🔒 PRIVADO'; titleEl.appendChild(b);
        }
        const meta = document.createElement('div');
        meta.className = 'sf-desc';
        meta.innerHTML = `Por: <strong style="color:#990000">${msg.username}</strong>`;
        tdContent.appendChild(titleEl); tdContent.appendChild(meta);
      }
      tr.appendChild(tdContent);

      // Sección — badge con icono y nombre
      const tdCat = document.createElement('td');
      tdCat.style.cssText = 'text-align:center;font-size:11px';
      const catLink = document.createElement('a');
      catLink.href = `subforo.html?cat=${msg.categoria.slug}`;
      catLink.style.cssText = 'display:inline-block;background:var(--azul3);border:1px solid #aabbdd;color:var(--azul);padding:2px 6px;border-radius:2px;font-size:10px;font-weight:bold;white-space:nowrap;text-decoration:none';
      catLink.textContent = `${msg.categoria.icono} ${msg.categoria.nombre}`;
      catLink.onmouseover = () => catLink.style.background = '#c0d4f0';
      catLink.onmouseout  = () => catLink.style.background = 'var(--azul3)';
      tdCat.appendChild(catLink);
      tr.appendChild(tdCat);

      // Fecha
      const tdDate = document.createElement('td');
      tdDate.className = 'num';
      tdDate.style.cssText = 'font-size:10px;color:#666;text-align:center';
      tdDate.textContent = formatDate(msg.created_at);
      tr.appendChild(tdDate);

      // Borrar (solo propio)
      const tdAct = document.createElement('td');
      tdAct.className = 'num';
      if (user && user.id === msg.user_id) {
        const btn = document.createElement('button');
        btn.className = 'btn-post';
        btn.style.cssText = 'background:linear-gradient(180deg,#cc0000 0%,#880000 100%);border:1px solid #660000;font-size:10px;padding:2px 8px';
        btn.textContent = '🗑 Borrar';
        btn.addEventListener('click', async () => {
          if (!confirm('¿Borrar este mensaje?')) return;
          const r = await fetch(`${API}/messages/${msg.id}`, { method:'DELETE', headers:{'Authorization':`Bearer ${getToken()}`} });
          if (r.ok) { tr.style.opacity='0'; tr.style.transition='opacity .2s'; setTimeout(()=>{ tr.remove(); loadAllMessages(); loadCategorias(); },200); }
          else { const d=await r.json(); alert(d.error||'Error'); }
        });
        tdAct.appendChild(btn);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });

    // Actualizar stats
    const rangoEl = document.getElementById('stat-rango');
    const conteoEl = document.getElementById('tu-conteo');
    if (conteoEl) conteoEl.textContent = `${tu_conteo} mensajes`;
    if (rangoEl)  rangoEl.textContent = es_jeje ? '+Jeje 🔥' : `Novato (${JEJE_THRESHOLD - tu_conteo} para +Jeje)`;
    updateAuthUI(es_jeje);

  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:#cc0000;text-align:center;padding:12px">Error al cargar mensajes</td></tr>';
  }
}

// ── Visibilidad selector ──────────────────────────────────────────────────
function initVisibilidadSelector() {
  const radios  = document.querySelectorAll('input[name="visibilidad"]');
  const invWrap = document.getElementById('invitados-wrap');
  const descs   = { publico: document.getElementById('desc-publico'), jeje: document.getElementById('desc-jeje'), privado: document.getElementById('desc-privado') };
  function update() {
    const val = document.querySelector('input[name="visibilidad"]:checked')?.value || 'publico';
    Object.entries(descs).forEach(([k,el]) => { if(el) el.classList.toggle('visible', k===val); });
    if (invWrap) invWrap.classList.toggle('visible', val==='privado');
  }
  radios.forEach(r => r.addEventListener('change', update));
  update();
}

// ── Invitados ─────────────────────────────────────────────────────────────
function initInvitados() {
  const input    = document.getElementById('invitado-input');
  const btnAdd   = document.getElementById('btn-add-inv');
  const acList   = document.getElementById('autocomplete-list');
  const tagsWrap = document.getElementById('invitados-tags');
  const errEl    = document.getElementById('invitados-error');
  if (!input) return;
  let acTimer;
  input.addEventListener('input', () => {
    clearTimeout(acTimer);
    const q = input.value.trim();
    if (q.length < 2) { acList.style.display='none'; return; }
    acTimer = setTimeout(async () => {
      try {
        const res = await fetch(`${API}/messages/usuarios?q=${encodeURIComponent(q)}`, { headers:{'Authorization':`Bearer ${getToken()}`} });
        const { usuarios } = await res.json();
        if (!usuarios.length) { acList.style.display='none'; return; }
        acList.innerHTML = ''; acList.style.display='block';
        usuarios.forEach(nick => {
          const item = document.createElement('div'); item.className='autocomplete-item'; item.textContent=nick;
          item.addEventListener('click', () => { addInvitado(nick); input.value=''; acList.style.display='none'; });
          acList.appendChild(item);
        });
      } catch { acList.style.display='none'; }
    }, 200);
  });
  function addInvitado(nick) {
    if (errEl) errEl.textContent='';
    if (invitados.includes(nick)) { if(errEl) errEl.textContent=`${nick} ya está añadido.`; return; }
    if (invitados.length>=20) { if(errEl) errEl.textContent='Máximo 20 usuarios.'; return; }
    invitados.push(nick); renderTags();
  }
  function renderTags() {
    tagsWrap.innerHTML='';
    invitados.forEach(nick => {
      const tag=document.createElement('div'); tag.className='inv-tag'; tag.textContent=nick;
      const del=document.createElement('span'); del.className='inv-tag-del'; del.textContent='×';
      del.addEventListener('click', () => { invitados=invitados.filter(n=>n!==nick); renderTags(); });
      tag.appendChild(del); tagsWrap.appendChild(tag);
    });
  }
  btnAdd?.addEventListener('click', () => { const n=input.value.trim(); if(n){addInvitado(n);input.value='';acList.style.display='none';} });
  input.addEventListener('keydown', e => { if(e.key==='Enter'){e.preventDefault();const n=input.value.trim();if(n){addInvitado(n);input.value='';acList.style.display='none';}} });
  document.addEventListener('click', e => { if(!acList.contains(e.target)&&e.target!==input) acList.style.display='none'; });
}

// ── Health ────────────────────────────────────────────────────────────────
async function checkHealth() {
  const el = document.getElementById('api-status-txt');
  try {
    const r = await fetch(`${API}/health`);
    if (el) el.textContent = r.ok ? 'Online ✓' : 'Error';
  } catch { if(el) el.textContent='Offline ✗'; }
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateAuthUI(false);
  checkHealth();
  loadUserStats();
  loadCategorias();
  loadAllMessages();
  initVisibilidadSelector();
  initInvitados();

  const ta = document.getElementById('msg-input');
  const cc = document.getElementById('char-count');
  if (ta && cc) {
    ta.addEventListener('input', () => { const l=ta.value.length; cc.textContent=`${l} / 500 caracteres`; cc.classList.toggle('warn', l>450); });
    ta.addEventListener('keydown', e => { if(e.key==='Enter'&&e.ctrlKey) postMessage(); });
  }
  document.getElementById('btn-post')?.addEventListener('click', postMessage);
  document.getElementById('btn-logout')?.addEventListener('click', () => { localStorage.clear(); window.location.replace('login.html'); });
});
