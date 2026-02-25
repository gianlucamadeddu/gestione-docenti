// ============================================================
// calendario.js — Orario Scolastico v2.0
// ============================================================
// Gestisce la visualizzazione e modifica dell'orario settimanale.
//
// NOVITÀ v2.0:
// - Vista multi-modalità: Docente / Aula / Classe
// - Modifica lezione (click su cella → modal precompilata)
// - Dropdown Aula e Classe dalla rispettive collezioni Firestore
// - Validazione conflitto aula (stessa aula, stesso giorno+slot)
// - Info contestuali nelle celle in base alla vista attiva
//
// - Admin (calendario.html): seleziona docente/aula/classe, aggiunge/modifica/rimuove
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
let auleLista = [];                // Lista aule da Firestore
let classiLista = [];              // Lista classi da Firestore

// ── Vista corrente (solo admin) ──
let vistaCorrente = "docente";     // "docente" | "aula" | "classe"
let entitaSelezionata = "";        // ID docente / nome aula / nome classe

// ── Modalità modal ──
let modalMode = "add";             // "add" | "edit"
let editingLezioneId = null;       // ID del documento in modifica

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
  const selectEntita = document.getElementById("select-entita");
  const btnAggiungi = document.getElementById("btn-aggiungi");

  // Carica tutte le liste in parallelo
  try {
    const [docSnap, auleSnap, classiSnap] = await Promise.all([
      db.collection("docenti").orderBy("cognome").get(),
      db.collection("aule").orderBy("nome").get(),
      db.collection("classi").orderBy("nome").get(),
    ]);

    docentiLista = [];
    docSnap.forEach(doc => {
      docentiLista.push({ id: doc.id, ...doc.data() });
    });

    auleLista = [];
    auleSnap.forEach(doc => {
      auleLista.push({ id: doc.id, ...doc.data() });
    });

    classiLista = [];
    classiSnap.forEach(doc => {
      classiLista.push({ id: doc.id, ...doc.data() });
    });

  } catch (err) {
    console.error("Errore caricamento liste:", err);
  }

  // Popola dropdown iniziale (vista docente)
  popolaDropdownEntita();

  // Al cambio entità → carica orario
  selectEntita.addEventListener("change", async () => {
    entitaSelezionata = selectEntita.value;

    // Bottone aggiungi: solo in vista docente e con docente selezionato
    btnAggiungi.disabled = !(vistaCorrente === "docente" && entitaSelezionata);

    if (entitaSelezionata) {
      // In vista docente, salva il currentDocenteId
      if (vistaCorrente === "docente") {
        currentDocenteId = entitaSelezionata;
      }
      await caricaEmostraOrario();
    } else {
      mostraEmptyPerVista();
    }
  });

  // Bottone aggiungi → apri modal in modalità add
  btnAggiungi.addEventListener("click", () => {
    if (vistaCorrente !== "docente" || !entitaSelezionata) return;
    currentDocenteId = entitaSelezionata;
    apriModal("add");
  });

  // Setup modal
  setupModal();

  // Mostra stato iniziale
  mostraEmptyPerVista();
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
// CAMBIO VISTA (Docente / Aula / Classe)
// ============================================================

function cambiaVista(nuovaVista) {
  if (nuovaVista === vistaCorrente) return;

  vistaCorrente = nuovaVista;
  entitaSelezionata = "";

  // Aggiorna bottoni vista
  document.querySelectorAll(".vista-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.vista === nuovaVista);
  });

  // Aggiorna dropdown
  popolaDropdownEntita();

  // Nascondi/mostra bottone aggiungi
  const btnAggiungi = document.getElementById("btn-aggiungi");
  btnAggiungi.disabled = true;
  btnAggiungi.style.display = (nuovaVista === "docente") ? "" : "none";

  // Reset tabella
  mostraEmptyPerVista();
}

// ============================================================
// POPOLA DROPDOWN IN BASE ALLA VISTA
// ============================================================

