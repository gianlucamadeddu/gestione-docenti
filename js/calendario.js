// ============================================================
// calendario.js — Orario Scolastico (Admin + Docente)
// ============================================================
// Gestisce la visualizzazione e modifica dell'orario settimanale.
// - Admin (calendario.html): seleziona docente, aggiunge/rimuove lezioni
// - Docente (mio-orario.html): sola lettura del proprio orario
//
// Dipende da: utils.js (GIORNI, caricaImpostazioniOrari, calcolaFasceOrarie)
// ============================================================

// ── Stato globale ──
let isAdmin = false;
let isDocente = false;
let currentDocenteId = null;       // ID docente selezionato (admin) o loggato (docente)
let impostazioniOrari = {};        // Mappa giorno → impostazioni da Firestore
let fascePerGiorno = {};           // Mappa giorno → array di fasce calcolate
let maxFasce = 0;                  // Numero massimo di fasce tra tutti i giorni
let lezioniCorrente = [];          // Array di lezioni caricate da Firestore
let docentiLista = [];             // Lista docenti per il dropdown admin

// ── Riferimenti DOM ──
let orarioContainer;

// ============================================================
// INIZIALIZZAZIONE
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Controlla autenticazione
  checkAuth();

  // Rileva ruolo
  const ruolo = getRole();
  isAdmin = ruolo === "admin";
  isDocente = ruolo === "docente";

  // Pagina corrente
  const pagina = window.location.pathname.split("/").pop();

  // Sicurezza: se docente tenta di accedere a calendario.html → redirect
  if (pagina === "calendario.html" && !isAdmin) {
    window.location.href = "mio-orario.html";
    return;
  }

  // Se admin tenta di accedere a mio-orario.html → redirect
  if (pagina === "mio-orario.html" && isAdmin) {
    window.location.href = "calendario.html";
    return;
  }

  // Init pagina (sidebar + header)
  if (isAdmin) {
    initPage("Orario Scolastico");
  } else {
    initPage("Il Mio Orario");
    // Mostra nome docente
    const nomeDisplay = document.getElementById("docente-nome-display");
    if (nomeDisplay) {
      nomeDisplay.textContent = getDocenteNome() || "Docente";
    }
  }

  // Riferimenti DOM
  orarioContainer = document.getElementById("orario-container");

  // ──── 1. Carica impostazioni orari da Firestore ────
  try {
    impostazioniOrari = await caricaImpostazioniOrari();
  } catch (err) {
    console.error("Errore caricamento impostazioni:", err);
  }

  // ──── 2. Calcola fasce per ogni giorno ────
  maxFasce = 0;
  GIORNI.forEach(giorno => {
    const imp = impostazioniOrari[giorno];
    if (imp) {
      fascePerGiorno[giorno] = calcolaFasceOrarie(
        imp.mattina_oraInizio,
        imp.mattina_durataLezione,
        imp.mattina_numeroLezioni
      );
      if (fascePerGiorno[giorno].length > maxFasce) {
        maxFasce = fascePerGiorno[giorno].length;
      }
    } else {
      fascePerGiorno[giorno] = [];
    }
  });

  // Se non ci sono impostazioni, mostra messaggio
  if (maxFasce === 0) {
    mostraEmpty("Nessuna impostazione orari trovata. Configura gli orari dalla pagina Impostazioni.");
    return;
  }

  // ──── 3. Logica specifica per ruolo ────
  if (isAdmin) {
    await initAdmin();
  } else {
    await initDocente();
  }
});

// ============================================================
// ADMIN: Inizializzazione
// ============================================================

async function initAdmin() {
  const selectDocente = document.getElementById("select-docente");
  const btnAggiungi = document.getElementById("btn-aggiungi");

  // Carica lista docenti
  try {
    const snapshot = await db.collection("docenti").orderBy("cognome").get();
    docentiLista = [];
    snapshot.forEach(doc => {
      docentiLista.push({ id: doc.id, ...doc.data() });
    });

    // Popola dropdown
    docentiLista.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = `${d.cognome} ${d.nome}`;
      selectDocente.appendChild(opt);
    });
  } catch (err) {
    console.error("Errore caricamento docenti:", err);
  }

  // Al cambio docente → carica orario
  selectDocente.addEventListener("change", async () => {
    currentDocenteId = selectDocente.value;
    btnAggiungi.disabled = !currentDocenteId;

    if (currentDocenteId) {
      await caricaEmostraOrario();
    } else {
      mostraEmpty("Seleziona un docente per visualizzare l'orario.");
    }
  });

  // Bottone aggiungi → apri modal
  btnAggiungi.addEventListener("click", () => {
    if (!currentDocenteId) return;
    apriModalAggiungi();
  });

  // Setup modal
  setupModal();

  // Mostra stato iniziale
  mostraEmpty("Seleziona un docente per visualizzare l'orario.");
}

