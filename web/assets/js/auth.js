/* GarperLux — auth simulada + sidebar dinámico para área personal.
   Sin backend: todo va a localStorage. Pensado solo para prototipo académico.
*/

const GLX_KEY = 'garperlux_session';

const GLX_USERS = {
  particular: {
    role: 'particular',
    name: 'Antonio',
    fullName: 'Antonio García',
    email: 'antonio.garcia@correo.com',
    initial: 'A',
    avatarBg: 'bg-ink',
  },
  pro: {
    role: 'pro',
    name: 'Jose Luis',
    fullName: 'Jose Luis García',
    nickname: 'El Chispas',
    email: 'chispas@instaladoreseljaen.es',
    initial: 'JL',
    avatarBg: 'bg-filament',
    cif: 'B12345678',
    btCard: 'BT-123456-AND',
    btExpiry: '2031-04',
    discount: 22,
  },
};

function glxGetSession() {
  try { return JSON.parse(localStorage.getItem(GLX_KEY) || 'null'); }
  catch { return null; }
}
function glxSetSession(role) {
  const user = GLX_USERS[role];
  if (!user) return;
  localStorage.setItem(GLX_KEY, JSON.stringify({ ...user, at: Date.now() }));
}
function glxClearSession() { localStorage.removeItem(GLX_KEY); }
function glxIsAuthed() { return !!glxGetSession(); }
function glxGetUser() { return glxGetSession(); }
function glxGetRole() { return glxGetSession()?.role || null; }

function glxRequireAuth() {
  if (!glxIsAuthed()) {
    const target = location.pathname.split('/').pop() || 'index.html';
    location.href = 'login.html?redirect=' + encodeURIComponent(target);
    return false;
  }
  return true;
}

function glxLogout() {
  glxClearSession();
  location.href = 'index.html';
}

/* ============= NAVIGATION DEFINITIONS ============= */

