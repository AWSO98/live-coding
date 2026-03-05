// subforo.js — Vista de una sección concreta
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

// Leer el slug de la URL: subforo.html?cat=videojuegos
const params  = new URLSearchParams(window.location.search);
const catSlug = params.get('cat') || 'general';
let catId = null;

function formatDate(iso) {
  return new Date(iso).toLocaleString('es-ES',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
}

// ── Auth UI ────────────────────────────────────────────────────────────────
function updateAuthUI(esJeje) {
  const user = getUser();
  const navUser  = document.getElementById('nav-user');
  const compose  = document.getElementById('compose-wrap');
  const loginPr  = document.getElementById('login-prompt');
  const uDisplay = document.getElementById('username-display');
  const jejeBadge = document.getElementById('jeje-badge');
  const thAct    = document.getElementById('th-actions');
  if (user && getToken()) {
    if (navUser)    navUser.style.display='flex';
    if (compose)    compose.style.display='block';
    if (loginPr)    loginPr.classList.remove('visible');
    if (uDisplay)   uDisplay.textContent=user.username;
    if (jejeBadge&&esJeje) jejeBadge.style.display='inline-block';
    if (thAct)      thAct.style.display='table-cell';
  } else {
    if (navUser)  navUser.style.display='none';
    if (compose)  compose.style.display='none';
    if (loginPr)  loginPr.classList.add('visible');
  }
}

// ── Cargar mensajes de esta sección ───────────────────────────────────────
async function loadMessages() {
  const tbody    = document.getElementById('messages-list');
  const statMsgs = document.getElementById('stat-msgs');
  const conteoEl = document.getElementById('tu-conteo');
  const rangoEl  = document.getElementById('stat-rango');
  const thAct    = document.getElementById('th-actions');
  if (!tbody) return;
  try {
    const res = await fetch(`${API}/messages?categoria=${encodeURIComponent(catSlug)}`, {
      headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    if (res.status===401||res.status===403) { localStorage.clear(); window.location.replace('login.html'); return; }
    if (!res.ok) throw new Error('Error');

    const { mensajes, tu_conteo, es_jeje } = await res.json();
    const user = getUser();
    tuConteoGlobal = tu_conteo;

    if (statMsgs)  statMsgs.textContent = mensajes.length;
    if (conteoEl)  conteoEl.textContent = `${tu_conteo} mensajes`;
    if (rangoEl)   rangoEl.textContent  = es_jeje ? '+Jeje 🔥' : `Novato (${JEJE_THRESHOLD-tu_conteo} para +Jeje)`;
    updateAuthUI(es_jeje);

    const hasOwn = user && mensajes.some(m=>m.user_id===user.id);
    if (thAct) thAct.style.display = hasOwn ? 'table-cell' : 'none';

    if (!mensajes.length) {
      tbody.innerHTML='<tr class="empty-row"><td colspan="4">No hay mensajes en esta sección todavía. ¡Sé el primero!</td></tr>';
      return;
    }

    tbody.innerHTML='';
    mensajes.forEach(msg => {
      const tr = document.createElement('tr');
      if (msg.bloqueado) tr.style.background='#fff8f0';

      const tdIcon = document.createElement('td');
      tdIcon.style.cssText='text-align:center;font-size:18px';
      tdIcon.textContent = {publico:'💬',jeje:'🔥',privado:'🔒'}[msg.visibilidad]||'💬';
      tr.appendChild(tdIcon);

      const tdContent = document.createElement('td');
      if (msg.bloqueado) {
        const lockEl = document.createElement('span'); lockEl.className='msg-title'; lockEl.style.cssText='color:#cc6600;font-style:italic';
        lockEl.textContent='[ Contenido exclusivo +Jeje — necesitas 100 mensajes para verlo ]';
        const badge=document.createElement('span');badge.className='vis-badge vis-badge-jeje';badge.textContent='+JEJE';lockEl.appendChild(badge);
        const metaEl=document.createElement('div');metaEl.className='msg-author';metaEl.appendChild(document.createTextNode('Por: '));
        const authorEl=document.createElement('strong');authorEl.textContent=msg.username;metaEl.appendChild(authorEl);
        const faltanEl=document.createElement('span');faltanEl.style.cssText='color:#cc6600;font-size:10px;margin-left:10px';
        faltanEl.textContent=`(te faltan ${JEJE_THRESHOLD-tuConteoGlobal} mensajes)`;metaEl.appendChild(faltanEl);
        tdContent.appendChild(lockEl);tdContent.appendChild(metaEl);
      } else {
        const titleEl=document.createElement('span');titleEl.className='msg-title';titleEl.textContent=msg.texto;
        if(msg.visibilidad==='jeje'){const b=document.createElement('span');b.className='vis-badge vis-badge-jeje';b.textContent='+JEJE';titleEl.appendChild(b);}
        if(msg.visibilidad==='privado'){const b=document.createElement('span');b.className='vis-badge vis-badge-privado';b.textContent='🔒 PRIVADO';titleEl.appendChild(b);
          if(user&&msg.user_id!==user.id){const i=document.createElement('span');i.className='vis-badge vis-badge-invitado';i.textContent='invitado/a';titleEl.appendChild(i);}
        }
        const metaEl=document.createElement('div');metaEl.className='msg-author';metaEl.appendChild(document.createTextNode('Por: '));
        const authorEl=document.createElement('strong');authorEl.textContent=msg.username;metaEl.appendChild(authorEl);
        if(msg.invitados&&msg.invitados.length){const s=document.createElement('span');s.style.cssText='color:#660066;font-size:10px;margin-left:8px';s.textContent='→ Para: '+msg.invitados.join(', ');metaEl.appendChild(s);}
        tdContent.appendChild(titleEl);tdContent.appendChild(metaEl);
      }
      tr.appendChild(tdContent);

      const tdDate=document.createElement('td');tdDate.className='num';tdDate.style.cssText='font-size:10px;color:#666;text-align:center';
      tdDate.textContent=formatDate(msg.created_at);tr.appendChild(tdDate);

      const tdAct=document.createElement('td');tdAct.className='num';
      if(user&&user.id===msg.user_id){
        const btn=document.createElement('button');btn.className='btn-del';btn.textContent='🗑 Borrar';
        btn.addEventListener('click',()=>deleteMessage(msg.id,tr));tdAct.appendChild(btn);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
  } catch(err) {
    tbody.innerHTML=`<tr class="empty-row"><td colspan="4" style="color:#cc0000">Error: ${err.message}</td></tr>`;
  }
}

async function deleteMessage(id,rowEl) {
  if(!confirm('¿Borrar este mensaje?')) return;
  try {
    const res=await fetch(`${API}/messages/${id}`,{method:'DELETE',headers:{'Authorization':`Bearer ${getToken()}`}});
    if(!res.ok){const d=await res.json();alert('Error: '+(d.error||'No se pudo borrar.'));return;}
    rowEl.style.opacity='0';rowEl.style.transition='opacity .2s';
    setTimeout(()=>{rowEl.remove();loadMessages();},200);
  } catch{alert('Error de conexión.');}
}

async function postMessage() {
  const ta=document.getElementById('msg-input'),errEl=document.getElementById('post-error'),okEl=document.getElementById('post-ok');
  const visEl=document.querySelector('input[name="visibilidad"]:checked');
  const texto=ta.value.trim(),visibilidad=visEl?visEl.value:'publico';
  errEl.textContent='';if(okEl)okEl.textContent='';
  if(!texto){errEl.textContent='⚠ El mensaje no puede estar vacío.';return;}
  if(visibilidad==='privado'&&invitados.length===0){errEl.textContent='⚠ Añade al menos un usuario.';return;}
  const btn=document.getElementById('btn-post');
  btn.disabled=true;btn.textContent='Enviando...';
  try {
    const res=await fetch(`${API}/messages`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${getToken()}`},
      body:JSON.stringify({texto,visibilidad,invitados,categoria_id:catId})});
    const d=await res.json();
    if(!res.ok){if(res.status===401||res.status===403){localStorage.clear();window.location.replace('login.html');return;}errEl.textContent='⚠ '+(d.error||'Error.');return;}
    ta.value='';document.getElementById('char-count').textContent='0 / 500 caracteres';
    invitados=[];const tw=document.getElementById('invitados-tags');if(tw)tw.innerHTML='';
    const pr=document.querySelector('input[name="visibilidad"][value="publico"]');if(pr){pr.checked=true;pr.dispatchEvent(new Event('change'));}
    if(okEl){okEl.textContent='✓ Mensaje publicado.';setTimeout(()=>okEl.textContent='',2500);}
    await loadMessages();
  } catch{errEl.textContent='⚠ Error de conexión.';}
  finally{btn.disabled=false;btn.textContent='📨 ENVIAR MENSAJE';}
}

function initVisibilidadSelector() {
  const radios=document.querySelectorAll('input[name="visibilidad"]');
  const invWrap=document.getElementById('invitados-wrap');
  const descs={publico:document.getElementById('desc-publico'),jeje:document.getElementById('desc-jeje'),privado:document.getElementById('desc-privado')};
  function update(){
    const val=document.querySelector('input[name="visibilidad"]:checked')?.value||'publico';
    Object.entries(descs).forEach(([k,el])=>{if(el)el.classList.toggle('visible',k===val);});
    if(invWrap)invWrap.classList.toggle('visible',val==='privado');
  }
  radios.forEach(r=>r.addEventListener('change',update));update();
}

function initInvitados() {
  const input=document.getElementById('invitado-input'),btnAdd=document.getElementById('btn-add-inv'),
        acList=document.getElementById('autocomplete-list'),tagsWrap=document.getElementById('invitados-tags'),errEl=document.getElementById('invitados-error');
  if(!input)return;
  let t;
  input.addEventListener('input',()=>{
    clearTimeout(t);const q=input.value.trim();if(q.length<2){acList.style.display='none';return;}
    t=setTimeout(async()=>{
      try{const res=await fetch(`${API}/messages/usuarios?q=${encodeURIComponent(q)}`,{headers:{'Authorization':`Bearer ${getToken()}`}});
        const{usuarios}=await res.json();if(!usuarios.length){acList.style.display='none';return;}
        acList.innerHTML='';acList.style.display='block';
        usuarios.forEach(n=>{const d=document.createElement('div');d.className='autocomplete-item';d.textContent=n;
          d.addEventListener('click',()=>{add(n);input.value='';acList.style.display='none';});acList.appendChild(d);});
      }catch{acList.style.display='none';}
    },200);
  });
  function add(nick){if(errEl)errEl.textContent='';if(invitados.includes(nick)){if(errEl)errEl.textContent=nick+' ya está.';return;}
    if(invitados.length>=20){if(errEl)errEl.textContent='Máximo 20.';return;}invitados.push(nick);render();}
  function render(){tagsWrap.innerHTML='';invitados.forEach(n=>{const t=document.createElement('div');t.className='inv-tag';t.textContent=n;
    const x=document.createElement('span');x.className='inv-tag-del';x.textContent='×';x.addEventListener('click',()=>{invitados=invitados.filter(v=>v!==n);render();});
    t.appendChild(x);tagsWrap.appendChild(t);});}
  btnAdd?.addEventListener('click',()=>{const n=input.value.trim();if(n){add(n);input.value='';acList.style.display='none';}});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();const n=input.value.trim();if(n){add(n);input.value='';acList.style.display='none';}}});
  document.addEventListener('click',e=>{if(!acList.contains(e.target)&&e.target!==input)acList.style.display='none';});
}

// ── Init ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  updateAuthUI(false);

  // Obtener info de la categoría
  try {
    const res=await fetch(`${API}/messages/categorias`,{headers:{'Authorization':`Bearer ${getToken()}`}});
    const{categorias}=await res.json();
    const cat=categorias.find(c=>c.slug===catSlug);
    if(cat){
      catId=cat.id;
      document.title=`ForoJejes — ${cat.nombre}`;
      document.getElementById('bc-section').textContent=`${cat.icono} ${cat.nombre}`;
      document.getElementById('section-header').textContent=`${cat.icono}  ${cat.nombre.toUpperCase()} — ${cat.descripcion}`;
      document.getElementById('compose-section-name').textContent=`${cat.icono} ${cat.nombre}`;
    } else {
      document.getElementById('bc-section').textContent='Sección no encontrada';
    }
  } catch{}

  loadMessages();
  initVisibilidadSelector();
  initInvitados();

  const ta=document.getElementById('msg-input'),cc=document.getElementById('char-count');
  if(ta&&cc){
    ta.addEventListener('input',()=>{const l=ta.value.length;cc.textContent=`${l} / 500 caracteres`;cc.classList.toggle('warn',l>450);});
    ta.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.ctrlKey)postMessage();});
  }
  document.getElementById('btn-post')?.addEventListener('click',postMessage);
  document.getElementById('btn-logout')?.addEventListener('click',()=>{localStorage.clear();window.location.replace('login.html');});
});
