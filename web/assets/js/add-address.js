(function(){
  document.addEventListener('DOMContentLoaded',()=>{
    try{ if(window.glxRequireAuth && !glxRequireAuth()) return; }catch(e){}
    const form = document.getElementById('add-address-form');
    if(!form) return;
    const params = new URLSearchParams(location.search);
    const addressId = params.get('id');
    const submitButton = form.querySelector('button[type="submit"]');
    const titleEl = document.querySelector('h1');
    const subtitleEl = document.querySelector('[data-particular-only]');

    if (addressId && titleEl) titleEl.textContent = 'Editar dirección.';
    if (addressId && submitButton) submitButton.childNodes[0].textContent = 'Guardar cambios';
    if (addressId && subtitleEl) subtitleEl.textContent = 'Edita los datos de esta dirección y guarda los cambios.';

    const typeInputs = Array.from(form.querySelectorAll('input[name="tipo"]'));
    const syncTypePills = () => {
      typeInputs.forEach((input) => {
        const pill = input.closest('.tag-pill');
        if (pill) pill.classList.toggle('is-on', input.checked);
      });
    };
    typeInputs.forEach((input) => input.addEventListener('change', syncTypePills));
    syncTypePills();

    const fillForm = async () => {
      if (!addressId) return false;
      try {
        const address = await window.GarperLuxApi.address(addressId);
        document.getElementById('label').value = address.label || '';
        const recipientParts = String(address.recipient || '').split(' ');
        document.getElementById('first-name').value = recipientParts.shift() || '';
        document.getElementById('last-name').value = recipientParts.join(' ') || '';
        document.getElementById('line1').value = address.line1 || '';
        document.getElementById('cp-input').value = address.postal_code || address.postalCode || '';
        document.getElementById('loc-input').value = address.city || '';
        document.getElementById('prov-input').value = address.province || '';
        document.getElementById('phone').value = address.phone || '';
        document.getElementById('is-default').checked = !!address.is_default;
        const billingInput = form.querySelector('input[name="tipo"][value="factura"]');
        const deliveryInput = form.querySelector('input[name="tipo"][value="envio"]');
        if (address.is_billing && billingInput) billingInput.checked = true;
        else if (deliveryInput) deliveryInput.checked = true;
        syncTypePills();
        const cancelLink = form.querySelector('a[href="/pages/cuenta/direcciones.html"]');
        if (cancelLink) cancelLink.href = '/pages/cuenta/direcciones.html';
        return true;
      } catch (error) {
        console.error('Failed to load address for edit', error);
        return false;
      }
    };

    if (addressId) {
      fillForm();
      window.addEventListener('load', () => { fillForm(); }, { once: true });
      setTimeout(() => { fillForm(); }, 250);
    }

    form.addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const api = window.GarperLuxApi;
      if(!api) return alert('No API client disponible');
      const data = new FormData(form);
      const labelRaw = String(data.get('label') || '').trim();
      const firstName = String(data.get('firstName') || '').trim();
      const lastName = String(data.get('lastName') || '').trim();
      const user = window.glxGetUser ? window.glxGetUser() : null;
      const company = String(data.get('company') || '').trim() || null;
      const recipient = [firstName, lastName].filter(Boolean).join(' ') || company || user?.name || null;
      const phone = String(data.get('phone') || '').trim() || null;
      const addressType = String(data.get('tipo') || 'envio');
      const line1 = String(data.get('line1') || '').trim();
      const number = String(data.get('number') || '').trim();
      const block = String(data.get('block') || '').trim();
      const staircase = String(data.get('staircase') || '').trim();
      const floorDoor = String(data.get('floorDoor') || '').trim();
      const postalCode = String(data.get('postalCode') || '').trim() || null;
      const city = String(data.get('city') || '').trim() || null;
      const province = String(data.get('province') || '').trim() || null;
      const isDefault = data.get('isDefault') === 'on';

      let composedLine1 = line1 || '';
      if(number) composedLine1 += (composedLine1? ' ':'') + number;
      if(block) composedLine1 += (composedLine1? ' ':'') + block;
      if(staircase) composedLine1 += (composedLine1? ' ':'') + staircase;
      if(floorDoor) composedLine1 += (composedLine1? ' ':'') + floorDoor;
      const label = labelRaw || composedLine1 || 'Dirección';

      // Deja que el backend valide campos obligatorios para evitar falsos positivos en frontend.

      if (typeof window.glxEnsureApiSession === 'function') {
        await window.glxEnsureApiSession().catch(() => null);
      }

      const payload = {
        label,
        recipient,
        line1: composedLine1 || null,
        city,
        province,
        postalCode,
        phone,
        isDefault,
        isBilling: addressType === 'factura',
      };

      try{
        if (addressId) await api.updateAddress(addressId, payload);
        else await api.addAddress(payload);
        // redirect back to list
        location.href = '/pages/cuenta/direcciones.html';
      }catch(err){
        console.error('Failed saving address', err);
        if (err?.code === 'VALIDATION_ERROR' && err?.details?.missing?.length) {
          alert(`Faltan campos obligatorios: ${err.details.missing.join(', ')}`);
          return;
        }
        alert(err?.message || 'Error al guardar la dirección. Revisa la consola para más detalles.');
      }
    });
  });
})();
