// ============================================================
// riepilogo.js — Riepilogo Mensile (solo Admin)
// ============================================================
// Mostra per ogni docente: lezioni mattina + ripetizioni pomeriggio
// con calcolo automatico importi basato su tariffe e impostazioni.
// ============================================================

// ── Stato corrente ──
let meseCorrente;    // 1-12
let annoCorrente;
let datiRiepilogo = null;  // dati calcolati, usati anche da export-csv

// ── Riferimenti DOM ──
const meseLabel        = document.getElementById("mese-label");
const btnPrev          = document.getElementById("btn-mese-prev");
const btnNext          = document.getElementById("btn-mese-next");
const btnEsporta       = document.getElementById("btn-esporta-csv");
const listaContainer   = document.getElementById("lista-docenti-riepilogo");

const rstatOre         = document.getElementById("rstat-ore");
const rstatOreSub      = document.getElementById("rstat-ore-sub");
const rstatGiorni      = document.getElementById("rstat-giorni");
const rstatGiorniSub   = document.getElementById("rstat-giorni-sub");
const rstatImporto     = document.getElementById("rstat-importo");
const rstatImportoSub  = document.getElementById("rstat-importo-sub");

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  checkAdmin();
  initPage("Riepilogo Mensile");

  // Mese iniziale = mese corrente
  const oggi = new Date();
  meseCorrente = oggi.getMonth() + 1;  // 1-12
  annoCorrente = oggi.getFullYear();

  // Event listeners
  btnPrev.addEventListener("click", () => cambiaMese(-1));
  btnNext.addEventListener("click", () => cambiaMese(+1));
  btnEsporta.addEventListener("click", () => esportaCSV(datiRiepilogo, meseCorrente, annoCorrente));

  // Carica dati
  caricaRiepilogo();
});

// ══════════════════════════════════════════
// NAVIGAZIONE MESE
// ══════════════════════════════════════════
function cambiaMese(delta) {
  meseCorrente += delta;
  if (meseCorrente < 1) {
    meseCorrente = 12;
    annoCorrente--;
  } else if (meseCorrente > 12) {
    meseCorrente = 1;
    annoCorrente++;
  }
  caricaRiepilogo();
}

function aggiornaMeseLabel() {
  meseLabel.textContent = `${MESI[meseCorrente - 1]} ${annoCorrente}`;
}

