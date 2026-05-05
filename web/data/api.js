/* GarperLux API client provisional. */

window.GarperLuxApi = (() => {
  const API_BASE = window.GARPERLUX_API_BASE || `${window.location.origin}/api`;
  const TOKEN_KEY = 'garperlux_api_token';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function request(path, options = {}) {
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (response.status === 204) return null;
    const payload = await response.json();
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error?.message || 'Error de comunicación con GarperLux.');
      error.code = payload.error?.code || 'REQUEST_ERROR';
      error.details = payload.error?.details || null;
      throw error;
    }
    return payload.data;
  }

  return {
    request,
    getToken,
    setToken,
    login: async (email, password) => {
      const data = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(data.token);
      return data.user;
    },
    logout: async () => {
      await request('/auth/logout', { method: 'POST' }).catch(() => null);
      setToken(null);
    },
    forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
    resetPassword: async (token, password) => {
      const data = await request('/auth/password/reset', { method: 'POST', body: JSON.stringify({ token, password }) });
      setToken(data.token);
      return data.user;
    },
    changePassword: (currentPassword, newPassword) => request('/auth/password/change', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
    me: () => request('/me'),
    products: (params = {}) => request(`/catalog/products?${new URLSearchParams(params)}`),
    product: (slug) => request(`/catalog/products/${encodeURIComponent(slug)}`),
    cart: () => request('/cart'),
    addToCart: (sku, quantity = 1) => request('/cart/items', { method: 'POST', body: JSON.stringify({ sku, quantity }) }),
    deleteCartItem: (sku) => request(`/cart/items/${encodeURIComponent(sku)}`, { method: 'DELETE' }),
    checkoutOptions: () => request('/checkout/options'),
    checkout: (payload) => request('/orders/checkout', { method: 'POST', body: JSON.stringify(payload) }),
    order: (code) => request(`/orders/${encodeURIComponent(code)}`),
    updateOrderStatus: (code, payload) => request(`/orders/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    serviceRequest: (payload) => request('/service-requests', { method: 'POST', body: JSON.stringify(payload) }),
    serviceRequestDetail: (code) => request(`/service-requests/${encodeURIComponent(code)}`),
    updateServiceRequestStatus: (code, payload) => request(`/service-requests/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    cancelServiceRequest: (code) => request(`/service-requests/${encodeURIComponent(code)}/cancel`, { method: 'POST' }),
    // (legacy) — usar createQuote(payload). Mantengo el nombre por compatibilidad con backend-integration.js.
    orders: () => request('/orders'),
    quotes: () => request('/quotes'),
    serviceRequests: () => request('/service-requests'),
    documents: (type) => request(`/documents${type ? `?type=${encodeURIComponent(type)}` : ''}`),
    document: (code) => request(`/documents/${encodeURIComponent(code)}`),
    documentsSummary: () => request('/documents/summary'),
    quote: (code) => request(`/quotes/${encodeURIComponent(code)}`),
    createQuote: (payload) => request('/quotes', { method: 'POST', body: JSON.stringify(payload) }),
    deleteRecurringOrder: (code) => request(`/recurring-orders/${encodeURIComponent(code)}`, { method: 'DELETE' }),
    reorderSuggestions: () => request('/account/reorder-suggestions'),
    addresses: () => request('/account/addresses'),
    address: (id) => request(`/account/addresses/${encodeURIComponent(id)}`),
    addAddress: (payload) => request('/account/addresses', { method: 'POST', body: JSON.stringify(payload) }),
    updateAddress: (id, payload) => request(`/account/addresses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    setDefaultAddress: (id) => request(`/account/addresses/${encodeURIComponent(id)}/default`, { method: 'PATCH' }),
    deleteAddress: (id) => request(`/account/addresses/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    paymentMethods: () => request('/account/payment-methods'),
    addPaymentMethod: (payload) => request('/account/payment-methods', { method: 'POST', body: JSON.stringify(payload) }),
    setDefaultPaymentMethod: (id) => request(`/account/payment-methods/${encodeURIComponent(id)}/default`, { method: 'PATCH' }),
    deletePaymentMethod: (id) => request(`/account/payment-methods/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    updateProfile: (payload) => request('/account/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
    fiscalProfile: () => request('/account/fiscal-profile'),
    saveFiscalProfile: (payload) => request('/account/fiscal-profile', { method: 'PUT', body: JSON.stringify(payload) }),
    favorites: () => request('/account/favorites'),
    savedTutorials: () => request('/account/saved-tutorials'),
    saveTutorial: (slug, payload = {}) => request(`/account/saved-tutorials/${encodeURIComponent(slug)}`, { method: 'POST', body: JSON.stringify(payload) }),
    reviews: (sku) => request(`/catalog/products/${encodeURIComponent(sku)}/reviews`),
    addReview: (payload) => request('/reviews', { method: 'POST', body: JSON.stringify(payload) }),
    returns: () => request('/returns'),
    createReturn: (payload) => request('/returns', { method: 'POST', body: JSON.stringify(payload) }),
    recurringOrders: () => request('/recurring-orders'),
    createRecurringOrder: (payload) => request('/recurring-orders', { method: 'POST', body: JSON.stringify(payload) }),
    contactMessage: (payload) => request('/contact-messages', { method: 'POST', body: JSON.stringify(payload) }),
    jobApplication: (payload) => request('/job-applications', { method: 'POST', body: JSON.stringify(payload) }),
    publicServiceRequest: (code, email = '') => request(`/public/service-requests/${encodeURIComponent(code)}?email=${encodeURIComponent(email)}`),
    adminSummary: () => request('/admin/summary'),
    adminOrders: () => request('/admin/orders'),
    adminUpdateOrderStatus: (code, payload) => request(`/admin/orders/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminServiceRequests: () => request('/admin/service-requests'),
    adminUpdateServiceRequestStatus: (code, payload) => request(`/admin/service-requests/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminReviews: () => request('/admin/reviews'),
    adminUpdateReviewStatus: (id, payload) => request(`/admin/reviews/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminReturns: () => request('/admin/returns'),
    adminUpdateReturnStatus: (code, payload) => request(`/admin/returns/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminContactMessages: () => request('/admin/contact-messages'),
    adminUpdateContactMessageStatus: (code, payload) => request(`/admin/contact-messages/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminJobApplications: () => request('/admin/job-applications'),
    adminUpdateJobApplicationStatus: (code, payload) => request(`/admin/job-applications/${encodeURIComponent(code)}/status`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminProducts: (params = {}) => request(`/admin/products?${new URLSearchParams(params)}`),
    adminCreateProduct: (payload) => request('/admin/products', { method: 'POST', body: JSON.stringify(payload) }),
    adminUpdateProduct: (sku, payload) => request(`/admin/products/${encodeURIComponent(sku)}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminUpdateProductStock: (sku, payload) => request(`/admin/products/${encodeURIComponent(sku)}/stock`, { method: 'PATCH', body: JSON.stringify(payload) }),
    adminAudit: () => request('/admin/audit'),
  };
})();