// ============================================================
// DOCENTE: Inizializzazione
// ============================================================

async function initDocente() {
  currentDocenteId = getDocenteId();

  if (!currentDocenteId) {
    mostraEmpty("Errore: ID docente non trovato.");
    return;
  }

  await caricaEmostraOrario();
}

// ============================================================
// CARICA LEZIONI DA FIRESTORE + MOSTRA TABELLA
// ============================================================

async function caricaEmostraOrario() {
  // Mostra loading
  orarioContainer.innerHTML = `
    <div class="orario-loading">
      <div class="loading-spinner"></div>
      <p>Caricamento orario…</p>
    </div>
  `;

  try {
    // Query Firestore: lezioni del docente selezionato
    const snapshot = await db.collection("orarioScolastico")
      .where("docenteId", "==", currentDocenteId)
      .get();

    lezioniCorrente = [];
    snapshot.forEach(doc => {
      lezioniCorrente.push({ id: doc.id, ...doc.data() });
    });

    // Costruisci la tabella
    renderTabella();

  } catch (err) {
    console.error("Errore caricamento lezioni:", err);
    orarioContainer.innerHTML = `
      <div class="orario-empty">
        <div class="empty-icon">⚠️</div>
        <p>Errore nel caricamento dell'orario. Riprova.</p>
      </div>
    `;
  }
}

// ============================================================
// RENDER TABELLA ORARIO
// ============================================================

function renderTabella() {
  // Trova il giorno con più fasce per le etichette
  let giornoMaxFasce = GIORNI[0];
  GIORNI.forEach(g => {
    if ((fascePerGiorno[g]?.length || 0) > (fascePerGiorno[giornoMaxFasce]?.length || 0)) {
      giornoMaxFasce = g;
    }
  });

  const fasceEtichette = fascePerGiorno[giornoMaxFasce] || [];

  // Costruisci mappa veloce: "giorno-slot" → lezione
  const mappaLezioni = {};
  lezioniCorrente.forEach(lez => {
    const key = `${lez.giorno}-${lez.slot}`;
    mappaLezioni[key] = lez;
  });

  // HTML tabella
  let html = `<table class="orario-table">`;

  // THEAD
  html += `<thead><tr>`;
  html += `<th class="col-fascia">Ora</th>`;
  GIORNI.forEach(g => {
    html += `<th>${g.substring(0, 3)}</th>`;
  });
  html += `</tr></thead>`;

  // TBODY
  html += `<tbody>`;

  for (let slot = 0; slot < maxFasce; slot++) {
    html += `<tr>`;

    // Colonna fascia oraria (etichette dal giorno con più fasce)
    const fascia = fasceEtichette[slot];
    if (fascia) {
      html += `<td class="td-fascia">
        <span class="fascia-inizio">${fascia.start}</span>
        <span class="fascia-fine">${fascia.end}</span>
      </td>`;
    } else {
      html += `<td class="td-fascia">—</td>`;
    }

    // Colonne giorni
    GIORNI.forEach(giorno => {
      const fasceGiorno = fascePerGiorno[giorno] || [];
      const numFasceGiorno = fasceGiorno.length;

      // Se lo slot è fuori range per questo giorno → cella disabled
      if (slot >= numFasceGiorno) {
        html += `<td class="cella-disabled"></td>`;
        return;
      }

      // Cerca lezione in questo slot
      const key = `${giorno}-${slot}`;
      const lezione = mappaLezioni[key];

      if (lezione) {
        // Cella occupata
        html += `<td class="cella-occupata">
          <div class="cella-content">
            <span class="cella-materia">${escapeHtml(lezione.materia)}</span>
            <span class="cella-classe">${escapeHtml(lezione.classe)}</span>
          </div>`;

        // Solo admin: bottone rimuovi
        if (isAdmin) {
          html += `<button class="cella-remove" onclick="rimuoviLezione('${lezione.id}')" title="Rimuovi">✕</button>`;
        }

        html += `</td>`;
      } else {
        // Cella vuota disponibile
        html += `<td class="cella-vuota">—</td>`;
      }
    });

    html += `</tr>`;
  }

  html += `</tbody></table>`;

  orarioContainer.innerHTML = html;
}

// ============================================================
// ADMIN: Modal Aggiungi Lezione
// ============================================================

