// ═══════════════════════════════════════════════════════════════
//  RIPETIZIONI.JS — Calendario Ripetizioni (pomeriggio)
//  Admin: CRUD completo su tutti i docenti
//  Docente: sola lettura sulle proprie ripetizioni
// ═══════════════════════════════════════════════════════════════

// ──────────────────────────────────────────
//  STATO GLOBALE
// ──────────────────────────────────────────

var isAdmin = false;
var isReadonly = false;
var currentDocenteId = null;

// Settimana visualizzata
var weekOffset = 0;
var settimanaDate = []; // array di 5 stringhe "YYYY-MM-DD" (lun→ven)

// Dati Firestore
var impostazioniOrari = {};
var docentiMap = {};    // id → { nome, cognome, materie, tariffaRipetizione, ... }
var docentiList = [];   // [{ id, nome, cognome, ... }]
var ripetizioni = [];   // array ripetizioni della settimana

// Colori docenti
var COLORI_DOCENTI = [
  { bg: '#E8F5E9', border: '#2E7D32', text: '#1B5E20' },
  { bg: '#E3F2FD', border: '#1565C0', text: '#0D47A1' },
  { bg: '#FFF3E0', border: '#E65100', text: '#BF360C' },
  { bg: '#F3E5F5', border: '#7B1FA2', text: '#4A148C' },
  { bg: '#FFF8E1', border: '#F9A825', text: '#F57F17' },
  { bg: '#E0F2F1', border: '#00695C', text: '#004D40' },
  { bg: '#FCE4EC', border: '#C62828', text: '#B71C1C' },
  { bg: '#E8EAF6', border: '#283593', text: '#1A237E' },
  { bg: '#EFEBE9', border: '#4E342E', text: '#3E2723' },
  { bg: '#F1F8E9', border: '#558B2F', text: '#33691E' }
];
var coloriAssegnati = {}; // docenteId → indice colore

// Costanti layout
var PX_PER_30MIN = 44; // altezza in pixel per ogni blocco di 30 minuti

// Ripetizione selezionata (per modifica)
var ripSelezionata = null;


// ──────────────────────────────────────────
//  INIT
// ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {

  // 1. Controlla autenticazione
  checkAuth();

  // 2. Determina modalità
  var ruolo = getRole();
  var pagina = window.location.pathname.split('/').pop();

  if (pagina === 'mie-ripetizioni.html') {
    // Vista docente
    isAdmin = false;
    isReadonly = true;
    currentDocenteId = getDocenteId();
    if (ruolo !== 'docente' || !currentDocenteId) {
      window.location.href = 'index.html';
      return;
    }
    initPage('Le Mie Ripetizioni');
  } else {
    // Vista admin
    isAdmin = true;
    isReadonly = false;
    checkAdmin();
    initPage('Ripetizioni');
  }

  // 3. Nascondi pulsanti admin se docente
  if (isReadonly) {
    var btnNuova = document.getElementById('btn-nuova-ripetizione');
    if (btnNuova) btnNuova.style.display = 'none';
  }

  // 4. Event listeners navigazione
  document.getElementById('btn-prev-week').addEventListener('click', function () {
    weekOffset--;
    caricaSettimana();
  });
  document.getElementById('btn-next-week').addEventListener('click', function () {
    weekOffset++;
    caricaSettimana();
  });
  document.getElementById('btn-oggi').addEventListener('click', function () {
    weekOffset = 0;
    caricaSettimana();
  });

  // 5. Event listeners modal
  if (!isReadonly) {
    var btnNuova = document.getElementById('btn-nuova-ripetizione');
    if (btnNuova) {
      btnNuova.addEventListener('click', function () {
        apriModalNuova(null, null);
      });
    }

    document.getElementById('form-ripetizione').addEventListener('submit', function (e) {
      e.preventDefault();
      salvaRipetizione();
    });

    document.getElementById('btn-elimina-ripetizione').addEventListener('click', function () {
      if (ripSelezionata && confirm('Sei sicuro di voler eliminare questa ripetizione?')) {
        eliminaRipetizione(ripSelezionata.id);
      }
    });

    // Preview live nel modal
    var campiPreview = ['modal-docente', 'modal-ora-inizio', 'modal-durata'];
    campiPreview.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', aggiornaPreview);
    });
    var dataField = document.getElementById('modal-data');
    if (dataField) dataField.addEventListener('change', aggiornaPreview);
  }

  var btnChiudi = document.querySelectorAll('.modal-close, #btn-annulla-ripetizione');
  btnChiudi.forEach(function (btn) {
    btn.addEventListener('click', chiudiModal);
  });

  // Chiudi modal con overlay
  document.getElementById('modal-overlay-ripetizione').addEventListener('click', function (e) {
    if (e.target === this) chiudiModal();
  });

  // Chiudi modal dettaglio (docente)
  var overlayDettaglio = document.getElementById('modal-overlay-dettaglio');
  if (overlayDettaglio) {
    overlayDettaglio.addEventListener('click', function (e) {
      if (e.target === this) chiudiModalDettaglio();
    });
    var btnChiudiDett = overlayDettaglio.querySelectorAll('.modal-close, #btn-chiudi-dettaglio');
    btnChiudiDett.forEach(function (btn) {
      btn.addEventListener('click', chiudiModalDettaglio);
    });
  }

  // 6. Carica dati
  await caricaDatiBase();
  caricaSettimana();
});


