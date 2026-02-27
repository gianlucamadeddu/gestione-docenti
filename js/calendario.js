// ============================================================
// calendario.js — Orario Scolastico v3.0
// ============================================================
// NOVITÀ v3.0:
// - Griglia unificata mattina + pomeriggio (con separatore visivo)
// - Ripetizioni integrate nella stessa griglia (colore arancione)
// - Navigazione settimanale per le ripetizioni
// - Vista Aula mostra occupazione completa (lezioni + ripetizioni)
// - Modal scelta: aggiungi Lezione o Ripetizione
// - CRUD ripetizioni direttamente dal calendario
// - Elenco studenti considera anche classi dalle ripetizioni
//
// Dipende da: utils.js (GIORNI, calcolaImpostazioniOrari,
//   calcolaFasceOrarie, calcolaFasceUnificate, trovaSlotPerOra,
//   calcolaSettimanaDate, giornoFromData, timeToMinutes, minutesToTime)
// ============================================================

// ── Stato globale ──
let isAdmin = false;
let isDocente = false;
let currentDocenteId = null;
let impostazioniOrari = {};
let fascePerGiorno = {};           // giorno → { mattina, pomeriggio, tutte, numMattina, numPomeriggio }
let maxFasceTotali = 0;            // max(mattina+pomeriggio) tra tutti i giorni
let maxFasceMattina = 0;
let maxFascePomeriggio = 0;
let lezioniCorrente = [];          // lezioni da orarioScolastico
let ripetizioniCorrente = [];      // ripetizioni da collezione ripetizioni (per la settimana corrente)
let docentiLista = [];
let auleLista = [];
let classiLista = [];

// ── Vista corrente (solo admin) ──
let vistaCorrente = "docente";
let entitaSelezionata = "";

// ── Panorama Aule ──
let panoramaGiorno = "";            // Giorno corrente nel panorama
let panoramaLezioni = [];           // TUTTE le lezioni (senza filtro)
let panoramaRipetizioni = [];       // TUTTE le ripetizioni della settimana

// ── Navigazione settimanale ──
let weekOffset = 0;
let settimanaDate = [];            // 5 stringhe "YYYY-MM-DD" (lun→ven)

// ── Modalità modal ──
let modalMode = "add";
let modalTipo = "lezione";         // "lezione" | "ripetizione"
let editingLezioneId = null;
let editingRipetizioneId = null;

// ── Riferimenti DOM ──
let orarioContainer;

// ── Mappa docenti per nome veloce ──
let mappaDocenti = {};

// ============================================================
// INIZIALIZZAZIONE
// ============================================================

document.addEventListener("DOMContentLoaded", async () => {
  checkAuth();

  const ruolo = getRole();
  isAdmin = ruolo === "admin";
  isDocente = ruolo === "docente";

  const pagina = window.location.pathname.split("/").pop();

  if (pagina === "calendario.html" && !isAdmin) {
    window.location.href = "mio-orario.html";
    return;
  }
  if (pagina === "mio-orario.html" && isAdmin) {
    window.location.href = "calendario.html";
    return;
  }

  if (isAdmin) {
    initPage("Orario Scolastico");
  } else {
    initPage("Il Mio Orario");
    const nomeDisplay = document.getElementById("docente-nome-display");
    if (nomeDisplay) {
      nomeDisplay.textContent = getDocenteNome() || "Docente";
    }
  }

  orarioContainer = document.getElementById("orario-container");

  // 1. Carica impostazioni orari
  try {
    impostazioniOrari = await caricaImpostazioniOrari();
  } catch (err) {
    console.error("Errore caricamento impostazioni:", err);
  }

  // 2. Calcola fasce unificate per ogni giorno
  maxFasceMattina = 0;
  maxFascePomeriggio = 0;
  maxFasceTotali = 0;

  GIORNI.forEach(giorno => {
    const imp = impostazioniOrari[giorno];
    const result = calcolaFasceUnificate(imp);
    fascePerGiorno[giorno] = result;
    if (result.numMattina > maxFasceMattina) maxFasceMattina = result.numMattina;
    if (result.numPomeriggio > maxFascePomeriggio) maxFascePomeriggio = result.numPomeriggio;
    const tot = result.numMattina + result.numPomeriggio;
    if (tot > maxFasceTotali) maxFasceTotali = tot;
  });

  if (maxFasceMattina === 0 && maxFascePomeriggio === 0) {
    mostraEmpty("Nessuna impostazione orari trovata. Configura gli orari dalla pagina Impostazioni.");
    return;
  }

  // 3. Calcola settimana corrente
  settimanaDate = calcolaSettimanaDate(weekOffset);

  // 4. Init per ruolo
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
  const btnStudenti = document.getElementById("btn-elenco-studenti");

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

  // Mappa docenti
  mappaDocenti = {};
  docentiLista.forEach(d => {
    mappaDocenti[d.id] = `${d.cognome} ${d.nome}`;
  });

  // Popola dropdown iniziale
  popolaDropdownEntita();

  // Evento cambio entità
  selectEntita.addEventListener("change", async () => {
    entitaSelezionata = selectEntita.value;
    btnAggiungi.disabled = !entitaSelezionata;

    if (entitaSelezionata) {
      if (vistaCorrente === "docente") {
        currentDocenteId = entitaSelezionata;
      }
      await caricaEmostraOrario();
      aggiornaBottoneStudenti();
    } else {
      if (btnStudenti) btnStudenti.style.display = "none";
      mostraEmptyPerVista();
    }
  });

  // Bottone aggiungi → apri scelta tipo
  btnAggiungi.addEventListener("click", () => {
    if (isPanoramaView()) {
      apriSceltaTipo();
      return;
    }
    if (!entitaSelezionata) return;
    if (vistaCorrente === "docente") currentDocenteId = entitaSelezionata;
    apriSceltaTipo();
  });

  // Setup week navigation
  setupWeekNav();

  // Setup modal
  setupModal();

  // Carica template email
  if (typeof EmailModule !== "undefined") {
    await EmailModule.init();
  }

  // Aggiorna label settimana e mostra stato iniziale
  aggiornaLabelSettimana();
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

  // Carica docenti per mappa nomi (serve per vista)
  try {
    const docSnap = await db.collection("docenti").orderBy("cognome").get();
    docentiLista = [];
    docSnap.forEach(doc => {
      docentiLista.push({ id: doc.id, ...doc.data() });
    });
    mappaDocenti = {};
    docentiLista.forEach(d => {
      mappaDocenti[d.id] = `${d.cognome} ${d.nome}`;
    });
  } catch (err) {
    console.error("Errore caricamento docenti:", err);
  }

  // Setup week navigation
  setupWeekNav();
  aggiornaLabelSettimana();

  await caricaEmostraOrario();

  if (typeof EmailModule !== "undefined") {
    await EmailModule.init();
  }

  aggiornaBottoneStudenti();
}

// ============================================================
// NAVIGAZIONE SETTIMANALE
// ============================================================

function setupWeekNav() {
  const btnPrev = document.getElementById("btn-prev-week");
  const btnOggi = document.getElementById("btn-oggi-week");
  const btnNext = document.getElementById("btn-next-week");

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      weekOffset--;
      settimanaDate = calcolaSettimanaDate(weekOffset);
      aggiornaLabelSettimana();
      if (vistaCorrente === "panorama") caricaPanorama();
      else if (vistaCorrente === "panorama_cal") caricaPanoramaCal();
      else if (entitaSelezionata || isDocente) caricaEmostraOrario();
    });
  }
  if (btnOggi) {
    btnOggi.addEventListener("click", () => {
      weekOffset = 0;
      settimanaDate = calcolaSettimanaDate(weekOffset);
      aggiornaLabelSettimana();
      if (vistaCorrente === "panorama") caricaPanorama();
      else if (vistaCorrente === "panorama_cal") caricaPanoramaCal();
      else if (entitaSelezionata || isDocente) caricaEmostraOrario();
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      weekOffset++;
      settimanaDate = calcolaSettimanaDate(weekOffset);
      aggiornaLabelSettimana();
      if (vistaCorrente === "panorama") caricaPanorama();
      else if (vistaCorrente === "panorama_cal") caricaPanoramaCal();
      else if (entitaSelezionata || isDocente) caricaEmostraOrario();
    });
  }
}

function aggiornaLabelSettimana() {
  const label = document.getElementById("label-settimana");
  if (!label || settimanaDate.length < 5) return;

  const dLun = new Date(settimanaDate[0] + "T00:00:00");
  const dVen = new Date(settimanaDate[4] + "T00:00:00");

  let testo = dLun.getDate() + " " + MESI_BREVI[dLun.getMonth()];
  if (dLun.getMonth() !== dVen.getMonth()) {
    testo += " – " + dVen.getDate() + " " + MESI_BREVI[dVen.getMonth()];
  } else {
    testo += " – " + dVen.getDate();
  }
  testo += " " + dVen.getFullYear();
  label.textContent = testo;
}

// ============================================================
// CAMBIO VISTA (Docente / Aula / Classe)
// ============================================================

function cambiaVista(nuovaVista) {
  if (nuovaVista === vistaCorrente) return;

  vistaCorrente = nuovaVista;
  entitaSelezionata = "";

  document.querySelectorAll(".vista-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.vista === nuovaVista);
  });

  const selectEntita = document.getElementById("select-entita");
  const btnAggiungi = document.getElementById("btn-aggiungi");
  const btnStudenti = document.getElementById("btn-elenco-studenti");
  const dayTabs = document.getElementById("day-tabs");

  if (nuovaVista === "panorama") {
    // Panorama Aule: nascondi dropdown, mostra tabs giorno
    if (selectEntita) selectEntita.style.display = "none";
    if (btnAggiungi) { btnAggiungi.disabled = false; btnAggiungi.textContent = "➕ Aggiungi"; }
    if (btnStudenti) btnStudenti.style.display = "none";
    if (dayTabs) dayTabs.style.display = "flex";

    // Imposta giorno iniziale = oggi o lunedì
    const oggi = new Date();
    const dow = oggi.getDay(); // 0=dom, 1=lun, ...
    const giornoOggi = dow >= 1 && dow <= 5 ? GIORNI[dow - 1] : GIORNI[0];
    panoramaGiorno = giornoOggi;

    caricaPanorama();
  } else if (nuovaVista === "panorama_cal") {
    // Panorama Calendario: nascondi dropdown e day tabs, mostra tutto settimanale
    if (selectEntita) selectEntita.style.display = "none";
    if (btnAggiungi) { btnAggiungi.disabled = false; btnAggiungi.textContent = "➕ Aggiungi"; }
    if (btnStudenti) btnStudenti.style.display = "none";
    if (dayTabs) dayTabs.style.display = "none";

    caricaPanoramaCal();
  } else {
    // Viste normali: mostra dropdown, nascondi day tabs
    if (selectEntita) selectEntita.style.display = "";
    if (dayTabs) dayTabs.style.display = "none";

    if (btnAggiungi) {
      btnAggiungi.disabled = true;
      btnAggiungi.textContent = "➕ Aggiungi";
    }

    if (btnStudenti) btnStudenti.style.display = "none";

    popolaDropdownEntita();
    mostraEmptyPerVista();
  }
}

