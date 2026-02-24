// ============================================================
// auth.js — Sistema di autenticazione (NO Firebase Auth)
// ============================================================
// Login basato su credenziali hardcoded (admin) o Firestore (docenti).
// Usa sessionStorage per mantenere la sessione.
// ============================================================

/**
 * Login utente.
 * - Se username "Silvia" + password corretta → admin
 * - Altrimenti cerca nella collezione "docenti" su Firestore
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function login(username, password) {
  // Trim per sicurezza
  const user = username.trim();
  const pass = password.trim();

  // Controllo campi vuoti
  if (!user || !pass) {
    return { success: false, error: "Inserisci username e password." };
  }

  // ──── CHECK ADMIN ────
  if (user === "Silvia" && pass === "iosonosilvia@2026") {
    sessionStorage.setItem("ruolo", "admin");
    sessionStorage.removeItem("docenteId"); // Admin non ha docenteId
    window.location.href = "dashboard.html";
    return { success: true };
  }

  // ──── CHECK DOCENTE (cerca in Firestore) ────
  try {
    const snapshot = await db.collection("docenti")
      .where("username", "==", user)
      .where("password", "==", pass)
      .get();

    if (!snapshot.empty) {
      // Trovato! Prendi il primo documento che matcha
      const doc = snapshot.docs[0];
      sessionStorage.setItem("ruolo", "docente");
      sessionStorage.setItem("docenteId", doc.id);
      sessionStorage.setItem("docenteNome", doc.data().nome + " " + doc.data().cognome);
      window.location.href = "mio-orario.html";
      return { success: true };
    } else {
      return { success: false, error: "Username o password non validi." };
    }
  } catch (err) {
    console.error("Errore durante il login:", err);
    return { success: false, error: "Errore di connessione. Riprova." };
  }
}

/**
 * Controlla se l'utente è autenticato.
 * Se non lo è, redirect alla pagina di login.
 */
function checkAuth() {
  const ruolo = sessionStorage.getItem("ruolo");
  if (!ruolo) {
    window.location.href = "index.html";
  }
}

/**
 * Controlla se l'utente è admin.
 * Se non lo è, redirect alla pagina appropriata.
 */
function checkAdmin() {
  const ruolo = sessionStorage.getItem("ruolo");
  if (ruolo !== "admin") {
    if (ruolo === "docente") {
      window.location.href = "mio-orario.html";
    } else {
      window.location.href = "index.html";
    }
  }
}

/**
 * Ritorna il ruolo corrente ("admin" o "docente").
 * @returns {string|null}
 */
function getRole() {
  return sessionStorage.getItem("ruolo");
}

/**
 * Ritorna l'ID del docente loggato.
 * @returns {string|null}
 */
function getDocenteId() {
  return sessionStorage.getItem("docenteId");
}

/**
 * Ritorna il nome completo del docente loggato.
 * @returns {string|null}
 */
function getDocenteNome() {
  return sessionStorage.getItem("docenteNome");
}

/**
 * Logout: pulisce sessionStorage e redirect al login.
 */
function logout() {
  sessionStorage.clear();
  window.location.href = "index.html";
}