function popolaDropdownEntita() {
  const select = document.getElementById("select-entita");
  select.innerHTML = "";

  if (vistaCorrente === "docente") {
    select.innerHTML = `<option value="">— Seleziona un docente —</option>`;
    docentiLista.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = `${d.cognome} ${d.nome}`;
      select.appendChild(opt);
    });

  } else if (vistaCorrente === "aula") {
    select.innerHTML = `<option value="">— Seleziona un'aula —</option>`;
    auleLista.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.nome;
      opt.textContent = a.nome;
      select.appendChild(opt);
    });

  } else if (vistaCorrente === "classe") {
    select.innerHTML = `<option value="">— Seleziona una classe —</option>`;
    classiLista.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.nome;
      opt.textContent = c.nome;
      select.appendChild(opt);
    });
  }
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
    let snapshot;

    // Query diversa in base alla vista
    if (isDocente) {
      // Docente: sempre per docenteId
      snapshot = await db.collection("orarioScolastico")
        .where("docenteId", "==", currentDocenteId)
        .get();

    } else if (vistaCorrente === "docente") {
      snapshot = await db.collection("orarioScolastico")
        .where("docenteId", "==", entitaSelezionata)
        .get();

    } else if (vistaCorrente === "aula") {
      snapshot = await db.collection("orarioScolastico")
        .where("aula", "==", entitaSelezionata)
        .get();

    } else if (vistaCorrente === "classe") {
      snapshot = await db.collection("orarioScolastico")
        .where("classe", "==", entitaSelezionata)
        .get();
    }

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
// RENDER TABELLA ORARIO (con info contestuali)
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
    // In vista aula/classe potrebbero esserci più lezioni nello stesso slot
    // (es: stessa classe con docenti diversi non dovrebbe succedere, ma gestiamo)
    if (!mappaLezioni[key]) {
      mappaLezioni[key] = lez;
    }
  });

  // Mappa docentiId → nome (per viste aula/classe)
  const mappaDocenti = {};
  docentiLista.forEach(d => {
    mappaDocenti[d.id] = `${d.cognome} ${d.nome}`;
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

    // Colonna fascia oraria
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

      // Slot fuori range → cella disabled
      if (slot >= numFasceGiorno) {
        html += `<td class="cella-disabled"></td>`;
        return;
      }

      const key = `${giorno}-${slot}`;
      const lezione = mappaLezioni[key];

      if (lezione) {
        // ── Cella occupata con info contestuali ──
        const editableClass = isAdmin && vistaCorrente === "docente" ? "cella-editable" : "";
        const onClickEdit = isAdmin && vistaCorrente === "docente"
          ? `onclick="apriModalModifica('${lezione.id}')"` : "";

        html += `<td class="cella-occupata ${editableClass}" ${onClickEdit}>
          <div class="cella-content">
            <span class="cella-materia">${escapeHtml(lezione.materia)}</span>`;

        // Info contestuali in base alla vista
        if (vistaCorrente === "docente" || isDocente) {
          // Vista docente: mostra classe + aula
          html += `<span class="cella-classe">${escapeHtml(lezione.classe)}</span>`;
          if (lezione.aula) {
            html += `<span class="cella-aula">${escapeHtml(lezione.aula)}</span>`;
          }
        } else if (vistaCorrente === "aula") {
          // Vista aula: mostra docente + classe
          const nomeDoc = mappaDocenti[lezione.docenteId] || "—";
          html += `<span class="cella-docente">${escapeHtml(nomeDoc)}</span>`;
          html += `<span class="cella-classe">${escapeHtml(lezione.classe)}</span>`;
        } else if (vistaCorrente === "classe") {
          // Vista classe: mostra docente + aula
          const nomeDoc = mappaDocenti[lezione.docenteId] || "—";
          html += `<span class="cella-docente">${escapeHtml(nomeDoc)}</span>`;
          if (lezione.aula) {
            html += `<span class="cella-aula">${escapeHtml(lezione.aula)}</span>`;
          }
        }

        html += `</div>`;

        // Bottone rimuovi (solo admin in vista docente)
        if (isAdmin && vistaCorrente === "docente") {
          html += `<button class="cella-remove" onclick="event.stopPropagation(); rimuoviLezione('${lezione.id}')" title="Rimuovi">✕</button>`;
        }

        html += `</td>`;
      } else {
        html += `<td class="cella-vuota">—</td>`;
      }
    });

    html += `</tr>`;
  }

  html += `</tbody></table>`;

  orarioContainer.innerHTML = html;
}

// ============================================================
// ADMIN: Modal Setup (Aggiungi / Modifica)
// ============================================================

