// ============================================================
// impostazioni.js — Pagina Impostazioni (solo Admin)
// ============================================================
// 3 Pannelli:
//   1. Orari Scuola (mattina + pomeriggio per ogni giorno)
//   2. Tariffario Docenti (tariffa lezione + tariffa ripetizione)
//   3. Credenziali Docenti (username + password)
// ============================================================

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  checkAdmin();
  initPage("Impostazioni");
  caricaTutto();
});

/**
 * Carica tutti e 3 i pannelli
 */
async function caricaTutto() {
  try {
    // Carica impostazioni orari e docenti in parallelo
    const [impostazioni, docentiSnapshot] = await Promise.all([
      caricaImpostazioniOrari(),
      db.collection("docenti").orderBy("cognome").get()
    ]);

    // Trasforma snapshot docenti in array
    const docenti = [];
    docentiSnapshot.forEach(doc => {
      docenti.push({ id: doc.id, ...doc.data() });
    });

    // Render dei 3 pannelli
    renderOrariScuola(impostazioni);
    renderTariffario(docenti);
    renderCredenziali(docenti);
  } catch (err) {
    console.error("Errore caricamento impostazioni:", err);
    mostraToast("Errore nel caricamento dei dati.", "errore");
  }
}

// ══════════════════════════════════════════════
// PANNELLO 1 — ORARI SCUOLA
// ══════════════════════════════════════════════

/**
 * Genera le 5 card dei giorni con campi mattina e pomeriggio.
 * @param {Object} impostazioni - Dati da Firestore (o default)
 */
function renderOrariScuola(impostazioni) {
  const container = document.getElementById("orari-grid");
  container.innerHTML = "";

  GIORNI.forEach(giorno => {
    const dati = impostazioni[giorno] || {
      mattina_oraInizio: "08:00",
      mattina_durataLezione: 50,
      mattina_numeroLezioni: 6,
      pomeriggio_oraApertura: "15:00",
      pomeriggio_oraChiusura: "18:30"
    };

    // ID sicuro per attributi HTML (senza accenti)
    const idGiorno = giorno.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const card = document.createElement("div");
    card.className = "giorno-card";
    card.innerHTML = `
      <div class="giorno-card-header">
        <div class="giorno-card-title">📆 ${giorno}</div>
      </div>
      <div class="giorno-card-body">

        <!-- MATTINA -->
        <div class="sezione-mattina">
          <div class="sezione-mattina-titolo">☀️ Mattina</div>

          <div class="campo-orario">
            <label>Ora inizio prima lezione</label>
            <input type="time" id="matt-inizio-${idGiorno}" value="${dati.mattina_oraInizio}"
                   oninput="aggiornaAnteprimaMattina('${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Durata lezione (minuti)</label>
            <input type="number" id="matt-durata-${idGiorno}" value="${dati.mattina_durataLezione}"
                   min="30" max="120" step="5"
                   oninput="aggiornaAnteprimaMattina('${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Numero lezioni</label>
            <input type="number" id="matt-numero-${idGiorno}" value="${dati.mattina_numeroLezioni}"
                   min="1" max="10" step="1"
                   oninput="aggiornaAnteprimaMattina('${idGiorno}')">
          </div>

          <div class="anteprima-fasce">
            <div class="anteprima-fasce-label">Anteprima fasce orarie</div>
            <div class="anteprima-fasce-text" id="anteprima-matt-${idGiorno}">—</div>
          </div>
        </div>

        <!-- POMERIGGIO -->
        <div class="sezione-pomeriggio">
          <div class="sezione-pomeriggio-titolo">🌅 Pomeriggio</div>

          <div class="campo-orario">
            <label>Ora apertura ripetizioni</label>
            <input type="time" id="pom-apertura-${idGiorno}" value="${dati.pomeriggio_oraApertura}"
                   oninput="aggiornaAnteprimaPomeriggio('${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Ora chiusura ripetizioni</label>
            <input type="time" id="pom-chiusura-${idGiorno}" value="${dati.pomeriggio_oraChiusura}"
                   oninput="aggiornaAnteprimaPomeriggio('${idGiorno}')">
          </div>

          <div class="anteprima-pomeriggio">
            <div class="anteprima-fasce-label" style="color:#E65100;">Riepilogo</div>
            <div class="anteprima-pomeriggio-text" id="anteprima-pom-${idGiorno}">—</div>
          </div>
        </div>

      </div>
      <div class="giorno-card-footer">
        <button class="btn-salva-giorno" onclick="salvaOrarioGiorno('${giorno}', '${idGiorno}')">
          💾 Salva ${giorno}
        </button>
      </div>
    `;

    container.appendChild(card);

    // Calcola anteprime iniziali
    aggiornaAnteprimaMattina(idGiorno);
    aggiornaAnteprimaPomeriggio(idGiorno);
  });
}

