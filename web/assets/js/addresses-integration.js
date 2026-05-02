(function(){
  async function renderAddresses() {
    const list = document.getElementById('glx-address-list');
    const listPro = document.getElementById('glx-address-list-pro');
    if(!list && !listPro) return;
    try{
      const api = window.GarperLuxApi;
      if(!api) return;
      const rows = await api.addresses();
      
      const u = window.glxGetUser ? window.glxGetUser() : { role: 'particular' };
      if (u.role !== 'pro') {
        const count = rows ? rows.length : 0;
        const subtitle = document.querySelector('[data-subtitle]');
        if (subtitle) {
          subtitle.textContent = count === 1 ? '1 dirección guardada' : `${count} direcciones guardadas`;
        }
      }

      if(!rows || rows.length===0){
        if(list) list.innerHTML = '<div class="bg-white border border-line rounded-2xl p-6">No hay direcciones guardadas.</div>';
        if(listPro) listPro.innerHTML = '<div class="bg-white border border-line rounded-2xl p-6">No hay direcciones de obra guardadas.</div>';
        return;
      }
      // separate by type heuristically: if label contains 'obra' or if there's a company maybe consider pro
      const particular = [];
      const pro = [];
      rows.forEach(r=>{
        // normalize keys
        const addr = Object.assign({}, r);
        addr.postalCode = addr.postal_code || addr.postalCode || '';
        addr.line1 = addr.line1 || addr.line_1 || '';
        addr.city = addr.city || '';
        addr.province = addr.province || '';
        addr.phone = addr.phone || '';
        // decide
        if((addr.label||'').toLowerCase().includes('obra') || (addr.recipient||'').toLowerCase().includes('s.l') || (addr.recipient||'').toLowerCase().includes('s.a')) pro.push(addr);
        else particular.push(addr);
      });

      if(list){
        list.innerHTML = particular.map(a=>addressCardHtml(a)).join('\n');
        list.querySelectorAll('[data-action="make-default"]').forEach(btn=>btn.addEventListener('click', async (e)=>{
          const id = e.currentTarget.dataset.id;
          try {
            await api.setDefaultAddress(id);
            await renderAddresses();
          } catch (error) {
            alert(error?.message || 'No se pudo marcar como predeterminada.');
          }
        }));
        list.querySelectorAll('[data-action="edit"]').forEach(btn=>btn.addEventListener('click',e=>{ const id=e.currentTarget.dataset.id; location.href=`/pages/cuenta/anadir-direccion.html?id=${id}`;}));
        list.querySelectorAll('[data-action="delete"]').forEach(btn=>btn.addEventListener('click', async (e)=>{
          const id = e.currentTarget.dataset.id;
          if (!confirm('¿Eliminar esta dirección?')) return;
          try {
            await api.deleteAddress(id);
            await renderAddresses();
          } catch (error) {
            alert(error?.message || 'No se pudo eliminar la dirección.');
          }
        }));
      }
      if(listPro){
        listPro.innerHTML = pro.map(a=>addressCardHtml(a,true)).join('\n');
        listPro.querySelectorAll('[data-action="make-default"]').forEach(btn=>btn.addEventListener('click', async (e)=>{
          const id = e.currentTarget.dataset.id;
          try {
            await api.setDefaultAddress(id);
            await renderAddresses();
          } catch (error) {
            alert(error?.message || 'No se pudo marcar como predeterminada.');
          }
        }));
        listPro.querySelectorAll('[data-action="edit"]').forEach(btn=>btn.addEventListener('click',e=>{ const id=e.currentTarget.dataset.id; location.href=`/pages/cuenta/anadir-direccion.html?id=${id}`;}));
        listPro.querySelectorAll('[data-action="delete"]').forEach(btn=>btn.addEventListener('click', async (e)=>{
          const id = e.currentTarget.dataset.id;
          if (!confirm('¿Eliminar esta dirección?')) return;
          try {
            await api.deleteAddress(id);
            await renderAddresses();
          } catch (error) {
            alert(error?.message || 'No se pudo eliminar la dirección.');
          }
        }));
      }
    }catch(err){
      console.error('Failed to load addresses', err);
    }
  }

  function addressCardHtml(a, pro=false){
    const typePill = a.is_billing ? '<span class="pill bg-stock text-white border-none text-[10px] before:hidden">Facturación</span>' : '<span class="pill bg-filament text-ink border-none text-[10px]">Envíos</span>';
    const defaultPill = a.is_default ? '<span class="pill pill-info text-[10px]">Predeterminada</span>' : '';
    const topPills = `<div class="absolute top-4 right-4 flex items-center gap-2">${typePill}${defaultPill}</div>`;
    const tag = a.label ? `<div class="font-mono text-[10px] text-graphite uppercase tracking-wider mb-2">${escapeHtml(a.label)}</div>` : '';
    const recipient = `<h3 class="font-serif text-xl font-medium leading-tight mb-3">${escapeHtml(a.recipient || '')}</h3>`;
    const addressLines = `${escapeHtml(a.line1 || '')}${a.postalCode ? '<br/>' + escapeHtml(a.postalCode) + ' · ' + escapeHtml(a.city || '') : ''}${a.province ? '<br/>' + escapeHtml(a.province) : ''}`;
    const phone = a.phone ? `<br/><span class="font-mono text-xs">Tlf: ${escapeHtml(a.phone)}</span>` : '';
    const actions = pro ? `<div class="flex gap-2 flex-wrap"><button class="btn btn-sm btn-ghost" data-action="edit" data-id="${a.id}">Editar</button><button class="btn btn-sm btn-ghost" data-action="make-default" data-id="${a.id}">Hacer predeterminada</button><button class="btn btn-sm btn-ghost text-warn" data-action="delete" data-id="${a.id}">Eliminar</button></div>` : `<div class="flex gap-3 mt-5 pt-5 border-t border-line text-xs"><button class="text-copper hover:underline" data-action="edit" data-id="${a.id}">Editar</button><button class="text-graphite hover:underline" data-action="make-default" data-id="${a.id}">Hacer predeterminada</button><button class="text-warn hover:underline" data-action="delete" data-id="${a.id}">Eliminar</button></div>`;
    const wrapperClass = pro ? 'bg-white border border-line rounded-2xl p-5 relative' : (a.is_default ? 'bg-white border-2 border-ink rounded-2xl p-6 relative pt-10' : 'bg-white border border-line rounded-2xl p-6 relative pt-10');
    return `<div class="${wrapperClass}">${topPills}${tag}${recipient}<address class="not-italic text-graphite text-sm leading-relaxed">${addressLines}${phone}</address>${actions}</div>`;
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[s]);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    try{ if(window.glxRequireAuth && !glxRequireAuth()) return; }catch(e){}
    renderAddresses();
  });

  window.glxRenderAddresses = renderAddresses;
})();