// ══════════════════════════════════════════
// CARICA TUTTI I DATI E CALCOLA
// ══════════════════════════════════════════
async function caricaRiepilogo() {
  aggiornaMeseLabel();
  btnEsporta.disabled = true;
  datiRiepilogo = null;

  // Mostra skeleton
  listaContainer.innerHTML = `
    <div class="docente-riepilogo">
      <div class="dr-summary" style="cursor:default;">
        <div class="dr-docente">
          <div class="skeleton" style="width:44px;height:44px;border-radius:50%;flex-shrink:0;"></div>
          <div>
            <div class="skeleton" style="width:140px;height:16px;margin-bottom:6px;"></div>
            <div class="skeleton" style="width:100px;height:12px;"></div>
          </div>
        </div>
        <div class="dr-col"><div class="skeleton" style="width:70px;height:20px;margin:0 auto;"></div></div>
        <div class="dr-col"><div class="skeleton" style="width:70px;height:20px;margin:0 auto;"></div></div>
        <div class="dr-col"><div class="skeleton" style="width:80px;height:24px;margin:0 auto;"></div></div>
        <div></div>
      </div>
    </div>
  `.repeat(2);

  try {
    // 1) Carica tutti i docenti
    const docentiSnap = await db.collection("docenti").orderBy("cognome").get();
    const docenti = [];
    docentiSnap.forEach(doc => {
      docenti.push({ id: doc.id, ...doc.data() });
    });

    if (docenti.length === 0) {
      mostraEmpty();
      return;
    }

    // 2) Carica orario scolastico (tutte le lezioni)
    const orarioSnap = await db.collection("orarioScolastico").get();
    const orarioLezioni = [];
    orarioSnap.forEach(doc => {
      orarioLezioni.push({ id: doc.id, ...doc.data() });
    });

    // 3) Carica ripetizioni del mese
    const primoGiorno = `${annoCorrente}-${String(meseCorrente).padStart(2, "0")}-01`;
    const ultimoGiornoNum = new Date(annoCorrente, meseCorrente, 0).getDate();
    const ultimoGiorno = `${annoCorrente}-${String(meseCorrente).padStart(2, "0")}-${String(ultimoGiornoNum).padStart(2, "0")}`;

    const ripSnap = await db.collection("ripetizioni")
      .where("data", ">=", primoGiorno)
      .where("data", "<=", ultimoGiorno)
      .get();
    const ripetizioni = [];
    ripSnap.forEach(doc => {
      ripetizioni.push({ id: doc.id, ...doc.data() });
    });

    // 4) Carica impostazioni orari
    const impostazioni = await caricaImpostazioniOrari();

    // 5) Calcola conteggio giorni nel mese (quante volte compare ogni giorno)
    const conteggioGiorni = contaGiorniPerNome(annoCorrente, meseCorrente);
    const giorniLavorativiTotali = Object.values(conteggioGiorni).reduce((s, v) => s + v, 0);

    // 6) Calcola riepilogo per ogni docente
    const riepilogoDocenti = docenti.map(docente => {
      return calcolaRiepilogoDocente(docente, orarioLezioni, ripetizioni, impostazioni, conteggioGiorni);
    });

    // 7) Calcola totali globali
    let oreTotaliGlobali = 0;
    let importoTotaleGlobale = 0;
    let lezioniTotaliGlobali = 0;
    let ripetizioniTotaliGlobali = 0;

    riepilogoDocenti.forEach(r => {
      oreTotaliGlobali += r.oreTotali;
      importoTotaleGlobale += r.importoTotale;
      lezioniTotaliGlobali += r.mattina.lezioniTotaliMese;
      ripetizioniTotaliGlobali += r.ripetizioni.totaleSessioni;
    });

    // 8) Aggiorna stat cards
    rstatOre.textContent = formattaOre(oreTotaliGlobali);
    rstatOre.classList.remove("loading");
    rstatOreSub.textContent = `${lezioniTotaliGlobali} lezioni + ${ripetizioniTotaliGlobali} ripetizioni`;

    rstatGiorni.textContent = giorniLavorativiTotali;
    rstatGiorni.classList.remove("loading");
    rstatGiorniSub.textContent = GIORNI.map(g => `${g.substring(0, 3)} ${conteggioGiorni[g]}`).join(" · ");

    rstatImporto.textContent = formattaEuro(importoTotaleGlobale);
    rstatImporto.classList.remove("loading");
    rstatImportoSub.textContent = `${docenti.length} docenti`;

    // 9) Renderizza lista docenti
    renderizzaDocenti(riepilogoDocenti);

    // 10) Salva dati per export CSV
    datiRiepilogo = {
      docenti: riepilogoDocenti,
      oreTotaliGlobali,
      importoTotaleGlobale,
      lezioniTotaliGlobali,
      ripetizioniTotaliGlobali,
      giorniLavorativiTotali,
      impostazioni
    };
    btnEsporta.disabled = false;

  } catch (err) {
    console.error("Errore caricamento riepilogo:", err);
    listaContainer.innerHTML = `
      <div class="riepilogo-empty">
        <div class="empty-icon">⚠️</div>
        <p>Errore nel caricamento dei dati. Riprova.</p>
      </div>
    `;
  }
}