function setupModal() {
  const overlay = document.getElementById("modal-overlay");
  const btnClose = document.getElementById("modal-close");
  const btnCancel = document.getElementById("modal-cancel");
  const btnSave = document.getElementById("modal-save");
  const selectGiorno = document.getElementById("modal-giorno");
  const selectFascia = document.getElementById("modal-fascia");

  // Chiudi modal
  btnClose.addEventListener("click", chiudiModal);
  btnCancel.addEventListener("click", chiudiModal);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) chiudiModal();
  });

  // Popola select giorni
  GIORNI.forEach(g => {
    const opt = document.createElement("option");
    opt.value = g;
    opt.textContent = g;
    selectGiorno.appendChild(opt);
  });

  // Al cambio giorno → aggiorna fasce disponibili
  selectGiorno.addEventListener("change", () => {
    const giorno = selectGiorno.value;
    selectFascia.innerHTML = "";

    if (!giorno) {
      selectFascia.disabled = true;
      selectFascia.innerHTML = `<option value="">— Prima seleziona il giorno —</option>`;
      return;
    }

    const fasce = fascePerGiorno[giorno] || [];

    if (fasce.length === 0) {
      selectFascia.disabled = true;
      selectFascia.innerHTML = `<option value="">Nessuna fascia configurata</option>`;
      return;
    }

    selectFascia.disabled = false;
    selectFascia.innerHTML = `<option value="">— Seleziona fascia —</option>`;

    fasce.forEach(f => {
      // Controlla se lo slot è già occupato
      const occupato = lezioniCorrente.some(l => l.giorno === giorno && l.slot === f.slot);
      const opt = document.createElement("option");
      opt.value = f.slot;
      opt.textContent = `${f.start} – ${f.end}` + (occupato ? " (occupata)" : "");
      opt.disabled = occupato;
      selectFascia.appendChild(opt);
    });
  });

  // Salva lezione
  btnSave.addEventListener("click", salvaLezione);
}

function apriModalAggiungi() {
  // Reset form
  document.getElementById("modal-giorno").value = "";
  document.getElementById("modal-fascia").innerHTML = `<option value="">— Prima seleziona il giorno —</option>`;
  document.getElementById("modal-fascia").disabled = true;
  document.getElementById("modal-materia").value = "";
  document.getElementById("modal-classe").value = "";
  nascondiErroreModal();

  // Mostra modal
  document.getElementById("modal-overlay").classList.add("active");
}

function chiudiModal() {
  document.getElementById("modal-overlay").classList.remove("active");
}

function mostraErroreModal(msg) {
  const el = document.getElementById("modal-error");
  el.textContent = msg;
  el.classList.add("visible");
}

function nascondiErroreModal() {
  const el = document.getElementById("modal-error");
  el.textContent = "";
  el.classList.remove("visible");
}

// ============================================================
// ADMIN: Salva nuova lezione su Firestore
// ============================================================

async function salvaLezione() {
  nascondiErroreModal();

  const giorno = document.getElementById("modal-giorno").value;
  const slotStr = document.getElementById("modal-fascia").value;
  const materia = document.getElementById("modal-materia").value.trim();
  const classe = document.getElementById("modal-classe").value.trim();

  // Validazione
  if (!giorno) {
    mostraErroreModal("Seleziona un giorno.");
    return;
  }
  if (slotStr === "") {
    mostraErroreModal("Seleziona una fascia oraria.");
    return;
  }
  if (!materia) {
    mostraErroreModal("Inserisci la materia.");
    return;
  }
  if (!classe) {
    mostraErroreModal("Inserisci la classe.");
    return;
  }

  const slot = parseInt(slotStr);

  // Verifica che lo slot non sia già occupato (doppio check)
  const occupato = lezioniCorrente.some(l => l.giorno === giorno && l.slot === slot);
  if (occupato) {
    mostraErroreModal("Questo slot è già occupato per il giorno selezionato.");
    return;
  }

  // Disabilita bottone salva
  const btnSave = document.getElementById("modal-save");
  btnSave.disabled = true;
  btnSave.textContent = "Salvataggio…";

  try {
    // Salva su Firestore
    await db.collection("orarioScolastico").add({
      docenteId: currentDocenteId,
      giorno: giorno,
      slot: slot,
      materia: materia,
      classe: classe,
    });

    // Chiudi modal e ricarica orario
    chiudiModal();
    await caricaEmostraOrario();

  } catch (err) {
    console.error("Errore salvataggio lezione:", err);
    mostraErroreModal("Errore durante il salvataggio. Riprova.");
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = "Salva Lezione";
  }
}

// ============================================================
// ADMIN: Rimuovi lezione da Firestore
// ============================================================

async function rimuoviLezione(lezioneId) {
  if (!confirm("Vuoi rimuovere questa lezione dall'orario?")) return;

  try {
    await db.collection("orarioScolastico").doc(lezioneId).delete();
    await caricaEmostraOrario();
  } catch (err) {
    console.error("Errore rimozione lezione:", err);
    alert("Errore durante la rimozione. Riprova.");
  }
}

// ============================================================
// UTILITY
// ============================================================

function mostraEmpty(messaggio) {
  orarioContainer.innerHTML = `
    <div class="orario-empty">
      <div class="empty-icon">📅</div>
      <p>${messaggio}</p>
    </div>
  `;
}

/**
 * Escape HTML per prevenire XSS
 */
function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