function setupModal() {
  const overlay = document.getElementById("modal-overlay");
  const btnClose = document.getElementById("modal-close");
  const btnCancel = document.getElementById("modal-cancel");
  const btnSave = document.getElementById("modal-save");
  const selectGiorno = document.getElementById("modal-giorno");
  const selectFascia = document.getElementById("modal-fascia");
  const selectClasse = document.getElementById("modal-classe");
  const selectAula = document.getElementById("modal-aula");

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

  // Popola select classi
  classiLista.forEach(c => {
    const opt = document.createElement("option");
    opt.value = c.nome;
    opt.textContent = c.nome;
    selectClasse.appendChild(opt);
  });

  // Popola select aule
  auleLista.forEach(a => {
    const opt = document.createElement("option");
    opt.value = a.nome;
    opt.textContent = a.nome;
    selectAula.appendChild(opt);
  });

  // Al cambio giorno → aggiorna fasce disponibili
  selectGiorno.addEventListener("change", () => {
    aggiornaFasceDisponibili();
  });

  // Salva lezione
  btnSave.addEventListener("click", salvaLezione);
}

/**
 * Aggiorna le fasce orarie disponibili nel dropdown della modal
 */
function aggiornaFasceDisponibili() {
  const selectGiorno = document.getElementById("modal-giorno");
  const selectFascia = document.getElementById("modal-fascia");
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
    // Controlla se lo slot è già occupato (escludi la lezione in modifica)
    const occupato = lezioniCorrente.some(l =>
      l.giorno === giorno && l.slot === f.slot && l.id !== editingLezioneId
    );
    const opt = document.createElement("option");
    opt.value = f.slot;
    opt.textContent = `${f.start} – ${f.end}` + (occupato ? " (occupata)" : "");
    opt.disabled = occupato;
    selectFascia.appendChild(opt);
  });
}

// ============================================================
// ADMIN: Apri Modal (add o edit)
// ============================================================

function apriModal(mode, lezione = null) {
  modalMode = mode;
  editingLezioneId = lezione ? lezione.id : null;

  const titleEl = document.getElementById("modal-title");
  const btnSave = document.getElementById("modal-save");

  if (mode === "edit" && lezione) {
    titleEl.textContent = "Modifica Lezione";
    btnSave.textContent = "Salva Modifiche";

    // Pre-compila i campi
    document.getElementById("modal-giorno").value = lezione.giorno;
    aggiornaFasceDisponibili();
    document.getElementById("modal-fascia").value = lezione.slot;
    document.getElementById("modal-materia").value = lezione.materia || "";
    document.getElementById("modal-classe").value = lezione.classe || "";
    document.getElementById("modal-aula").value = lezione.aula || "";

  } else {
    titleEl.textContent = "Aggiungi Lezione";
    btnSave.textContent = "Salva Lezione";

    // Reset form
    document.getElementById("modal-giorno").value = "";
    document.getElementById("modal-fascia").innerHTML = `<option value="">— Prima seleziona il giorno —</option>`;
    document.getElementById("modal-fascia").disabled = true;
    document.getElementById("modal-materia").value = "";
    document.getElementById("modal-classe").value = "";
    document.getElementById("modal-aula").value = "";
  }

  nascondiErroreModal();

  // Mostra modal
  document.getElementById("modal-overlay").classList.add("active");
}

/**
 * Apri modal in modifica dalla cella cliccata
 */
function apriModalModifica(lezioneId) {
  const lezione = lezioniCorrente.find(l => l.id === lezioneId);
  if (!lezione) return;
  apriModal("edit", lezione);
}

