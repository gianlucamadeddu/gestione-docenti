// ═══════════════════════════════════════════════════════
// ANAGRAFICA DOCENTI — js/docenti.js
// CRUD completo su Firestore + ricerca client-side
// Solo Admin può accedere a questa pagina
// Usa Firebase compat SDK (stessa versione di firebase-config.js)
// ═══════════════════════════════════════════════════════

console.log('📁 docenti.js caricato');

// ── Riferimenti DOM ──────────────────────────────────
const grid          = document.getElementById('docenti-grid');
const loading       = document.getElementById('loading');
const emptyState    = document.getElementById('empty-state');
const countEl       = document.getElementById('docenti-count');
const searchInput   = document.getElementById('search-input');

// Modal
const modalOverlay  = document.getElementById('modal-docente');
const modalTitle    = document.getElementById('modal-title');
const form          = document.getElementById('form-docente');
const btnNuovo      = document.getElementById('btn-nuovo-docente');
const btnCancel     = document.getElementById('btn-cancel');
const btnClose      = document.getElementById('modal-close');
const btnSave       = document.getElementById('btn-save');

// Campi form
const fieldNome       = document.getElementById('field-nome');
const fieldCognome    = document.getElementById('field-cognome');
const fieldCellulare  = document.getElementById('field-cellulare');
const fieldEmail      = document.getElementById('field-email');
const fieldLaurea     = document.getElementById('field-laurea');
const fieldMaterie    = document.getElementById('field-materie');
const fieldUsername   = document.getElementById('field-username');
const fieldPassword   = document.getElementById('field-password');

// Errori
const errNome     = document.getElementById('err-nome');
const errCognome  = document.getElementById('err-cognome');
const errUsername  = document.getElementById('err-username');
const errPassword  = document.getElementById('err-password');

// Dialog elimina
const dialogElimina      = document.getElementById('dialog-elimina');
const deleteName         = document.getElementById('delete-name');
const btnDeleteCancel    = document.getElementById('btn-delete-cancel');
const btnDeleteConfirm   = document.getElementById('btn-delete-confirm');

// Toast
const toast = document.getElementById('toast');

// ── Firestore (compat SDK) ───────────────────────────
const db = firebase.firestore();

// ── Stato ────────────────────────────────────────────
let docentiList = [];       // Array completo dei docenti caricati
let editingId = null;       // ID del docente in modifica (null = nuovo)
let deletingId = null;      // ID del docente da eliminare

// ══════════════════════════════════════════════════════
// 1. INIT — Controllo accesso + caricamento
// ══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    // Controllo: solo Admin può stare qui
    const ruolo = sessionStorage.getItem('ruolo');
    if (ruolo !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    // Carica i docenti da Firestore
    await caricaDocenti();

    // ── Event Listeners ──
    btnNuovo.addEventListener('click', apriModalNuovo);
    btnCancel.addEventListener('click', chiudiModal);
    btnClose.addEventListener('click', chiudiModal);
    form.addEventListener('submit', salvaDocente);

    btnDeleteCancel.addEventListener('click', chiudiDialogElimina);
    btnDeleteConfirm.addEventListener('click', confermaElimina);

    searchInput.addEventListener('input', filtraDocenti);

    // Chiudi modal cliccando fuori
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) chiudiModal();
    });
    dialogElimina.addEventListener('click', (e) => {
        if (e.target === dialogElimina) chiudiDialogElimina();
    });

    // Chiudi con ESC
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (modalOverlay.classList.contains('active')) chiudiModal();
            if (dialogElimina.classList.contains('active')) chiudiDialogElimina();
        }
    });
});

// ══════════════════════════════════════════════════════
// 2. READ — Carica tutti i docenti da Firestore
// ══════════════════════════════════════════════════════
async function caricaDocenti() {
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    grid.innerHTML = '';
    countEl.textContent = '';

    try {
        const snapshot = await db.collection('docenti').orderBy('cognome').get();

        docentiList = [];
        snapshot.forEach(docSnap => {
            docentiList.push({ id: docSnap.id, ...docSnap.data() });
        });

        console.log('✅ Docenti caricati:', docentiList.length);
        renderDocenti(docentiList);
    } catch (error) {
        console.error('❌ Errore caricamento docenti:', error);
        showToast('Errore nel caricamento dei docenti', 'error');
    } finally {
        loading.style.display = 'none';
    }
}

