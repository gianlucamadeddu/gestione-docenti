// ============================================================
// utils.js — Funzioni di utilità
// ============================================================
// Costanti, formattazione date/orari, calcoli fasce orarie,
// e lettura impostazioni da Firestore.
//
// NOVITÀ v3.0:
// - calcolaFasceUnificate(): calcola fasce mattina + pomeriggio
// - trovaSlotPerOra(): mappa un orario ad uno slot
// - calcolaSettimanaDate(): calcola le date lun-ven di una settimana
// ============================================================

/**
 * Giorni lavorativi della settimana
 */
const GIORNI = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"];

/**
 * Nomi dei mesi in italiano
 */
const MESI = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

/**
 * Nomi brevi dei giorni in italiano
 */
const GIORNI_BREVI = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];

/**
 * Nomi brevi dei mesi in italiano
 */
const MESI_BREVI = [
  "gen", "feb", "mar", "apr", "mag", "giu",
  "lug", "ago", "set", "ott", "nov", "dic"
];

// ──────────────────────────────────────────
// FORMATTAZIONE DATE
// ──────────────────────────────────────────

/**
 * Formatta una data stringa in formato leggibile.
 * @param {string} dateString - Data in formato "YYYY-MM-DD"
 * @returns {string} Es: "mer 18 feb"
 */
function formatDate(dateString) {
  const date = new Date(dateString + "T00:00:00");
  const giorno = GIORNI_BREVI[date.getDay()];
  const numero = date.getDate();
  const mese = MESI_BREVI[date.getMonth()];
  return `${giorno} ${numero} ${mese}`;
}

/**
 * Formatta una data in formato completo.
 * @param {string} dateString - Data in formato "YYYY-MM-DD"
 * @returns {string} Es: "Mercoledì 18 Febbraio 2026"
 */
function formatDateFull(dateString) {
  const date = new Date(dateString + "T00:00:00");
  const giornoSettimana = GIORNI[date.getDay() - 1] || "Domenica";
  const numero = date.getDate();
  const mese = MESI[date.getMonth()];
  const anno = date.getFullYear();
  return `${giornoSettimana} ${numero} ${mese} ${anno}`;
}

/**
 * Ritorna la data odierna in formato "YYYY-MM-DD".
 * @returns {string}
 */
function oggiISO() {
  const oggi = new Date();
  return oggi.toISOString().split("T")[0];
}

/**
 * Formatta una Date in "YYYY-MM-DD"
 */