const GLX_NAV_PARTICULAR = [
  { key: 'dashboard', href: 'area-personal.html', label: 'Dashboard', section: 'main',
    icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
  { key: 'mis-pedidos', href: 'mis-pedidos.html', label: 'Mis pedidos', section: 'main', count: '3',
    icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' },
  { key: 'mis-solicitudes', href: 'mis-solicitudes.html', label: 'Mis solicitudes', section: 'main', count: '1 activa', countClass: 'text-filament',
    icon: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z"/>' },
  { key: 'mis-favoritos', href: 'mis-favoritos.html', label: 'Mis favoritos', section: 'main', count: '12',
    icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' },
  { key: 'tutoriales-guardados', href: 'tutoriales-guardados.html', label: 'Tutoriales guardados', section: 'main',
    icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>' },
  { key: 'direcciones', href: 'direcciones.html', label: 'Direcciones', section: 'config',
    icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>' },
  { key: 'metodos-pago', href: 'metodos-pago.html', label: 'Métodos de pago', section: 'config',
    icon: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>' },
  { key: 'datos-personales', href: 'datos-personales.html', label: 'Datos personales', section: 'config',
    icon: '<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>' },
];

const GLX_NAV_PRO = [
  { key: 'dashboard', href: 'area-personal.html', label: 'Panel general', section: 'main',
    icon: '<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>' },
  { key: 'mis-tarifas', href: 'mis-tarifas.html', label: 'Mis tarifas pro', section: 'main', count: '−22%', countClass: 'pill pill-stock',
    icon: '<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
  { key: 'albaranes', href: 'albaranes.html', label: 'Albaranes', section: 'main', count: '42',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
  { key: 'facturas', href: 'facturas.html', label: 'Facturas', section: 'main', count: '38',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M16 13H8M16 17H8M10 9H8"/>' },
  { key: 'mis-pedidos', href: 'mis-pedidos.html', label: 'Mis pedidos', section: 'main', count: '42',
    icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>' },
  { key: 'mis-presupuestos', href: 'mis-presupuestos.html', label: 'Mis presupuestos', section: 'main', count: '2 abiertos', countClass: 'text-filament',
    icon: '<circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/>' },
  { key: 'repetir-compra', href: 'repetir-compra.html', label: 'Repetir compra', section: 'main',
    icon: '<path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"/><path d="M3 12h4l3-9 4 18 3-9h4"/>' },
  { key: 'mis-favoritos', href: 'mis-favoritos.html', label: 'Mis favoritos', section: 'main', count: '87',
    icon: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>' },
  { key: 'datos-fiscales', href: 'datos-fiscales.html', label: 'Datos fiscales', section: 'config',
    icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' },
  { key: 'direcciones', href: 'direcciones.html', label: 'Direcciones de obra', section: 'config',
    icon: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>' },
];

/* ============= USER CARD (top of sidebar) ============= */
function glxRenderUserCard(user) {
  if (user.role === 'pro') {
    return `<div class="bg-ink text-paper rounded-2xl p-5 mb-5">
      <div class="flex items-center gap-3 mb-3">
        <div class="w-12 h-12 rounded-full bg-filament text-ink grid place-items-center font-medium text-lg">${user.initial}</div>
        <div>
          <div class="font-medium">${user.fullName}</div>
          <div class="text-[11px] text-paper/60 font-mono">"${user.nickname}"</div>
        </div>
      </div>
      <div class="flex items-center gap-2 text-xs">
        <span class="pill pill-stock !bg-stock/15 text-stock !border-0"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg> BT vigente</span>
        <span class="text-paper/60 font-mono">−${user.discount}% PVP</span>
      </div>
      <div class="text-[11px] text-paper/60 mt-3 pt-3 border-t border-white/10 font-mono">Carnet: ${user.btCard} · CIF ${user.cif}</div>
    </div>`;
  }
  return `<div class="bg-white border border-line rounded-2xl p-5 mb-5">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-12 h-12 rounded-full bg-ink text-paper grid place-items-center font-medium text-lg">${user.initial}</div>
      <div>
        <div class="font-medium">${user.fullName}</div>
        <div class="text-xs text-graphite font-mono">Cliente desde 2026-04</div>
      </div>
    </div>
    <div class="text-xs text-graphite">${user.email}</div>
  </div>`;
}

/* ============= SIDEBAR RENDER ============= */
function glxRenderSidebar(activeKey) {
  const user = glxGetUser();
  if (!user) return '';
  const items = user.role === 'pro' ? GLX_NAV_PRO : GLX_NAV_PARTICULAR;

  const renderItem = (it) => {
    const isActive = it.key === activeKey;
    const cls = `nav-item${isActive ? ' is-active' : ''}`;
    const countHtml = it.count ? `<span class="ml-auto text-xs font-mono ${it.countClass || 'text-graphite'}">${it.count}</span>` : '';
    return `<a href="${it.href}" class="${cls}">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${it.icon}</svg>
      ${it.label}${countHtml}
    </a>`;
  };

  const main = items.filter(i => i.section === 'main').map(renderItem).join('');
  const config = items.filter(i => i.section === 'config').map(renderItem).join('');

  // Botón demo: cambiar de rol (solo prototipo)
  const otherRole = user.role === 'pro' ? 'particular' : 'pro';
  const otherLabel = user.role === 'pro' ? 'particular (Antonio)' : 'profesional (El Chispas)';

  return `${glxRenderUserCard(user)}
    <nav class="space-y-1">
      ${main}
      <div class="px-2 pt-4 pb-2 text-[11px] font-mono uppercase tracking-wider text-graphite">Configuración</div>
      ${config}
      <button onclick="glxLogout()" class="nav-item w-full text-warn hover:!bg-warn/5 hover:!text-warn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        Cerrar sesión
      </button>
    </nav>
    <div class="mt-7 pt-5 border-t border-line">
      <div class="text-[11px] font-mono uppercase tracking-wider text-graphite mb-2">Demo prototipo</div>
      <button onclick="glxSwitchRole('${otherRole}')" class="text-xs text-copper hover:underline">→ Cambiar a vista ${otherLabel}</button>
    </div>`;
}

function glxSwitchRole(newRole) {
  glxSetSession(newRole);
  // Si la subpantalla actual es exclusiva del otro rol, redirige al dashboard
  const currentFile = location.pathname.split('/').pop();
  const exclusivePro = ['mis-tarifas.html', 'albaranes.html', 'facturas.html', 'mis-presupuestos.html', 'repetir-compra.html', 'datos-fiscales.html'];
  const exclusiveParticular = ['mis-solicitudes.html', 'tutoriales-guardados.html', 'metodos-pago.html', 'datos-personales.html'];
  if (newRole === 'particular' && exclusivePro.includes(currentFile)) {
    location.href = 'area-personal.html';
    return;
  }
  if (newRole === 'pro' && exclusiveParticular.includes(currentFile)) {
    location.href = 'area-personal.html';
    return;
  }
  location.reload();
}

/* ============= HEADER USER BUTTON UPDATE ============= */
function glxUpdateHeaderUserButton() {
  const btn = document.querySelector('[data-user-btn]');
  if (!btn) return;
  const user = glxGetUser();
  if (user) {
    btn.innerHTML = `<span>${user.name}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>`;
    btn.href = 'area-personal.html';
  } else {
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    btn.href = 'login.html';
  }
}

document.addEventListener('DOMContentLoaded', glxUpdateHeaderUserButton);