function chiudiModal() {
  document.getElementById("modal-overlay").classList.remove("active");
  modalMode = "add";
  editingLezioneId = null;
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
// ADMIN: Salva lezione (Add o Update) con validazione conflitto
// ============================================================

async function salvaLezione() {
  nascondiErroreModal();

  const giorno = document.getElementById("modal-giorno").value;
  const slotStr = document.getElementById("modal-fascia").value;
  const materia = document.getElementById("modal-materia").value.trim();
  const classe = document.getElementById("modal-classe").value;
  const aula = document.getElementById("modal-aula").value;

  // Validazione campi
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
    mostraErroreModal("Seleziona una classe.");
    return;
  }
  if (!aula) {
    mostraErroreModal("Seleziona un'aula.");
    return;
  }

  const slot = parseInt(slotStr);

  // ── Verifica slot docente non già occupato ──
  const slotOccupato = lezioniCorrente.some(l =>
    l.giorno === giorno && l.slot === slot && l.id !== editingLezioneId
  );
  if (slotOccupato) {
    mostraErroreModal("Questo slot è già occupato per il docente selezionato.");
    return;
  }

  // Disabilita bottone salva
  const btnSave = document.getElementById("modal-save");
  btnSave.disabled = true;
  const originalText = btnSave.textContent;
  btnSave.textContent = "Controllo disponibilità…";

  try {
    // ── Validazione conflitto AULA ──
    // Cerca se qualcuno ha già prenotato quest'aula nello stesso giorno+slot
    const conflittoAula = await db.collection("orarioScolastico")
      .where("giorno", "==", giorno)
      .where("slot", "==", slot)
      .where("aula", "==", aula)
      .get();

    // Filtra: escludi il documento che stiamo modificando
    const conflitti = [];
    conflittoAula.forEach(doc => {
      if (doc.id !== editingLezioneId) {
        conflitti.push({ id: doc.id, ...doc.data() });
      }
    });

    if (conflitti.length > 0) {
      // Trova il nome del docente che ha l'aula occupata
      const conflitto = conflitti[0];
      const docConflitto = docentiLista.find(d => d.id === conflitto.docenteId);
      const nomeConflitto = docConflitto
        ? `${docConflitto.cognome} ${docConflitto.nome}`
        : "un altro docente";

      mostraErroreModal(
        `L'aula "${aula}" è già occupata in ${giorno} a quest'ora da ${nomeConflitto} (${conflitto.materia} — ${conflitto.classe}).`
      );
      btnSave.disabled = false;
      btnSave.textContent = originalText;
      return;
    }

    // ── Salvataggio ──
    btnSave.textContent = "Salvataggio…";

    const datiLezione = {
      docenteId: currentDocenteId,
      giorno: giorno,
      slot: slot,
      materia: materia,
      classe: classe,
      aula: aula,
    };

    if (modalMode === "edit" && editingLezioneId) {
      // Update del documento esistente
      await db.collection("orarioScolastico").doc(editingLezioneId).update(datiLezione);
    } else {
      // Add nuovo documento
      await db.collection("orarioScolastico").add(datiLezione);
    }

    // Chiudi modal e ricarica orario
    chiudiModal();
    await caricaEmostraOrario();

  } catch (err) {
    console.error("Errore salvataggio lezione:", err);
    mostraErroreModal("Errore durante il salvataggio. Riprova.");
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = originalText;
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

function mostraEmptyPerVista() {
  if (vistaCorrente === "docente") {
    mostraEmpty("Seleziona un docente per visualizzare l'orario.");
  } else if (vistaCorrente === "aula") {
    mostraEmpty("Seleziona un'aula per visualizzare le lezioni assegnate.");
  } else if (vistaCorrente === "classe") {
    mostraEmpty("Seleziona una classe per visualizzare l'orario.");
  }
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

// ============================================================
// GESTISCI AULE E CLASSI
// ============================================================

function apriGestisci() {
  document.getElementById("gestisci-overlay").classList.add("active");
  switchGestisciTab("aule");
}

function chiudiGestisci() {
  document.getElementById("gestisci-overlay").classList.remove("active");
}

// Chiudi cliccando fuori
document.addEventListener("click", (e) => {
  const overlay = document.getElementById("gestisci-overlay");
  if (e.target === overlay) chiudiGestisci();
});

/**
 * Cambia tab tra Aule e Classi
 */
function switchGestisciTab(tab) {
  // Aggiorna bottoni tab
  document.querySelectorAll(".gestisci-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });

  // Mostra/nascondi pannelli
  document.getElementById("panel-aule").style.display = (tab === "aule") ? "" : "none";
  document.getElementById("panel-classi").style.display = (tab === "classi") ? "" : "none";

  // Renderizza la lista
  renderGestisciLista(tab);
}

/**
 * Renderizza la lista di aule o classi nel pannello
 */
function renderGestisciLista(tipo) {
  const lista = tipo === "aule" ? auleLista : classiLista;
  const container = document.getElementById(`lista-${tipo}`);

  if (lista.length === 0) {
    container.innerHTML = `<div class="gestisci-empty">Nessuna ${tipo === "aule" ? "aula" : "classe"} presente. Aggiungine una!</div>`;
    return;
  }

  // Conta quante lezioni usano ciascun nome
  const conteggioUso = {};
  lezioniCorrente.forEach(l => {
    const campo = tipo === "aule" ? l.aula : l.classe;
    if (campo) conteggioUso[campo] = (conteggioUso[campo] || 0) + 1;
  });

  container.innerHTML = lista.map(item => {
    const uso = conteggioUso[item.nome] || 0;
    const usoLabel = uso > 0 ? `<span class="gestisci-item-count">(${uso} lez.)</span>` : "";
    return `
      <div class="gestisci-item" id="gestisci-item-${item.id}">
        <span class="gestisci-item-nome">${escapeHtml(item.nome)}${usoLabel}</span>
        <button class="gestisci-item-btn" onclick="iniziaRinomina('${tipo}', '${item.id}', '${escapeHtml(item.nome)}')" title="Rinomina">✏️</button>
        <button class="gestisci-item-btn btn-delete" onclick="eliminaEntita('${tipo}', '${item.id}', '${escapeHtml(item.nome)}')" title="Elimina">🗑️</button>
      </div>
    `;
  }).join("");
}

/**
 * Aggiunge una nuova aula o classe su Firestore
 */
async function aggiungiEntita(tipo) {
  const inputId = tipo === "aule" ? "input-nuova-aula" : "input-nuova-classe";
  const input = document.getElementById(inputId);
  const nome = input.value.trim();

  if (!nome) return;

  // Controlla duplicati
  const lista = tipo === "aule" ? auleLista : classiLista;
  const duplicato = lista.some(item => item.nome.toLowerCase() === nome.toLowerCase());
  if (duplicato) {
    alert(`Esiste già ${tipo === "aule" ? "un'aula" : "una classe"} con questo nome.`);
    return;
  }

  try {
    const ref = await db.collection(tipo).add({ nome: nome });

    // Aggiorna lista locale
    const nuovoItem = { id: ref.id, nome: nome };
    if (tipo === "aule") {
      auleLista.push(nuovoItem);
      auleLista.sort((a, b) => a.nome.localeCompare(b.nome));
    } else {
      classiLista.push(nuovoItem);
      classiLista.sort((a, b) => a.nome.localeCompare(b.nome));
    }

    // Aggiorna UI
    input.value = "";
    renderGestisciLista(tipo);
    aggiornaDropdownModal();
    // Aggiorna anche il dropdown entità se siamo nella vista giusta
    if ((tipo === "aule" && vistaCorrente === "aula") || (tipo === "classi" && vistaCorrente === "classe")) {
      popolaDropdownEntita();
    }

  } catch (err) {
    console.error("Errore aggiunta:", err);
    alert("Errore durante l'aggiunta. Riprova.");
  }
}

/**
 * Attiva la modalità rinomina per un item
 */
function iniziaRinomina(tipo, id, nomeAttuale) {
  const itemEl = document.getElementById(`gestisci-item-${id}`);
  if (!itemEl) return;

  itemEl.innerHTML = `
    <input type="text" class="gestisci-item-input" id="rinomina-input-${id}" value="${nomeAttuale}" onkeydown="if(event.key==='Enter')salvaRinomina('${tipo}','${id}')">
    <button class="gestisci-item-btn btn-save" onclick="salvaRinomina('${tipo}','${id}')" title="Salva">✅</button>
    <button class="gestisci-item-btn" onclick="renderGestisciLista('${tipo}')" title="Annulla">❌</button>
  `;

  // Focus sull'input
  const input = document.getElementById(`rinomina-input-${id}`);
  input.focus();
  input.select();
}

/**
 * Salva la rinomina su Firestore e aggiorna le lezioni collegate
 */
async function salvaRinomina(tipo, id) {
  const input = document.getElementById(`rinomina-input-${id}`);
  if (!input) return;

  const nuovoNome = input.value.trim();
  if (!nuovoNome) return;

  const lista = tipo === "aule" ? auleLista : classiLista;
  const item = lista.find(i => i.id === id);
  if (!item) return;

  const vecchioNome = item.nome;

  // Se il nome non è cambiato, chiudi semplicemente
  if (nuovoNome === vecchioNome) {
    renderGestisciLista(tipo);
    return;
  }

  // Controlla duplicati
  const duplicato = lista.some(i => i.id !== id && i.nome.toLowerCase() === nuovoNome.toLowerCase());
  if (duplicato) {
    alert(`Esiste già ${tipo === "aule" ? "un'aula" : "una classe"} con questo nome.`);
    return;
  }

  try {
    // 1. Aggiorna il documento nella collezione aule/classi
    await db.collection(tipo).doc(id).update({ nome: nuovoNome });

    // 2. Aggiorna tutte le lezioni che usano il vecchio nome
    const campo = tipo === "aule" ? "aula" : "classe";
    const snapshot = await db.collection("orarioScolastico")
      .where(campo, "==", vecchioNome)
      .get();

    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, { [campo]: nuovoNome });
      });
      await batch.commit();
    }

    // 3. Aggiorna lista locale
    item.nome = nuovoNome;
    lista.sort((a, b) => a.nome.localeCompare(b.nome));

    // 4. Aggiorna anche lezioniCorrente in locale
    lezioniCorrente.forEach(l => {
      if (l[campo] === vecchioNome) l[campo] = nuovoNome;
    });

    // 5. Refresh UI
    renderGestisciLista(tipo);
    aggiornaDropdownModal();
    if ((tipo === "aule" && vistaCorrente === "aula") || (tipo === "classi" && vistaCorrente === "classe")) {
      popolaDropdownEntita();
    }
    // Refresh tabella se visibile
    if (entitaSelezionata) renderTabella();

  } catch (err) {
    console.error("Errore rinomina:", err);
    alert("Errore durante la rinomina. Riprova.");
  }
}