/**
 * Aggiorna l'anteprima delle fasce orarie della mattina.
 * @param {string} idGiorno - ID normalizzato del giorno
 */
function aggiornaAnteprimaMattina(idGiorno) {
  const oraInizio = document.getElementById(`matt-inizio-${idGiorno}`).value;
  const durata = parseInt(document.getElementById(`matt-durata-${idGiorno}`).value) || 50;
  const numero = parseInt(document.getElementById(`matt-numero-${idGiorno}`).value) || 6;

  const anteprima = document.getElementById(`anteprima-matt-${idGiorno}`);

  if (!oraInizio) {
    anteprima.textContent = "Inserisci un'ora di inizio";
    return;
  }

  const fasce = calcolaFasceOrarie(oraInizio, durata, numero);
  const testo = fasce.map((f, i) => `${i + 1}ª ${f.start}–${f.end}`).join("  |  ");
  anteprima.textContent = testo;
}

/**
 * Aggiorna l'anteprima del pomeriggio.
 * @param {string} idGiorno - ID normalizzato del giorno
 */
function aggiornaAnteprimaPomeriggio(idGiorno) {
  const apertura = document.getElementById(`pom-apertura-${idGiorno}`).value;
  const chiusura = document.getElementById(`pom-chiusura-${idGiorno}`).value;

  const anteprima = document.getElementById(`anteprima-pom-${idGiorno}`);

  if (!apertura || !chiusura) {
    anteprima.textContent = "Inserisci apertura e chiusura";
    return;
  }

  const minApertura = timeToMinutes(apertura);
  const minChiusura = timeToMinutes(chiusura);

  if (minChiusura <= minApertura) {
    anteprima.textContent = "⚠️ L'ora di chiusura deve essere dopo l'apertura";
    return;
  }

  const oreDisponibili = ((minChiusura - minApertura) / 60).toFixed(1);
  anteprima.textContent = `Ripetizioni dalle ${apertura} alle ${chiusura} (${oreDisponibili} ore disponibili)`;
}

/**
 * Salva le impostazioni orario di un giorno su Firestore.
 * @param {string} giorno - Nome del giorno (es: "Lunedì")
 * @param {string} idGiorno - ID normalizzato
 */
async function salvaOrarioGiorno(giorno, idGiorno) {
  const btn = event.target.closest(".btn-salva-giorno");
  btn.disabled = true;
  btn.textContent = "⏳ Salvataggio...";

  try {
    const dati = {
      giorno: giorno,
      mattina_oraInizio: document.getElementById(`matt-inizio-${idGiorno}`).value,
      mattina_durataLezione: parseInt(document.getElementById(`matt-durata-${idGiorno}`).value) || 50,
      mattina_numeroLezioni: parseInt(document.getElementById(`matt-numero-${idGiorno}`).value) || 6,
      pomeriggio_oraApertura: document.getElementById(`pom-apertura-${idGiorno}`).value,
      pomeriggio_oraChiusura: document.getElementById(`pom-chiusura-${idGiorno}`).value
    };

    // Validazione
    if (!dati.mattina_oraInizio) {
      mostraToast("Inserisci l'ora di inizio mattina.", "errore");
      resetBtnSalvaGiorno(btn, giorno);
      return;
    }
    if (!dati.pomeriggio_oraApertura || !dati.pomeriggio_oraChiusura) {
      mostraToast("Inserisci apertura e chiusura pomeriggio.", "errore");
      resetBtnSalvaGiorno(btn, giorno);
      return;
    }

    // Salva su Firestore (ID documento = nome giorno)
    await db.collection("impostazioniOrari").doc(giorno).set(dati);

    btn.textContent = "✅ Salvato!";
    btn.classList.add("salvato");
    mostraToast(`Orari di ${giorno} salvati con successo!`, "successo");

    setTimeout(() => {
      resetBtnSalvaGiorno(btn, giorno);
    }, 2000);
  } catch (err) {
    console.error("Errore salvataggio orario:", err);
    mostraToast("Errore nel salvataggio. Riprova.", "errore");
    resetBtnSalvaGiorno(btn, giorno);
  }
}

