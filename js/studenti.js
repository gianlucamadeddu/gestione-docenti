// ============================================================
// studenti.js — CRUD Anagrafica Studenti + Email
// ============================================================
// Gestisce: lista, ricerca, filtro per classe, creazione,
// modifica, eliminazione studenti, invio email.
// Firestore collection: "studenti"
// ============================================================

// ── Stato ──
let studentiLista = [];
let classiLista = [];
let editingId = null;
let deletingId = null;
let studentiFiltrati = [];

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  checkAuth();
  checkAdmin();
  initPage("Anagrafica Studenti");

  await caricaClassi();
  await caricaStudenti();
  await EmailModule.init();

  document.getElementById("searchInput").addEventListener("input", filtraERendi);
  document.getElementById("filterClasse").addEventListener("change", filtraERendi);
});

// ══════════════════════════════════════════════
// CARICA CLASSI
// ══════════════════════════════════════════════
async function caricaClassi() {
  try {
    const snapshot = await db.collection("classi").orderBy("nome").get();
    classiLista = [];
    snapshot.forEach(doc => {
      classiLista.push({ id: doc.id, ...doc.data() });
    });

    const filterSelect = document.getElementById("filterClasse");
    filterSelect.innerHTML = '<option value="">Tutte le classi</option>';
    classiLista.forEach(c => {
      filterSelect.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });

    // Popola tutti e 4 i dropdown classe nel modal
    ["sClasse", "sClasse2", "sClasse3", "sClasse4"].forEach((id, idx) => {
      const sel = document.getElementById(id);
      sel.innerHTML = idx === 0
        ? '<option value="">— Nessuna classe —</option>'
        : '<option value="">— Nessuna —</option>';
      classiLista.forEach(c => {
        sel.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
      });
    });
  } catch (err) {
    console.error("Errore caricamento classi:", err);
  }
}

// ══════════════════════════════════════════════
// CARICA STUDENTI
// ══════════════════════════════════════════════
async function caricaStudenti() {
  try {
    const snapshot = await db.collection("studenti").orderBy("cognome").get();
    studentiLista = [];
    snapshot.forEach(doc => {
      studentiLista.push({ id: doc.id, ...doc.data() });
    });

    aggiornaStats();
    filtraERendi();
  } catch (err) {
    console.error("Errore caricamento studenti:", err);
    document.getElementById("studentiBody").innerHTML = `
      <tr><td colspan="5" class="text-center" style="padding:40px;color:var(--danger);">
        Errore nel caricamento dei dati.
      </td></tr>`;
  }
}

// ══════════════════════════════════════════════
// AGGIORNA STATISTICHE
// ══════════════════════════════════════════════
function aggiornaStats() {
  document.getElementById("stat-totale").textContent = studentiLista.length;

  // Classi attive (tutte le classi assegnate a qualsiasi studente)
  const classiAttive = new Set();
  studentiLista.forEach(s => {
    getClassiStudente(s).forEach(c => classiAttive.add(c));
  });
  document.getElementById("stat-classi").textContent = classiAttive.size;

  const minorenni = studentiLista.filter(s => {
    if (!s.dataNascita) return false;
    return calcolaEta(s.dataNascita) < 18;
  }).length;
  document.getElementById("stat-minorenni").textContent = minorenni;
}

// ══════════════════════════════════════════════
// FILTRA E RENDERIZZA
// ══════════════════════════════════════════════
function filtraERendi() {
  const query = document.getElementById("searchInput").value.toLowerCase().trim();
  const classeFilter = document.getElementById("filterClasse").value;

  let filtrati = studentiLista;

  if (classeFilter) {
    filtrati = filtrati.filter(s => getClassiStudente(s).includes(classeFilter));
  }

  if (query) {
    filtrati = filtrati.filter(s => {
      const nomeCompleto = `${s.nome} ${s.cognome}`.toLowerCase();
      const email = (s.email || "").toLowerCase();
      const telefono = (s.telefono || "").toLowerCase();
      return nomeCompleto.includes(query) || email.includes(query) || telefono.includes(query);
    });
  }

  studentiFiltrati = filtrati;
  aggiornaBottoneEmail();
  renderTabella(filtrati);
}