// ============================================================
// PANORAMA AULE: Day tabs + Load + Render
// ============================================================

function aggiornaTabsGiorno() {
  const container = document.getElementById("day-tabs");
  if (!container) return;
  container.innerHTML = "";

  GIORNI.forEach((g, idx) => {
    const btn = document.createElement("button");
    btn.className = "day-tab" + (g === panoramaGiorno ? " active" : "");
    const dataStr = settimanaDate[idx];
    const dataObj = dataStr ? new Date(dataStr + "T00:00:00") : null;
    const numGiorno = dataObj ? dataObj.getDate() : "";
    btn.innerHTML = `<span class="day-tab-nome">${g.substring(0, 3)}</span><span class="day-tab-num">${numGiorno}</span>`;
    btn.onclick = () => {
      panoramaGiorno = g;
      aggiornaTabsGiorno();
      renderTabellaPanorama();
    };
    container.appendChild(btn);
  });
}

async function caricaPanorama() {
  orarioContainer.innerHTML = `
    <div class="orario-loading">
      <div class="loading-spinner"></div>
      <p>Caricamento panorama aule…</p>
    </div>
  `;

  try {
    // Carica TUTTE le lezioni (senza filtro)
    const snapLezioni = await db.collection("orarioScolastico").get();
    panoramaLezioni = [];
    snapLezioni.forEach(doc => { panoramaLezioni.push({ id: doc.id, ...doc.data() }); });

    // Carica TUTTE le ripetizioni della settimana
    panoramaRipetizioni = [];
    if (settimanaDate.length === 5) {
      const snapRip = await db.collection("ripetizioni")
        .where("data", ">=", settimanaDate[0])
        .where("data", "<=", settimanaDate[4])
        .get();
      snapRip.forEach(doc => { panoramaRipetizioni.push({ id: doc.id, ...doc.data() }); });
    }

    aggiornaTabsGiorno();
    renderTabellaPanorama();

  } catch (err) {
    console.error("Errore caricamento panorama:", err);
    orarioContainer.innerHTML = `<div class="orario-empty"><div class="empty-icon">⚠️</div><p>Errore nel caricamento. Riprova.</p></div>`;
  }
}

function renderTabellaPanorama() {
  const giorno = panoramaGiorno;
  const fpg = fascePerGiorno[giorno];
  if (!fpg) {
    orarioContainer.innerHTML = `<div class="orario-empty"><p>Nessuna fascia configurata per ${giorno}.</p></div>`;
    return;
  }

  const aule = auleLista.map(a => a.nome);
  if (aule.length === 0) {
    orarioContainer.innerHTML = `<div class="orario-empty"><div class="empty-icon">🏫</div><p>Nessuna aula presente. Aggiungile da ⚙️ Gestisci.</p></div>`;
    return;
  }

  // Data del giorno selezionato
  const idxGiorno = GIORNI.indexOf(giorno);
  const dataGiorno = (idxGiorno >= 0 && settimanaDate.length > idxGiorno) ? settimanaDate[idxGiorno] : null;

  // Mappa "slot-aula" → [items]
  const mappa = {};

  // Lezioni del giorno
  panoramaLezioni.forEach(lez => {
    if (lez.giorno !== giorno || !lez.aula) return;
    const key = `${lez.slot}-${lez.aula}`;
    if (!mappa[key]) mappa[key] = [];
    mappa[key].push({ ...lez, _tipo: "lezione" });
  });

  // Ripetizioni del giorno
  if (dataGiorno) {
    panoramaRipetizioni.forEach(rip => {
      if (rip.data !== dataGiorno || !rip.aula) return;
      const slot = trovaSlotPerOra(fpg.tutte, rip.oraInizio || "15:00");
      if (slot >= 0) {
        const key = `${slot}-${rip.aula}`;
        if (!mappa[key]) mappa[key] = [];
        mappa[key].push({ ...rip, _tipo: "ripetizione", _slot: slot });
      }
    });
  }

  // Conta slot occupati per aula (per header badge)
  const countPerAula = {};
  aule.forEach(a => { countPerAula[a] = 0; });
  Object.keys(mappa).forEach(key => {
    const parts = key.split("-");
    const aula = parts.slice(1).join("-"); // nomi aula con "-"
    if (countPerAula[aula] !== undefined) countPerAula[aula] += mappa[key].length;
  });

  // ── HTML ──
  let html = `<table class="orario-table panorama-table">`;

  // THEAD
  html += `<thead><tr><th class="col-fascia">Ora</th>`;
  aule.forEach(aula => {
    const count = countPerAula[aula] || 0;
    const badge = count > 0
      ? `<span class="th-count th-count-busy">${count}</span>`
      : `<span class="th-count th-count-free">libera</span>`;
    html += `<th class="col-aula-pan">${escapeHtml(aula)} ${badge}</th>`;
  });
  html += `</tr></thead><tbody>`;

  const fasceMattina = fpg.mattina || [];
  const fascePom = fpg.pomeriggio || [];

  // Righe mattina
  fasceMattina.forEach(fascia => {
    html += renderRigaPanorama(fascia, aule, mappa, giorno, dataGiorno, "mattina");
  });

  // Separatore
  if (fasceMattina.length > 0 && fascePom.length > 0) {
    html += `<tr class="separator-row"><td colspan="${aule.length + 1}" class="td-separator">
      <div class="separator-line"><span class="separator-label">☀️ Pomeriggio</span></div>
    </td></tr>`;
  }

  // Righe pomeriggio
  fascePom.forEach(fascia => {
    html += renderRigaPanorama(fascia, aule, mappa, giorno, dataGiorno, "pomeriggio");
  });

  html += `</tbody></table>`;

  // Riepilogo
  const totSlots = (fasceMattina.length + fascePom.length) * aule.length;
  const totOccupati = Object.keys(mappa).reduce((acc, key) => acc + (mappa[key].length > 0 ? 1 : 0), 0);
  const totLiberi = totSlots - totOccupati;

  html += `<div class="panorama-summary">
    <span class="pan-stat">🏫 ${aule.length} aule</span>
    <span class="pan-stat">📗 ${totLiberi} slot liberi</span>
    <span class="pan-stat">📕 ${totOccupati} slot occupati</span>
  </div>`;

  orarioContainer.innerHTML = html;
}

