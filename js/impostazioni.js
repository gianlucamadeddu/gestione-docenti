// ============================================================
// impostazioni.js — Pagina Impostazioni (solo Admin)
// ============================================================
// 3 Pannelli:
//   1. Orari Scuola (2 blocchi identici, entrambi per lezioni E ripetizioni)
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
    const [impostazioni, docentiSnapshot] = await Promise.all([
      caricaImpostazioniOrari(),
      db.collection("docenti").orderBy("cognome").get()
    ]);

    const docenti = [];
    docentiSnapshot.forEach(doc => {
      docenti.push({ id: doc.id, ...doc.data() });
    });

    renderOrariScuola(impostazioni);
    renderTariffario(docenti);
    renderCredenziali(docenti);
  } catch (err) {
    console.error("Errore caricamento impostazioni:", err);
    mostraToast("Errore nel caricamento dei dati.", "errore");
  }
}

// ══════════════════════════════════════════════
// PANNELLO 1 — ORARI SCUOLA (2 blocchi unificati)
// ══════════════════════════════════════════════

/**
 * Genera le 5 card dei giorni.
 * Ogni giorno ha 2 blocchi (Mattina e Pomeriggio), entrambi con:
 * - Ora inizio
 * - Durata fascia (minuti)
 * - Numero fasce
 * Entrambi possono contenere sia lezioni che ripetizioni.
 */