// ──────────────────────────────────────────
//  CALCOLO SETTIMANA
// ──────────────────────────────────────────

function calcolaSettimana(offset) {
  var oggi = new Date();
  // Trova lunedì della settimana corrente
  var giorno = oggi.getDay(); // 0=dom
  var diffLun = giorno === 0 ? -6 : 1 - giorno;
  var lunedi = new Date(oggi);
  lunedi.setDate(oggi.getDate() + diffLun + (offset * 7));

  var date = [];
  for (var i = 0; i < 5; i++) {
    var d = new Date(lunedi);
    d.setDate(lunedi.getDate() + i);
    date.push(formattaDataISO(d));
  }
  return date;
}

function formattaDataISO(d) {
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + '-' + mm + '-' + dd;
}

function aggiornaLabelSettimana() {
  var label = document.getElementById('label-settimana');
  if (settimanaDate.length < 5) return;

  var dLun = new Date(settimanaDate[0] + 'T00:00:00');
  var dVen = new Date(settimanaDate[4] + 'T00:00:00');

  var mesiNomi = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu',
                  'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  var testo = dLun.getDate() + ' ' + mesiNomi[dLun.getMonth()];
  if (dLun.getMonth() !== dVen.getMonth()) {
    testo += ' – ' + dVen.getDate() + ' ' + mesiNomi[dVen.getMonth()];
  } else {
    testo += ' – ' + dVen.getDate();
  }
  testo += ' ' + dVen.getFullYear();

  label.textContent = testo;

  // Evidenzia pulsante "Oggi"
  var btnOggi = document.getElementById('btn-oggi');
  if (btnOggi) {
    btnOggi.classList.toggle('btn-accent', weekOffset !== 0);
    btnOggi.classList.toggle('btn-secondary', weekOffset === 0);
  }
}


// ──────────────────────────────────────────
//  CARICAMENTO DATI
// ──────────────────────────────────────────

/**
 * Carica impostazioni orari e docenti (una sola volta).
 */
async function caricaDatiBase() {
  try {
    var risultati = await Promise.all([
      caricaImpostazioniOrari(),
      db.collection('docenti').get()
    ]);

    impostazioniOrari = risultati[0];

    // Mappa docenti
    docentiMap = {};
    docentiList = [];
    risultati[1].forEach(function (doc) {
      var data = doc.data();
      docentiMap[doc.id] = data;
      docentiList.push({
        id: doc.id,
        nome: data.nome,
        cognome: data.cognome,
        materie: data.materie || [],
        tariffaRipetizione: data.tariffaRipetizione || 0
      });
    });

    // Ordina docenti per cognome
    docentiList.sort(function (a, b) {
      return (a.cognome || '').localeCompare(b.cognome || '');
    });

    // Assegna colori
    docentiList.forEach(function (doc, i) {
      coloriAssegnati[doc.id] = i % COLORI_DOCENTI.length;
    });

    // Popola dropdown docente nel modal (solo admin)
    if (isAdmin) {
      popolaDropdownDocenti();
    }

  } catch (err) {
    console.error('Errore caricamento dati base:', err);
  }
}