function renderRigaPanorama(fascia, aule, mappa, giorno, dataGiorno, blocco) {
  let html = `<tr>`;
  html += `<td class="td-fascia ${blocco === 'pomeriggio' ? 'td-fascia-pom' : ''}">
    <span class="fascia-inizio">${fascia.start}</span>
    <span class="fascia-fine">${fascia.end}</span>
  </td>`;

  aule.forEach(aula => {
    const key = `${fascia.slot}-${aula}`;
    const items = mappa[key] || [];

    if (items.length > 0) {
      html += `<td class="cella-occupata-multi pan-cell-busy">`;
      items.forEach(item => {
        if (item._tipo === "lezione") {
          html += renderCellaPanoramaItem(item, "lezione");
        } else {
          html += renderCellaPanoramaItem(item, "ripetizione");
        }
      });
      html += `</td>`;
    } else {
      // Cella libera — cliccabile
      const aulaEscaped = escapeHtml(aula).replace(/'/g, "\\'");
      html += `<td class="cella-vuota cella-clickable pan-cell-free" onclick="cellaVuotaPanoramaClick('${giorno}', ${fascia.slot}, '${aulaEscaped}', '${blocco}', '${dataGiorno || ''}')">
        <span class="cella-free-label">+</span>
      </td>`;
    }
  });

  html += `</tr>`;
  return html;
}

function renderCellaPanoramaItem(item, tipo) {
  const nomeDoc = mappaDocenti[item.docenteId] || "—";
  const editable = "cella-item-editable";

  if (tipo === "lezione") {
    const onClick = `onclick="apriModalModificaLezione('${item.id}')"`;
    let html = `<div class="cella-item cella-lezione ${editable}" ${onClick}><div class="cella-content">`;
    html += `<span class="cella-materia">${escapeHtml(item.materia)}</span>`;
    html += `<span class="cella-classe">${escapeHtml(item.classe)}</span>`;
    html += `<span class="cella-docente">${escapeHtml(nomeDoc)}</span>`;
    html += `</div>`;
    html += `<button class="cella-remove" onclick="event.stopPropagation(); rimuoviLezione('${item.id}')" title="Rimuovi">✕</button>`;
    html += `</div>`;
    return html;
  } else {
    const durata = Number(item.durata) || 60;
    const oraFine = minutesToTime(timeToMinutes(item.oraInizio || "15:00") + durata);
    const onClick = `onclick="apriModalModificaRipetizione('${item.id}')"`;
    let html = `<div class="cella-item cella-ripetizione ${editable}" ${onClick}><div class="cella-content">`;
    html += `<span class="cella-materia-rip">${escapeHtml(item.materia)}</span>`;
    html += `<span class="cella-studente">${escapeHtml(item.studente)}</span>`;
    html += `<span class="cella-docente-rip">${escapeHtml(nomeDoc)}</span>`;
    html += `<span class="cella-ora-rip">${item.oraInizio}–${oraFine}</span>`;
    html += `</div>`;
    html += `<button class="cella-remove cella-remove-rip" onclick="event.stopPropagation(); rimuoviRipetizione('${item.id}')" title="Rimuovi">✕</button>`;
    html += `</div>`;
    return html;
  }
}

function cellaVuotaPanoramaClick(giorno, slot, aula, blocco, dataGiorno) {
  if (!isAdmin) return;

  const overlay = document.getElementById("scelta-overlay");
  if (overlay) {
    overlay.dataset.giorno = giorno;
    overlay.dataset.slot = slot;
    overlay.dataset.blocco = blocco;
    overlay.dataset.aula = aula;
    overlay.dataset.data = dataGiorno;
    overlay.classList.add("active");
  }
}

function cellaVuotaPanoramaClick(giorno, slot, aula, blocco, dataGiorno) {
  if (!isAdmin) return;

  const overlay = document.getElementById("scelta-overlay");
  if (overlay) {
    overlay.dataset.giorno = giorno;
    overlay.dataset.slot = slot;
    overlay.dataset.blocco = blocco;
    overlay.dataset.aula = aula;
    overlay.dataset.data = dataGiorno;
    overlay.classList.add("active");
  }
}

// ============================================================
// PANORAMA CALENDARIO (settimana intera, TUTTO visibile)
// ============================================================

async function caricaPanoramaCal() {
  orarioContainer.innerHTML = `
    <div class="orario-loading">
      <div class="loading-spinner"></div>
      <p>Caricamento panorama settimanale…</p>
    </div>
  `;

  try {
    // Carica TUTTE le lezioni (senza filtro)
    const snapLezioni = await db.collection("orarioScolastico").get();
    panoramaLezioni = [];
    snapLezioni.forEach(doc => { panoramaLezioni.push({ id: doc.id, ...doc.data() }); });

    // Carica TUTTE le ripetizioni della settimana
    panoramaRipetizioni = [];
    if (settimanaDate.length === 5) {
      const snapRip = await db.collection("ripetizioni")
        .where("data", ">=", settimanaDate[0])
        .where("data", "<=", settimanaDate[4])
        .get();
      snapRip.forEach(doc => { panoramaRipetizioni.push({ id: doc.id, ...doc.data() }); });
    }

    renderTabellaPanoramaCal();

  } catch (err) {
    console.error("Errore caricamento panorama calendario:", err);
    orarioContainer.innerHTML = `<div class="orario-empty"><div class="empty-icon">⚠️</div><p>Errore nel caricamento. Riprova.</p></div>`;
  }
}

function renderTabellaPanoramaCal() {
  // Trova giorno con più fasce per le etichette
  let giornoMaxMattina = GIORNI[0];
  let giornoMaxPomeriggio = GIORNI[0];
  GIORNI.forEach(g => {
    if ((fascePerGiorno[g]?.numMattina || 0) > (fascePerGiorno[giornoMaxMattina]?.numMattina || 0)) giornoMaxMattina = g;
    if ((fascePerGiorno[g]?.numPomeriggio || 0) > (fascePerGiorno[giornoMaxPomeriggio]?.numPomeriggio || 0)) giornoMaxPomeriggio = g;
  });

  const fasceMattinaEtichette = fascePerGiorno[giornoMaxMattina]?.mattina || [];
  const fascePomeriggioEtichette = fascePerGiorno[giornoMaxPomeriggio]?.pomeriggio || [];

  // Mappa: "giorno-slot" → [items]
  const mappa = {};

  // Lezioni
  panoramaLezioni.forEach(lez => {
    if (!lez.giorno) return;
    const key = `${lez.giorno}-${lez.slot}`;
    if (!mappa[key]) mappa[key] = [];
    mappa[key].push({ ...lez, _tipo: "lezione" });
  });

  // Ripetizioni
  panoramaRipetizioni.forEach(rip => {
    const giorno = giornoFromData(rip.data);
    if (!giorno) return;
    const fasce = fascePerGiorno[giorno]?.tutte || [];
    const slot = trovaSlotPerOra(fasce, rip.oraInizio || "15:00");
    if (slot >= 0) {
      const key = `${giorno}-${slot}`;
      if (!mappa[key]) mappa[key] = [];
      mappa[key].push({ ...rip, _tipo: "ripetizione", _giorno: giorno, _slot: slot });
    }
  });

  // Conteggi per header
  const countPerGiorno = {};
  GIORNI.forEach(g => { countPerGiorno[g] = 0; });
  Object.keys(mappa).forEach(key => {
    const giorno = key.split("-")[0];
    if (countPerGiorno[giorno] !== undefined) countPerGiorno[giorno] += mappa[key].length;
  });

  // ── HTML tabella ──
  let html = `<table class="orario-table pancal-table">`;

  // THEAD con date + conteggio
  html += `<thead><tr><th class="col-fascia">Ora</th>`;
  GIORNI.forEach((g, idx) => {
    const dataStr = settimanaDate[idx];
    const dataObj = dataStr ? new Date(dataStr + "T00:00:00") : null;
    const numGiorno = dataObj ? dataObj.getDate() : "";
    const count = countPerGiorno[g] || 0;
    const badge = count > 0 ? `<span class="pancal-slot-count pancal-slot-count-busy">${count}</span>` : "";
    html += `<th>${g.substring(0, 3)} ${numGiorno} ${badge}</th>`;
  });
  html += `</tr></thead><tbody>`;

  // Righe mattina
  for (let i = 0; i < maxFasceMattina; i++) {
    html += renderRigaPanoramaCal(i, "mattina", fasceMattinaEtichette[i], mappa);
  }

  // Separatore
  if (maxFasceMattina > 0 && maxFascePomeriggio > 0) {
    html += `<tr class="separator-row"><td colspan="${GIORNI.length + 1}" class="td-separator">
      <div class="separator-line"><span class="separator-label">☀️ Pomeriggio</span></div>
    </td></tr>`;
  }

  // Righe pomeriggio
  for (let i = 0; i < maxFascePomeriggio; i++) {
    const slotGlobale = maxFasceMattina + i;
    html += renderRigaPanoramaCal(slotGlobale, "pomeriggio", fascePomeriggioEtichette[i], mappa);
  }

  html += `</tbody></table>`;

  // Riepilogo
  const totItems = panoramaLezioni.length + panoramaRipetizioni.length;
  html += `<div class="panorama-summary">
    <span class="pan-stat">📘 ${panoramaLezioni.length} lezioni</span>
    <span class="pan-stat">📙 ${panoramaRipetizioni.length} ripetizioni</span>
    <span class="pan-stat">📊 ${totItems} totale attività</span>
  </div>`;

  orarioContainer.innerHTML = html;
}

function renderRigaPanoramaCal(slotGlobale, blocco, fasciaEtichetta, mappa) {
  let html = `<tr>`;

  // Colonna fascia oraria
  if (fasciaEtichetta) {
    html += `<td class="td-fascia ${blocco === 'pomeriggio' ? 'td-fascia-pom' : ''}">
      <span class="fascia-inizio">${fasciaEtichetta.start}</span>
      <span class="fascia-fine">${fasciaEtichetta.end}</span>
    </td>`;
  } else {
    html += `<td class="td-fascia">—</td>`;
  }

  // Colonne giorni
  GIORNI.forEach(giorno => {
    const fpg = fascePerGiorno[giorno];
    const numMattina = fpg?.numMattina || 0;
    const numPomeriggio = fpg?.numPomeriggio || 0;

    let slotValido = false;
    if (blocco === "mattina") slotValido = slotGlobale < numMattina;
    else slotValido = (slotGlobale - maxFasceMattina) < numPomeriggio;

    if (!slotValido) { html += `<td class="cella-disabled"></td>`; return; }

    let realSlot = slotGlobale;
    if (blocco === "pomeriggio") {
      const pomIdx = slotGlobale - maxFasceMattina;
      realSlot = numMattina + pomIdx;
    }

    const key = `${giorno}-${realSlot}`;
    const items = mappa[key] || [];

    if (items.length > 0) {
      const MAX_VISIBLE = 4;
      html += `<td class="cella-occupata-multi"><div class="pancal-cell">`;

      const visibili = items.slice(0, MAX_VISIBLE);
      const restanti = items.length - MAX_VISIBLE;

      visibili.forEach(item => {
        html += renderItemPanoramaCal(item);
      });

      if (restanti > 0) {
        html += `<div class="pancal-more">+${restanti} altr${restanti === 1 ? "o" : "i"}</div>`;
      }

      html += `</div></td>`;
    } else {
      // Cella vuota — cliccabile
      html += `<td class="cella-vuota cella-clickable" onclick="cellaVuotaClick('${giorno}', ${realSlot}, '${blocco}')">
        <span class="cella-add-hint">+</span>
      </td>`;
    }
  });

  html += `</tr>`;
  return html;
}

function renderItemPanoramaCal(item) {
  const nomeDoc = mappaDocenti[item.docenteId] || "—";
  const tipo = item._tipo;

  const cssClass = tipo === "lezione" ? "pancal-item-lez" : "pancal-item-rip";
  const onClick = tipo === "lezione"
    ? `onclick="apriModalModificaLezione('${item.id}')"`
    : `onclick="apriModalModificaRipetizione('${item.id}')"`;

  let detail = "";
  if (tipo === "lezione") {
    detail = `${escapeHtml(nomeDoc)} · ${escapeHtml(item.classe || "")}`;
  } else {
    detail = `${escapeHtml(item.studente || "")} · ${escapeHtml(nomeDoc)}`;
  }

  const aulaTag = item.aula ? `<span class="pancal-item-aula">${escapeHtml(item.aula)}</span>` : "";

  let html = `<div class="pancal-item ${cssClass}" ${onClick}>`;
  html += `<div class="pancal-item-content">`;
  html += `<div class="pancal-item-materia">${escapeHtml(item.materia)}</div>`;
  html += `<div class="pancal-item-detail">${detail}</div>`;
  html += `</div>`;
  html += aulaTag;
  html += `</div>`;
  return html;
}

// ============================================================
// GESTIONE PULSANTE ELENCO STUDENTI
// ============================================================

function aggiornaBottoneStudenti() {
  const btnStudenti = document.getElementById("btn-elenco-studenti");
  if (!btnStudenti) return;

  const classiNelOrario = getClassiDalleLezioni();
  const mostra = classiNelOrario.length > 0 && (
    isDocente ||
    vistaCorrente === "docente" ||
    vistaCorrente === "classe"
  );

  btnStudenti.style.display = mostra ? "" : "none";
}

/**
 * Estrai le classi uniche dalle lezioni E ripetizioni correnti.
 */
function getClassiDalleLezioni() {
  const classiSet = new Set();
  lezioniCorrente.forEach(l => {
    if (l.classe) classiSet.add(l.classe);
  });
  ripetizioniCorrente.forEach(r => {
    if (r.classe) classiSet.add(r.classe);
  });
  return Array.from(classiSet).sort();
}

// ============================================================
// MODAL ELENCO STUDENTI (invariato nella logica)
// ============================================================

async function apriModalStudenti() {
  const overlay = document.getElementById("studenti-overlay");
  const body = document.getElementById("studenti-modal-body");
  const title = document.getElementById("studenti-modal-title");

  if (!overlay || !body) return;

  if (isDocente) {
    title.textContent = "👥 I Miei Studenti";
  } else if (vistaCorrente === "classe" && entitaSelezionata) {
    title.textContent = `👥 Studenti — Classe ${entitaSelezionata}`;
  } else {
    const doc = docentiLista.find(d => d.id === entitaSelezionata);
    const nomeDoc = doc ? `${doc.cognome} ${doc.nome}` : "Docente";
    title.textContent = `👥 Studenti di ${nomeDoc}`;
  }

  body.innerHTML = `
    <div class="studenti-loading">
      <div class="loading-spinner" style="width:36px;height:36px;border:3px solid #EFEDE8;border-top-color:#1B4332;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px;"></div>
      <p style="font-size:14px;color:#999;">Caricamento studenti…</p>
    </div>
  `;
  overlay.classList.add("active");

  try {
    const classi = getClassiDalleLezioni();

    if (classi.length === 0) {
      body.innerHTML = `
        <div class="studenti-empty">
          <div class="empty-icon">📭</div>
          <p>Nessuna classe assegnata nell'orario.</p>
        </div>
      `;
      return;
    }

    const snapshot = await db.collection("studenti").orderBy("cognome").get();

    const studenti = [];
    snapshot.forEach(doc => {
      const s = { id: doc.id, ...doc.data() };
      const classiStudente = (s.classi && Array.isArray(s.classi) && s.classi.length > 0)
        ? s.classi.filter(c => c)
        : [s.classe, s.classe2, s.classe3, s.classe4].filter(c => c);
      if (classiStudente.some(c => classi.includes(c))) {
        studenti.push(s);
      }
    });

    const perClasse = {};
    classi.forEach(c => { perClasse[c] = []; });
    studenti.forEach(s => {
      const classiStudente = (s.classi && Array.isArray(s.classi) && s.classi.length > 0)
        ? s.classi.filter(c => c)
        : [s.classe, s.classe2, s.classe3, s.classe4].filter(c => c);
      classiStudente.forEach(c => {
        if (perClasse[c]) perClasse[c].push(s);
      });
    });

    Object.keys(perClasse).forEach(c => {
      perClasse[c].sort((a, b) => (a.cognome || "").localeCompare(b.cognome || ""));
    });

    const tutteEmail = [...new Set(
      studenti.map(s => s.email).filter(e => e && e.trim())
    )].sort();

    let html = "";

    if (tutteEmail.length > 0) {
      html += `
        <div class="studenti-copy-bar">
          <span>📧 ${tutteEmail.length} email disponibili</span>
          <div style="display:flex;gap:6px;">
            <button class="studenti-copy-btn" onclick="copiaEmailStudenti()">📋 Copia email</button>
            <button class="studenti-copy-btn" style="background:#1565C0;" onclick="inviaEmailDaCalendario()">📧 Componi email</button>
          </div>
        </div>
      `;
    }

    classi.forEach(nomeClasse => {
      const lista = perClasse[nomeClasse];
      html += `<div class="studenti-classe-group">`;
      html += `
        <div class="studenti-classe-header">
          <span class="studenti-classe-nome">Classe ${escapeHtml(nomeClasse)}</span>
          <span class="studenti-classe-count">${lista.length} student${lista.length === 1 ? "e" : "i"}</span>
        </div>
      `;

      if (lista.length === 0) {
        html += `<div style="padding:12px 14px;color:#BBB;font-size:13px;">Nessuno studente registrato in questa classe</div>`;
      } else {
        lista.forEach(s => {
          const iniziali = `${(s.nome || "?")[0]}${(s.cognome || "?")[0]}`.toUpperCase();
          let contatti = [];
          if (s.email) contatti.push(`<a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a>`);
          if (s.telefono) contatti.push(`📞 ${escapeHtml(s.telefono)}`);

          html += `
            <div class="studenti-list-item">
              <div class="studenti-list-avatar">${iniziali}</div>
              <div class="studenti-list-info">
                <div class="studenti-list-nome">${escapeHtml(s.cognome)} ${escapeHtml(s.nome)}</div>
                <div class="studenti-list-contatti">${contatti.join(" · ") || "Nessun contatto"}</div>
              </div>
            </div>
          `;
        });
      }
      html += `</div>`;
    });

    if (studenti.length === 0) {
      html = `
        <div class="studenti-empty">
          <div class="empty-icon">🎓</div>
          <p>Nessuno studente registrato nelle classi di questo orario.<br>
          Aggiungili dalla sezione <strong>Anagrafica Studenti</strong>.</p>
        </div>
      `;
    }

    body.innerHTML = html;

  } catch (err) {
    console.error("Errore caricamento studenti:", err);
    body.innerHTML = `
      <div class="studenti-empty">
        <div class="empty-icon">⚠️</div>
        <p>Errore nel caricamento degli studenti.</p>
      </div>
    `;
  }
}

function chiudiModalStudenti() {
  const overlay = document.getElementById("studenti-overlay");
  if (overlay) overlay.classList.remove("active");
}

document.addEventListener("click", (e) => {
  const overlay = document.getElementById("studenti-overlay");
  if (e.target === overlay) chiudiModalStudenti();
});

async function copiaEmailStudenti() {
  const classi = getClassiDalleLezioni();
  if (classi.length === 0) return;

  try {
    const snapshot = await db.collection("studenti").get();
    const emails = [];
    snapshot.forEach(doc => {
      const s = doc.data();
      const classiStudente = (s.classi && Array.isArray(s.classi) && s.classi.length > 0)
        ? s.classi.filter(c => c)
        : [s.classe, s.classe2, s.classe3, s.classe4].filter(c => c);
      if (classiStudente.some(c => classi.includes(c))) {
        const email = s.email;
        if (email && email.trim()) emails.push(email.trim());
      }
    });

    if (emails.length === 0) { alert("Nessuna email trovata."); return; }

    const testo = emails.sort().join("; ");
    await navigator.clipboard.writeText(testo);

    const btns = document.querySelectorAll(".studenti-copy-btn");
    const btn = btns[0];
    if (btn) {
      const original = btn.textContent;
      btn.textContent = "✅ Copiato!";
      btn.style.background = "#2E7D32";
      setTimeout(() => { btn.textContent = original; btn.style.background = ""; }, 2000);
    }
  } catch (err) {
    console.error("Errore copia email:", err);
    alert("Errore durante la copia. Prova a copiare manualmente.");
  }
}

async function inviaEmailDaCalendario() {
  const classi = getClassiDalleLezioni();
  if (classi.length === 0) return;

  try {
    const snapshot = await db.collection("studenti").get();
    const destinatari = [];
    snapshot.forEach(doc => {
      const s = doc.data();
      const classiStudente = (s.classi && Array.isArray(s.classi) && s.classi.length > 0)
        ? s.classi.filter(c => c)
        : [s.classe, s.classe2, s.classe3, s.classe4].filter(c => c);
      if (classiStudente.some(c => classi.includes(c)) && s.email && s.email.trim()) {
        destinatari.push({ nome: s.nome, cognome: s.cognome, email: s.email, classe: s.classe || "" });
      }
    });

    if (destinatari.length === 0) { alert("Nessuno studente con email registrata."); return; }

    const vars = {};
    if (vistaCorrente === "classe" && entitaSelezionata) vars.classe = entitaSelezionata;
    if (vistaCorrente === "docente" && entitaSelezionata) {
      const doc = docentiLista.find(d => d.id === entitaSelezionata);
      if (doc) vars.docente = `${doc.cognome} ${doc.nome}`;
    }
    if (isDocente) vars.docente = getDocenteNome ? (getDocenteNome() || "Docente") : "Docente";

    chiudiModalStudenti();
    EmailModule.apriComponi(destinatari, vars);
  } catch (err) {
    console.error("Errore invio email da calendario:", err);
    alert("Errore nel caricamento. Riprova.");
  }
}

// ============================================================
// POPOLA DROPDOWN IN BASE ALLA VISTA
// ============================================================

function popolaDropdownEntita() {
  const select = document.getElementById("select-entita");
  if (!select) return;
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
// CARICA LEZIONI + RIPETIZIONI E MOSTRA TABELLA
// ============================================================

async function caricaEmostraOrario() {
  orarioContainer.innerHTML = `
    <div class="orario-loading">
      <div class="loading-spinner"></div>
      <p>Caricamento orario…</p>
    </div>
  `;

  try {
    // ── Carica LEZIONI ──
    let snapLezioni;

    if (isDocente) {
      snapLezioni = await db.collection("orarioScolastico")
        .where("docenteId", "==", currentDocenteId).get();
    } else if (vistaCorrente === "docente") {
      snapLezioni = await db.collection("orarioScolastico")
        .where("docenteId", "==", entitaSelezionata).get();
    } else if (vistaCorrente === "aula") {
      snapLezioni = await db.collection("orarioScolastico")
        .where("aula", "==", entitaSelezionata).get();
    } else if (vistaCorrente === "classe") {
      snapLezioni = await db.collection("orarioScolastico")
        .where("classe", "==", entitaSelezionata).get();
    }

    lezioniCorrente = [];
    if (snapLezioni) {
      snapLezioni.forEach(doc => {
        lezioniCorrente.push({ id: doc.id, ...doc.data() });
      });
    }

    // ── Carica RIPETIZIONI della settimana ──
    ripetizioniCorrente = [];

    if (settimanaDate.length === 5) {
      let queryRip;

      if (isDocente) {
        queryRip = db.collection("ripetizioni")
          .where("docenteId", "==", currentDocenteId)
          .where("data", ">=", settimanaDate[0])
          .where("data", "<=", settimanaDate[4]);
      } else if (vistaCorrente === "docente") {
        queryRip = db.collection("ripetizioni")
          .where("docenteId", "==", entitaSelezionata)
          .where("data", ">=", settimanaDate[0])
          .where("data", "<=", settimanaDate[4]);
      } else if (vistaCorrente === "aula") {
        // Ripetizioni filtrate per aula nella settimana
        queryRip = db.collection("ripetizioni")
          .where("aula", "==", entitaSelezionata)
          .where("data", ">=", settimanaDate[0])
          .where("data", "<=", settimanaDate[4]);
      } else if (vistaCorrente === "classe") {
        // Ripetizioni filtrate per classe nella settimana
        queryRip = db.collection("ripetizioni")
          .where("classe", "==", entitaSelezionata)
          .where("data", ">=", settimanaDate[0])
          .where("data", "<=", settimanaDate[4]);
      }

      if (queryRip) {
        try {
          const snapRip = await queryRip.get();
          snapRip.forEach(doc => {
            ripetizioniCorrente.push({ id: doc.id, ...doc.data() });
          });
        } catch (ripErr) {
          // Firestore potrebbe richiedere un indice composito per query con 2+ where
          // Fallback: carica tutte le ripetizioni della settimana e filtra client-side
          console.warn("Query ripetizioni con filtro composito fallita, fallback client-side:", ripErr);
          try {
            const snapAll = await db.collection("ripetizioni")
              .where("data", ">=", settimanaDate[0])
              .where("data", "<=", settimanaDate[4])
              .get();

            snapAll.forEach(doc => {
              const r = { id: doc.id, ...doc.data() };
              let match = false;

              if (isDocente) {
                match = r.docenteId === currentDocenteId;
              } else if (vistaCorrente === "docente") {
                match = r.docenteId === entitaSelezionata;
              } else if (vistaCorrente === "aula") {
                match = r.aula === entitaSelezionata;
              } else if (vistaCorrente === "classe") {
                match = r.classe === entitaSelezionata;
              }

              if (match) ripetizioniCorrente.push(r);
            });
          } catch (fallbackErr) {
            console.error("Errore fallback ripetizioni:", fallbackErr);
          }
        }
      }
    }

    renderTabella();

  } catch (err) {
    console.error("Errore caricamento orario:", err);
    orarioContainer.innerHTML = `
      <div class="orario-empty">
        <div class="empty-icon">⚠️</div>
        <p>Errore nel caricamento dell'orario. Riprova.</p>
      </div>
    `;
  }
}

// ============================================================
// RENDER TABELLA UNIFICATA (Mattina + Pomeriggio)
// ============================================================

function renderTabella() {
  // Trova il giorno con più fasce per le etichette
  let giornoMaxMattina = GIORNI[0];
  let giornoMaxPomeriggio = GIORNI[0];

  GIORNI.forEach(g => {
    if ((fascePerGiorno[g]?.numMattina || 0) > (fascePerGiorno[giornoMaxMattina]?.numMattina || 0)) {
      giornoMaxMattina = g;
    }
    if ((fascePerGiorno[g]?.numPomeriggio || 0) > (fascePerGiorno[giornoMaxPomeriggio]?.numPomeriggio || 0)) {
      giornoMaxPomeriggio = g;
    }
  });

  const fasceMattinaEtichette = fascePerGiorno[giornoMaxMattina]?.mattina || [];
  const fascePomeriggioEtichette = fascePerGiorno[giornoMaxPomeriggio]?.pomeriggio || [];

  // ── Mappa lezioni: "giorno-slot" → lezione ──
  const mappaLezioni = {};
  lezioniCorrente.forEach(lez => {
    const key = `${lez.giorno}-${lez.slot}`;
    if (!mappaLezioni[key]) mappaLezioni[key] = [];
    mappaLezioni[key].push({ ...lez, _tipo: "lezione" });
  });

  // ── Mappa ripetizioni: "giorno-slot" → ripetizione ──
  const mappaRipetizioni = {};
  ripetizioniCorrente.forEach(rip => {
    const giorno = giornoFromData(rip.data);
    if (!giorno) return;

    const fasce = fascePerGiorno[giorno]?.tutte || [];
    const slot = trovaSlotPerOra(fasce, rip.oraInizio || "15:00");
    if (slot >= 0) {
      const key = `${giorno}-${slot}`;
      if (!mappaRipetizioni[key]) mappaRipetizioni[key] = [];
      mappaRipetizioni[key].push({ ...rip, _tipo: "ripetizione", _giorno: giorno, _slot: slot });
    }
  });

  // ── HTML tabella ──
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

  // ── Righe MATTINA ──
  for (let i = 0; i < maxFasceMattina; i++) {
    html += renderRigaFascia(i, "mattina", fasceMattinaEtichette[i], mappaLezioni, mappaRipetizioni);
  }

  // ── Separatore mattina/pomeriggio ──
  if (maxFasceMattina > 0 && maxFascePomeriggio > 0) {
    html += `<tr class="separator-row">`;
    html += `<td colspan="${GIORNI.length + 1}" class="td-separator">
      <div class="separator-line">
        <span class="separator-label">☀️ Pomeriggio</span>
      </div>
    </td>`;
    html += `</tr>`;
  }

  // ── Righe POMERIGGIO ──
  for (let i = 0; i < maxFascePomeriggio; i++) {
    const slotGlobale = maxFasceMattina + i;
    html += renderRigaFascia(slotGlobale, "pomeriggio", fascePomeriggioEtichette[i], mappaLezioni, mappaRipetizioni);
  }

  html += `</tbody></table>`;

  orarioContainer.innerHTML = html;
}

function renderRigaFascia(slotGlobale, blocco, fasciaEtichetta, mappaLezioni, mappaRipetizioni) {
  let html = `<tr>`;

  // Colonna fascia oraria
  if (fasciaEtichetta) {
    html += `<td class="td-fascia ${blocco === 'pomeriggio' ? 'td-fascia-pom' : ''}">
      <span class="fascia-inizio">${fasciaEtichetta.start}</span>
      <span class="fascia-fine">${fasciaEtichetta.end}</span>
    </td>`;
  } else {
    html += `<td class="td-fascia">—</td>`;
  }

  // Colonne giorni
  GIORNI.forEach(giorno => {
    const fpg = fascePerGiorno[giorno];
    const numMattina = fpg?.numMattina || 0;
    const numPomeriggio = fpg?.numPomeriggio || 0;

    // Determina se lo slot è valido per questo giorno
    let slotValido = false;
    if (blocco === "mattina") {
      slotValido = slotGlobale < numMattina;
    } else {
      const pomIdx = slotGlobale - maxFasceMattina;
      slotValido = pomIdx < numPomeriggio;
    }

    if (!slotValido) {
      html += `<td class="cella-disabled"></td>`;
      return;
    }

    // Cerca il vero slot per questo giorno
    let realSlot = slotGlobale;
    if (blocco === "pomeriggio") {
      // Lo slot globale per pomeriggio è maxFasceMattina + i
      // Ma nel giorno specifico, il pomeriggio inizia a numMattina di QUEL giorno
      const pomIdx = slotGlobale - maxFasceMattina;
      realSlot = numMattina + pomIdx;
    }

    const key = `${giorno}-${realSlot}`;
    const lezioni = mappaLezioni[key] || [];
    const ripetizioni = mappaRipetizioni[key] || [];
    const items = [...lezioni, ...ripetizioni];

    if (items.length > 0) {
      html += renderCellaOccupata(items, giorno, realSlot, blocco);
    } else {
      // Cella vuota cliccabile (admin)
      if (isAdmin) {
        html += `<td class="cella-vuota cella-clickable" onclick="cellaVuotaClick('${giorno}', ${realSlot}, '${blocco}')">
          <span class="cella-add-hint">+</span>
        </td>`;
      } else {
        html += `<td class="cella-vuota">—</td>`;
      }
    }
  });

  html += `</tr>`;
  return html;
}

function renderCellaOccupata(items, giorno, slot, blocco) {
  let html = `<td class="cella-occupata-multi">`;

  items.forEach(item => {
    if (item._tipo === "lezione") {
      html += renderCellaLezione(item, giorno, slot);
    } else {
      html += renderCellaRipetizione(item, giorno, slot);
    }
  });

  html += `</td>`;
  return html;
}

function renderCellaLezione(lez, giorno, slot) {
  const editable = isAdmin ? "cella-item-editable" : "";
  const onClick = isAdmin ? `onclick="apriModalModificaLezione('${lez.id}')"` : "";

  let html = `<div class="cella-item cella-lezione ${editable}" ${onClick}>`;
  html += `<div class="cella-content">`;
  html += `<span class="cella-materia">${escapeHtml(lez.materia)}</span>`;

  if (vistaCorrente === "docente" || isDocente) {
    html += `<span class="cella-classe">${escapeHtml(lez.classe)}</span>`;
    if (lez.aula) html += `<span class="cella-aula-tag">${escapeHtml(lez.aula)}</span>`;
  } else if (vistaCorrente === "aula") {
    const nomeDoc = mappaDocenti[lez.docenteId] || "—";
    html += `<span class="cella-docente">${escapeHtml(nomeDoc)}</span>`;
    html += `<span class="cella-classe">${escapeHtml(lez.classe)}</span>`;
  } else if (vistaCorrente === "classe") {
    const nomeDoc = mappaDocenti[lez.docenteId] || "—";
    html += `<span class="cella-docente">${escapeHtml(nomeDoc)}</span>`;
    if (lez.aula) html += `<span class="cella-aula-tag">${escapeHtml(lez.aula)}</span>`;
  }

  html += `</div>`;

  // Bottone rimuovi (admin)
  if (isAdmin) {
    html += `<button class="cella-remove" onclick="event.stopPropagation(); rimuoviLezione('${lez.id}')" title="Rimuovi">✕</button>`;
  }

  html += `</div>`;
  return html;
}

function renderCellaRipetizione(rip, giorno, slot) {
  const editable = isAdmin ? "cella-item-editable" : "";
  const onClick = isAdmin
    ? `onclick="apriModalModificaRipetizione('${rip.id}')"`
    : `onclick="apriDettaglioRipetizione('${rip.id}')"`;

  const durata = Number(rip.durata) || 60;
  const oraFine = minutesToTime(timeToMinutes(rip.oraInizio || "15:00") + durata);

  let html = `<div class="cella-item cella-ripetizione ${editable}" ${onClick}>`;
  html += `<div class="cella-content">`;
  html += `<span class="cella-materia-rip">${escapeHtml(rip.materia)}</span>`;
  html += `<span class="cella-studente">${escapeHtml(rip.studente)}</span>`;

  // Info contestuali
  if (vistaCorrente === "aula" || vistaCorrente === "classe") {
    const nomeDoc = mappaDocenti[rip.docenteId] || "—";
    html += `<span class="cella-docente-rip">${escapeHtml(nomeDoc)}</span>`;
  }

  html += `<span class="cella-ora-rip">${rip.oraInizio}–${oraFine}</span>`;

  html += `</div>`;

  if (isAdmin) {
    html += `<button class="cella-remove cella-remove-rip" onclick="event.stopPropagation(); rimuoviRipetizione('${rip.id}')" title="Rimuovi">✕</button>`;
  }

  html += `</div>`;
  return html;
}

// ============================================================
// CLICK SU CELLA VUOTA (Admin)
// ============================================================

function cellaVuotaClick(giorno, slot, blocco) {
  if (!isAdmin) return;
  if (!entitaSelezionata && vistaCorrente !== "panorama" && vistaCorrente !== "panorama_cal") return;

  // Pre-seleziona giorno e slot nel modal
  if (vistaCorrente === "docente") currentDocenteId = entitaSelezionata;

  apriSceltaTipo(giorno, slot, blocco);
}

// ============================================================
// SCELTA TIPO: Lezione o Ripetizione
// ============================================================

function apriSceltaTipo(giorno, slot, blocco) {
  const overlay = document.getElementById("scelta-overlay");
  if (!overlay) {
    // Fallback: apri direttamente il modal lezione
    apriModalLezione("add", null, giorno, slot);
    return;
  }

  // Salva contesto per passarlo al modal successivo
  // Non sovrascrivere se già settato da panorama click
  if (giorno !== undefined) overlay.dataset.giorno = giorno || "";
  if (slot !== undefined) overlay.dataset.slot = slot != null ? slot : "";
  if (blocco !== undefined) overlay.dataset.blocco = blocco || "";
  // aula e data vengono settati direttamente da cellaVuotaPanoramaClick

  overlay.classList.add("active");
}

function sceltaLezione() {
  const overlay = document.getElementById("scelta-overlay");
  const giorno = overlay?.dataset.giorno || "";
  const slot = overlay?.dataset.slot !== "" ? parseInt(overlay.dataset.slot) : null;
  const aula = overlay?.dataset.aula || "";

  chiudiScelta();
  apriModalLezione("add", null, giorno, slot, aula);
}

function sceltaRipetizione() {
  const overlay = document.getElementById("scelta-overlay");
  const giorno = overlay?.dataset.giorno || "";
  const slot = overlay?.dataset.slot !== "" ? parseInt(overlay.dataset.slot) : null;
  const blocco = overlay?.dataset.blocco || "";
  const aula = overlay?.dataset.aula || "";
  const data = overlay?.dataset.data || "";

  chiudiScelta();
  apriModalRipetizione("add", null, giorno, slot, blocco, aula, data);
}

function chiudiScelta() {
  const overlay = document.getElementById("scelta-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.dataset.giorno = "";
    overlay.dataset.slot = "";
    overlay.dataset.blocco = "";
    overlay.dataset.aula = "";
    overlay.dataset.data = "";
  }
}

document.addEventListener("click", (e) => {
  const overlay = document.getElementById("scelta-overlay");
  if (e.target === overlay) chiudiScelta();
});

// ============================================================
// MODAL SETUP
// ============================================================

function setupModal() {
  // ── Modal Lezione ──
  const overlayLez = document.getElementById("modal-overlay");
  const btnCloseLez = document.getElementById("modal-close");
  const btnCancelLez = document.getElementById("modal-cancel");
  const btnSaveLez = document.getElementById("modal-save");
  const selectGiorno = document.getElementById("modal-giorno");

  if (btnCloseLez) btnCloseLez.addEventListener("click", chiudiModalLezione);
  if (btnCancelLez) btnCancelLez.addEventListener("click", chiudiModalLezione);
  if (overlayLez) overlayLez.addEventListener("click", (e) => { if (e.target === overlayLez) chiudiModalLezione(); });

  // Popola select giorni
  if (selectGiorno) {
    GIORNI.forEach(g => {
      const opt = document.createElement("option");
      opt.value = g;
      opt.textContent = g;
      selectGiorno.appendChild(opt);
    });
    selectGiorno.addEventListener("change", () => { aggiornaFasceDisponibili(); });
  }

  // Popola select classi e aule nel modal lezione
  const selectClasse = document.getElementById("modal-classe");
  const selectAula = document.getElementById("modal-aula");

  if (selectClasse) {
    classiLista.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.nome;
      opt.textContent = c.nome;
      selectClasse.appendChild(opt);
    });
  }

  if (selectAula) {
    auleLista.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.nome;
      opt.textContent = a.nome;
      selectAula.appendChild(opt);
    });
  }

  // Popola docente nel modal lezione (per panorama)
  const selectDocLez = document.getElementById("modal-lez-docente");
  if (selectDocLez) {
    docentiLista.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = `${d.cognome} ${d.nome}`;
      selectDocLez.appendChild(opt);
    });
  }

  if (btnSaveLez) btnSaveLez.addEventListener("click", salvaLezione);

  // ── Modal Ripetizione ──
  const overlayRip = document.getElementById("modal-overlay-rip");
  if (overlayRip) {
    overlayRip.addEventListener("click", (e) => { if (e.target === overlayRip) chiudiModalRipetizione(); });
  }

  const btnCloseRip = document.getElementById("modal-close-rip");
  const btnCancelRip = document.getElementById("modal-cancel-rip");
  const btnSaveRip = document.getElementById("modal-save-rip");
  const btnDeleteRip = document.getElementById("btn-elimina-rip");

  if (btnCloseRip) btnCloseRip.addEventListener("click", chiudiModalRipetizione);
  if (btnCancelRip) btnCancelRip.addEventListener("click", chiudiModalRipetizione);
  if (btnSaveRip) btnSaveRip.addEventListener("click", salvaRipetizione);
  if (btnDeleteRip) btnDeleteRip.addEventListener("click", () => {
    if (editingRipetizioneId && confirm("Sei sicuro di voler eliminare questa ripetizione?")) {
      rimuoviRipetizione(editingRipetizioneId);
      chiudiModalRipetizione();
    }
  });

  // Popola dropdown docente nel modal ripetizione
  const selectDocRip = document.getElementById("modal-rip-docente");
  if (selectDocRip) {
    docentiLista.forEach(d => {
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = `${d.cognome} ${d.nome}`;
      selectDocRip.appendChild(opt);
    });
  }

  // Popola aule nel modal ripetizione
  const selectAulaRip = document.getElementById("modal-rip-aula");
  if (selectAulaRip) {
    auleLista.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.nome;
      opt.textContent = a.nome;
      selectAulaRip.appendChild(opt);
    });
  }
}