// ══════════════════════════════════════════════
// BOTTONE EMAIL
// ══════════════════════════════════════════════
function aggiornaBottoneEmail() {
  const btn = document.getElementById("btnInviaEmail");
  if (!btn) return;

  const conEmail = studentiFiltrati.filter(s => s.email && s.email.trim()).length;
  if (conEmail > 0) {
    btn.style.display = "";
    btn.innerHTML = `📧 Invia Email (${conEmail})`;
  } else {
    btn.style.display = "none";
  }
}

// ══════════════════════════════════════════════
// INVIA EMAIL AI FILTRATI
// ══════════════════════════════════════════════
function inviaEmailFiltrati() {
  const destinatari = studentiFiltrati
    .filter(s => s.email && s.email.trim())
    .map(s => ({
      nome: s.nome,
      cognome: s.cognome,
      email: s.email,
      classe: s.classe || ""
    }));

  if (destinatari.length === 0) {
    alert("Nessuno studente con email tra quelli filtrati.");
    return;
  }

  const classeFilter = document.getElementById("filterClasse").value;
  const vars = {};
  if (classeFilter) vars.classe = classeFilter;

  EmailModule.apriComponi(destinatari, vars);
}

// ══════════════════════════════════════════════
// INVIA EMAIL A SINGOLO STUDENTE
// ══════════════════════════════════════════════
function inviaEmailSingolo(id) {
  const studente = studentiLista.find(s => s.id === id);
  if (!studente || !studente.email) {
    alert("Questo studente non ha un'email registrata.");
    return;
  }

  const destinatari = [{
    nome: studente.nome,
    cognome: studente.cognome,
    email: studente.email,
    classe: studente.classe || ""
  }];

  const vars = {
    nome: studente.nome,
    cognome: studente.cognome,
    classe: studente.classe || ""
  };

  EmailModule.apriComponi(destinatari, vars);
}