/**
 * Carica le ripetizioni per la settimana corrente e renderizza.
 */
async function caricaSettimana() {
  settimanaDate = calcolaSettimana(weekOffset);
  aggiornaLabelSettimana();

  try {
    // Query ripetizioni nella settimana
    var query = db.collection('ripetizioni')
      .where('data', '>=', settimanaDate[0])
      .where('data', '<=', settimanaDate[4]);

    // Se docente, filtra solo le sue
    if (!isAdmin && currentDocenteId) {
      query = db.collection('ripetizioni')
        .where('docenteId', '==', currentDocenteId)
        .where('data', '>=', settimanaDate[0])
        .where('data', '<=', settimanaDate[4]);
    }

    var snapshot = await query.get();
    ripetizioni = [];
    snapshot.forEach(function (doc) {
      ripetizioni.push({ id: doc.id, ...doc.data() });
    });

    renderCalendario();
    renderLegenda();

  } catch (err) {
    console.error('Errore caricamento ripetizioni:', err);
  }
}


// ──────────────────────────────────────────
//  RENDER CALENDARIO
// ──────────────────────────────────────────

function renderCalendario() {
  var griglia = document.getElementById('calendar-grid');
  var giorniNomi = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì'];
  var giorniBrevi = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven'];

  // Trova range orario globale (min apertura → max chiusura)
  var globalMinMin = 24 * 60;
  var globalMaxMin = 0;

  giorniNomi.forEach(function (giorno) {
    var imp = impostazioniOrari[giorno];
    if (!imp) return;
    var apMin = timeToMinutes(imp.pomeriggio_oraApertura || '15:00');
    var chMin = timeToMinutes(imp.pomeriggio_oraChiusura || '18:30');
    if (apMin < globalMinMin) globalMinMin = apMin;
    if (chMin > globalMaxMin) globalMaxMin = chMin;
  });

  // Arrotonda a 30 min
  globalMinMin = Math.floor(globalMinMin / 30) * 30;
  globalMaxMin = Math.ceil(globalMaxMin / 30) * 30;

  var totalSlots = (globalMaxMin - globalMinMin) / 30;
  var altezzaTotale = totalSlots * PX_PER_30MIN;

  // Costruisci HTML
  var html = '';

  // ── Riga header giorni ──
  html += '<div class="cal-header-row">';
  html += '<div class="cal-time-gutter cal-header-cell"></div>'; // angolo vuoto

  for (var i = 0; i < 5; i++) {
    var dataStr = settimanaDate[i];
    var d = new Date(dataStr + 'T00:00:00');
    var oggi = formattaDataISO(new Date());
    var isOggi = dataStr === oggi;

    html += '<div class="cal-header-cell' + (isOggi ? ' cal-today-header' : '') + '">';
    html += '<span class="cal-header-giorno">' + giorniBrevi[i] + '</span>';
    html += '<span class="cal-header-numero' + (isOggi ? ' cal-today-numero' : '') + '">' + d.getDate() + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // ── Corpo griglia ──
  html += '<div class="cal-body" style="height:' + altezzaTotale + 'px;">';

  // Colonna etichette orario
  html += '<div class="cal-time-gutter">';
  for (var s = 0; s < totalSlots; s++) {
    var minuti = globalMinMin + s * 30;
    var label = minutesToTime(minuti);
    html += '<div class="cal-time-label" style="top:' + (s * PX_PER_30MIN) + 'px;height:' + PX_PER_30MIN + 'px;">';
    html += '<span>' + label + '</span>';
    html += '</div>';
  }
  html += '</div>';

  // 5 colonne giorno
  for (var c = 0; c < 5; c++) {
    var giorno = giorniNomi[c];
    var dataGiorno = settimanaDate[c];
    var imp = impostazioniOrari[giorno] || {};
    var apMin = timeToMinutes(imp.pomeriggio_oraApertura || '15:00');
    var chMin = timeToMinutes(imp.pomeriggio_oraChiusura || '18:30');
    var oggi = formattaDataISO(new Date());
    var isOggi = dataGiorno === oggi;

    html += '<div class="cal-day-column' + (isOggi ? ' cal-today-column' : '') + '" data-data="' + dataGiorno + '" data-giorno="' + giorno + '">';

    // Linee griglia orizzontali
    for (var s = 0; s < totalSlots; s++) {
      var slotMin = globalMinMin + s * 30;
      var inRange = slotMin >= apMin && slotMin < chMin;
      html += '<div class="cal-grid-line' + (inRange ? '' : ' cal-grid-disabled') + '" ';
      html += 'style="top:' + (s * PX_PER_30MIN) + 'px;height:' + PX_PER_30MIN + 'px;" ';
      if (inRange && !isReadonly) {
        html += 'data-data="' + dataGiorno + '" data-ora="' + minutesToTime(slotMin) + '" ';
      }
      html += '></div>';
    }

    // Indicatore "ora corrente" se è oggi
    if (isOggi) {
      var now = new Date();
      var nowMin = now.getHours() * 60 + now.getMinutes();
      if (nowMin >= globalMinMin && nowMin <= globalMaxMin) {
        var topNow = ((nowMin - globalMinMin) / 30) * PX_PER_30MIN;
        html += '<div class="cal-now-line" style="top:' + topNow + 'px;"></div>';
      }
    }

    // Blocchi ripetizioni di questo giorno
    var ripGiorno = ripetizioni.filter(function (r) { return r.data === dataGiorno; });

    ripGiorno.forEach(function (rip) {
      var startMin = timeToMinutes(rip.oraInizio || '15:00');
      var durata = Number(rip.durata) || 60;
      var endMin = startMin + durata;

      var top = ((startMin - globalMinMin) / 30) * PX_PER_30MIN;
      var height = (durata / 30) * PX_PER_30MIN;

      var colIdx = coloriAssegnati[rip.docenteId] != null ? coloriAssegnati[rip.docenteId] : 0;
      var col = COLORI_DOCENTI[colIdx];

      var docente = docentiMap[rip.docenteId];
      var nomeDocente = docente ? (docente.nome + ' ' + docente.cognome) : '?';
      var tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
      var importo = ((durata / 60) * tariffa).toFixed(2).replace('.', ',');
      var oraFine = minutesToTime(endMin);

      html += '<div class="cal-block" ';
      html += 'style="top:' + top + 'px;height:' + (height - 2) + 'px;';
      html += 'background:' + col.bg + ';border-left:3px solid ' + col.border + ';color:' + col.text + ';" ';
      html += 'data-rip-id="' + rip.id + '" ';
      html += 'title="' + escHtml(rip.studente) + ' — ' + escHtml(rip.materia) + '">';

      html += '<div class="cal-block-ora">' + escHtml(rip.oraInizio) + ' – ' + oraFine + '</div>';
      html += '<div class="cal-block-studente">' + escHtml(rip.studente || '') + '</div>';

      // Mostra più dettagli se il blocco è abbastanza alto
      if (durata >= 60) {
        html += '<div class="cal-block-materia">' + escHtml(rip.materia || '') +
                (rip.classe ? ' · ' + escHtml(rip.classe) : '') + '</div>';
      }
      if (durata >= 90) {
        html += '<div class="cal-block-docente">' + escHtml(nomeDocente) + '</div>';
      }

      html += '<div class="cal-block-importo">€ ' + importo + '</div>';
      html += '</div>';
    });

    html += '</div>'; // chiudi cal-day-column
  }

  html += '</div>'; // chiudi cal-body

  griglia.innerHTML = html;

  // ── Event listeners blocchi ──
  griglia.querySelectorAll('.cal-block').forEach(function (blocco) {
    blocco.addEventListener('click', function (e) {
      e.stopPropagation();
      var ripId = this.getAttribute('data-rip-id');
      if (isAdmin) {
        apriModalModifica(ripId);
      } else {
        apriModalDettaglio(ripId);
      }
    });
  });

  // ── Event listeners click su slot vuoto (solo admin) ──
  if (!isReadonly) {
    griglia.querySelectorAll('.cal-grid-line:not(.cal-grid-disabled)').forEach(function (slot) {
      slot.addEventListener('click', function () {
        var data = this.getAttribute('data-data');
        var ora = this.getAttribute('data-ora');
        if (data && ora) {
          apriModalNuova(data, ora);
        }
      });
    });
  }
}


// ──────────────────────────────────────────
//  RENDER LEGENDA DOCENTI
// ──────────────────────────────────────────

function renderLegenda() {
  var container = document.getElementById('legenda-docenti');
  if (!container) return;

  // Trova docenti che hanno ripetizioni questa settimana
  var docentiPresenti = {};
  ripetizioni.forEach(function (r) {
    if (!docentiPresenti[r.docenteId]) {
      docentiPresenti[r.docenteId] = true;
    }
  });

  var ids = Object.keys(docentiPresenti);
  if (ids.length === 0) {
    container.innerHTML = '<span class="text-muted text-sm">Nessuna ripetizione questa settimana</span>';
    return;
  }

  var html = '';
  ids.forEach(function (id) {
    var doc = docentiMap[id];
    var nome = doc ? (doc.nome + ' ' + doc.cognome) : 'Sconosciuto';
    var colIdx = coloriAssegnati[id] != null ? coloriAssegnati[id] : 0;
    var col = COLORI_DOCENTI[colIdx];

    html += '<span class="legenda-item">';
    html += '<span class="legenda-color" style="background:' + col.border + ';"></span>';
    html += '<span class="legenda-nome">' + escHtml(nome) + '</span>';
    html += '</span>';
  });

  container.innerHTML = html;
}


// ──────────────────────────────────────────
//  MODAL: NUOVA RIPETIZIONE (Admin)
// ──────────────────────────────────────────

function apriModalNuova(data, ora) {
  ripSelezionata = null;

  document.getElementById('modal-title-ripetizione').textContent = 'Nuova Ripetizione';
  document.getElementById('btn-elimina-ripetizione').style.display = 'none';
  document.getElementById('btn-salva-ripetizione').textContent = 'Salva';

  // Reset form
  var form = document.getElementById('form-ripetizione');
  form.reset();

  // Precompila data e ora se forniti
  if (data) document.getElementById('modal-data').value = data;
  if (ora) document.getElementById('modal-ora-inizio').value = ora;

  // Default durata
  document.getElementById('modal-durata').value = '60';

  aggiornaPreview();
  mostraModal();
}


// ──────────────────────────────────────────
//  MODAL: MODIFICA RIPETIZIONE (Admin)
// ──────────────────────────────────────────

function apriModalModifica(ripId) {
  var rip = ripetizioni.find(function (r) { return r.id === ripId; });
  if (!rip) return;

  ripSelezionata = rip;

  document.getElementById('modal-title-ripetizione').textContent = 'Modifica Ripetizione';
  document.getElementById('btn-elimina-ripetizione').style.display = 'inline-flex';
  document.getElementById('btn-salva-ripetizione').textContent = 'Aggiorna';

  // Popola campi
  document.getElementById('modal-docente').value = rip.docenteId || '';
  document.getElementById('modal-data').value = rip.data || '';
  document.getElementById('modal-ora-inizio').value = rip.oraInizio || '';
  document.getElementById('modal-durata').value = String(rip.durata || 60);
  document.getElementById('modal-studente').value = rip.studente || '';
  document.getElementById('modal-materia').value = rip.materia || '';
  document.getElementById('modal-classe').value = rip.classe || '';
  document.getElementById('modal-note').value = rip.note || '';

  aggiornaPreview();
  mostraModal();
}


// ──────────────────────────────────────────
//  MODAL: DETTAGLIO RIPETIZIONE (Docente)
// ──────────────────────────────────────────

function apriModalDettaglio(ripId) {
  var rip = ripetizioni.find(function (r) { return r.id === ripId; });
  if (!rip) return;

  var docente = docentiMap[rip.docenteId];
  var nomeDocente = docente ? (docente.nome + ' ' + docente.cognome) : 'Sconosciuto';
  var tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
  var durata = Number(rip.durata) || 60;
  var importo = ((durata / 60) * tariffa).toFixed(2).replace('.', ',');
  var oraFine = minutesToTime(timeToMinutes(rip.oraInizio || '15:00') + durata);

  // Data leggibile
  var dataObj = new Date(rip.data + 'T00:00:00');
  var giorni = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
  var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
              'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var dataLeggibile = giorni[dataObj.getDay()] + ' ' + dataObj.getDate() + ' ' + mesi[dataObj.getMonth()] + ' ' + dataObj.getFullYear();

  var container = document.getElementById('dettaglio-contenuto');
  container.innerHTML =
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">📅 Data</span>' +
    '  <span class="dettaglio-valore">' + dataLeggibile + '</span>' +
    '</div>' +
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">🕐 Orario</span>' +
    '  <span class="dettaglio-valore">' + escHtml(rip.oraInizio) + ' → ' + oraFine + ' (' + durata + ' min)</span>' +
    '</div>' +
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">👤 Studente</span>' +
    '  <span class="dettaglio-valore">' + escHtml(rip.studente || '—') + '</span>' +
    '</div>' +
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">📖 Materia</span>' +
    '  <span class="dettaglio-valore">' + escHtml(rip.materia || '—') + '</span>' +
    '</div>' +
    (rip.classe ?
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">🏫 Classe</span>' +
    '  <span class="dettaglio-valore">' + escHtml(rip.classe) + '</span>' +
    '</div>' : '') +
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">💰 Importo</span>' +
    '  <span class="dettaglio-valore">€ ' + importo + '</span>' +
    '</div>' +
    (rip.note ?
    '<div class="dettaglio-riga">' +
    '  <span class="dettaglio-label">📝 Note</span>' +
    '  <span class="dettaglio-valore">' + escHtml(rip.note) + '</span>' +
    '</div>' : '');

  document.getElementById('modal-overlay-dettaglio').classList.add('active');
}

function chiudiModalDettaglio() {
  document.getElementById('modal-overlay-dettaglio').classList.remove('active');
}


// ──────────────────────────────────────────
//  PREVIEW ORARIO + TARIFFA
// ──────────────────────────────────────────

function aggiornaPreview() {
  var previewEl = document.getElementById('modal-preview');
  var warningEl = document.getElementById('modal-warning');
  if (!previewEl) return;

  var docenteId = document.getElementById('modal-docente').value;
  var oraInizio = document.getElementById('modal-ora-inizio').value;
  var durata = Number(document.getElementById('modal-durata').value) || 60;
  var dataVal = document.getElementById('modal-data').value;

  // Reset
  previewEl.textContent = '';
  warningEl.textContent = '';
  warningEl.style.display = 'none';

  if (!oraInizio) return;

  var endMin = timeToMinutes(oraInizio) + durata;
  var oraFine = minutesToTime(endMin);

  var testoPreview = oraInizio + ' → ' + oraFine;

  // Tariffa
  if (docenteId && docentiMap[docenteId]) {
    var tariffa = Number(docentiMap[docenteId].tariffaRipetizione) || 0;
    var ore = durata / 60;
    var totale = (ore * tariffa).toFixed(2).replace('.', ',');
    testoPreview += '  ·  Tariffa €' + tariffa + '/h → Totale € ' + totale;
  }

  previewEl.textContent = testoPreview;

  // Warning se supera ora chiusura
  if (dataVal) {
    var dataObj = new Date(dataVal + 'T00:00:00');
    var dow = dataObj.getDay(); // 0=dom, 1=lun,...
    var giorniNomi = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    var nomeGiorno = giorniNomi[dow];
    var imp = impostazioniOrari[nomeGiorno];

    if (imp) {
      var apMin = timeToMinutes(imp.pomeriggio_oraApertura || '15:00');
      var chMin = timeToMinutes(imp.pomeriggio_oraChiusura || '18:30');
      var startMin = timeToMinutes(oraInizio);

      if (startMin < apMin) {
        warningEl.textContent = '⚠️ L\'orario di inizio è prima dell\'apertura pomeridiana (' + (imp.pomeriggio_oraApertura || '15:00') + ') di ' + nomeGiorno + '.';
        warningEl.style.display = 'block';
      } else if (endMin > chMin) {
        warningEl.textContent = '⚠️ La ripetizione termina dopo l\'orario di chiusura (' + (imp.pomeriggio_oraChiusura || '18:30') + ') di ' + nomeGiorno + '.';
        warningEl.style.display = 'block';
      }
    }
  }
}


// ──────────────────────────────────────────
//  SALVA RIPETIZIONE (Admin)
// ──────────────────────────────────────────

async function salvaRipetizione() {
  var docenteId = document.getElementById('modal-docente').value;
  var data = document.getElementById('modal-data').value;
  var oraInizio = document.getElementById('modal-ora-inizio').value;
  var durata = Number(document.getElementById('modal-durata').value);
  var studente = document.getElementById('modal-studente').value.trim();
  var materia = document.getElementById('modal-materia').value.trim();
  var classe = document.getElementById('modal-classe').value.trim();
  var note = document.getElementById('modal-note').value.trim();

  // Validazione
  if (!docenteId || !data || !oraInizio || !durata || !studente || !materia) {
    alert('Compila tutti i campi obbligatori (docente, data, ora, durata, studente, materia).');
    return;
  }

  // Controlla che la data sia lun-ven
  var dataObj = new Date(data + 'T00:00:00');
  var dow = dataObj.getDay();
  if (dow === 0 || dow === 6) {
    alert('Le ripetizioni possono essere solo dal lunedì al venerdì.');
    return;
  }

  var documento = {
    docenteId: docenteId,
    data: data,
    oraInizio: oraInizio,
    durata: durata,
    studente: studente,
    materia: materia,
    classe: classe,
    note: note,
    creatoIl: firebase.firestore.FieldValue.serverTimestamp()
  };

  var btnSalva = document.getElementById('btn-salva-ripetizione');
  btnSalva.disabled = true;
  btnSalva.textContent = 'Salvataggio...';

  try {
    if (ripSelezionata) {
      // Aggiorna
      await db.collection('ripetizioni').doc(ripSelezionata.id).update(documento);
    } else {
      // Crea nuova
      await db.collection('ripetizioni').add(documento);
    }

    chiudiModal();
    await caricaSettimana(); // Ricarica

  } catch (err) {
    console.error('Errore salvataggio ripetizione:', err);
    alert('Errore durante il salvataggio. Riprova.');
  } finally {
    btnSalva.disabled = false;
    btnSalva.textContent = ripSelezionata ? 'Aggiorna' : 'Salva';
  }
}


// ──────────────────────────────────────────
//  ELIMINA RIPETIZIONE (Admin)
// ──────────────────────────────────────────

async function eliminaRipetizione(id) {
  try {
    await db.collection('ripetizioni').doc(id).delete();
    chiudiModal();
    await caricaSettimana();
  } catch (err) {
    console.error('Errore eliminazione ripetizione:', err);
    alert('Errore durante l\'eliminazione. Riprova.');
  }
}


// ──────────────────────────────────────────
//  MODAL HELPERS
// ──────────────────────────────────────────

function mostraModal() {
  document.getElementById('modal-overlay-ripetizione').classList.add('active');
}

function chiudiModal() {
  document.getElementById('modal-overlay-ripetizione').classList.remove('active');
  ripSelezionata = null;
}

function popolaDropdownDocenti() {
  var select = document.getElementById('modal-docente');
  if (!select) return;

  select.innerHTML = '<option value="">— Seleziona docente —</option>';
  docentiList.forEach(function (doc) {
    var opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = doc.cognome + ' ' + doc.nome;
    select.appendChild(opt);
  });
}


// ──────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────

function escHtml(str) {
  var div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}
