(function(){
  async function renderPaymentMethods() {
    const list = document.getElementById('glx-payment-methods-list');
    if(!list) return;
    try {
      const api = window.GarperLuxApi;
      if(!api) return;
      const rows = await api.paymentMethods();
      
      const addCardHtml = `
        <a href="/pages/cuenta/anadir-tarjeta.html" class="bg-paper-2 border-2 border-dashed border-line rounded-2xl p-6 grid place-items-center text-center min-h-[200px] hover:border-ink transition-colors cursor-pointer">
          <div>
            <div class="w-12 h-12 mx-auto rounded-full bg-white grid place-items-center mb-3"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 5v14M5 12h14"/></svg></div>
            <div class="font-medium">Añadir nueva tarjeta</div>
            <div class="text-xs text-graphite">Visa, Mastercard, Amex</div>
          </div>
        </a>
      `;

      if(!rows || rows.length===0){
        list.innerHTML = addCardHtml;
        const bizumContainer = document.getElementById('bizum-container');
        if (bizumContainer) {
          document.getElementById('bizum-status').textContent = 'Sin configurar';
          document.getElementById('bizum-action').style.display = '';
        }
        return;
      }

      const hasBizum = rows.some(r => r.type === 'Bizum' || r.type === 'bizum');
      const bizumContainer = document.getElementById('bizum-container');
      if (bizumContainer) {
        if (hasBizum) {
          document.getElementById('bizum-status').textContent = 'Guardado en tus métodos principales';
          document.getElementById('bizum-action').style.display = 'none';
          document.getElementById('bizum-form').classList.add('hidden');
        } else {
          document.getElementById('bizum-status').textContent = 'Sin configurar';
          document.getElementById('bizum-action').style.display = '';
        }
      }

      const cardsHtml = rows.map(m => paymentMethodCardHtml(m)).join('\n');
      list.innerHTML = cardsHtml + '\n' + addCardHtml;

      list.querySelectorAll('[data-action="make-default"]').forEach(btn => btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await api.setDefaultPaymentMethod(id);
          await renderPaymentMethods();
        } catch (error) {
          alert(error?.message || 'No se pudo marcar como predeterminada.');
        }
      }));
      list.querySelectorAll('[data-action="delete"]').forEach(btn => btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm('¿Eliminar este método de pago?')) return;
        try {
          await api.deletePaymentMethod(id);
          await renderPaymentMethods();
        } catch (error) {
          alert(error?.message || 'No se pudo eliminar.');
        }
      }));
    } catch(err) {
      console.error('Failed to load payment methods', err);
    }
  }

  function paymentMethodCardHtml(m) {
    const isDefault = m.is_default;
    const defaultTag = isDefault ? '<span class="font-mono text-[10px] uppercase tracking-wider text-paper/60">Predeterminada</span>' : '<span></span>';
    
    if (m.type === 'Bizum' || m.type === 'bizum') {
      const phone = escapeHtml(m.label || 'Móvil');
      const actions = `
        <div class="mt-4 pt-4 border-t border-paper/10 flex gap-3 text-xs justify-end relative z-10">
          ${!isDefault ? `<button class="text-paper/70 hover:text-white transition-colors" data-action="make-default" data-id="${m.id}">Hacer predeterminada</button>` : ''}
          <button class="text-warn hover:text-red-400 transition-colors" data-action="delete" data-id="${m.id}">Eliminar</button>
        </div>
      `;
      return `
      <div class="card-pay flex flex-col justify-between overflow-hidden" style="background: linear-gradient(135deg, #1C1F26, #09131C);">
        <div class="absolute top-0 right-0 w-40 h-40 bg-[#00A4DF] opacity-20 blur-2xl rounded-full"></div>
        <div class="flex-grow">
          <div class="flex items-start justify-between mb-8 relative z-10">
            ${defaultTag}
            <span class="font-sans font-bold text-[#00A4DF] bg-white px-2 py-0.5 rounded text-[11px] uppercase">Bizum</span>
          </div>
          <div class="font-mono text-xl tracking-widest mb-2 relative z-10">${phone}</div>
          <div class="text-[10px] font-mono text-paper/70 relative z-10 uppercase tracking-wider">Conectado a tu móvil</div>
        </div>
        ${actions}
      </div>
      `;
    }

    const brand = escapeHtml(m.brand || 'VISA');
    const last4 = escapeHtml(m.last4 || '••••');
    const holder = escapeHtml(m.holder || 'TITULAR');
    const exp = escapeHtml((m.exp_month && m.exp_year) ? `${m.exp_month}/${m.exp_year}` : 'MM/AA');
    
    let expiredWarning = '';
    if (m.exp_month && m.exp_year) {
      const expM = parseInt(m.exp_month, 10);
      const expY = parseInt(m.exp_year, 10);
      const now = new Date();
      const curY = now.getFullYear() % 100;
      const curM = now.getMonth() + 1;
      if (expY < curY || (expY === curY && expM < curM)) {
        expiredWarning = '<div class="absolute top-0 left-0 right-0 bg-warn/90 text-white text-[10px] uppercase tracking-wider py-1 font-bold z-20 flex items-center justify-center gap-1"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>Tarjeta caducada</div>';
      }
    }

    const actions = `
      <div class="mt-4 pt-4 border-t border-paper/10 flex gap-3 text-xs justify-end relative z-10">
        ${!isDefault ? `<button class="text-paper/70 hover:text-white transition-colors" data-action="make-default" data-id="${m.id}">Hacer predeterminada</button>` : ''}
        <button class="text-warn hover:text-red-400 transition-colors" data-action="delete" data-id="${m.id}">Eliminar</button>
      </div>
    `;

    return `
    <div class="card-pay flex flex-col justify-between overflow-hidden">
      ${expiredWarning}
      <div class="absolute top-0 right-0 w-40 h-40 filament-glow opacity-30"></div>
      <div class="flex-grow ${expiredWarning ? 'mt-4' : ''}">
        <div class="flex items-start justify-between mb-10 relative z-10">
          ${defaultTag}
          <span class="font-serif italic text-lg">${brand.toUpperCase()}</span>
        </div>
        <div class="font-mono text-xl tracking-widest mb-4 relative z-10">•••• •••• •••• ${last4}</div>
        <div class="flex justify-between text-xs font-mono text-paper/70 relative z-10">
          <div><div class="text-[9px] uppercase">Titular</div><div>${holder.toUpperCase()}</div></div>
          <div><div class="text-[9px] uppercase">Caduca</div><div>${exp}</div></div>
        </div>
      </div>
      ${actions}
    </div>
    `;
  }

  function escapeHtml(str){
    return String(str||'').replace(/[&<>"']/g, s=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;" })[s]);
  }

  document.addEventListener('DOMContentLoaded', () => {
    try{ if(window.glxRequireAuth && !glxRequireAuth()) return; }catch(e){}
    renderPaymentMethods();

    const bizumBtn = document.getElementById('btn-bizum');
    const bizumForm = document.getElementById('bizum-form');
    
    if (bizumBtn && bizumForm) {
      bizumBtn.addEventListener('click', () => {
        bizumForm.classList.toggle('hidden');
        if (!bizumForm.classList.contains('hidden')) {
          const u = window.glxGetUser ? window.glxGetUser() : {};
          const bizumUseAccountBtn = document.getElementById('bizum-use-account-phone');
          if (u.phone && bizumUseAccountBtn) {
            bizumUseAccountBtn.classList.remove('hidden');
            bizumUseAccountBtn.onclick = () => {
              document.getElementById('glx-bizum-phone-input').value = u.phone;
            };
          }
          document.getElementById('glx-bizum-phone-input').focus();
        }
      });

      bizumForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bizumPhoneInput = document.getElementById('glx-bizum-phone-input');
        if (!bizumPhoneInput) return;
        
        const phone = bizumPhoneInput.value.trim();
        if (!phone) {
          alert('Por favor, introduce un número de teléfono para Bizum.');
          return;
        }

        try {
          const api = window.GarperLuxApi;
          if (!api) throw new Error('API no disponible');
          
          await api.addPaymentMethod({
            type: 'Bizum',
            label: phone,
            isDefault: false
          });

          bizumPhoneInput.value = '';
          bizumForm.classList.add('hidden');
          
          await renderPaymentMethods();
        } catch (err) {
          alert(err?.message || 'Error al guardar Bizum.');
        }
      });
    }
  });

  window.glxRenderPaymentMethods = renderPaymentMethods;
})();
