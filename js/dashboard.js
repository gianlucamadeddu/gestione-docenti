// ═══════════════════════════════════════════════════════════════
//  DASHBOARD.JS — Solo Admin
//  Legge da Firestore: docenti, ripetizioni, calcola statistiche
// ═══════════════════════════════════════════════════════════════

import { db } from './firebase-config.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { checkAuth, checkAdmin } from './auth.js';
import { initTemplate } from './template.js';

// ─── AVVIO PAGINA ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Controlla che l'utente sia loggato
    checkAuth();
    // 2. Controlla che sia Admin (altrimenti redirect)
    checkAdmin();
    // 3. Inizializza sidebar + header
    initTemplate('dashboard');
    // 4. Carica tutti i dati
    await caricaDashboard();
});

// ─── FUNZIONE PRINCIPALE ───────────────────────────────────
async function caricaDashboard() {
    try {
        // Fetch parallelo: docenti + ripetizioni
        const [docentiSnap, ripetizioniSnap] = await Promise.all([
            getDocs(collection(db, 'docenti')),
            getDocs(collection(db, 'ripetizioni'))
        ]);

        // Mappa docenti: id → dati
        const docentiMap = {};
        const docentiList = [];
        docentiSnap.forEach(doc => {
            const data = doc.data();
            docentiMap[doc.id] = data;
            docentiList.push({ id: doc.id, ...data });
        });

        // Array di tutte le ripetizioni
        const tutteRipetizioni = [];
        ripetizioniSnap.forEach(doc => {
            tutteRipetizioni.push({ id: doc.id, ...doc.data() });
        });

        // Date utili
        const oggi = getOggiString();                 // "2026-02-24"
        const { lunedi, venerdi } = getSettimanaCorrente();

        // Filtra ripetizioni di oggi
        const ripOggi = tutteRipetizioni
            .filter(r => r.data === oggi)
            .sort((a, b) => (a.oraInizio || '').localeCompare(b.oraInizio || ''));

        // Filtra ripetizioni della settimana (lun → ven)
        const ripSettimana = tutteRipetizioni.filter(r => {
            return r.data >= lunedi && r.data <= venerdi;
        });

        // ── CALCOLA STATISTICHE ──
        const numDocenti = docentiList.length;
        const numRipOggi = ripOggi.length;

        let oreSett = 0;
        let importoSett = 0;

        ripSettimana.forEach(r => {
            const durata = Number(r.durata) || 0;
            const ore = durata / 60;
            oreSett += ore;

            // Trova tariffa del docente
            const docente = docentiMap[r.docenteId];
            const tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
            importoSett += ore * tariffa;
        });

        // ── AGGIORNA STAT CARDS ──
        aggiornaStatCard('stat-docenti', numDocenti);
        aggiornaStatCard('stat-rip-oggi', numRipOggi);
        aggiornaStatCard('stat-ore-sett', oreSett % 1 === 0 ? oreSett : oreSett.toFixed(1));
        aggiornaStatCard('stat-importo-sett', '€ ' + importoSett.toFixed(2).replace('.', ','));

        // ── RENDERIZZA RIPETIZIONI DI OGGI ──
        renderRipetizioniOggi(ripOggi, docentiMap);

        // ── RENDERIZZA LISTA DOCENTI ──
        renderDocenti(docentiList);

    } catch (errore) {
        console.error('Errore caricamento dashboard:', errore);
    }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER: Stat Cards
// ═══════════════════════════════════════════════════════════════
function aggiornaStatCard(id, valore) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = valore;
        el.classList.remove('loading');
    }
}

