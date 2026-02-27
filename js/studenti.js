// ============================================================
// studenti.js — CRUD Anagrafica Studenti
// ============================================================
// Gestisce: lista, ricerca, filtro per classe, creazione,
// modifica, eliminazione studenti. Firestore collection: "studenti"
// ============================================================

// ── Stato ──
let studentiLista = [];
let classiLista = [];
let editingId = null;     // null = nuovo, string = modifica
let deletingId = null;    // id studente da eliminare

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  checkAuth();
  checkAdmin();
  initPage("Anagrafica Studenti");

  // Carica classi per i filtri e i dropdown
  await caricaClassi();

  // Carica studenti
  await caricaStudenti();

  // Event listeners
  document.getElementById("searchInput").addEventListener("input", filtraERendi);
  document.getElementById("filterClasse").addEventListener("change", filtraERendi);
});

// ══════════════════════════════════════════════
// CARICA CLASSI (per dropdown e filtri)
// ══════════════════════════════════════════════
async function caricaClassi() {
  try {
    const snapshot = await db.collection("classi").orderBy("nome").get();
    classiLista = [];
    snapshot.forEach(doc => {
      classiLista.push({ id: doc.id, ...doc.data() });
    });

    // Popola filtro
    const filterSelect = document.getElementById("filterClasse");
    filterSelect.innerHTML = '<option value="">Tutte le classi</option>';
    classiLista.forEach(c => {
      filterSelect.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
    });

    // Popola dropdown nel modal
    const modalSelect = document.getElementById("sClasse");
    modalSelect.innerHTML = '<option value="">— Nessuna classe —</option>';
    classiLista.forEach(c => {
      modalSelect.innerHTML += `<option value="${c.nome}">${c.nome}</option>`;
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
  // Totale studenti
  document.getElementById("stat-totale").textContent = studentiLista.length;

  // Classi attive (classi che hanno almeno 1 studente)
  const classiAttive = new Set(studentiLista.filter(s => s.classe).map(s => s.classe));
  document.getElementById("stat-classi").textContent = classiAttive.size;

  // Studenti minorenni
  const oggi = new Date();
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

  // Filtro per classe
  if (classeFilter) {
    filtrati = filtrati.filter(s => s.classe === classeFilter);
  }

  // Filtro per testo (nome, cognome, email)
  if (query) {
    filtrati = filtrati.filter(s => {
      const nomeCompleto = `${s.nome} ${s.cognome}`.toLowerCase();
      const email = (s.email || "").toLowerCase();
      const telefono = (s.telefono || "").toLowerCase();
      return nomeCompleto.includes(query) || email.includes(query) || telefono.includes(query);
    });
  }

  renderTabella(filtrati);
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

    // Contatti studente
    let contatti = "";
    if (s.telefono) contatti += `📞 <a href="tel:${s.telefono}">${s.telefono}</a><br>`;
    if (s.email) contatti += `✉️ <a href="mailto:${s.email}">${s.email}</a>`;
    if (!contatti) contatti = '<span style="color:var(--text-muted)">—</span>';

    // Contatti genitore
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
          ${s.classe
            ? `<span class="badge-classe-table">${s.classe}</span>`
            : '<span style="color:var(--text-muted)">Non assegnata</span>'
          }
        </td>
        <td class="contatto-cell">${contatti}</td>
        <td class="contatto-cell" style="font-size:12.5px;">${genitore}</td>
        <td>
          <div class="azioni-cell" style="justify-content:center;">
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

  // Reset campi
  ["sNome", "sCognome", "sDataNascita", "sTelefono", "sEmail", "sNote",
   "gNome", "gCognome", "gTelefono", "gEmail"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("sClasse").value = "";

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

  // Popola campi studente
  document.getElementById("sNome").value = studente.nome || "";
  document.getElementById("sCognome").value = studente.cognome || "";
  document.getElementById("sDataNascita").value = studente.dataNascita || "";
  document.getElementById("sClasse").value = studente.classe || "";
  document.getElementById("sTelefono").value = studente.telefono || "";
  document.getElementById("sEmail").value = studente.email || "";
  document.getElementById("sNote").value = studente.note || "";

  // Popola campi genitore
  const g = studente.genitore || {};
  document.getElementById("gNome").value = g.nome || "";
  document.getElementById("gCognome").value = g.cognome || "";
  document.getElementById("gTelefono").value = g.telefono || "";
  document.getElementById("gEmail").value = g.email || "";

  document.getElementById("modalStudente").classList.add("active");
}

// ══════════════════════════════════════════════
// CHIUDI MODAL
// ══════════════════════════════════════════════
function chiudiModal() {
  document.getElementById("modalStudente").classList.remove("active");
  editingId = null;
}

// ══════════════════════════════════════════════
// SALVA STUDENTE (crea o aggiorna)
// ══════════════════════════════════════════════
async function salvaStudente() {
  const nome = document.getElementById("sNome").value.trim();
  const cognome = document.getElementById("sCognome").value.trim();

  // Validazione minima
  if (!nome || !cognome) {
    alert("Nome e Cognome sono obbligatori.");
    return;
  }

  const btnSalva = document.getElementById("btnSalva");
  btnSalva.disabled = true;
  btnSalva.textContent = "Salvataggio...";

  const dati = {
    nome: nome,
    cognome: cognome,
    dataNascita: document.getElementById("sDataNascita").value || "",
    classe: document.getElementById("sClasse").value || "",
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

  try {
    if (editingId) {
      // Aggiorna
      await db.collection("studenti").doc(editingId).update(dati);
      console.log("✅ Studente aggiornato:", editingId);
    } else {
      // Crea nuovo
      dati.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await db.collection("studenti").add(dati);
      console.log("✅ Studente creato:", ref.id);
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
// MODAL: ELIMINA STUDENTE
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
    console.log("🗑️ Studente eliminato:", deletingId);

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
// UTILITY: Calcola età
// ══════════════════════════════════════════════
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