/**
 * Elimina un'aula o classe da Firestore
 */
async function eliminaEntita(tipo, id, nome) {
  // Verifica se è in uso nelle lezioni
  const campo = tipo === "aule" ? "aula" : "classe";
  const snapshot = await db.collection("orarioScolastico")
    .where(campo, "==", nome)
    .get();

  if (!snapshot.empty) {
    const conferma = confirm(
      `"${nome}" è usata in ${snapshot.size} lezione/i nell'orario.\n\n` +
      `Se elimini, il campo ${campo} verrà svuotato in quelle lezioni.\n\nProcedere?`
    );
    if (!conferma) return;

    // Svuota il campo nelle lezioni
    const batch = db.batch();
    snapshot.forEach(doc => {
      batch.update(doc.ref, { [campo]: "" });
    });
    await batch.commit();

    // Aggiorna lezioniCorrente localmente
    lezioniCorrente.forEach(l => {
      if (l[campo] === nome) l[campo] = "";
    });
  } else {
    if (!confirm(`Eliminare "${nome}"?`)) return;
  }

  try {
    // Elimina il documento
    await db.collection(tipo).doc(id).delete();

    // Aggiorna lista locale
    if (tipo === "aule") {
      auleLista = auleLista.filter(a => a.id !== id);
    } else {
      classiLista = classiLista.filter(c => c.id !== id);
    }

    // Refresh UI
    renderGestisciLista(tipo);
    aggiornaDropdownModal();
    if ((tipo === "aule" && vistaCorrente === "aula") || (tipo === "classi" && vistaCorrente === "classe")) {
      popolaDropdownEntita();
    }
    if (entitaSelezionata) renderTabella();

  } catch (err) {
    console.error("Errore eliminazione:", err);
    alert("Errore durante l'eliminazione. Riprova.");
  }
}

/**
 * Aggiorna i dropdown aula e classe nella modal lezione
 */
function aggiornaDropdownModal() {
  const selectClasse = document.getElementById("modal-classe");
  const selectAula = document.getElementById("modal-aula");

  if (selectClasse) {
    const valCorrente = selectClasse.value;
    selectClasse.innerHTML = `<option value="">— Seleziona classe —</option>`;
    classiLista.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.nome;
      opt.textContent = c.nome;
      selectClasse.appendChild(opt);
    });
    selectClasse.value = valCorrente;
  }

  if (selectAula) {
    const valCorrente = selectAula.value;
    selectAula.innerHTML = `<option value="">— Seleziona aula —</option>`;
    auleLista.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.nome;
      opt.textContent = a.nome;
      selectAula.appendChild(opt);
    });
    selectAula.value = valCorrente;
  }
}