function dateToISO(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ──────────────────────────────────────────
// ORARI
// ──────────────────────────────────────────

/**
 * Converte un orario stringa in minuti dall'inizio del giorno.
 * @param {string} time - Es: "15:30"
 * @returns {number} Es: 930
 */
function timeToMinutes(time) {
  const [ore, minuti] = time.split(":").map(Number);
  return ore * 60 + minuti;
}

/**
 * Converte minuti dall'inizio del giorno in stringa orario.
 * @param {number} minutes - Es: 930
 * @returns {string} Es: "15:30"
 */
function minutesToTime(minutes) {
  const ore = Math.floor(minutes / 60);
  const min = minutes % 60;
  return `${String(ore).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Calcola l'ora di fine data un'ora di inizio e una durata.
 * @param {string} oraInizio - Es: "15:00"
 * @param {number} durataMinuti - Es: 60
 * @returns {string} Es: "16:00"
 */
function calcolaFineLezione(oraInizio, durataMinuti) {
  const inizioMin = timeToMinutes(oraInizio);
  return minutesToTime(inizioMin + durataMinuti);
}

/**
 * Calcola le fasce orarie dato inizio, durata e numero.
 * @param {string} oraInizio - Es: "08:00"
 * @param {number} durataLezione - Es: 50 (minuti)
 * @param {number} numeroLezioni - Es: 6
 * @returns {Array<{start: string, end: string, label: string, slot: number}>}
 */
function calcolaFasceOrarie(oraInizio, durataLezione, numeroLezioni) {
  const fasce = [];
  let inizioMin = timeToMinutes(oraInizio);

  for (let i = 0; i < numeroLezioni; i++) {
    const start = minutesToTime(inizioMin);
    const end = minutesToTime(inizioMin + durataLezione);
    fasce.push({
      slot: i,
      start: start,
      end: end,
      label: `${start} – ${end}`
    });
    inizioMin += durataLezione;
  }

  return fasce;
}

/**
 * Calcola fasce unificate mattina + pomeriggio per un giorno.
 * Usa i nuovi campi (mattina_durataFascia, mattina_numeroFasce, 
 * pomeriggio_oraInizio, pomeriggio_durataFascia, pomeriggio_numeroFasce)
 * con fallback ai vecchi campi per backward compatibility.
 * 
 * @param {Object} imp - Impostazioni del giorno da Firestore
 * @returns {{mattina: Array, pomeriggio: Array, tutte: Array, numMattina: number, numPomeriggio: number}}
 */
function calcolaFasceUnificate(imp) {
  if (!imp) return { mattina: [], pomeriggio: [], tutte: [], numMattina: 0, numPomeriggio: 0 };

  // Mattina: usa nuovi campi con fallback ai vecchi
  const mattinaOra = imp.mattina_oraInizio || "08:00";
  const mattinaDurata = imp.mattina_durataFascia || imp.mattina_durataLezione || 50;
  const mattinaNumero = imp.mattina_numeroFasce || imp.mattina_numeroLezioni || 0;

  const fasceMattina = [];
  let inizioMin = timeToMinutes(mattinaOra);
  for (let i = 0; i < mattinaNumero; i++) {
    const start = minutesToTime(inizioMin);
    const end = minutesToTime(inizioMin + mattinaDurata);
    fasceMattina.push({
      slot: i,
      start: start,
      end: end,
      label: `${start} – ${end}`,
      tipo: "mattina"
    });
    inizioMin += mattinaDurata;
  }

  // Pomeriggio: usa nuovi campi se presenti
  const fascePomeriggio = [];
  const pomOra = imp.pomeriggio_oraInizio;
  const pomDurata = imp.pomeriggio_durataFascia;
  const pomNumero = imp.pomeriggio_numeroFasce;

  if (pomOra && pomDurata && pomNumero) {
    let pomInizioMin = timeToMinutes(pomOra);
    for (let i = 0; i < pomNumero; i++) {
      const start = minutesToTime(pomInizioMin);
      const end = minutesToTime(pomInizioMin + pomDurata);
      fascePomeriggio.push({
        slot: mattinaNumero + i,
        start: start,
        end: end,
        label: `${start} – ${end}`,
        tipo: "pomeriggio"
      });
      pomInizioMin += pomDurata;
    }
  }

  return {
    mattina: fasceMattina,
    pomeriggio: fascePomeriggio,
    tutte: [...fasceMattina, ...fascePomeriggio],
    numMattina: fasceMattina.length,
    numPomeriggio: fascePomeriggio.length
  };
}

/**
 * Trova lo slot corrispondente ad un orario specifico all'interno delle fasce.
 * Usato per mappare ripetizioni (che hanno oraInizio) allo slot della griglia.
 * @param {Array} fasce - Array di fasce [{slot, start, end, ...}]
 * @param {string} oraInizio - Es: "15:30"
 * @returns {number} Indice slot, o -1 se fuori range
 */
function trovaSlotPerOra(fasce, oraInizio) {
  const minuti = timeToMinutes(oraInizio);
  for (const f of fasce) {
    const startMin = timeToMinutes(f.start);
    const endMin = timeToMinutes(f.end);
    if (minuti >= startMin && minuti < endMin) {
      return f.slot;
    }
  }
  return -1;
}

/**
 * Restituisce il nome del giorno (Lunedì, ...) da una data ISO "YYYY-MM-DD".
 * @param {string} dataISO
 * @returns {string} Nome del giorno o "" se weekend/invalido
 */
function giornoFromData(dataISO) {
  const d = new Date(dataISO + "T00:00:00");
  const dow = d.getDay(); // 0=dom, 1=lun, ..., 5=ven
  if (dow >= 1 && dow <= 5) return GIORNI[dow - 1];
  return "";
}

/**
 * Calcola le 5 date (lun-ven) di una settimana con offset dal corrente.
 * @param {number} offset - 0 = settimana corrente, -1 = precedente, +1 = successiva
 * @returns {string[]} Array di 5 stringhe "YYYY-MM-DD"
 */
function calcolaSettimanaDate(offset) {
  const oggi = new Date();
  const dow = oggi.getDay(); // 0=dom
  const diffLun = dow === 0 ? -6 : 1 - dow;
  const lunedi = new Date(oggi);
  lunedi.setDate(oggi.getDate() + diffLun + (offset * 7));

  const date = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(lunedi);
    d.setDate(lunedi.getDate() + i);
    date.push(dateToISO(d));
  }
  return date;
}

// ──────────────────────────────────────────
// CALCOLI MESE
// ──────────────────────────────────────────

/**
 * Ritorna tutti i giorni lavorativi (lun-ven) di un mese.
 * @param {number} anno - Es: 2026
 * @param {number} mese - Es: 1 (Gennaio) a 12 (Dicembre)
 * @returns {Array<string>} Array di date in formato "YYYY-MM-DD"
 */
function getGiorniLavorativiMese(anno, mese) {
  const giorni = [];
  const numGiorni = new Date(anno, mese, 0).getDate();

  for (let g = 1; g <= numGiorni; g++) {
    const data = new Date(anno, mese - 1, g);
    const dow = data.getDay();
    if (dow >= 1 && dow <= 5) {
      const iso = data.toISOString().split("T")[0];
      giorni.push(iso);
    }
  }

  return giorni;
}

/**
 * Conta quante volte appare ogni nome di giorno in un mese.
 * @param {number} anno
 * @param {number} mese - 1-12
 * @returns {Object} Es: { "Lunedì": 4, "Martedì": 5, ... }
 */
function contaGiorniPerNome(anno, mese) {
  const conteggio = {};
  GIORNI.forEach(g => conteggio[g] = 0);

  const numGiorni = new Date(anno, mese, 0).getDate();

  for (let g = 1; g <= numGiorni; g++) {
    const data = new Date(anno, mese - 1, g);
    const dow = data.getDay();
    if (dow >= 1 && dow <= 5) {
      conteggio[GIORNI[dow - 1]]++;
    }
  }

  return conteggio;
}

// ──────────────────────────────────────────
// IMPOSTAZIONI ORARI (lettura da Firestore)
// ──────────────────────────────────────────

/**
 * Carica le impostazioni orari per tutti e 5 i giorni da Firestore.
 * Collezione: "impostazioniOrari", ID documento = nome giorno.
 * @returns {Promise<Object>} Es: { "Lunedì": { mattina_oraInizio: "08:00", ... }, ... }
 */
async function caricaImpostazioniOrari() {
  const impostazioni = {};

  try {
    const snapshot = await db.collection("impostazioniOrari").get();

    snapshot.forEach(doc => {
      impostazioni[doc.id] = doc.data();
    });

    // Se non ci sono documenti, ritorna valori di default
    if (Object.keys(impostazioni).length === 0) {
      GIORNI.forEach(giorno => {
        impostazioni[giorno] = {
          giorno: giorno,
          mattina_oraInizio: "08:00",
          mattina_durataLezione: 50,
          mattina_durataFascia: 50,
          mattina_numeroLezioni: 6,
          mattina_numeroFasce: 6,
          pomeriggio_oraInizio: "15:00",
          pomeriggio_durataFascia: 60,
          pomeriggio_numeroFasce: 3,
          pomeriggio_oraApertura: "15:00",
          pomeriggio_oraChiusura: "18:30"
        };
      });
    }

    return impostazioni;
  } catch (err) {
    console.error("Errore caricamento impostazioni orari:", err);
    GIORNI.forEach(giorno => {
      impostazioni[giorno] = {
        giorno: giorno,
        mattina_oraInizio: "08:00",
        mattina_durataLezione: 50,
        mattina_durataFascia: 50,
        mattina_numeroLezioni: 6,
        mattina_numeroFasce: 6,
        pomeriggio_oraInizio: "15:00",
        pomeriggio_durataFascia: 60,
        pomeriggio_numeroFasce: 3,
        pomeriggio_oraApertura: "15:00",
        pomeriggio_oraChiusura: "18:30"
      };
    });
    return impostazioni;
  }
}