/**
 * Ripristina il bottone salva giorno allo stato iniziale.
 */
function resetBtnSalvaGiorno(btn, giorno) {
  btn.disabled = false;
  btn.textContent = `💾 Salva ${giorno}`;
  btn.classList.remove("salvato");
}

// ══════════════════════════════════════════════
// PANNELLO 2 — TARIFFARIO DOCENTI
// ══════════════════════════════════════════════

/**
 * Genera le card tariffe per ogni docente.
 * @param {Array} docenti - Array di docenti da Firestore
 */
function renderTariffario(docenti) {
  const container = document.getElementById("tariffe-grid");
  container.innerHTML = "";

  if (docenti.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">👥</div>
        <p>Nessun docente presente. Aggiungili dalla sezione Anagrafica.</p>
      </div>
    `;
    return;
  }

  docenti.forEach(docente => {
    const iniziali = (docente.nome?.charAt(0) || "") + (docente.cognome?.charAt(0) || "");
    const nomeCompleto = `${docente.nome || ""} ${docente.cognome || ""}`.trim();
    const materie = docente.materie || [];
    const tariffaLezione = docente.tariffaLezione ?? 0;
    const tariffaRipetizione = docente.tariffaRipetizione ?? 0;
    const noteTariffa = docente.noteTariffa || "";

    const card = document.createElement("div");
    card.className = "tariffa-card";
    card.id = `tariffa-card-${docente.id}`;
    card.innerHTML = `
      <div class="tariffa-card-header">
        <div class="tariffa-avatar">${iniziali.toUpperCase()}</div>
        <div class="tariffa-info">
          <div class="tariffa-nome">${nomeCompleto}</div>
          <div class="tariffa-materie">
            ${materie.map(m => `<span class="badge-materia">${m}</span>`).join("")}
          </div>
        </div>
      </div>

      <div class="tariffa-card-body">
        <div class="tariffa-boxes">
          <!-- Box Tariffa Lezione -->
          <div class="tariffa-box tariffa-box-lezione">
            <div class="tariffa-box-label">Tariffa Lezione</div>
            <div class="tariffa-box-valore" id="tariffa-lez-view-${docente.id}">
              €${tariffaLezione.toFixed(0)}
            </div>
            <div class="tariffa-box-unita">per lezione (mattina)</div>
            <!-- Input nascosto per edit -->
            <input type="number" class="tariffa-box-input" id="tariffa-lez-input-${docente.id}"
                   value="${tariffaLezione}" min="0" step="1" style="display:none;">
            <div class="tariffa-box-unita" id="tariffa-lez-unita-edit-${docente.id}" style="display:none;">€ per lezione</div>
          </div>

          <!-- Box Tariffa Ripetizione -->
          <div class="tariffa-box tariffa-box-ripetizione">
            <div class="tariffa-box-label">Tariffa Ripetizione</div>
            <div class="tariffa-box-valore" id="tariffa-rip-view-${docente.id}">
              €${tariffaRipetizione.toFixed(0)}
            </div>
            <div class="tariffa-box-unita">per ora (pomeriggio)</div>
            <!-- Input nascosto per edit -->
            <input type="number" class="tariffa-box-input" id="tariffa-rip-input-${docente.id}"
                   value="${tariffaRipetizione}" min="0" step="1" style="display:none;">
            <div class="tariffa-box-unita" id="tariffa-rip-unita-edit-${docente.id}" style="display:none;">€ per ora</div>
          </div>
        </div>

        <!-- Note -->
        <div class="tariffa-note">
          <div class="tariffa-note-label">Note</div>
          <div class="tariffa-note-text ${noteTariffa ? '' : 'vuota'}" id="tariffa-note-view-${docente.id}">
            ${noteTariffa || "Nessuna nota"}
          </div>
          <textarea class="tariffa-note-input" id="tariffa-note-input-${docente.id}"
                    style="display:none;" placeholder="Aggiungi note...">${noteTariffa}</textarea>
        </div>
      </div>

      <div class="tariffa-card-footer">
        <!-- Vista normale -->
        <button class="btn-modifica-tariffa" id="tariffa-btn-modifica-${docente.id}"
                onclick="editTariffa('${docente.id}')">
          ✏️ Modifica
        </button>
        <!-- Vista edit -->
        <button class="btn-annulla-tariffa" id="tariffa-btn-annulla-${docente.id}"
                onclick="annullaTariffa('${docente.id}')" style="display:none;">
          Annulla
        </button>
        <button class="btn-salva-tariffa" id="tariffa-btn-salva-${docente.id}"
                onclick="salvaTariffa('${docente.id}')" style="display:none;">
          💾 Salva
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Attiva la modalità edit per una card tariffa.
 * @param {string} docenteId
 */
function editTariffa(docenteId) {
  // Nasconde i valori, mostra gli input
  document.getElementById(`tariffa-lez-view-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-rip-view-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-note-view-${docenteId}`).style.display = "none";

  document.getElementById(`tariffa-lez-input-${docenteId}`).style.display = "inline-block";
  document.getElementById(`tariffa-rip-input-${docenteId}`).style.display = "inline-block";
  document.getElementById(`tariffa-lez-unita-edit-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-rip-unita-edit-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-note-input-${docenteId}`).style.display = "block";

  // Nasconde il bottone Modifica, mostra Annulla + Salva
  document.getElementById(`tariffa-btn-modifica-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-btn-annulla-${docenteId}`).style.display = "inline-flex";
  document.getElementById(`tariffa-btn-salva-${docenteId}`).style.display = "inline-flex";
}

/**
 * Annulla le modifiche alla tariffa e torna alla vista.
 * @param {string} docenteId
 */
function annullaTariffa(docenteId) {
  // Ripristina vista
  document.getElementById(`tariffa-lez-view-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-rip-view-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-note-view-${docenteId}`).style.display = "block";

  document.getElementById(`tariffa-lez-input-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-rip-input-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-lez-unita-edit-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-rip-unita-edit-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-note-input-${docenteId}`).style.display = "none";

  document.getElementById(`tariffa-btn-modifica-${docenteId}`).style.display = "inline-flex";
  document.getElementById(`tariffa-btn-annulla-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-btn-salva-${docenteId}`).style.display = "none";
}

/**
 * Salva le tariffe modificate su Firestore.
 * @param {string} docenteId
 */
async function salvaTariffa(docenteId) {
  const btnSalva = document.getElementById(`tariffa-btn-salva-${docenteId}`);
  btnSalva.disabled = true;
  btnSalva.textContent = "⏳ ...";

  try {
    const tariffaLezione = parseFloat(document.getElementById(`tariffa-lez-input-${docenteId}`).value) || 0;
    const tariffaRipetizione = parseFloat(document.getElementById(`tariffa-rip-input-${docenteId}`).value) || 0;
    const noteTariffa = document.getElementById(`tariffa-note-input-${docenteId}`).value.trim();

    await db.collection("docenti").doc(docenteId).update({
      tariffaLezione: tariffaLezione,
      tariffaRipetizione: tariffaRipetizione,
      noteTariffa: noteTariffa
    });

    // Aggiorna la vista con i nuovi valori
    document.getElementById(`tariffa-lez-view-${docenteId}`).textContent = `€${tariffaLezione.toFixed(0)}`;
    document.getElementById(`tariffa-rip-view-${docenteId}`).textContent = `€${tariffaRipetizione.toFixed(0)}`;

    const noteView = document.getElementById(`tariffa-note-view-${docenteId}`);
    noteView.textContent = noteTariffa || "Nessuna nota";
    noteView.className = `tariffa-note-text ${noteTariffa ? '' : 'vuota'}`;

    // Torna alla vista
    annullaTariffa(docenteId);
    mostraToast("Tariffe aggiornate con successo!", "successo");
  } catch (err) {
    console.error("Errore salvataggio tariffa:", err);
    mostraToast("Errore nel salvataggio. Riprova.", "errore");
  } finally {
    btnSalva.disabled = false;
    btnSalva.textContent = "💾 Salva";
  }
}

// ══════════════════════════════════════════════
// PANNELLO 3 — CREDENZIALI DOCENTI
// ══════════════════════════════════════════════

/**
 * Genera la tabella credenziali per ogni docente.
 * @param {Array} docenti - Array di docenti da Firestore
 */
function renderCredenziali(docenti) {
  const container = document.getElementById("credenziali-container");
  container.innerHTML = "";

  if (docenti.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔐</div>
        <p>Nessun docente presente. Aggiungili dalla sezione Anagrafica.</p>
      </div>
    `;
    return;
  }

  const card = document.createElement("div");
  card.className = "credenziali-card";

  // Header
  card.innerHTML = `
    <div class="credenziali-header">
      <span>Docente</span>
      <span>Username</span>
      <span>Password</span>
      <span style="text-align:right;">Azioni</span>
    </div>
  `;

  // Righe
  docenti.forEach(docente => {
    const iniziali = (docente.nome?.charAt(0) || "") + (docente.cognome?.charAt(0) || "");
    const nomeCompleto = `${docente.nome || ""} ${docente.cognome || ""}`.trim();
    const username = docente.username || "";
    const password = docente.password || "";

    const riga = document.createElement("div");
    riga.className = "credenziali-riga";
    riga.id = `cred-riga-${docente.id}`;

    riga.innerHTML = `
      <!-- Docente -->
      <div class="credenziali-docente">
        <div class="credenziali-avatar">${iniziali.toUpperCase()}</div>
        <div class="credenziali-nome">${nomeCompleto}</div>
      </div>

      <!-- Username VIEW -->
      <div class="credenziali-campo" id="cred-user-view-${docente.id}">${username || "—"}</div>
      <!-- Username EDIT -->
      <div id="cred-user-edit-${docente.id}" style="display:none;">
        <input type="text" class="credenziali-input" id="cred-user-input-${docente.id}" value="${username}" placeholder="Username">
      </div>

      <!-- Password VIEW -->
      <div class="credenziali-password" id="cred-pass-view-${docente.id}">
        <span class="credenziali-password-text" id="cred-pass-text-${docente.id}">••••••••</span>
        <button class="btn-toggle-password" onclick="togglePassword('${docente.id}')" title="Mostra/nascondi password">
          👁️
        </button>
      </div>
      <!-- Password EDIT -->
      <div id="cred-pass-edit-${docente.id}" style="display:none;">
        <input type="text" class="credenziali-input" id="cred-pass-input-${docente.id}" value="${password}" placeholder="Password">
      </div>

      <!-- Azioni VIEW -->
      <div class="credenziali-azioni" id="cred-azioni-view-${docente.id}">
        <button class="btn-cred btn-cred-modifica" onclick="editCredenziali('${docente.id}')">✏️ Modifica</button>
      </div>
      <!-- Azioni EDIT -->
      <div class="credenziali-azioni" id="cred-azioni-edit-${docente.id}" style="display:none;">
        <button class="btn-cred btn-cred-annulla" onclick="annullaCredenziali('${docente.id}')">Annulla</button>
        <button class="btn-cred btn-cred-salva" id="cred-btn-salva-${docente.id}" onclick="salvaCredenziali('${docente.id}')">💾 Salva</button>
      </div>
    `;

    // Salva la password originale come data attribute per il toggle
    riga.dataset.password = password;

    card.appendChild(riga);
  });

  container.appendChild(card);
}

/**
 * Mostra/nasconde la password di un docente.
 * @param {string} docenteId
 */
function togglePassword(docenteId) {
  const riga = document.getElementById(`cred-riga-${docenteId}`);
  const textEl = document.getElementById(`cred-pass-text-${docenteId}`);
  const password = riga.dataset.password || "";

  if (textEl.textContent === "••••••••") {
    textEl.textContent = password;
  } else {
    textEl.textContent = "••••••••";
  }
}

/**
 * Attiva la modalità edit per le credenziali di un docente.
 * @param {string} docenteId
 */
function editCredenziali(docenteId) {
  // Nasconde view, mostra edit
  document.getElementById(`cred-user-view-${docenteId}`).style.display = "none";
  document.getElementById(`cred-pass-view-${docenteId}`).style.display = "none";
  document.getElementById(`cred-azioni-view-${docenteId}`).style.display = "none";

  document.getElementById(`cred-user-edit-${docenteId}`).style.display = "block";
  document.getElementById(`cred-pass-edit-${docenteId}`).style.display = "block";
  document.getElementById(`cred-azioni-edit-${docenteId}`).style.display = "flex";
}

/**
 * Annulla le modifiche alle credenziali.
 * @param {string} docenteId
 */
function annullaCredenziali(docenteId) {
  // Torna alla vista
  document.getElementById(`cred-user-view-${docenteId}`).style.display = "block";
  document.getElementById(`cred-pass-view-${docenteId}`).style.display = "flex";
  document.getElementById(`cred-azioni-view-${docenteId}`).style.display = "flex";

  document.getElementById(`cred-user-edit-${docenteId}`).style.display = "none";
  document.getElementById(`cred-pass-edit-${docenteId}`).style.display = "none";
  document.getElementById(`cred-azioni-edit-${docenteId}`).style.display = "none";
}

/**
 * Salva le credenziali modificate su Firestore.
 * @param {string} docenteId
 */
async function salvaCredenziali(docenteId) {
  const btnSalva = document.getElementById(`cred-btn-salva-${docenteId}`);
  btnSalva.disabled = true;
  btnSalva.textContent = "⏳ ...";

  try {
    const nuovoUsername = document.getElementById(`cred-user-input-${docenteId}`).value.trim();
    const nuovaPassword = document.getElementById(`cred-pass-input-${docenteId}`).value.trim();

    // Validazione
    if (!nuovoUsername) {
      mostraToast("Lo username non può essere vuoto.", "errore");
      btnSalva.disabled = false;
      btnSalva.textContent = "💾 Salva";
      return;
    }

    if (!nuovaPassword) {
      mostraToast("La password non può essere vuota.", "errore");
      btnSalva.disabled = false;
      btnSalva.textContent = "💾 Salva";
      return;
    }

    // Controlla che lo username non sia già usato da un altro docente
    const existingSnapshot = await db.collection("docenti")
      .where("username", "==", nuovoUsername)
      .get();

    const altroDocente = existingSnapshot.docs.find(doc => doc.id !== docenteId);
    if (altroDocente) {
      mostraToast("Username già in uso da un altro docente.", "errore");
      btnSalva.disabled = false;
      btnSalva.textContent = "💾 Salva";
      return;
    }

    // Salva su Firestore
    await db.collection("docenti").doc(docenteId).update({
      username: nuovoUsername,
      password: nuovaPassword
    });

    // Aggiorna la vista
    document.getElementById(`cred-user-view-${docenteId}`).textContent = nuovoUsername;
    const riga = document.getElementById(`cred-riga-${docenteId}`);
    riga.dataset.password = nuovaPassword;
    document.getElementById(`cred-pass-text-${docenteId}`).textContent = "••••••••";

    // Torna alla vista
    annullaCredenziali(docenteId);
    mostraToast("Credenziali aggiornate con successo!", "successo");
  } catch (err) {
    console.error("Errore salvataggio credenziali:", err);
    mostraToast("Errore nel salvataggio. Riprova.", "errore");
  } finally {
    btnSalva.disabled = false;
    btnSalva.textContent = "💾 Salva";
  }
}

// ══════════════════════════════════════════════
// TOAST FEEDBACK
// ══════════════════════════════════════════════

/**
 * Mostra un messaggio toast.
 * @param {string} messaggio - Testo da mostrare
 * @param {"successo"|"errore"} tipo - Tipo di toast
 */
function mostraToast(messaggio, tipo) {
  const toast = document.getElementById("toast");
  toast.textContent = messaggio;
  toast.className = `toast toast-${tipo} visibile`;

  setTimeout(() => {
    toast.classList.remove("visibile");
  }, 3000);
}