// ══════════════════════════════════════════════
// RENDER TABELLA
// ══════════════════════════════════════════════
function renderTabella(studenti) {
  const tbody = document.getElementById("studentiBody");
  const countEl = document.getElementById("tableCount");

  if (studenti.length === 0) {
    tbody.innerHTML = `
      <tr><td colspan="5">
        <div class="empty-state">
          <div class="empty-state-icon">🎓</div>
          <p class="empty-state-text">Nessuno studente trovato</p>
        </div>
      </td></tr>`;
    countEl.textContent = "0 studenti";
    return;
  }

  countEl.textContent = `${studenti.length} student${studenti.length === 1 ? "e" : "i"} ${
    studenti.length !== studentiLista.length ? `su ${studentiLista.length} totali` : ""
  }`;

  tbody.innerHTML = studenti.map(s => {
    const iniziali = `${(s.nome || "?")[0]}${(s.cognome || "?")[0]}`.toUpperCase();
    const eta = s.dataNascita ? calcolaEta(s.dataNascita) : null;
    const isMinore = eta !== null && eta < 18;

    let contatti = "";
    if (s.telefono) contatti += `📞 <a href="tel:${s.telefono}">${s.telefono}</a><br>`;
    if (s.email) contatti += `✉️ <a href="mailto:${s.email}">${s.email}</a>`;
    if (!contatti) contatti = '<span style="color:var(--text-muted)">—</span>';

    let genitore = "";
    if (s.genitore && (s.genitore.nome || s.genitore.cognome)) {
      genitore += `<strong>${s.genitore.nome || ""} ${s.genitore.cognome || ""}</strong><br>`;
      if (s.genitore.telefono) genitore += `📞 <a href="tel:${s.genitore.telefono}">${s.genitore.telefono}</a><br>`;
      if (s.genitore.email) genitore += `✉️ <a href="mailto:${s.genitore.email}">${s.genitore.email}</a>`;
    } else {
      genitore = '<span style="color:var(--text-muted)">—</span>';
    }

    return `
      <tr>
        <td>
          <div class="studente-nome-cell">
            <div class="studente-avatar ${isMinore ? 'minore' : ''}">${iniziali}</div>
            <div class="studente-nome-text">
              <strong>${s.cognome} ${s.nome}</strong>
              <small>${eta !== null ? `${eta} anni` : ""}${isMinore ? ' · Minorenne' : ''}</small>
            </div>
          </div>
        </td>
        <td>
          ${(() => {
            const classi = getClassiStudente(s);
            if (classi.length === 0) return '<span style="color:var(--text-muted)">Non assegnata</span>';
            return classi.map(c => `<span class="badge-classe-table">${c}</span>`).join(" ");
          })()}
        </td>
        <td class="contatto-cell">${contatti}</td>
        <td class="contatto-cell" style="font-size:12.5px;">${genitore}</td>
        <td>
          <div class="azioni-cell" style="justify-content:center;">
            ${s.email ? `<button class="btn-action" title="Invia email" onclick="inviaEmailSingolo('${s.id}')" style="color:#1565C0;">📧</button>` : ""}
            <button class="btn-action edit" title="Modifica" onclick="apriModalModifica('${s.id}')">✏️</button>
            <button class="btn-action delete" title="Elimina" onclick="apriModalElimina('${s.id}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// ══════════════════════════════════════════════
// MODAL: NUOVO STUDENTE
// ══════════════════════════════════════════════
function apriModalNuovo() {
  editingId = null;
  document.getElementById("modalTitolo").textContent = "Nuovo Studente";
  document.getElementById("btnSalva").textContent = "Salva Studente";

  ["sNome", "sCognome", "sDataNascita", "sTelefono", "sEmail", "sNote",
   "gNome", "gCognome", "gTelefono", "gEmail"].forEach(id => {
    document.getElementById(id).value = "";
  });
  ["sClasse", "sClasse2", "sClasse3", "sClasse4"].forEach(id => {
    document.getElementById(id).value = "";
  });

  document.getElementById("modalStudente").classList.add("active");
}

// ══════════════════════════════════════════════
// MODAL: MODIFICA STUDENTE
// ══════════════════════════════════════════════
function apriModalModifica(id) {
  const studente = studentiLista.find(s => s.id === id);
  if (!studente) return;

  editingId = id;
  document.getElementById("modalTitolo").textContent = "Modifica Studente";
  document.getElementById("btnSalva").textContent = "Salva Modifiche";

  document.getElementById("sNome").value = studente.nome || "";
  document.getElementById("sCognome").value = studente.cognome || "";
  document.getElementById("sDataNascita").value = studente.dataNascita || "";
  document.getElementById("sClasse").value = studente.classe || "";
  document.getElementById("sClasse2").value = studente.classe2 || "";
  document.getElementById("sClasse3").value = studente.classe3 || "";
  document.getElementById("sClasse4").value = studente.classe4 || "";
  document.getElementById("sTelefono").value = studente.telefono || "";
  document.getElementById("sEmail").value = studente.email || "";
  document.getElementById("sNote").value = studente.note || "";

  const g = studente.genitore || {};
  document.getElementById("gNome").value = g.nome || "";
  document.getElementById("gCognome").value = g.cognome || "";
  document.getElementById("gTelefono").value = g.telefono || "";
  document.getElementById("gEmail").value = g.email || "";

  document.getElementById("modalStudente").classList.add("active");
}

function chiudiModal() {
  document.getElementById("modalStudente").classList.remove("active");
  editingId = null;
}

// ══════════════════════════════════════════════
// SALVA STUDENTE
// ══════════════════════════════════════════════
async function salvaStudente() {
  const nome = document.getElementById("sNome").value.trim();
  const cognome = document.getElementById("sCognome").value.trim();

  if (!nome || !cognome) {
    alert("Nome e Cognome sono obbligatori.");
    return;
  }

  const btnSalva = document.getElementById("btnSalva");
  btnSalva.disabled = true;
  btnSalva.textContent = "Salvataggio...";

  const dati = {
    nome, cognome,
    dataNascita: document.getElementById("sDataNascita").value || "",
    classe: document.getElementById("sClasse").value || "",
    classe2: document.getElementById("sClasse2").value || "",
    classe3: document.getElementById("sClasse3").value || "",
    classe4: document.getElementById("sClasse4").value || "",
    telefono: document.getElementById("sTelefono").value.trim() || "",
    email: document.getElementById("sEmail").value.trim() || "",
    note: document.getElementById("sNote").value.trim() || "",
    genitore: {
      nome: document.getElementById("gNome").value.trim() || "",
      cognome: document.getElementById("gCognome").value.trim() || "",
      telefono: document.getElementById("gTelefono").value.trim() || "",
      email: document.getElementById("gEmail").value.trim() || "",
    }
  };

  // Costruisci array classi (per query efficienti)
  dati.classi = [dati.classe, dati.classe2, dati.classe3, dati.classe4].filter(c => c);

  try {
    if (editingId) {
      await db.collection("studenti").doc(editingId).update(dati);
    } else {
      dati.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("studenti").add(dati);
    }
    chiudiModal();
    await caricaStudenti();
  } catch (err) {
    console.error("Errore salvataggio studente:", err);
    alert("Errore durante il salvataggio. Riprova.");
  }

  btnSalva.disabled = false;
  btnSalva.textContent = editingId ? "Salva Modifiche" : "Salva Studente";
}

// ══════════════════════════════════════════════
// ELIMINA STUDENTE
// ══════════════════════════════════════════════
function apriModalElimina(id) {
  const studente = studentiLista.find(s => s.id === id);
  if (!studente) return;

  deletingId = id;
  document.getElementById("eliminaText").innerHTML = `
    Sei sicuro di voler eliminare lo studente
    <strong>${studente.cognome} ${studente.nome}</strong>?<br>
    L'operazione è irreversibile.
  `;
  document.getElementById("modalElimina").classList.add("active");
}

function chiudiModalElimina() {
  document.getElementById("modalElimina").classList.remove("active");
  deletingId = null;
}

async function confermaElimina() {
  if (!deletingId) return;

  const btn = document.getElementById("btnConfermaElimina");
  btn.disabled = true;
  btn.textContent = "Eliminazione...";

  try {
    await db.collection("studenti").doc(deletingId).delete();
    chiudiModalElimina();
    await caricaStudenti();
  } catch (err) {
    console.error("Errore eliminazione studente:", err);
    alert("Errore durante l'eliminazione. Riprova.");
  }

  btn.disabled = false;
  btn.textContent = "Elimina";
}

// ══════════════════════════════════════════════
// UTILITY
// ══════════════════════════════════════════════

/**
 * Restituisce array di tutte le classi assegnate a uno studente
 * Compatibile sia con vecchi dati (solo campo classe) sia con nuovi (classe + classe2/3/4 + classi)
 */
function getClassiStudente(s) {
  // Se esiste l'array classi, usalo (ma filtra vuoti)
  if (s.classi && Array.isArray(s.classi) && s.classi.length > 0) {
    return s.classi.filter(c => c);
  }
  // Fallback: costruisci da campi singoli
  return [s.classe, s.classe2, s.classe3, s.classe4].filter(c => c);
}

function calcolaEta(dataNascitaStr) {
  if (!dataNascitaStr) return null;
  const nascita = new Date(dataNascitaStr);
  const oggi = new Date();
  let eta = oggi.getFullYear() - nascita.getFullYear();
  const meseOggi = oggi.getMonth();
  const meseNascita = nascita.getMonth();
  if (meseOggi < meseNascita || (meseOggi === meseNascita && oggi.getDate() < nascita.getDate())) {
    eta--;
  }
  return eta;
}
