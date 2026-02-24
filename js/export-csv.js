// ============================================================
// export-csv.js — Esportazione Riepilogo Mensile in CSV
// ============================================================
// Genera un file CSV con:
// - Una riga per ogni lezione mattina (moltiplicata per giorni nel mese)
// - Una riga per ogni singola ripetizione
// - Riga vuota + riga TOTALE
// File: riepilogo_NomeMese_Anno.csv (UTF-8 + BOM per Excel)
// ============================================================

/**
 * Genera e scarica il file CSV dal riepilogo calcolato.
 * @param {Object} dati - Oggetto datiRiepilogo da riepilogo.js
 * @param {number} mese - 1-12
 * @param {number} anno - Es: 2026
 */
function esportaCSV(dati, mese, anno) {
  if (!dati || !dati.docenti || dati.docenti.length === 0) {
    alert("Nessun dato da esportare.");
    return;
  }

  const meseNome = MESI[mese - 1];
  const conteggioGiorni = contaGiorniPerNome(anno, mese);
  const giorniLavorativi = getGiorniLavorativiMese(anno, mese);

  // ── Header CSV ──
  const intestazione = [
    "Tipo",
    "Data",
    "Docente",
    "Studente",
    "Materia",
    "Classe",
    "Ore",
    "Tariffa",
    "Importo"
  ];

  const righe = [];

  // ── Per ogni docente ──
  dati.docenti.forEach(r => {
    const doc = r.docente;
    const nomeDocente = `${doc.nome || ""} ${doc.cognome || ""}`.trim();

    // ── LEZIONI MATTINA ──
    // Per ogni giorno della settimana, per ogni occorrenza nel mese
    GIORNI.forEach((giorno, gIdx) => {
      const detGiorno = r.mattina.dettaglio[giorno];
      if (detGiorno.lezioniSettimana === 0) return;

      // Trova le date di questo giorno nel mese
      // gIdx: 0=Lunedì...4=Venerdì → getDay(): 1=Lunedì...5=Venerdì
      const targetDow = gIdx + 1;
      const dateGiorno = giorniLavorativi.filter(d => {
        return new Date(d + "T00:00:00").getDay() === targetDow;
      });

      // Per ogni data di quel giorno
      dateGiorno.forEach(dataISO => {
        // Il docente ha N lezioni in quel giorno della settimana
        // Creiamo una riga per ogni lezione
        for (let i = 0; i < detGiorno.lezioniSettimana; i++) {
          const durataOre = detGiorno.durataLezioneMin / 60;
          const importoRiga = r.mattina.tariffaLezione;

          righe.push([
            "Lezione mattina",
            formatDateCSV(dataISO),
            nomeDocente,
            "—",
            "—",       // Non abbiamo la materia specifica per slot qui
            "—",       // Non abbiamo la classe specifica per slot qui
            durataOre.toFixed(2),
            r.mattina.tariffaLezione.toFixed(2),
            importoRiga.toFixed(2)
          ]);
        }
      });
    });

    // ── RIPETIZIONI ──
    // Una riga per ogni singola ripetizione (dal dettaglio raw)
    r.ripetizioni.dettaglioRaw.forEach(rip => {
      const durataOre = (rip.durata || 60) / 60;
      const importoRiga = durataOre * r.ripetizioni.tariffaRipetizione;

      righe.push([
        "Ripetizione",
        formatDateCSV(rip.data),
        nomeDocente,
        rip.studente || "—",
        rip.materia || "—",
        rip.classe || "—",
        durataOre.toFixed(2),
        r.ripetizioni.tariffaRipetizione.toFixed(2),
        importoRiga.toFixed(2)
      ]);
    });
  });

  // ── Ordina per data ──
  righe.sort((a, b) => {
    // Colonna data è indice 1 — riconvertiamo in ISO per ordinare
    const dateA = csvDateToISO(a[1]);
    const dateB = csvDateToISO(b[1]);
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    // A parità di data, docente
    return a[2].localeCompare(b[2]);
  });

  // ── Riga vuota + TOTALE ──
  righe.push([]); // riga vuota
  righe.push([
    "TOTALE",
    "",
    "",
    "",
    "",
    "",
    (dati.oreTotaliGlobali).toFixed(2),
    "",
    (dati.importoTotaleGlobale).toFixed(2)
  ]);

  // ── Costruisci CSV ──
  const csvContent = [intestazione, ...righe]
    .map(riga => riga.map(cella => escapeCSV(String(cella ?? ""))).join(";"))
    .join("\r\n");

  // ── BOM UTF-8 per Excel ──
  const BOM = "\uFEFF";
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });

  // ── Scarica ──
  const nomeFile = `riepilogo_${meseNome}_${anno}.csv`;
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = nomeFile;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);

  console.log(`✅ CSV esportato: ${nomeFile} (${righe.length - 1} righe)`);
}

// ══════════════════════════════════════════
// HELPERS CSV
// ══════════════════════════════════════════

/**
 * Escape di un valore per CSV (gestisce virgolette e punto e virgola).
 * @param {string} val
 * @returns {string}
 */
function escapeCSV(val) {
  if (val.includes('"') || val.includes(';') || val.includes('\n') || val.includes('\r')) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}

/**
 * Formatta una data ISO in formato DD/MM/YYYY per il CSV.
 * @param {string} dataISO - Es: "2026-02-18"
 * @returns {string} Es: "18/02/2026"
 */
function formatDateCSV(dataISO) {
  if (!dataISO) return "";
  const parti = dataISO.split("-");
  if (parti.length !== 3) return dataISO;
  return `${parti[2]}/${parti[1]}/${parti[0]}`;
}

/**
 * Riconverte una data DD/MM/YYYY in ISO per ordinamento.
 * @param {string} csvDate - Es: "18/02/2026"
 * @returns {string} Es: "2026-02-18"
 */
function csvDateToISO(csvDate) {
  if (!csvDate || !csvDate.includes("/")) return "9999-99-99";
  const parti = csvDate.split("/");
  if (parti.length !== 3) return "9999-99-99";
  return `${parti[2]}-${parti[1]}-${parti[0]}`;
}