function renderOrariScuola(impostazioni) {
  const container = document.getElementById("orari-grid");
  container.innerHTML = "";

  GIORNI.forEach(giorno => {
    const dati = impostazioni[giorno] || {};

    // Valori default — blocco mattina
    const matt = {
      oraInizio:  dati.mattina_oraInizio || "08:00",
      durata:     dati.mattina_durataLezione || dati.mattina_durataFascia || 50,
      numero:     dati.mattina_numeroLezioni || dati.mattina_numeroFasce || 6
    };

    // Valori default — blocco pomeriggio
    // Compatibilità: vecchi dati avevano solo oraApertura/oraChiusura
    const pom = {
      oraInizio:  dati.pomeriggio_oraInizio || dati.pomeriggio_oraApertura || "15:00",
      durata:     dati.pomeriggio_durataFascia || 60,
      numero:     dati.pomeriggio_numeroFasce || 3
    };

    const idGiorno = giorno.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    const card = document.createElement("div");
    card.className = "giorno-card";
    card.innerHTML = `
      <div class="giorno-card-header">
        <div class="giorno-card-title">📆 ${giorno}</div>
      </div>
      <div class="giorno-card-body">

        <!-- BLOCCO MATTINA -->
        <div class="sezione-mattina">
          <div class="sezione-mattina-titolo">
            ☀️ Mattina
            <span class="blocco-badge">Lezioni e Ripetizioni</span>
          </div>

          <div class="campo-orario">
            <label>Ora inizio prima fascia</label>
            <input type="time" id="matt-inizio-${idGiorno}" value="${matt.oraInizio}"
                   oninput="aggiornaAnteprimaBlocco('matt', '${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Durata fascia (minuti)</label>
            <input type="number" id="matt-durata-${idGiorno}" value="${matt.durata}"
                   min="30" max="120" step="5"
                   oninput="aggiornaAnteprimaBlocco('matt', '${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Numero fasce</label>
            <input type="number" id="matt-numero-${idGiorno}" value="${matt.numero}"
                   min="1" max="10" step="1"
                   oninput="aggiornaAnteprimaBlocco('matt', '${idGiorno}')">
          </div>

          <div class="anteprima-fasce">
            <div class="anteprima-fasce-label">Anteprima fasce orarie</div>
            <div class="anteprima-fasce-text" id="anteprima-matt-${idGiorno}">—</div>
          </div>
        </div>

        <!-- BLOCCO POMERIGGIO -->
        <div class="sezione-pomeriggio">
          <div class="sezione-pomeriggio-titolo">
            🌅 Pomeriggio
            <span class="blocco-badge pom">Lezioni e Ripetizioni</span>
          </div>

          <div class="campo-orario">
            <label>Ora inizio prima fascia</label>
            <input type="time" id="pom-inizio-${idGiorno}" value="${pom.oraInizio}"
                   oninput="aggiornaAnteprimaBlocco('pom', '${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Durata fascia (minuti)</label>
            <input type="number" id="pom-durata-${idGiorno}" value="${pom.durata}"
                   min="30" max="120" step="5"
                   oninput="aggiornaAnteprimaBlocco('pom', '${idGiorno}')">
          </div>

          <div class="campo-orario">
            <label>Numero fasce</label>
            <input type="number" id="pom-numero-${idGiorno}" value="${pom.numero}"
                   min="1" max="10" step="1"
                   oninput="aggiornaAnteprimaBlocco('pom', '${idGiorno}')">
          </div>

          <div class="anteprima-pomeriggio">
            <div class="anteprima-fasce-label" style="color:#E65100;">Anteprima fasce orarie</div>
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
    aggiornaAnteprimaBlocco("matt", idGiorno);
    aggiornaAnteprimaBlocco("pom", idGiorno);
  });
}

/**
 * Aggiorna l'anteprima delle fasce orarie per un blocco (matt o pom).
 * @param {string} blocco - "matt" o "pom"
 * @param {string} idGiorno - ID normalizzato del giorno
 */
function aggiornaAnteprimaBlocco(blocco, idGiorno) {
  const oraInizio = document.getElementById(`${blocco}-inizio-${idGiorno}`).value;
  const durata = parseInt(document.getElementById(`${blocco}-durata-${idGiorno}`).value) || 50;
  const numero = parseInt(document.getElementById(`${blocco}-numero-${idGiorno}`).value) || 4;

  const anteprima = document.getElementById(`anteprima-${blocco}-${idGiorno}`);

  if (!oraInizio) {
    anteprima.textContent = "Inserisci un'ora di inizio";
    return;
  }

  const fasce = calcolaFasceOrarie(oraInizio, durata, numero);
  const testo = fasce.map((f, i) => `${i + 1}ª ${f.start}–${f.end}`).join("  |  ");

  // Calcola ora fine ultima fascia
  const ultimaFascia = fasce[fasce.length - 1];
  const oreTotali = ((numero * durata) / 60).toFixed(1);

  anteprima.textContent = testo;
}

// Mantieni compatibilità con vecchia funzione chiamata dall'HTML precedente
function aggiornaAnteprimaMattina(idGiorno) {
  aggiornaAnteprimaBlocco("matt", idGiorno);
}

/**
 * Salva le impostazioni orario di un giorno su Firestore.
 * Nuova struttura: entrambi i blocchi hanno oraInizio, durataFascia, numeroFasce.
 */
async function salvaOrarioGiorno(giorno, idGiorno) {
  const btn = event.target.closest(".btn-salva-giorno");
  btn.disabled = true;
  btn.textContent = "⏳ Salvataggio...";

  try {
    const dati = {
      giorno: giorno,
      // Blocco Mattina
      mattina_oraInizio:      document.getElementById(`matt-inizio-${idGiorno}`).value,
      mattina_durataFascia:   parseInt(document.getElementById(`matt-durata-${idGiorno}`).value) || 50,
      mattina_numeroFasce:    parseInt(document.getElementById(`matt-numero-${idGiorno}`).value) || 6,
      // Compatibilità vecchi nomi (il calendario potrebbe usarli)
      mattina_durataLezione:  parseInt(document.getElementById(`matt-durata-${idGiorno}`).value) || 50,
      mattina_numeroLezioni:  parseInt(document.getElementById(`matt-numero-${idGiorno}`).value) || 6,
      // Blocco Pomeriggio
      pomeriggio_oraInizio:     document.getElementById(`pom-inizio-${idGiorno}`).value,
      pomeriggio_durataFascia:  parseInt(document.getElementById(`pom-durata-${idGiorno}`).value) || 60,
      pomeriggio_numeroFasce:   parseInt(document.getElementById(`pom-numero-${idGiorno}`).value) || 3,
      // Compatibilità vecchi nomi
      pomeriggio_oraApertura:   document.getElementById(`pom-inizio-${idGiorno}`).value,
      pomeriggio_oraChiusura:   "" // non più usato, ma evita errori
    };

    // Validazione
    if (!dati.mattina_oraInizio) {
      mostraToast("Inserisci l'ora di inizio per il blocco mattina.", "errore");
      resetBtnSalvaGiorno(btn, giorno);
      return;
    }
    if (!dati.pomeriggio_oraInizio) {
      mostraToast("Inserisci l'ora di inizio per il blocco pomeriggio.", "errore");
      resetBtnSalvaGiorno(btn, giorno);
      return;
    }

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

function resetBtnSalvaGiorno(btn, giorno) {
  btn.disabled = false;
  btn.textContent = `💾 Salva ${giorno}`;
  btn.classList.remove("salvato");
}

// ══════════════════════════════════════════════
// PANNELLO 2 — TARIFFARIO DOCENTI
// ══════════════════════════════════════════════

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
          <div class="tariffa-box tariffa-box-lezione">
            <div class="tariffa-box-label">Tariffa Lezione</div>
            <div class="tariffa-box-valore" id="tariffa-lez-view-${docente.id}">
              €${tariffaLezione.toFixed(0)}
            </div>
            <div class="tariffa-box-unita">per lezione</div>
            <input type="number" class="tariffa-box-input" id="tariffa-lez-input-${docente.id}"
                   value="${tariffaLezione}" min="0" step="1" style="display:none;">
            <div class="tariffa-box-unita" id="tariffa-lez-unita-edit-${docente.id}" style="display:none;">€ per lezione</div>
          </div>

          <div class="tariffa-box tariffa-box-ripetizione">
            <div class="tariffa-box-label">Tariffa Ripetizione</div>
            <div class="tariffa-box-valore" id="tariffa-rip-view-${docente.id}">
              €${tariffaRipetizione.toFixed(0)}
            </div>
            <div class="tariffa-box-unita">per ora</div>
            <input type="number" class="tariffa-box-input" id="tariffa-rip-input-${docente.id}"
                   value="${tariffaRipetizione}" min="0" step="1" style="display:none;">
            <div class="tariffa-box-unita" id="tariffa-rip-unita-edit-${docente.id}" style="display:none;">€ per ora</div>
          </div>
        </div>

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
        <button class="btn-modifica-tariffa" id="tariffa-btn-modifica-${docente.id}"
                onclick="editTariffa('${docente.id}')">
          ✏️ Modifica
        </button>
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

function editTariffa(docenteId) {
  document.getElementById(`tariffa-lez-view-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-rip-view-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-note-view-${docenteId}`).style.display = "none";

  document.getElementById(`tariffa-lez-input-${docenteId}`).style.display = "inline-block";
  document.getElementById(`tariffa-rip-input-${docenteId}`).style.display = "inline-block";
  document.getElementById(`tariffa-lez-unita-edit-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-rip-unita-edit-${docenteId}`).style.display = "block";
  document.getElementById(`tariffa-note-input-${docenteId}`).style.display = "block";

  document.getElementById(`tariffa-btn-modifica-${docenteId}`).style.display = "none";
  document.getElementById(`tariffa-btn-annulla-${docenteId}`).style.display = "inline-flex";
  document.getElementById(`tariffa-btn-salva-${docenteId}`).style.display = "inline-flex";
}

function annullaTariffa(docenteId) {
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

async function salvaTariffa(docenteId) {
  const btnSalva = document.getElementById(`tariffa-btn-salva-${docenteId}`);
  btnSalva.disabled = true;
  btnSalva.textContent = "⏳ ...";

  try {
    const tariffaLezione = parseFloat(document.getElementById(`tariffa-lez-input-${docenteId}`).value) || 0;
    const tariffaRipetizione = parseFloat(document.getElementById(`tariffa-rip-input-${docenteId}`).value) || 0;
    const noteTariffa = document.getElementById(`tariffa-note-input-${docenteId}`).value.trim();

    await db.collection("docenti").doc(docenteId).update({
      tariffaLezione,
      tariffaRipetizione,
      noteTariffa
    });

    document.getElementById(`tariffa-lez-view-${docenteId}`).textContent = `€${tariffaLezione.toFixed(0)}`;
    document.getElementById(`tariffa-rip-view-${docenteId}`).textContent = `€${tariffaRipetizione.toFixed(0)}`;

    const noteView = document.getElementById(`tariffa-note-view-${docenteId}`);
    noteView.textContent = noteTariffa || "Nessuna nota";
    noteView.className = `tariffa-note-text ${noteTariffa ? '' : 'vuota'}`;

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

  card.innerHTML = `
    <div class="credenziali-header">
      <span>Docente</span>
      <span>Username</span>
      <span>Password</span>
      <span style="text-align:right;">Azioni</span>
    </div>
  `;

  docenti.forEach(docente => {
    const iniziali = (docente.nome?.charAt(0) || "") + (docente.cognome?.charAt(0) || "");
    const nomeCompleto = `${docente.nome || ""} ${docente.cognome || ""}`.trim();
    const username = docente.username || "";
    const password = docente.password || "";

    const riga = document.createElement("div");
    riga.className = "credenziali-riga";
    riga.id = `cred-riga-${docente.id}`;

    riga.innerHTML = `
      <div class="credenziali-docente">
        <div class="credenziali-avatar">${iniziali.toUpperCase()}</div>
        <div class="credenziali-nome">${nomeCompleto}</div>
      </div>

      <div class="credenziali-campo" id="cred-user-view-${docente.id}">${username || "—"}</div>
      <div id="cred-user-edit-${docente.id}" style="display:none;">
        <input type="text" class="credenziali-input" id="cred-user-input-${docente.id}" value="${username}" placeholder="Username">
      </div>

      <div class="credenziali-password" id="cred-pass-view-${docente.id}">
        <span class="credenziali-password-text" id="cred-pass-text-${docente.id}">••••••••</span>
        <button class="btn-toggle-password" onclick="togglePassword('${docente.id}')" title="Mostra/nascondi password">
          👁️
        </button>
      </div>
      <div id="cred-pass-edit-${docente.id}" style="display:none;">
        <input type="text" class="credenziali-input" id="cred-pass-input-${docente.id}" value="${password}" placeholder="Password">
      </div>

      <div class="credenziali-azioni" id="cred-azioni-view-${docente.id}">
        <button class="btn-cred btn-cred-modifica" onclick="editCredenziali('${docente.id}')">✏️ Modifica</button>
      </div>
      <div class="credenziali-azioni" id="cred-azioni-edit-${docente.id}" style="display:none;">
        <button class="btn-cred btn-cred-annulla" onclick="annullaCredenziali('${docente.id}')">Annulla</button>
        <button class="btn-cred btn-cred-salva" id="cred-btn-salva-${docente.id}" onclick="salvaCredenziali('${docente.id}')">💾 Salva</button>
      </div>
    `;

    riga.dataset.password = password;
    card.appendChild(riga);
  });

  container.appendChild(card);
}

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

function editCredenziali(docenteId) {
  document.getElementById(`cred-user-view-${docenteId}`).style.display = "none";
  document.getElementById(`cred-pass-view-${docenteId}`).style.display = "none";
  document.getElementById(`cred-azioni-view-${docenteId}`).style.display = "none";

  document.getElementById(`cred-user-edit-${docenteId}`).style.display = "block";
  document.getElementById(`cred-pass-edit-${docenteId}`).style.display = "block";
  document.getElementById(`cred-azioni-edit-${docenteId}`).style.display = "flex";
}

function annullaCredenziali(docenteId) {
  document.getElementById(`cred-user-view-${docenteId}`).style.display = "block";
  document.getElementById(`cred-pass-view-${docenteId}`).style.display = "flex";
  document.getElementById(`cred-azioni-view-${docenteId}`).style.display = "flex";

  document.getElementById(`cred-user-edit-${docenteId}`).style.display = "none";
  document.getElementById(`cred-pass-edit-${docenteId}`).style.display = "none";
  document.getElementById(`cred-azioni-edit-${docenteId}`).style.display = "none";
}

async function salvaCredenziali(docenteId) {
  const btnSalva = document.getElementById(`cred-btn-salva-${docenteId}`);
  btnSalva.disabled = true;
  btnSalva.textContent = "⏳ ...";

  try {
    const nuovoUsername = document.getElementById(`cred-user-input-${docenteId}`).value.trim();
    const nuovaPassword = document.getElementById(`cred-pass-input-${docenteId}`).value.trim();

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

    await db.collection("docenti").doc(docenteId).update({
      username: nuovoUsername,
      password: nuovaPassword
    });

    document.getElementById(`cred-user-view-${docenteId}`).textContent = nuovoUsername;
    const riga = document.getElementById(`cred-riga-${docenteId}`);
    riga.dataset.password = nuovaPassword;
    document.getElementById(`cred-pass-text-${docenteId}`).textContent = "••••••••";

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

function mostraToast(messaggio, tipo) {
  const toast = document.getElementById("toast");
  toast.textContent = messaggio;
  toast.className = `toast toast-${tipo} visibile`;

  setTimeout(() => {
    toast.classList.remove("visibile");
  }, 3000);
}
