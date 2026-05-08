/**
 * Script para resaltar automáticamente el menú activo
 * basado en la URL actual y los data-nav-match
 */

function activateCurrentMenu() {
  // Obtener la URL actual
  const currentPath = window.location.pathname.toLowerCase();
  
  // Obtener todos los enlaces del menú con data-nav-match
  const allNavLinks = document.querySelectorAll('a[data-nav-match]');
  
  // Limpiar cualquier resaltado anterior
  allNavLinks.forEach(link => {
    link.classList.remove('is-active');
  });
  
  // Obtener el nombre del archivo
  const page = currentPath.split('/').pop().replace('.html', '');
  
  // Obtener la sección principal de la URL
  const pathSegments = currentPath.split('/').filter(s => s && s !== 'pages');
  const mainSection = pathSegments[0] || '';
  
  // Verificar cada enlace y activar el que corresponda
  allNavLinks.forEach(link => {
    const matchPatterns = link.getAttribute('data-nav-match').split(',').map(p => p.trim());
    
    let isMatched = false;
    
    // Estrategia 1: Buscar coincidencia exacta o muy específica con el nombre del archivo
    isMatched = matchPatterns.some(pattern => page === pattern || page.startsWith(pattern + '-') || page.startsWith(pattern + '.'));
    
    // Estrategia 2: Si no hay coincidencia exacta con el archivo, comprobar sección principal
    // PERO solo si la sección NO es "servicios" (para evitar conflicto entre Servicios y Solicitar técnico)
    if (!isMatched && mainSection !== 'servicios') {
      isMatched = matchPatterns.some(pattern => mainSection === pattern || mainSection.startsWith(pattern));
    }
    
    if (isMatched) {
      link.classList.add('is-active');
    }
  });
}

// Ejecutar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', activateCurrentMenu);
} else {
  activateCurrentMenu();
}

// También ejecutar cuando cambie el historial (para navegación sin recargar)
window.addEventListener('popstate', activateCurrentMenu);

// Ejecutar cuando se inyecte contenido dinámicamente
const observer = new MutationObserver(() => {
  activateCurrentMenu();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true
});

