// ============================================================
// template.js — Sidebar dinamica + Header
// ============================================================
// Genera la sidebar in base al ruolo e inserisce l'header.
// ============================================================
/**
 * Voci del menu per ADMIN
 */
const MENU_ADMIN = [
  { label: "Dashboard",           href: "dashboard.html",              icon: "📊" },
  { label: "Anagrafica Docenti",  href: "docenti.html",                icon: "👥" },
  { label: "Anagrafica Studenti", href: "anagrafica-studenti.html",    icon: "🎓" },
  { label: "Orario Scolastico",   href: "calendario.html",             icon: "📅" },
  { label: "Ripetizioni",         href: "ripetizioni.html",            icon: "📚" },
  { label: "Riepilogo Mensile",   href: "riepilogo.html",              icon: "💰" },
  { label: "Impostazioni",        href: "impostazioni.html",           icon: "⚙️" },
];
/**
 * Voci del menu per DOCENTE
 */
const MENU_DOCENTE = [
  { label: "Il Mio Orario",       href: "mio-orario.html",       icon: "📅" },
  { label: "Le Mie Ripetizioni",  href: "mie-ripetizioni.html",  icon: "📚" },
];
/**
 * Inizializza la pagina: crea sidebar + header.
 * @param {string} titoloPagina - Il titolo da mostrare nell'header
 */
function initPage(titoloPagina) {
  const ruolo = getRole();
  const menu = ruolo === "admin" ? MENU_ADMIN : MENU_DOCENTE;
  const paginaCorrente = window.location.pathname.split("/").pop();
  // Nome utente da mostrare
  const nomeUtente = ruolo === "admin" ? "Silvia (Admin)" : (getDocenteNome() || "Docente");
  // ──── SIDEBAR ────
  const sidebar = document.createElement("aside");
  sidebar.className = "sidebar";
  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="sidebar-logo">
        <span class="sidebar-logo-icon">🎓</span>
        <span class="sidebar-logo-text">GestioneDocenti</span>
      </div>
    </div>
    <nav class="sidebar-nav">
      ${menu.map(voce => `
        <a href="${voce.href}" class="sidebar-link ${paginaCorrente === voce.href ? 'active' : ''}">
          <span class="sidebar-link-icon">${voce.icon}</span>
          <span class="sidebar-link-label">${voce.label}</span>
        </a>
      `).join("")}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="avatar">${nomeUtente.charAt(0).toUpperCase()}</div>
        <span class="sidebar-user-name">${nomeUtente}</span>
      </div>
      <button class="btn btn-ghost sidebar-logout" onclick="logout()">
        🚪 Disconnetti
      </button>
    </div>
  `;
  // ──── HAMBURGER per mobile ────
  const hamburger = document.createElement("button");
  hamburger.className = "hamburger";
  hamburger.innerHTML = "☰";
  hamburger.onclick = () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("visible");
  };
  // Overlay per chiudere sidebar su mobile
  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";
  overlay.onclick = () => {
    sidebar.classList.remove("open");
    overlay.classList.remove("visible");
  };
  // ──── HEADER ────
  const header = document.createElement("header");
  header.className = "page-header";
  header.innerHTML = `
    <h1 class="page-title">${titoloPagina}</h1>
  `;
  // ──── INSERISCI NEL DOM ────
  document.body.prepend(overlay);
  document.body.prepend(sidebar);
  document.body.prepend(hamburger);
  // Avvolgi il contenuto esistente in un wrapper
  const mainContent = document.querySelector(".main-content");
  if (mainContent) {
    mainContent.prepend(header);
  }
}