// ═══════════════════════════════════════════════════════════════
//  RENDER: Ripetizioni di Oggi
// ═══════════════════════════════════════════════════════════════
function renderRipetizioniOggi(ripetizioni, docentiMap) {
    const container = document.getElementById('lista-ripetizioni-oggi');
    const badge = document.getElementById('badge-oggi-count');

    badge.textContent = ripetizioni.length;

    // Se vuota
    if (ripetizioni.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📭</div>
                <p>Nessuna ripetizione oggi</p>
            </div>
        `;
        return;
    }

    let html = '';

    ripetizioni.forEach(rip => {
        const docente = docentiMap[rip.docenteId];
        const nomeDocente = docente ? `${docente.nome} ${docente.cognome}` : 'Docente sconosciuto';
        const tariffa = docente ? (Number(docente.tariffaRipetizione) || 0) : 0;
        const durata = Number(rip.durata) || 60;
        const ore = durata / 60;
        const importo = (ore * tariffa).toFixed(2).replace('.', ',');
        const oraFine = calcolaOraFine(rip.oraInizio, durata);

        html += `
            <div class="ripetizione-item">
                <div class="rip-time-block">
                    <div class="rip-time-start">${rip.oraInizio || '--:--'}</div>
                    <div class="rip-time-end">${oraFine}</div>
                </div>
                <div class="rip-divider"></div>
                <div class="rip-details">
                    <div class="rip-studente">${escapeHtml(rip.studente || 'Studente')}</div>
                    <div class="rip-meta">
                        <span class="badge-materia">${escapeHtml(rip.materia || '—')}</span>
                        ${rip.classe ? `<span class="badge-classe">${escapeHtml(rip.classe)}</span>` : ''}
                    </div>
                    <div class="rip-docente">con <strong>${escapeHtml(nomeDocente)}</strong></div>
                    <div class="rip-importo">€ ${importo}</div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  RENDER: Docenti e Tariffe
// ═══════════════════════════════════════════════════════════════
function renderDocenti(docentiList) {
    const container = document.getElementById('lista-docenti');
    const badge = document.getElementById('badge-docenti-count');

    badge.textContent = docentiList.length;

    if (docentiList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">👤</div>
                <p>Nessun docente registrato</p>
            </div>
        `;
        return;
    }

    // Ordina per cognome
    docentiList.sort((a, b) => (a.cognome || '').localeCompare(b.cognome || ''));

    let html = '';

    docentiList.forEach(doc => {
        const iniziali = getInizialiDocente(doc.nome, doc.cognome);
        const nomeCompleto = `${doc.nome || ''} ${doc.cognome || ''}`.trim();
        const materie = doc.materie || [];
        const tariffaLez = doc.tariffaLezione != null ? Number(doc.tariffaLezione) : null;
        const tariffaRip = doc.tariffaRipetizione != null ? Number(doc.tariffaRipetizione) : null;

        // Badge materie
        const materieHtml = materie.map(m =>
            `<span class="badge-materia">${escapeHtml(m)}</span>`
        ).join('');

        // Tariffe
        let tariffeHtml = '';
        const parti = [];
        if (tariffaLez != null) parti.push(`Lezioni: <span>€${tariffaLez}/lez</span>`);
        if (tariffaRip != null) parti.push(`Ripetizioni: <span>€${tariffaRip}/h</span>`);
        tariffeHtml = parti.join('<span class="sep">·</span>');

        // Colore avatar ciclico
        const colori = ['#1B4332', '#BC6C25', '#1565C0', '#2D6A4F', '#7B2D26', '#5B4A8A'];
        const colore = colori[docentiList.indexOf(doc) % colori.length];

        html += `
            <div class="docente-item">
                <div class="docente-avatar" style="background:${colore};">${iniziali}</div>
                <div class="docente-info">
                    <div class="docente-nome">${escapeHtml(nomeCompleto)}</div>
                    ${materie.length > 0 ? `<div class="docente-materie">${materieHtml}</div>` : ''}
                    ${tariffeHtml ? `<div class="docente-tariffe">${tariffeHtml}</div>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

/** Restituisce la data di oggi come stringa "YYYY-MM-DD" */
function getOggiString() {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Restituisce lunedì e venerdì della settimana corrente come "YYYY-MM-DD" */
function getSettimanaCorrente() {
    const oggi = new Date();
    const giorno = oggi.getDay(); // 0=dom, 1=lun, ..., 6=sab
    // Calcola lunedì: torna indietro di (giorno - 1) giorni
    // Se domenica (0), torna indietro di 6 giorni
    const diffLun = giorno === 0 ? -6 : 1 - giorno;
    const lunedi = new Date(oggi);
    lunedi.setDate(oggi.getDate() + diffLun);

    const venerdi = new Date(lunedi);
    venerdi.setDate(lunedi.getDate() + 4);

    return {
        lunedi: formattaData(lunedi),
        venerdi: formattaData(venerdi)
    };
}

/** Formatta Date → "YYYY-MM-DD" */
function formattaData(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/** Calcola ora fine dato oraInizio ("HH:MM") e durata in minuti */
function calcolaOraFine(oraInizio, durataMin) {
    if (!oraInizio) return '--:--';
    const [h, m] = oraInizio.split(':').map(Number);
    const totaleMin = h * 60 + m + durataMin;
    const hFine = Math.floor(totaleMin / 60) % 24;
    const mFine = totaleMin % 60;
    return `${String(hFine).padStart(2, '0')}:${String(mFine).padStart(2, '0')}`;
}

/** Iniziali del docente (es. "Marco Rossi" → "MR") */
function getInizialiDocente(nome, cognome) {
    const n = (nome || '').trim();
    const c = (cognome || '').trim();
    return ((n[0] || '') + (c[0] || '')).toUpperCase();
}

/** Escape HTML per sicurezza */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
}