// ══════════════════════════════════════════════════════
// 3. RENDER — Mostra le card dei docenti
// ══════════════════════════════════════════════════════
function renderDocenti(lista) {
    grid.innerHTML = '';

    if (lista.length === 0) {
        emptyState.style.display = 'block';
        countEl.textContent = '';
        return;
    }

    emptyState.style.display = 'none';
    countEl.textContent = lista.length + ' docent' + (lista.length === 1 ? 'e' : 'i');

    lista.forEach(doc => {
        const card = creaCard(doc);
        grid.appendChild(card);
    });
}

function creaCard(docente) {
    const card = document.createElement('div');
    card.className = 'docente-card';

    // Iniziali per avatar
    const iniziali = (docente.nome?.[0] || '') + (docente.cognome?.[0] || '');

    // Badge materie
    const materie = docente.materie || [];
    const badgesHTML = materie.map(m =>
        '<span class="badge-materia">' + escapeHtml(m.trim()) + '</span>'
    ).join('');

    // Contatti
    let contattiHTML = '';
    if (docente.cellulare) {
        contattiHTML += `
            <div class="contatto-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
                <span>${escapeHtml(docente.cellulare)}</span>
            </div>
        `;
    }
    if (docente.email) {
        contattiHTML += `
            <div class="contatto-row">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                </svg>
                <span>${escapeHtml(docente.email)}</span>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="card-top">
            <div class="avatar">${escapeHtml(iniziali.toUpperCase())}</div>
            <div class="card-info">
                <h3>${escapeHtml(docente.nome || '')} ${escapeHtml(docente.cognome || '')}</h3>
                ${docente.laurea ? '<p class="card-laurea">' + escapeHtml(docente.laurea) + '</p>' : ''}
            </div>
        </div>
        ${materie.length > 0 ? '<div class="card-materie">' + badgesHTML + '</div>' : ''}
        ${contattiHTML ? '<div class="card-contatti">' + contattiHTML + '</div>' : ''}
        <div class="card-actions">
            <button class="btn-action btn-edit" data-id="${docente.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Modifica
            </button>
            <button class="btn-action btn-delete" data-id="${docente.id}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
                Elimina
            </button>
        </div>
    `;

    // Event: Modifica
    card.querySelector('.btn-edit').addEventListener('click', () => {
        apriModalModifica(docente);
    });

    // Event: Elimina
    card.querySelector('.btn-delete').addEventListener('click', () => {
        apriDialogElimina(docente.id, (docente.nome || '') + ' ' + (docente.cognome || ''));
    });

    return card;
}

// ══════════════════════════════════════════════════════
// 4. RICERCA — Filtro client-side
// ══════════════════════════════════════════════════════
function filtraDocenti() {
    const termine = searchInput.value.trim().toLowerCase();

    if (!termine) {
        renderDocenti(docentiList);
        return;
    }

    const filtrati = docentiList.filter(d => {
        const nomeCompleto = ((d.nome || '') + ' ' + (d.cognome || '')).toLowerCase();
        const materie = (d.materie || []).join(' ').toLowerCase();
        return nomeCompleto.includes(termine) || materie.includes(termine);
    });

    renderDocenti(filtrati);
}

// ══════════════════════════════════════════════════════
// 5. MODAL — Apertura / Chiusura
// ══════════════════════════════════════════════════════
function apriModalNuovo() {
    editingId = null;
    modalTitle.textContent = 'Nuovo Docente';
    btnSave.textContent = 'Salva Docente';
    resetForm();
    modalOverlay.classList.add('active');
    fieldNome.focus();
}

function apriModalModifica(docente) {
    editingId = docente.id;
    modalTitle.textContent = 'Modifica Docente';
    btnSave.textContent = 'Aggiorna Docente';
    resetForm();

    // Popola i campi
    fieldNome.value      = docente.nome || '';
    fieldCognome.value   = docente.cognome || '';
    fieldCellulare.value = docente.cellulare || '';
    fieldEmail.value     = docente.email || '';
    fieldLaurea.value    = docente.laurea || '';
    fieldMaterie.value   = (docente.materie || []).join(', ');
    fieldUsername.value  = docente.username || '';
    fieldPassword.value  = docente.password || '';

    modalOverlay.classList.add('active');
    fieldNome.focus();
}

function chiudiModal() {
    modalOverlay.classList.remove('active');
    editingId = null;
    resetForm();
}

function resetForm() {
    form.reset();
    // Rimuovi errori
    [errNome, errCognome, errUsername, errPassword].forEach(el => el.classList.remove('visible'));
    [fieldNome, fieldCognome, fieldUsername, fieldPassword].forEach(el => el.classList.remove('error'));
}

// ══════════════════════════════════════════════════════
// 6. VALIDAZIONE
// ══════════════════════════════════════════════════════
function validaForm() {
    let valido = true;

    // Reset errori
    [errNome, errCognome, errUsername, errPassword].forEach(el => el.classList.remove('visible'));
    [fieldNome, fieldCognome, fieldUsername, fieldPassword].forEach(el => el.classList.remove('error'));

    if (!fieldNome.value.trim()) {
        errNome.classList.add('visible');
        fieldNome.classList.add('error');
        valido = false;
    }

    if (!fieldCognome.value.trim()) {
        errCognome.classList.add('visible');
        fieldCognome.classList.add('error');
        valido = false;
    }

    if (!fieldUsername.value.trim()) {
        errUsername.classList.add('visible');
        fieldUsername.classList.add('error');
        valido = false;
    }

    if (!fieldPassword.value.trim()) {
        errPassword.classList.add('visible');
        fieldPassword.classList.add('error');
        valido = false;
    }

    return valido;
}

// ══════════════════════════════════════════════════════
// 7. CREATE / UPDATE — Salva docente su Firestore
// ══════════════════════════════════════════════════════
async function salvaDocente(e) {
    e.preventDefault();

    if (!validaForm()) return;

    // Disabilita bottone durante salvataggio
    btnSave.disabled = true;
    btnSave.textContent = 'Salvataggio...';

    // Costruisci oggetto dati
    const materieArray = fieldMaterie.value
        .split(',')
        .map(m => m.trim())
        .filter(m => m.length > 0);

    const dati = {
        nome:       fieldNome.value.trim(),
        cognome:    fieldCognome.value.trim(),
        cellulare:  fieldCellulare.value.trim(),
        email:      fieldEmail.value.trim(),
        laurea:     fieldLaurea.value.trim(),
        materie:    materieArray,
        username:   fieldUsername.value.trim(),
        password:   fieldPassword.value.trim()
    };

    try {
        if (editingId) {
            // ── UPDATE ──
            await db.collection('docenti').doc(editingId).update(dati);
            showToast('Docente aggiornato con successo!', 'success');
        } else {
            // ── CREATE ──
            dati.tariffaLezione     = 10;    // Default €10/lezione
            dati.tariffaRipetizione = 10;    // Default €10/ora
            dati.noteTariffa        = '';
            dati.creatoIl           = firebase.firestore.FieldValue.serverTimestamp();

            await db.collection('docenti').add(dati);
            showToast('Docente creato con successo!', 'success');
        }

        chiudiModal();
        await caricaDocenti();

        // Mantieni la ricerca attiva
        if (searchInput.value.trim()) {
            filtraDocenti();
        }

    } catch (error) {
        console.error('❌ Errore salvataggio:', error);
        showToast('Errore durante il salvataggio', 'error');
    } finally {
        btnSave.disabled = false;
        btnSave.textContent = editingId ? 'Aggiorna Docente' : 'Salva Docente';
    }
}

// ══════════════════════════════════════════════════════
// 8. DELETE — Eliminazione con conferma
// ══════════════════════════════════════════════════════
function apriDialogElimina(id, nomeCompleto) {
    deletingId = id;
    deleteName.textContent = nomeCompleto;
    dialogElimina.classList.add('active');
}

function chiudiDialogElimina() {
    dialogElimina.classList.remove('active');
    deletingId = null;
}

async function confermaElimina() {
    if (!deletingId) return;

    btnDeleteConfirm.disabled = true;
    btnDeleteConfirm.textContent = 'Eliminazione...';

    try {
        await db.collection('docenti').doc(deletingId).delete();
        showToast('Docente eliminato', 'success');
        chiudiDialogElimina();
        await caricaDocenti();

        // Mantieni la ricerca attiva
        if (searchInput.value.trim()) {
            filtraDocenti();
        }

    } catch (error) {
        console.error('❌ Errore eliminazione:', error);
        showToast("Errore durante l'eliminazione", 'error');
    } finally {
        btnDeleteConfirm.disabled = false;
        btnDeleteConfirm.textContent = 'Elimina';
    }
}

// ══════════════════════════════════════════════════════
// 9. TOAST — Notifiche
// ══════════════════════════════════════════════════════
function showToast(messaggio, tipo) {
    tipo = tipo || 'success';
    toast.textContent = messaggio;
    toast.className = 'toast ' + tipo;

    // Forza reflow per riavviare animazione
    void toast.offsetWidth;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ══════════════════════════════════════════════════════
// 10. UTILITY — Escape HTML per XSS prevention
// ══════════════════════════════════════════════════════
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