// ══════════════════════════════════════════
// CALCOLO RIEPILOGO SINGOLO DOCENTE
// ══════════════════════════════════════════
function calcolaRiepilogoDocente(docente, orarioLezioni, ripetizioni, impostazioni, conteggioGiorni) {
  const tariffaLezione     = docente.tariffaLezione || 0;
  const tariffaRipetizione = docente.tariffaRipetizione || 0;

  // ── MATTINA: lezioni da orario scolastico ──
  // Filtra lezioni di questo docente
  const lezioniDocente = orarioLezioni.filter(l => l.docenteId === docente.id);

  // Raggruppa per giorno
  const lezioniPerGiorno = {};
  GIORNI.forEach(g => { lezioniPerGiorno[g] = []; });
  lezioniDocente.forEach(l => {
    if (lezioniPerGiorno[l.giorno]) {
      lezioniPerGiorno[l.giorno].push(l);
    }
  });

  // Per ogni giorno: conta lezioni × quante volte quel giorno compare nel mese
  const mattinaDettaglio = {};
  let lezioniTotaliMese = 0;
  let oreMattinaTotal = 0;

  GIORNI.forEach(giorno => {
    const lezioniGiorno = lezioniPerGiorno[giorno].length;
    const volteNelMese = conteggioGiorni[giorno] || 0;
    const lezioniMese = lezioniGiorno * volteNelMese;

    // Durata lezione dal giorno (da impostazioni)
    const imp = impostazioni[giorno] || {};
    const durataLezioneMin = imp.mattina_durataLezione || 50;
    const oreGiorno = (lezioniMese * durataLezioneMin) / 60;

    mattinaDettaglio[giorno] = {
      lezioniSettimana: lezioniGiorno,
      volteNelMese: volteNelMese,
      lezioniMese: lezioniMese,
      durataLezioneMin: durataLezioneMin,
      ore: oreGiorno
    };

    lezioniTotaliMese += lezioniMese;
    oreMattinaTotal += oreGiorno;
  });

  const importoMattina = lezioniTotaliMese * tariffaLezione;

  // ── RIPETIZIONI: dal collection ripetizioni ──
  const ripDocente = ripetizioni.filter(r => r.docenteId === docente.id);

  // Raggruppa per studente+materia+classe
  const gruppi = {};
  ripDocente.forEach(r => {
    const chiave = `${r.studente}|||${r.materia}|||${r.classe || ""}`;
    if (!gruppi[chiave]) {
      gruppi[chiave] = {
        studente: r.studente,
        materia: r.materia,
        classe: r.classe || "",
        sessioni: 0,
        minutiTotali: 0,
        dettaglioSessioni: []
      };
    }
    gruppi[chiave].sessioni++;
    gruppi[chiave].minutiTotali += (r.durata || 60);
    gruppi[chiave].dettaglioSessioni.push({
      data: r.data,
      oraInizio: r.oraInizio,
      durata: r.durata || 60
    });
  });

  const gruppiArray = Object.values(gruppi);
  let oreRipetizioni = 0;
  let totaleSessioniRip = 0;

  gruppiArray.forEach(g => {
    oreRipetizioni += g.minutiTotali / 60;
    totaleSessioniRip += g.sessioni;
  });

  const importoRipetizioni = oreRipetizioni * tariffaRipetizione;

  // ── TOTALE ──
  const oreTotali = oreMattinaTotal + oreRipetizioni;
  const importoTotale = importoMattina + importoRipetizioni;

  return {
    docente,
    mattina: {
      dettaglio: mattinaDettaglio,
      lezioniTotaliMese,
      ore: oreMattinaTotal,
      importo: importoMattina,
      tariffaLezione
    },
    ripetizioni: {
      gruppi: gruppiArray,
      ore: oreRipetizioni,
      totaleSessioni: totaleSessioniRip,
      importo: importoRipetizioni,
      tariffaRipetizione,
      dettaglioRaw: ripDocente
    },
    oreTotali,
    importoTotale
  };
}

