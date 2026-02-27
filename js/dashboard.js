// ═══════════════════════════════════════════════════════════════
//  DASHBOARD.JS — Solo Admin
//  Legge da Firestore: docenti, ripetizioni, studenti
//  Calcola statistiche, mostra ripetizioni di oggi e lista docenti
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async function () {
    // 1. Controlla che l'utente sia loggato
    checkAuth();
    // 2. Controlla che sia Admin (altrimenti redirect)
    checkAdmin();
    // 3. Inizializza sidebar + header (funzione da template.js)
    initPage('Dashboard');
    // 4. Carica tutti i dati della dashboard
    await caricaDashboard();
});
// ═══════════════════════════════════════════════════════════════
//  FUNZIONE PRINCIPALE
// ═══════════════════════════════════════════════════════════════
async function caricaDashboard() {
    try {
        // Fetch parallelo: docenti + ripetizioni + studenti
        var risultati = await Promise.all([
            db.collection('docenti').get(),
            db.collection('ripetizioni').get(),
            db.collection('studenti').get()
        ]);
        var docentiSnap = risultati[0];
        var ripetizioniSnap = risultati[1];
        var studentiSnap = risultati[2];
        // ── Mappa docenti: id → dati ──
        var docentiMap = {};
        var docentiList = [];
        docentiSnap.forEach(function (doc) {
            var data = doc.data();
            docentiMap[doc.id] = data;
            docentiList.push({ id: doc.id, nome: data.nome, cognome: data.cognome, materie: data.materie, tariffaLezione: data.tariffaLezione, tariffaRipetizione: data.tariffaRipetizione });
        });
        // ── Conteggio studenti ──
        var numStudenti = studentiSnap.size;
        // ── Array di tutte le ripetizioni ──
        var tutteRipetizioni = [];
        ripetizioniSnap.forEach(function (doc) {
            tutteRipetizioni.push({ id: doc.id, ...doc.data() });
        });
        // ── Date utili ──
        var oggi = getOggiString();
        var settimana = getSettimanaCorrente();
        // ── Filtra ripetizioni di oggi (ordinate per ora) ──
        var ripOggi = tutteRipetizioni
            .filter(function (r) { return r.data === oggi; })
            .sort(function (a, b) { return (a.oraInizio || '').localeCompare(b.oraInizio || ''); });
        // ── Filtra ripetizioni della settimana (lun → ven) ──
        var ripSettimana = tutteRipetizioni.filter(function (r) {
            return r.data >= settimana.lunedi && r.data <= settimana.venerdi;
        });
        // ══════════════════════════════════════
        //  CALCOLA LE 5 STATISTICHE
        // ══════════════════════════════════════
        var numDocenti = docentiList.length;
        var numRipOggi = ripOggi.length;
        var oreSett = 0;
        var importoSett = 0;
        ripSettimana.forEach(function (r) {
            var durata = Number(r.durata) || 0;
            var ore = durata / 60;
            oreSett += ore;
            var docente = docentiMap[r.docenteId];
            var tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
            importoSett += ore * tariffa;
        });
        // ══════════════════════════════════════
        //  AGGIORNA LE 5 STAT CARDS
        // ══════════════════════════════════════
        aggiornaStatCard('stat-docenti', numDocenti);
        aggiornaStatCard('stat-studenti', numStudenti);
        aggiornaStatCard('stat-rip-oggi', numRipOggi);
        aggiornaStatCard('stat-ore-sett', oreSett % 1 === 0 ? oreSett : oreSett.toFixed(1));
        aggiornaStatCard('stat-importo-sett', '€ ' + importoSett.toFixed(2).replace('.', ','));
        // ══════════════════════════════════════
        //  RENDER SEZIONI
        // ══════════════════════════════════════
        renderRipetizioniOggi(ripOggi, docentiMap);
        renderDocenti(docentiList);
    } catch (errore) {
        console.error('Errore caricamento dashboard:', errore);
    }
}
// ═══════════════════════════════════════════════════════════════
//  RENDER: Stat Cards
// ═══════════════════════════════════════════════════════════════
function aggiornaStatCard(id, valore) {
    var el = document.getElementById(id);
    if (el) {
        el.textContent = valore;
        el.classList.remove('loading');
    }
}
// ═══════════════════════════════════════════════════════════════
//  RENDER: Ripetizioni di Oggi (sezione sinistra)
// ═══════════════════════════════════════════════════════════════
function renderRipetizioniOggi(ripetizioni, docentiMap) {
    var container = document.getElementById('lista-ripetizioni-oggi');
    var badge = document.getElementById('badge-oggi-count');
    badge.textContent = ripetizioni.length;
    if (ripetizioni.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
            '  <div class="empty-icon">📭</div>' +
            '  <p>Nessuna ripetizione oggi</p>' +
            '</div>';
        return;
    }
    var html = '';
    ripetizioni.forEach(function (rip) {
        var docente = docentiMap[rip.docenteId];
        var nomeDocente = docente ? (docente.nome + ' ' + docente.cognome) : 'Docente sconosciuto';
        var tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
        var durata = Number(rip.durata) || 60;
        var ore = durata / 60;
        var importo = (ore * tariffa).toFixed(2).replace('.', ',');
        var oraFine = calcolaOraFine(rip.oraInizio, durata);
        html +=
            '<div class="ripetizione-item">' +
            '  <div class="rip-time-block">' +
            '    <div class="rip-time-start">' + escapeHtml(rip.oraInizio || '--:--') + '</div>' +
            '    <div class="rip-time-end">' + oraFine + '</div>' +
            '  </div>' +
            '  <div class="rip-divider"></div>' +
            '  <div class="rip-details">' +
            '    <div class="rip-studente">' + escapeHtml(rip.studente || 'Studente') + '</div>' +
            '    <div class="rip-meta">' +
            '      <span class="badge-materia">' + escapeHtml(rip.materia || '—') + '</span>' +
                   (rip.classe ? '<span class="badge-classe">' + escapeHtml(rip.classe) + '</span>' : '') +
            '    </div>' +
            '    <div class="rip-docente">con <strong>' + escapeHtml(nomeDocente) + '</strong></div>' +
            '    <div class="rip-importo">€ ' + importo + '</div>' +
            '  </div>' +
            '</div>';
    });
    container.innerHTML = html;
}
// ═══════════════════════════════════════════════════════════════
//  RENDER: Docenti e Tariffe (sezione destra)
// ═══════════════════════════════════════════════════════════════
function renderDocenti(docentiList) {
    var container = document.getElementById('lista-docenti');
    var badge = document.getElementById('badge-docenti-count');
    badge.textContent = docentiList.length;
    if (docentiList.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
            '  <div class="empty-icon">👤</div>' +
            '  <p>Nessun docente registrato</p>' +
            '</div>';
        return;
    }
    docentiList.sort(function (a, b) {
        return (a.cognome || '').localeCompare(b.cognome || '');
    });
    var colori = ['#1B4332', '#BC6C25', '#1565C0', '#2D6A4F', '#7B2D26', '#5B4A8A'];
    var html = '';
    docentiList.forEach(function (doc, index) {
        var iniziali = getInizialiDocente(doc.nome, doc.cognome);
        var nomeCompleto = ((doc.nome || '') + ' ' + (doc.cognome || '')).trim();
        var materie = doc.materie || [];
        var tariffaLez = doc.tariffaLezione != null ? Number(doc.tariffaLezione) : null;
        var tariffaRip = doc.tariffaRipetizione != null ? Number(doc.tariffaRipetizione) : null;
        var colore = colori[index % colori.length];
        var materieHtml = '';
        materie.forEach(function (m) {
            materieHtml += '<span class="badge-materia">' + escapeHtml(m) + '</span>';
        });
        var parti = [];
        if (tariffaLez != null) parti.push('Lezioni: <span>€' + tariffaLez + '/lez</span>');
        if (tariffaRip != null) parti.push('Ripetizioni: <span>€' + tariffaRip + '/h</span>');
        var tariffeHtml = parti.join('<span class="sep">·</span>');
        html +=
            '<div class="docente-item">' +
            '  <div class="docente-avatar" style="background:' + colore + ';">' + iniziali + '</div>' +
            '  <div class="docente-info">' +
            '    <div class="docente-nome">' + escapeHtml(nomeCompleto) + '</div>' +
                 (materie.length > 0 ? '<div class="docente-materie">' + materieHtml + '</div>' : '') +
                 (tariffeHtml ? '<div class="docente-tariffe">' + tariffeHtml + '</div>' : '') +
            '  </div>' +
            '</div>';
    });
    container.innerHTML = html;
}
// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════
function getOggiString() {
    var d = new Date();
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}
function getSettimanaCorrente() {
    var oggi = new Date();
    var giorno = oggi.getDay();
    var diffLun = giorno === 0 ? -6 : 1 - giorno;
    var lunedi = new Date(oggi);
    lunedi.setDate(oggi.getDate() + diffLun);
    var venerdi = new Date(lunedi);
    venerdi.setDate(lunedi.getDate() + 4);
    return {
        lunedi: formattaData(lunedi),
        venerdi: formattaData(venerdi)
    };
}
function formattaData(d) {
    var yyyy = d.getFullYear();
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return yyyy + '-' + mm + '-' + dd;
}
function calcolaOraFine(oraInizio, durataMin) {
    if (!oraInizio) return '--:--';
    var parti = oraInizio.split(':');
    var h = parseInt(parti[0]);
    var m = parseInt(parti[1]);
    var totaleMin = h * 60 + m + durataMin;
    var hFine = Math.floor(totaleMin / 60) % 24;
    var mFine = totaleMin % 60;
    return String(hFine).padStart(2, '0') + ':' + String(mFine).padStart(2, '0');
}
function getInizialiDocente(nome, cognome) {
    var n = (nome || '').trim();
    var c = (cognome || '').trim();
    return ((n[0] || '') + (c[0] || '')).toUpperCase();
}
function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
