// Dynamic profile form for the account page
(function () {
  const api = window.GarperLuxApi;
  if (!api) return;

  const toast = (message) => {
    if (window.glxToast) return window.glxToast(message);
    console.info(message);
  };

  const els = {
    form: document.getElementById('profile-form'),
    firstName: document.getElementById('profile-first-name'),
    lastName: document.getElementById('profile-last-name'),
    fiscalId: document.getElementById('profile-fiscal-id'),
    birthDate: document.getElementById('profile-birth-date'),
    email: document.getElementById('profile-email'),
    phone: document.getElementById('profile-phone'),
    marketingEmail: document.getElementById('profile-marketing-email'),
    orderNotifications: document.getElementById('profile-order-notifications'),
    tutorialReminders: document.getElementById('profile-tutorial-reminders'),
    smsUrgency: document.getElementById('profile-sms-urgency'),
    passwordHint: document.getElementById('profile-password-hint'),
    sidebar: document.getElementById('glx-sidebar'),
    fullNameBadge: document.getElementById('profile-full-name-badge'),
    emailBadge: document.getElementById('profile-email-badge'),
  };

  function splitName(fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
    };
  }

  function renderSidebar() {
    if (!els.sidebar || typeof glxRenderSidebar !== 'function') return;
    const active = els.sidebar.dataset.active || 'datos-personales';
    els.sidebar.innerHTML = glxRenderSidebar(active);
  }

  function initializeWhenReady() {
    const start = async () => {
      try {
        await loadProfile();
        els.form?.addEventListener('submit', saveProfile);
        document.getElementById('profile-cancel')?.addEventListener('click', () => loadProfile());
      } catch (error) {
        console.error('profile page error', error);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  async function loadProfile() {
    if (!api.getToken()) {
      if (typeof glxRequireAuth === 'function') glxRequireAuth();
      return;
    }

    const user = await api.me();
    if (user.role === 'pro') {
      location.href = '/pages/cuenta/datos-fiscales.html';
      return;
    }

    if (typeof window.glxSyncSessionToLegacyAuth === 'function') {
      try { await window.glxSyncSessionToLegacyAuth(user); } catch (error) { /* ignore */ }
    }

    document.body.dataset.activeView = user.role || 'particular';
    renderSidebar();

    const nameParts = splitName(user.fullName);
    if (els.firstName) els.firstName.value = nameParts.firstName;
    if (els.lastName) els.lastName.value = nameParts.lastName;
    if (els.fiscalId) els.fiscalId.value = user.fiscalId || '';
    if (els.birthDate) els.birthDate.value = user.birthDate || '';
    if (els.email) els.email.value = user.email || '';
    if (els.phone) els.phone.value = user.phone || '';
    if (els.marketingEmail) els.marketingEmail.checked = !!user.marketingEmail;
    if (els.orderNotifications) els.orderNotifications.checked = !!user.orderNotifications;
    if (els.tutorialReminders) els.tutorialReminders.checked = !!user.tutorialReminders;
    if (els.smsUrgency) els.smsUrgency.checked = !!user.smsUrgency;
    if (els.fullNameBadge) els.fullNameBadge.textContent = user.fullName || 'Sin nombre';
    if (els.emailBadge) els.emailBadge.textContent = user.email || '';
    if (els.passwordHint) els.passwordHint.textContent = 'Tu contraseña no se muestra por seguridad.';
  }

  async function saveProfile(event) {
    event.preventDefault();

    const formData = new FormData(els.form);
    const fullName = `${String(formData.get('firstName') || '').trim()} ${String(formData.get('lastName') || '').trim()}`.trim();
    const payload = {
      fullName,
      email: String(formData.get('email') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      fiscalId: String(formData.get('fiscalId') || '').trim(),
      birthDate: String(formData.get('birthDate') || '').trim() || null,
      birth_date: String(formData.get('birthDate') || '').trim() || null,
      marketingEmail: !!formData.get('marketingEmail'),
      orderNotifications: !!formData.get('orderNotifications'),
      tutorialReminders: !!formData.get('tutorialReminders'),
      smsUrgency: !!formData.get('smsUrgency'),
    };

    try {
      const updated = await api.request('/account/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (typeof window.glxSyncSessionToLegacyAuth === 'function') {
        try { await window.glxSyncSessionToLegacyAuth(updated); } catch (error) { /* ignore */ }
      }
      if (els.fullNameBadge) els.fullNameBadge.textContent = updated.fullName || fullName;
      if (els.emailBadge) els.emailBadge.textContent = updated.email || payload.email;
      renderSidebar();
      toast('Datos personales actualizados.');
    } catch (error) {
      toast(error.message);
    }
  }

  initializeWhenReady();
})();