// ══════════════════════════════════════════
// RENDERIZZA LISTA DOCENTI
// ══════════════════════════════════════════
function renderizzaDocenti(riepilogoDocenti) {
  if (riepilogoDocenti.length === 0) {
    mostraEmpty();
    return;
  }

  listaContainer.innerHTML = "";

  riepilogoDocenti.forEach((r, index) => {
    const doc = r.docente;
    const iniziali = (doc.nome?.charAt(0) || "") + (doc.cognome?.charAt(0) || "");
    const nomeCompleto = `${doc.nome || ""} ${doc.cognome || ""}`.trim();

    const card = document.createElement("div");
    card.className = "docente-riepilogo";

    // ── SUMMARY (riga chiusa) ──
    card.innerHTML = `
      <div class="dr-summary" onclick="toggleDocente(this)">
        <div class="dr-docente">
          <div class="dr-avatar">${iniziali.toUpperCase()}</div>
          <div>
            <div class="dr-nome">${nomeCompleto}</div>
            <div class="dr-tariffe">
              Lezione <span>€${r.mattina.tariffaLezione}</span>
              &nbsp;·&nbsp;
              Ripetizione <span>€${r.ripetizioni.tariffaRipetizione}/h</span>
            </div>
          </div>
        </div>

        <div class="dr-col">
          <div class="dr-col-label">Mattina</div>
          <div class="dr-col-importo">${formattaEuro(r.mattina.importo)}</div>
          <div class="dr-col-detail">${r.mattina.lezioniTotaliMese} lez · ${formattaOre(r.mattina.ore)}</div>
        </div>

        <div class="dr-col">
          <div class="dr-col-label">Ripetizioni</div>
          <div class="dr-col-importo">${formattaEuro(r.ripetizioni.importo)}</div>
          <div class="dr-col-detail">${r.ripetizioni.totaleSessioni} rip · ${formattaOre(r.ripetizioni.ore)}</div>
        </div>

        <div class="dr-col dr-col-total">
          <div class="dr-col-label">Totale</div>
          <div class="dr-col-importo">${formattaEuro(r.importoTotale)}</div>
          <div class="dr-col-detail">${formattaOre(r.oreTotali)}</div>
        </div>

        <div class="dr-toggle">▼</div>
      </div>

      <div class="dr-detail">
        ${renderSezioneMattinaHTML(r)}
        ${renderSezioneRipetizioniHTML(r)}
        ${renderSezioneTotaleHTML(r, nomeCompleto)}
      </div>
    `;

    listaContainer.appendChild(card);
  });
}

// ── Toggle accordion ──
function toggleDocente(summaryEl) {
  const card = summaryEl.closest(".docente-riepilogo");
  card.classList.toggle("open");
}