// ============================================================
// MODAL LEZIONE: Apri / Chiudi / Fasce
// ============================================================

function apriModalLezione(mode, lezione, giorno, slot, aula) {
  modalMode = mode;
  modalTipo = "lezione";
  editingLezioneId = lezione ? lezione.id : null;

  const titleEl = document.getElementById("modal-title");
  const btnSave = document.getElementById("modal-save");
  const docenteGroup = document.getElementById("modal-docente-group");

  // Mostra/nascondi dropdown docente: visibile solo in panorama
  if (docenteGroup) {
    docenteGroup.style.display = (isPanoramaView()) ? "" : "none";
  }

  if (mode === "edit" && lezione) {
    titleEl.textContent = "Modifica Lezione";
    btnSave.textContent = "Salva Modifiche";

    document.getElementById("modal-giorno").value = lezione.giorno;
    aggiornaFasceDisponibili();
    document.getElementById("modal-fascia").value = lezione.slot;
    document.getElementById("modal-materia").value = lezione.materia || "";
    document.getElementById("modal-classe").value = lezione.classe || "";
    document.getElementById("modal-aula").value = lezione.aula || "";

    // In panorama modifica, preseleziona il docente della lezione
    if (isPanoramaView()) {
      currentDocenteId = lezione.docenteId;
      const selDoc = document.getElementById("modal-lez-docente");
      if (selDoc) selDoc.value = lezione.docenteId || "";
    }
  } else {
    titleEl.textContent = "Aggiungi Lezione";
    btnSave.textContent = "Salva Lezione";

    document.getElementById("modal-giorno").value = giorno || "";
    if (giorno) {
      aggiornaFasceDisponibili();
      if (slot != null) document.getElementById("modal-fascia").value = slot;
    } else {
      document.getElementById("modal-fascia").innerHTML = `<option value="">— Prima seleziona il giorno —</option>`;
      document.getElementById("modal-fascia").disabled = true;
    }
    document.getElementById("modal-materia").value = "";
    document.getElementById("modal-classe").value = "";
    document.getElementById("modal-aula").value = aula || "";

    // In panorama, resetta docente
    if (isPanoramaView()) {
      const selDoc = document.getElementById("modal-lez-docente");
      if (selDoc) selDoc.value = "";
    }
  }

  nascondiErroreModal();
  document.getElementById("modal-overlay").classList.add("active");
}