// ══════════════════════════════════════════
// RENDER SEZIONE MATTINA (HTML)
// ══════════════════════════════════════════
function renderSezioneMattinaHTML(r) {
  const dettaglio = r.mattina.dettaglio;

  const giorniHTML = GIORNI.map(giorno => {
    const d = dettaglio[giorno];
    return `
      <div class="mattina-giorno">
        <div class="mattina-giorno-nome">${giorno.substring(0, 3)}</div>
        <div class="mattina-giorno-lez">${d.lezioniSettimana}</div>
        <div class="mattina-giorno-sub">lez/sett</div>
        <div class="mattina-giorno-mese">
          ×${d.volteNelMese} sett = <strong>${d.lezioniMese}</strong> lez
        </div>
      </div>
    `;
  }).join("");

  return `
    <div class="dr-section-mattina">
      <div class="dr-section-title">
        🌅 Lezioni Mattina — €${r.mattina.tariffaLezione} a lezione
      </div>
      <div class="mattina-grid">
        ${giorniHTML}
      </div>
      <div class="mattina-totale">
        <div>
          <span class="mattina-totale-label">Totale Mattina</span>
          <span class="mattina-totale-detail">
            ${r.mattina.lezioniTotaliMese} lezioni × €${r.mattina.tariffaLezione} · ${formattaOre(r.mattina.ore)}
          </span>
        </div>
        <div class="mattina-totale-value">${formattaEuro(r.mattina.importo)}</div>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER SEZIONE RIPETIZIONI (HTML)
// ══════════════════════════════════════════
function renderSezioneRipetizioniHTML(r) {
  const gruppi = r.ripetizioni.gruppi;

  if (gruppi.length === 0) {
    return `
      <div class="dr-section-ripetizioni">
        <div class="dr-section-title">
          📚 Ripetizioni Pomeriggio — €${r.ripetizioni.tariffaRipetizione}/ora
        </div>
        <div class="rip-nessuna">Nessuna ripetizione in questo mese</div>
      </div>
    `;
  }

  const righeHTML = gruppi.map(g => {
    const ore = g.minutiTotali / 60;
    const importo = ore * r.ripetizioni.tariffaRipetizione;
    return `
      <tr>
        <td>${g.studente}</td>
        <td><span class="badge-materia" style="font-size:12px;">${g.materia}</span></td>
        <td>${g.classe || "—"}</td>
        <td class="text-right">${g.sessioni}</td>
        <td class="text-right">${formattaOre(ore)}</td>
        <td class="text-right" style="font-weight:600;color:#2D6A4F;">${formattaEuro(importo)}</td>
      </tr>
    `;
  }).join("");

  return `
    <div class="dr-section-ripetizioni">
      <div class="dr-section-title">
        📚 Ripetizioni Pomeriggio — €${r.ripetizioni.tariffaRipetizione}/ora · Per Studente
      </div>
      <table class="rip-table">
        <thead>
          <tr>
            <th>Studente</th>
            <th>Materia</th>
            <th>Classe</th>
            <th class="text-right">Sessioni</th>
            <th class="text-right">Ore</th>
            <th class="text-right">Importo</th>
          </tr>
        </thead>
        <tbody>
          ${righeHTML}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3" style="text-align:right;">Subtotale Ripetizioni</td>
            <td class="text-right">${r.ripetizioni.totaleSessioni}</td>
            <td class="text-right">${formattaOre(r.ripetizioni.ore)}</td>
            <td class="text-right">${formattaEuro(r.ripetizioni.importo)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

// ══════════════════════════════════════════
// RENDER SEZIONE TOTALE DOCENTE (HTML)
// ══════════════════════════════════════════
function renderSezioneTotaleHTML(r, nomeCompleto) {
  const meseNome = MESI[meseCorrente - 1].toUpperCase();

  return `
    <div class="dr-section-totale">
      <div class="dr-section-title">
        💰 TOTALE ${meseNome} — ${nomeCompleto}
      </div>
      <div class="dr-totale-big">
        <span class="dr-totale-importo">${formattaEuro(r.importoTotale)}</span>
        <span class="dr-totale-ore">${formattaOre(r.oreTotali)}</span>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════
// HELPERS DI FORMATTAZIONE
// ══════════════════════════════════════════

/**
 * Formatta un importo in euro.
 * @param {number} val - Es: 1250.5
 * @returns {string} Es: "€1.250,50"
 */
function formattaEuro(val) {
  return "€" + val.toLocaleString("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

/**
 * Formatta ore decimali in stringa leggibile.
 * @param {number} ore - Es: 12.5
 * @returns {string} Es: "12h 30m"
 */
function formattaOre(ore) {
  const h = Math.floor(ore);
  const m = Math.round((ore - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Mostra stato vuoto
 */
function mostraEmpty() {
  listaContainer.innerHTML = `
    <div class="riepilogo-empty">
      <div class="empty-icon">📋</div>
      <p>Nessun docente trovato. Aggiungi docenti dall'Anagrafica.</p>
    </div>
  `;

  rstatOre.textContent = "0h";
  rstatGiorni.textContent = "0";
  rstatImporto.textContent = "€0,00";
}