function apriModalModificaLezione(lezioneId) {
  let lezione = lezioniCorrente.find(l => l.id === lezioneId);
  if (!lezione) lezione = panoramaLezioni.find(l => l.id === lezioneId);
  if (!lezione) return;
  apriModalLezione("edit", lezione);
}

function chiudiModalLezione() {
  document.getElementById("modal-overlay").classList.remove("active");
  modalMode = "add";
  editingLezioneId = null;
}

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

  const fpg = fascePerGiorno[giorno];
  const fasce = fpg?.tutte || [];

  if (fasce.length === 0) {
    selectFascia.disabled = true;
    selectFascia.innerHTML = `<option value="">Nessuna fascia configurata</option>`;
    return;
  }

  selectFascia.disabled = false;
  selectFascia.innerHTML = `<option value="">— Seleziona fascia —</option>`;

  fasce.forEach((f, idx) => {
    // Separatore visivo tra mattina e pomeriggio
    if (idx === fpg.numMattina && fpg.numPomeriggio > 0) {
      const sep = document.createElement("option");
      sep.disabled = true;
      sep.textContent = "── Pomeriggio ──";
      selectFascia.appendChild(sep);
    }

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

function mostraErroreModal(msg) {
  const el = document.getElementById("modal-error");
  if (el) { el.textContent = msg; el.classList.add("visible"); }
}

function nascondiErroreModal() {
  const el = document.getElementById("modal-error");
  if (el) { el.textContent = ""; el.classList.remove("visible"); }
}

// ============================================================
// MODAL RIPETIZIONE: Apri / Chiudi
// ============================================================

function apriModalRipetizione(mode, ripetizione, giorno, slot, blocco, aula, data) {
  modalMode = mode;
  modalTipo = "ripetizione";
  editingRipetizioneId = ripetizione ? ripetizione.id : null;

  const titleEl = document.getElementById("modal-title-rip");
  const btnSave = document.getElementById("modal-save-rip");
  const btnDelete = document.getElementById("btn-elimina-rip");

  if (mode === "edit" && ripetizione) {
    titleEl.textContent = "Modifica Ripetizione";
    btnSave.textContent = "Aggiorna";
    btnDelete.style.display = "inline-flex";

    document.getElementById("modal-rip-docente").value = ripetizione.docenteId || "";
    document.getElementById("modal-rip-data").value = ripetizione.data || "";
    document.getElementById("modal-rip-ora").value = ripetizione.oraInizio || "";
    document.getElementById("modal-rip-durata").value = String(ripetizione.durata || 60);
    document.getElementById("modal-rip-studente").value = ripetizione.studente || "";
    document.getElementById("modal-rip-materia").value = ripetizione.materia || "";
    document.getElementById("modal-rip-classe").value = ripetizione.classe || "";
    document.getElementById("modal-rip-aula").value = ripetizione.aula || "";
    document.getElementById("modal-rip-note").value = ripetizione.note || "";
  } else {
    titleEl.textContent = "Nuova Ripetizione";
    btnSave.textContent = "Salva";
    btnDelete.style.display = "none";

    // Pre-seleziona docente se in vista docente
    const selectDoc = document.getElementById("modal-rip-docente");
    if (vistaCorrente === "docente" && entitaSelezionata) {
      selectDoc.value = entitaSelezionata;
    } else {
      selectDoc.value = "";
    }

    // Pre-seleziona data: da parametro panorama, oppure dal giorno+settimana
    if (data) {
      document.getElementById("modal-rip-data").value = data;
    } else if (giorno && settimanaDate.length === 5) {
      const idxGiorno = GIORNI.indexOf(giorno);
      if (idxGiorno >= 0) {
        document.getElementById("modal-rip-data").value = settimanaDate[idxGiorno];
      }
    } else {
      document.getElementById("modal-rip-data").value = "";
    }

    // Pre-seleziona ora dallo slot cliccato
    if (slot != null && giorno) {
      const fasce = fascePerGiorno[giorno]?.tutte || [];
      const fascia = fasce.find(f => f.slot === slot);
      if (fascia) {
        document.getElementById("modal-rip-ora").value = fascia.start;
      }
    } else {
      document.getElementById("modal-rip-ora").value = "";
    }

    // Pre-seleziona aula: da parametro, oppure dalla vista aula
    if (aula) {
      document.getElementById("modal-rip-aula").value = aula;
    } else if (vistaCorrente === "aula" && entitaSelezionata) {
      document.getElementById("modal-rip-aula").value = entitaSelezionata;
    } else {
      document.getElementById("modal-rip-aula").value = "";
    }

    document.getElementById("modal-rip-durata").value = "60";
    document.getElementById("modal-rip-studente").value = "";
    document.getElementById("modal-rip-materia").value = "";
    document.getElementById("modal-rip-classe").value = "";
    document.getElementById("modal-rip-note").value = "";
  }

  document.getElementById("modal-overlay-rip").classList.add("active");
}

function apriModalModificaRipetizione(ripId) {
  let rip = ripetizioniCorrente.find(r => r.id === ripId);
  if (!rip) rip = panoramaRipetizioni.find(r => r.id === ripId);
  if (!rip) return;
  apriModalRipetizione("edit", rip);
}

function chiudiModalRipetizione() {
  const overlay = document.getElementById("modal-overlay-rip");
  if (overlay) overlay.classList.remove("active");
  editingRipetizioneId = null;
}

// ============================================================
// DETTAGLIO RIPETIZIONE (Docente — sola lettura)
// ============================================================

function apriDettaglioRipetizione(ripId) {
  let rip = ripetizioniCorrente.find(r => r.id === ripId);
  if (!rip) rip = panoramaRipetizioni.find(r => r.id === ripId);
  if (!rip) return;

  const nomeDocente = mappaDocenti[rip.docenteId] || "—";
  const durata = Number(rip.durata) || 60;
  const oraFine = minutesToTime(timeToMinutes(rip.oraInizio || "15:00") + durata);
  const dataLeggibile = formatDateFull(rip.data);

  const overlay = document.getElementById("dettaglio-rip-overlay");
  const body = document.getElementById("dettaglio-rip-body");
  if (!overlay || !body) return;

  body.innerHTML = `
    <div class="dettaglio-riga"><span class="dettaglio-label">📅 Data</span><span class="dettaglio-valore">${dataLeggibile}</span></div>
    <div class="dettaglio-riga"><span class="dettaglio-label">🕐 Orario</span><span class="dettaglio-valore">${escapeHtml(rip.oraInizio)} → ${oraFine} (${durata} min)</span></div>
    <div class="dettaglio-riga"><span class="dettaglio-label">👤 Studente</span><span class="dettaglio-valore">${escapeHtml(rip.studente || "—")}</span></div>
    <div class="dettaglio-riga"><span class="dettaglio-label">📖 Materia</span><span class="dettaglio-valore">${escapeHtml(rip.materia || "—")}</span></div>
    ${rip.classe ? `<div class="dettaglio-riga"><span class="dettaglio-label">🏫 Classe</span><span class="dettaglio-valore">${escapeHtml(rip.classe)}</span></div>` : ""}
    ${rip.aula ? `<div class="dettaglio-riga"><span class="dettaglio-label">📍 Aula</span><span class="dettaglio-valore">${escapeHtml(rip.aula)}</span></div>` : ""}
    ${rip.note ? `<div class="dettaglio-riga"><span class="dettaglio-label">📝 Note</span><span class="dettaglio-valore">${escapeHtml(rip.note)}</span></div>` : ""}
  `;

  overlay.classList.add("active");
}

function chiudiDettaglioRipetizione() {
  const overlay = document.getElementById("dettaglio-rip-overlay");
  if (overlay) overlay.classList.remove("active");
}

document.addEventListener("click", (e) => {
  const overlay = document.getElementById("dettaglio-rip-overlay");
  if (e.target === overlay) chiudiDettaglioRipetizione();
});

// ============================================================
// SALVA LEZIONE
// ============================================================

async function salvaLezione() {
  nascondiErroreModal();

  const giorno = document.getElementById("modal-giorno").value;
  const slotStr = document.getElementById("modal-fascia").value;
  const materia = document.getElementById("modal-materia").value.trim();
  const classe = document.getElementById("modal-classe").value;
  const aula = document.getElementById("modal-aula").value;

  if (!giorno) { mostraErroreModal("Seleziona un giorno."); return; }
  if (slotStr === "") { mostraErroreModal("Seleziona una fascia oraria."); return; }
  if (!materia) { mostraErroreModal("Inserisci la materia."); return; }
  if (!classe) { mostraErroreModal("Seleziona una classe."); return; }
  if (!aula) { mostraErroreModal("Seleziona un'aula."); return; }

  // In panorama, prendi docente dal dropdown nel modal
  let docenteIdDaSalvare = currentDocenteId;
  if (isPanoramaView()) {
    const selDoc = document.getElementById("modal-lez-docente");
    docenteIdDaSalvare = selDoc ? selDoc.value : "";
    if (!docenteIdDaSalvare) { mostraErroreModal("Seleziona un docente."); return; }
  }

  const slot = parseInt(slotStr);

  const slotOccupato = lezioniCorrente.some(l =>
    l.giorno === giorno && l.slot === slot && l.id !== editingLezioneId
  );
  if (slotOccupato && vistaCorrente !== "panorama") {
    mostraErroreModal("Questo slot è già occupato per il docente selezionato.");
    return;
  }

  const btnSave = document.getElementById("modal-save");
  btnSave.disabled = true;
  const originalText = btnSave.textContent;
  btnSave.textContent = "Controllo disponibilità…";

  try {
    // Validazione conflitto aula
    const conflittoAula = await db.collection("orarioScolastico")
      .where("giorno", "==", giorno)
      .where("slot", "==", slot)
      .where("aula", "==", aula)
      .get();

    const conflitti = [];
    conflittoAula.forEach(doc => {
      if (doc.id !== editingLezioneId) conflitti.push({ id: doc.id, ...doc.data() });
    });

    if (conflitti.length > 0) {
      const c = conflitti[0];
      const docConflitto = docentiLista.find(d => d.id === c.docenteId);
      const nomeConflitto = docConflitto ? `${docConflitto.cognome} ${docConflitto.nome}` : "un altro docente";
      mostraErroreModal(`L'aula "${aula}" è già occupata in ${giorno} a quest'ora da ${nomeConflitto} (${c.materia} — ${c.classe}).`);
      btnSave.disabled = false;
      btnSave.textContent = originalText;
      return;
    }

    btnSave.textContent = "Salvataggio…";

    const datiLezione = {
      docenteId: docenteIdDaSalvare,
      giorno: giorno,
      slot: slot,
      materia: materia,
      classe: classe,
      aula: aula,
    };

    if (modalMode === "edit" && editingLezioneId) {
      await db.collection("orarioScolastico").doc(editingLezioneId).update(datiLezione);
    } else {
      await db.collection("orarioScolastico").add(datiLezione);
    }

    chiudiModalLezione();
    if (isPanoramaView()) {
      await ricaricaPanoramaCorrente();
    } else {
      await caricaEmostraOrario();
      aggiornaBottoneStudenti();
    }

  } catch (err) {
    console.error("Errore salvataggio lezione:", err);
    mostraErroreModal("Errore durante il salvataggio. Riprova.");
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = originalText;
  }
}

// ============================================================
// SALVA RIPETIZIONE
// ============================================================

async function salvaRipetizione() {
  const docenteId = document.getElementById("modal-rip-docente").value;
  const data = document.getElementById("modal-rip-data").value;
  const oraInizio = document.getElementById("modal-rip-ora").value;
  const durata = Number(document.getElementById("modal-rip-durata").value);
  const studente = document.getElementById("modal-rip-studente").value.trim();
  const materia = document.getElementById("modal-rip-materia").value.trim();
  const classe = document.getElementById("modal-rip-classe").value.trim();
  const aula = document.getElementById("modal-rip-aula").value;
  const note = document.getElementById("modal-rip-note").value.trim();

  if (!docenteId || !data || !oraInizio || !durata || !studente || !materia) {
    alert("Compila tutti i campi obbligatori (docente, data, ora, durata, studente, materia).");
    return;
  }

  const dataObj = new Date(data + "T00:00:00");
  const dow = dataObj.getDay();
  if (dow === 0 || dow === 6) {
    alert("Le ripetizioni possono essere solo dal lunedì al venerdì.");
    return;
  }

  const documento = {
    docenteId: docenteId,
    docenteNome: mappaDocenti[docenteId] || "",
    data: data,
    oraInizio: oraInizio,
    durata: durata,
    studente: studente,
    materia: materia,
    classe: classe,
    aula: aula,
    note: note,
    creatoIl: firebase.firestore.FieldValue.serverTimestamp()
  };

  const btnSalva = document.getElementById("modal-save-rip");
  btnSalva.disabled = true;
  const origText = btnSalva.textContent;
  btnSalva.textContent = "Salvataggio…";

  try {
    if (editingRipetizioneId) {
      await db.collection("ripetizioni").doc(editingRipetizioneId).update(documento);
    } else {
      await db.collection("ripetizioni").add(documento);
    }

    chiudiModalRipetizione();
    if (isPanoramaView()) {
      await ricaricaPanoramaCorrente();
    } else {
      await caricaEmostraOrario();
      aggiornaBottoneStudenti();
    }

  } catch (err) {
    console.error("Errore salvataggio ripetizione:", err);
    alert("Errore durante il salvataggio. Riprova.");
  } finally {
    btnSalva.disabled = false;
    btnSalva.textContent = origText;
  }
}

// ============================================================
// RIMUOVI LEZIONE / RIPETIZIONE
// ============================================================

async function rimuoviLezione(lezioneId) {
  if (!confirm("Vuoi rimuovere questa lezione dall'orario?")) return;

  try {
    await db.collection("orarioScolastico").doc(lezioneId).delete();
    if (isPanoramaView()) {
      await ricaricaPanoramaCorrente();
    } else {
      await caricaEmostraOrario();
      aggiornaBottoneStudenti();
    }
  } catch (err) {
    console.error("Errore rimozione lezione:", err);
    alert("Errore durante la rimozione. Riprova.");
  }
}

async function rimuoviRipetizione(ripId) {
  if (!confirm("Vuoi rimuovere questa ripetizione?")) return;

  try {
    await db.collection("ripetizioni").doc(ripId).delete();
    if (isPanoramaView()) {
      await ricaricaPanoramaCorrente();
    } else {
      await caricaEmostraOrario();
      aggiornaBottoneStudenti();
    }
  } catch (err) {
    console.error("Errore rimozione ripetizione:", err);
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
    mostraEmpty("Seleziona un'aula per visualizzare le lezioni e ripetizioni assegnate.");
  } else if (vistaCorrente === "classe") {
    mostraEmpty("Seleziona una classe per visualizzare l'orario.");
  } else if (isPanoramaView()) {
    // Panorama non usa empty — carica direttamente
  }
}

function escapeHtml(str) {
  if (!str) return "";
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Verifica se siamo in una delle viste panoramiche */
function isPanoramaView() {
  return vistaCorrente === "panorama" || vistaCorrente === "panorama_cal";
}

/** Ricarica la vista panoramica corrente */
async function ricaricaPanoramaCorrente() {
  if (vistaCorrente === "panorama") await caricaPanorama();
  else if (vistaCorrente === "panorama_cal") await caricaPanoramaCal();
}

// ============================================================
// GESTISCI AULE E CLASSI (invariato)
// ============================================================

function apriGestisci() {
  document.getElementById("gestisci-overlay").classList.add("active");
  switchGestisciTab("aule");
}

function chiudiGestisci() {
  document.getElementById("gestisci-overlay").classList.remove("active");
}

document.addEventListener("click", (e) => {
  const overlay = document.getElementById("gestisci-overlay");
  if (e.target === overlay) chiudiGestisci();
});

function switchGestisciTab(tab) {
  document.querySelectorAll(".gestisci-tab").forEach(t => {
    t.classList.toggle("active", t.dataset.tab === tab);
  });
  document.getElementById("panel-aule").style.display = (tab === "aule") ? "" : "none";
  document.getElementById("panel-classi").style.display = (tab === "classi") ? "" : "none";
  renderGestisciLista(tab);
}

function renderGestisciLista(tipo) {
  const lista = tipo === "aule" ? auleLista : classiLista;
  const container = document.getElementById(`lista-${tipo}`);

  if (lista.length === 0) {
    container.innerHTML = `<div class="gestisci-empty">Nessuna ${tipo === "aule" ? "aula" : "classe"} presente. Aggiungine una!</div>`;
    return;
  }

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

async function aggiungiEntita(tipo) {
  const inputId = tipo === "aule" ? "input-nuova-aula" : "input-nuova-classe";
  const input = document.getElementById(inputId);
  const nome = input.value.trim();
  if (!nome) return;

  const lista = tipo === "aule" ? auleLista : classiLista;
  const duplicato = lista.some(item => item.nome.toLowerCase() === nome.toLowerCase());
  if (duplicato) {
    alert(`Esiste già ${tipo === "aule" ? "un'aula" : "una classe"} con questo nome.`);
    return;
  }

  try {
    const ref = await db.collection(tipo).add({ nome: nome });
    const nuovoItem = { id: ref.id, nome: nome };
    if (tipo === "aule") {
      auleLista.push(nuovoItem);
      auleLista.sort((a, b) => a.nome.localeCompare(b.nome));
    } else {
      classiLista.push(nuovoItem);
      classiLista.sort((a, b) => a.nome.localeCompare(b.nome));
    }
    input.value = "";
    renderGestisciLista(tipo);
    aggiornaDropdownModal();
    if ((tipo === "aule" && vistaCorrente === "aula") || (tipo === "classi" && vistaCorrente === "classe")) {
      popolaDropdownEntita();
    }
  } catch (err) {
    console.error("Errore aggiunta:", err);
    alert("Errore durante l'aggiunta. Riprova.");
  }
}

function iniziaRinomina(tipo, id, nomeAttuale) {
  const itemEl = document.getElementById(`gestisci-item-${id}`);
  if (!itemEl) return;
  itemEl.innerHTML = `
    <input type="text" class="gestisci-item-input" id="rinomina-input-${id}" value="${nomeAttuale}" onkeydown="if(event.key==='Enter')salvaRinomina('${tipo}','${id}')">
    <button class="gestisci-item-btn btn-save" onclick="salvaRinomina('${tipo}','${id}')" title="Salva">✅</button>
    <button class="gestisci-item-btn" onclick="renderGestisciLista('${tipo}')" title="Annulla">❌</button>
  `;
  const input = document.getElementById(`rinomina-input-${id}`);
  input.focus();
  input.select();
}

async function salvaRinomina(tipo, id) {
  const input = document.getElementById(`rinomina-input-${id}`);
  if (!input) return;
  const nuovoNome = input.value.trim();
  if (!nuovoNome) return;

  const lista = tipo === "aule" ? auleLista : classiLista;
  const item = lista.find(i => i.id === id);
  if (!item) return;
  const vecchioNome = item.nome;

  if (nuovoNome === vecchioNome) { renderGestisciLista(tipo); return; }

  const duplicato = lista.some(i => i.id !== id && i.nome.toLowerCase() === nuovoNome.toLowerCase());
  if (duplicato) {
    alert(`Esiste già ${tipo === "aule" ? "un'aula" : "una classe"} con questo nome.`);
    return;
  }

  try {
    await db.collection(tipo).doc(id).update({ nome: nuovoNome });
    const campo = tipo === "aule" ? "aula" : "classe";
    const snapshot = await db.collection("orarioScolastico").where(campo, "==", vecchioNome).get();
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach(doc => { batch.update(doc.ref, { [campo]: nuovoNome }); });
      await batch.commit();
    }

    item.nome = nuovoNome;
    lista.sort((a, b) => a.nome.localeCompare(b.nome));
    lezioniCorrente.forEach(l => { if (l[campo] === vecchioNome) l[campo] = nuovoNome; });

    renderGestisciLista(tipo);
    aggiornaDropdownModal();
    if ((tipo === "aule" && vistaCorrente === "aula") || (tipo === "classi" && vistaCorrente === "classe")) {
      popolaDropdownEntita();
    }
    if (entitaSelezionata) renderTabella();
  } catch (err) {
    console.error("Errore rinomina:", err);
    alert("Errore durante la rinomina. Riprova.");
  }
}

async function eliminaEntita(tipo, id, nome) {
  const campo = tipo === "aule" ? "aula" : "classe";
  const snapshot = await db.collection("orarioScolastico").where(campo, "==", nome).get();

  if (!snapshot.empty) {
    const conferma = confirm(
      `"${nome}" è usata in ${snapshot.size} lezione/i nell'orario.\n\n` +
      `Se elimini, il campo ${campo} verrà svuotato in quelle lezioni.\n\nProcedere?`
    );
    if (!conferma) return;

    const batch = db.batch();
    snapshot.forEach(doc => { batch.update(doc.ref, { [campo]: "" }); });
    await batch.commit();
    lezioniCorrente.forEach(l => { if (l[campo] === nome) l[campo] = ""; });
  } else {
    if (!confirm(`Eliminare "${nome}"?`)) return;
  }

  try {
    await db.collection(tipo).doc(id).delete();
    if (tipo === "aule") {
      auleLista = auleLista.filter(a => a.id !== id);
    } else {
      classiLista = classiLista.filter(c => c.id !== id);
    }
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

function aggiornaDropdownModal() {
  const selectClasse = document.getElementById("modal-classe");
  const selectAula = document.getElementById("modal-aula");

  if (selectClasse) {
    const valCorrente = selectClasse.value;
    selectClasse.innerHTML = `<option value="">— Seleziona classe —</option>`;
    classiLista.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.nome; opt.textContent = c.nome;
      selectClasse.appendChild(opt);
    });
    selectClasse.value = valCorrente;
  }

  if (selectAula) {
    const valCorrente = selectAula.value;
    selectAula.innerHTML = `<option value="">— Seleziona aula —</option>`;
    auleLista.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.nome; opt.textContent = a.nome;
      selectAula.appendChild(opt);
    });
    selectAula.value = valCorrente;
  }
}
