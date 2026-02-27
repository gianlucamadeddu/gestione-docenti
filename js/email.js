// ============================================================
// email.js — Sistema Email con Template
// ============================================================
// Modulo riutilizzabile per comporre e inviare email usando
// template preimpostati salvati su Firestore.
//
// Funzionalità:
// - Carica template da Firestore (collection "emailTemplates")
// - Modal di composizione con selezione template
// - Sostituzione variabili: {nome}, {cognome}, {classe}, {docente}, {data}
// - Invio tramite mailto: (apre il client email dell'utente)
// - Copia rapida destinatari/corpo negli appunti
// - Gestione template: crea, modifica, elimina dal modal
//
// Uso:
//   await EmailModule.init();                    // Carica template
//   EmailModule.apriComponi(destinatari, vars);  // Apri modal
//
// destinatari = [{ nome, cognome, email, classe }]
// vars = { classe: "3A", docente: "Rossi Mario", ... }
// ============================================================

const EmailModule = (() => {

  // ── Stato ──
  let templateLista = [];
  let destinatariCorrente = [];
  let variabiliCorrente = {};
  let modalIniettato = false;
  let templateEditId = null;   // null = nuovo, string = modifica

  // ══════════════════════════════════════════
  // INIT: Carica template da Firestore
  // ══════════════════════════════════════════
  async function init() {
    try {
      const snapshot = await db.collection("emailTemplates").orderBy("nome").get();
      templateLista = [];
      snapshot.forEach(doc => {
        templateLista.push({ id: doc.id, ...doc.data() });
      });
      console.log(`📧 EmailModule: ${templateLista.length} template caricati`);
    } catch (err) {
      console.error("Errore caricamento email templates:", err);
    }
  }

  // ══════════════════════════════════════════
  // INIETTA IL MODAL NEL DOM (una volta sola)
  // ══════════════════════════════════════════
  function injectModal() {
    if (modalIniettato) return;

    const html = `
    <!-- ═══════ MODAL COMPONI EMAIL ═══════ -->
    <div class="modal-overlay" id="email-overlay">
      <div class="modal" style="max-width:680px;">
        <div class="modal-header">
          <h3 class="modal-title" id="email-modal-title">📧 Componi Email</h3>
          <button class="modal-close" onclick="EmailModule.chiudi()">✕</button>
        </div>
        <div class="modal-body" id="email-modal-body">

          <!-- Destinatari -->
          <div class="email-dest-bar" id="email-dest-bar">
            <div class="email-dest-info">
              <span class="email-dest-label">A:</span>
              <span class="email-dest-count" id="email-dest-count">0 destinatari</span>
            </div>
            <button class="email-dest-toggle" id="email-dest-toggle" onclick="EmailModule.toggleDestinatari()">Mostra ▾</button>
          </div>
          <div class="email-dest-list" id="email-dest-list" style="display:none;"></div>

          <!-- Selezione template -->
          <div class="email-template-row">
            <div style="flex:1;">
              <label class="form-label">Template</label>
              <select class="select" id="email-template-select" onchange="EmailModule.applicaTemplate()">
                <option value="">— Scrivi da zero —</option>
              </select>
            </div>
            <button class="btn btn-ghost btn-sm" style="margin-top:22px;" onclick="EmailModule.apriGestisciTemplate()" title="Gestisci template">⚙️ Gestisci</button>
          </div>

          <!-- Oggetto -->
          <div class="form-group">
            <label class="form-label" for="email-oggetto">Oggetto</label>
            <input type="text" class="input" id="email-oggetto" placeholder="Oggetto dell'email">
          </div>

          <!-- Corpo -->
          <div class="form-group">
            <label class="form-label" for="email-corpo">Messaggio</label>
            <textarea class="textarea" id="email-corpo" rows="8" placeholder="Scrivi il tuo messaggio..."></textarea>
          </div>

          <!-- Variabili disponibili -->
          <div class="email-vars-hint" id="email-vars-hint">
            <strong>Variabili disponibili:</strong>
            <span class="email-var-tag">{nome}</span>
            <span class="email-var-tag">{cognome}</span>
            <span class="email-var-tag">{classe}</span>
            <span class="email-var-tag">{docente}</span>
            <span class="email-var-tag">{data}</span>
          </div>

        </div>
        <div class="modal-footer" style="flex-wrap:wrap;gap:8px;">
          <button class="btn btn-ghost" onclick="EmailModule.copiaDestinatari()" title="Copia tutte le email">📋 Copia Email</button>
          <div style="flex:1;"></div>
          <button class="btn btn-secondary" onclick="EmailModule.chiudi()">Annulla</button>
          <button class="btn btn-primary" id="email-btn-invia" onclick="EmailModule.inviaMailto()">📧 Apri Client Email</button>
        </div>
      </div>
    </div>

    <!-- ═══════ MODAL GESTISCI TEMPLATE ═══════ -->
    <div class="modal-overlay" id="email-tpl-overlay">
      <div class="modal" style="max-width:560px;">
        <div class="modal-header">
          <h3 class="modal-title" id="email-tpl-title">⚙️ Gestisci Template</h3>
          <button class="modal-close" onclick="EmailModule.chiudiGestisciTemplate()">✕</button>
        </div>
        <div class="modal-body" id="email-tpl-body">
          <!-- Lista template o form modifica -->
        </div>
      </div>
    </div>

    <style>
      /* ── Email Module Styles ── */
      .email-dest-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px;
        background: #E3F2FD;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .email-dest-info {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .email-dest-label {
        font-family: 'Source Sans 3', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #1565C0;
      }
      .email-dest-count {
        font-family: 'Source Sans 3', sans-serif;
        font-size: 13px;
        color: #1565C0;
      }
      .email-dest-toggle {
        background: none;
        border: none;
        font-size: 12px;
        color: #1565C0;
        cursor: pointer;
        font-weight: 600;
        font-family: 'Source Sans 3', sans-serif;
      }
      .email-dest-toggle:hover { text-decoration: underline; }
      .email-dest-list {
        max-height: 150px;
        overflow-y: auto;
        padding: 8px 14px;
        background: #F8FBFF;
        border: 1px solid #BBDEFB;
        border-radius: 8px;
        margin-bottom: 16px;
        font-family: 'Source Sans 3', sans-serif;
        font-size: 12.5px;
        color: #333;
        line-height: 1.8;
      }
      .email-template-row {
        display: flex;
        gap: 10px;
        align-items: flex-start;
        margin-bottom: 16px;
      }
      .email-vars-hint {
        padding: 10px 14px;
        background: #FEFAE0;
        border: 1px solid rgba(188, 108, 37, 0.2);
        border-radius: 8px;
        font-family: 'Source Sans 3', sans-serif;
        font-size: 12px;
        color: #856404;
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 6px;
      }
      .email-var-tag {
        background: rgba(188, 108, 37, 0.12);
        color: #BC6C25;
        padding: 2px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 11.5px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .email-var-tag:hover {
        background: rgba(188, 108, 37, 0.25);
      }
      /* Template management */
      .tpl-list-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid #F5F3EF;
        transition: background 0.1s;
      }
      .tpl-list-item:last-child { border-bottom: none; }
      .tpl-list-item:hover { background: #FAFAF8; }
      .tpl-list-info { flex: 1; min-width: 0; }
      .tpl-list-nome {
        font-family: 'Source Sans 3', sans-serif;
        font-size: 14px;
        font-weight: 600;
        color: #333;
      }
      .tpl-list-oggetto {
        font-family: 'Source Sans 3', sans-serif;
        font-size: 12px;
        color: #999;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tpl-list-actions {
        display: flex;
        gap: 4px;
      }
      .tpl-list-btn {
        width: 30px;
        height: 30px;
        border: 1px solid #E0E0E0;
        border-radius: 6px;
        background: #fff;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        transition: all 0.15s;
      }
      .tpl-list-btn:hover { background: #F5F3EF; }
      .tpl-list-btn.delete:hover { border-color: #C62828; color: #C62828; background: #FFEBEE; }
      .tpl-add-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px;
        border-bottom: 1px solid #EFEDE8;
      }
      .tpl-form { padding: 16px; }
      .tpl-form .form-group { margin-bottom: 14px; }
      .tpl-form-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding-top: 10px;
      }
      .tpl-empty {
        text-align: center;
        padding: 32px;
        color: #BBB;
        font-size: 14px;
      }
    </style>
    `;

    document.body.insertAdjacentHTML("beforeend", html);
    modalIniettato = true;

    // Chiudi overlay con click fuori
    document.getElementById("email-overlay").addEventListener("click", (e) => {
      if (e.target.id === "email-overlay") chiudi();
    });
    document.getElementById("email-tpl-overlay").addEventListener("click", (e) => {
      if (e.target.id === "email-tpl-overlay") chiudiGestisciTemplate();
    });

    // Click su variabile tag → inserisci nel corpo
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("email-var-tag")) {
        const textarea = document.getElementById("email-corpo");
        const varText = e.target.textContent;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        textarea.value = text.substring(0, start) + varText + text.substring(end);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = start + varText.length;
      }
    });
  }

  // ══════════════════════════════════════════
  // APRI MODAL COMPOSIZIONE
  // ══════════════════════════════════════════
  /**
   * @param {Array} destinatari - [{nome, cognome, email, classe}]
   * @param {Object} vars - {classe, docente, ...} variabili extra per i template
   */
  function apriComponi(destinatari, vars = {}) {
    injectModal();

    destinatariCorrente = destinatari.filter(d => d.email && d.email.trim());
    variabiliCorrente = {
      data: new Date().toLocaleDateString("it-IT"),
      ...vars
    };

    // Aggiorna contatore destinatari
    const count = destinatariCorrente.length;
    document.getElementById("email-dest-count").textContent =
      `${count} destinatari${count === 1 ? "o" : ""}`;

    // Popola lista destinatari
    const listEl = document.getElementById("email-dest-list");
    listEl.innerHTML = destinatariCorrente
      .map(d => `${d.cognome} ${d.nome} &lt;${d.email}&gt;`)
      .join("<br>");
    listEl.style.display = "none";
    document.getElementById("email-dest-toggle").textContent = "Mostra ▾";

    // Popola dropdown template
    const select = document.getElementById("email-template-select");
    select.innerHTML = '<option value="">— Scrivi da zero —</option>';
    templateLista.forEach(t => {
      select.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
    });

    // Reset campi
    document.getElementById("email-oggetto").value = "";
    document.getElementById("email-corpo").value = "";

    // Mostra modal
    document.getElementById("email-overlay").classList.add("active");
  }

  // ══════════════════════════════════════════
  // CHIUDI
  // ══════════════════════════════════════════
  function chiudi() {
    document.getElementById("email-overlay").classList.remove("active");
  }

  // ══════════════════════════════════════════
  // TOGGLE DESTINATARI
  // ══════════════════════════════════════════
  function toggleDestinatari() {
    const list = document.getElementById("email-dest-list");
    const btn = document.getElementById("email-dest-toggle");
    if (list.style.display === "none") {
      list.style.display = "block";
      btn.textContent = "Nascondi ▴";
    } else {
      list.style.display = "none";
      btn.textContent = "Mostra ▾";
    }
  }

  // ══════════════════════════════════════════
  // APPLICA TEMPLATE SELEZIONATO
  // ══════════════════════════════════════════
  function applicaTemplate() {
    const select = document.getElementById("email-template-select");
    const templateId = select.value;

    if (!templateId) {
      document.getElementById("email-oggetto").value = "";
      document.getElementById("email-corpo").value = "";
      return;
    }

    const template = templateLista.find(t => t.id === templateId);
    if (!template) return;

    document.getElementById("email-oggetto").value = sostituisciVariabili(template.oggetto || "");
    document.getElementById("email-corpo").value = sostituisciVariabili(template.corpo || "");
  }

  // ══════════════════════════════════════════
  // SOSTITUISCI VARIABILI
  // ══════════════════════════════════════════
  function sostituisciVariabili(testo) {
    let result = testo;
    result = result.replace(/\{data\}/g, variabiliCorrente.data || "");
    result = result.replace(/\{classe\}/g, variabiliCorrente.classe || "");
    result = result.replace(/\{docente\}/g, variabiliCorrente.docente || "");
    result = result.replace(/\{nome\}/g, variabiliCorrente.nome || "");
    result = result.replace(/\{cognome\}/g, variabiliCorrente.cognome || "");
    return result;
  }

  // ══════════════════════════════════════════
  // INVIA CON MAILTO
  // ══════════════════════════════════════════
  function inviaMailto() {
    const oggetto = document.getElementById("email-oggetto").value.trim();
    const corpo = document.getElementById("email-corpo").value.trim();

    if (!oggetto) {
      alert("Inserisci l'oggetto dell'email.");
      return;
    }

    const emails = destinatariCorrente.map(d => d.email.trim());

    if (emails.length === 0) {
      alert("Nessun destinatario con email valida.");
      return;
    }

    // Per molti destinatari usiamo BCC per privacy
    let mailtoUrl;
    if (emails.length === 1) {
      mailtoUrl = `mailto:${encodeURIComponent(emails[0])}?subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;
    } else {
      // Primo destinatario nel "to", resto in BCC
      mailtoUrl = `mailto:?bcc=${encodeURIComponent(emails.join(","))}&subject=${encodeURIComponent(oggetto)}&body=${encodeURIComponent(corpo)}`;
    }

    // Apri il client email
    window.open(mailtoUrl, "_blank");

    // Feedback
    const btn = document.getElementById("email-btn-invia");
    const original = btn.innerHTML;
    btn.innerHTML = "✅ Client email aperto!";
    btn.disabled = true;
    setTimeout(() => {
      btn.innerHTML = original;
      btn.disabled = false;
    }, 2500);
  }

  // ══════════════════════════════════════════
  // COPIA DESTINATARI
  // ══════════════════════════════════════════
  async function copiaDestinatari() {
    const emails = destinatariCorrente.map(d => d.email.trim()).filter(Boolean);
    if (emails.length === 0) {
      alert("Nessuna email da copiare.");
      return;
    }

    try {
      await navigator.clipboard.writeText(emails.join("; "));
      // Feedback
      const btn = document.querySelector("#email-overlay .btn-ghost");
      if (btn) {
        const original = btn.innerHTML;
        btn.innerHTML = "✅ Email copiate!";
        setTimeout(() => { btn.innerHTML = original; }, 2000);
      }
    } catch (err) {
      // Fallback: prompt con testo selezionabile
      prompt("Copia manualmente le email:", emails.join("; "));
    }
  }

  // ══════════════════════════════════════════
  // GESTIONE TEMPLATE
  // ══════════════════════════════════════════

  function apriGestisciTemplate() {
    injectModal();
    templateEditId = null;
    renderListaTemplate();
    document.getElementById("email-tpl-overlay").classList.add("active");
  }

  function chiudiGestisciTemplate() {
    document.getElementById("email-tpl-overlay").classList.remove("active");
    templateEditId = null;

    // Aggiorna dropdown nel modal principale
    const select = document.getElementById("email-template-select");
    if (select) {
      const valCorrente = select.value;
      select.innerHTML = '<option value="">— Scrivi da zero —</option>';
      templateLista.forEach(t => {
        select.innerHTML += `<option value="${t.id}">${t.nome}</option>`;
      });
      select.value = valCorrente;
    }
  }

  function renderListaTemplate() {
    const body = document.getElementById("email-tpl-body");
    const title = document.getElementById("email-tpl-title");
    title.textContent = "⚙️ Gestisci Template";

    let html = `
      <div class="tpl-add-bar">
        <span style="font-size:14px;font-weight:600;color:#333;">I tuoi template</span>
        <button class="btn btn-primary btn-sm" onclick="EmailModule.mostraFormTemplate()">➕ Nuovo</button>
      </div>
    `;

    if (templateLista.length === 0) {
      html += `<div class="tpl-empty">Nessun template. Creane uno!</div>`;
    } else {
      templateLista.forEach(t => {
        html += `
          <div class="tpl-list-item">
            <div class="tpl-list-info">
              <div class="tpl-list-nome">${escapeHtmlEmail(t.nome)}</div>
              <div class="tpl-list-oggetto">${escapeHtmlEmail(t.oggetto || "")}</div>
            </div>
            <div class="tpl-list-actions">
              <button class="tpl-list-btn" onclick="EmailModule.mostraFormTemplate('${t.id}')" title="Modifica">✏️</button>
              <button class="tpl-list-btn delete" onclick="EmailModule.eliminaTemplate('${t.id}')" title="Elimina">🗑️</button>
            </div>
          </div>
        `;
      });
    }

    body.innerHTML = html;
  }

  function mostraFormTemplate(id = null) {
    const body = document.getElementById("email-tpl-body");
    const title = document.getElementById("email-tpl-title");
    templateEditId = id;

    const template = id ? templateLista.find(t => t.id === id) : null;
    title.textContent = template ? "✏️ Modifica Template" : "➕ Nuovo Template";

    body.innerHTML = `
      <div class="tpl-form">
        <div class="form-group">
          <label class="form-label">Nome del template *</label>
          <input type="text" class="input" id="tpl-nome" value="${template ? escapeAttr(template.nome) : ""}" placeholder="Es. Link DAD">
        </div>
        <div class="form-group">
          <label class="form-label">Oggetto email</label>
          <input type="text" class="input" id="tpl-oggetto" value="${template ? escapeAttr(template.oggetto || "") : ""}" placeholder="Es. Link lezione DAD - {classe}">
        </div>
        <div class="form-group">
          <label class="form-label">Corpo del messaggio</label>
          <textarea class="textarea" id="tpl-corpo" rows="6" placeholder="Scrivi il template del messaggio...">${template ? escapeHtmlEmail(template.corpo || "") : ""}</textarea>
        </div>
        <div class="email-vars-hint" style="margin-bottom:14px;">
          <strong>Variabili:</strong>
          <span class="email-var-tag">{nome}</span>
          <span class="email-var-tag">{cognome}</span>
          <span class="email-var-tag">{classe}</span>
          <span class="email-var-tag">{docente}</span>
          <span class="email-var-tag">{data}</span>
        </div>
        <div class="tpl-form-footer">
          <button class="btn btn-secondary btn-sm" onclick="EmailModule.renderListaTemplate()">Annulla</button>
          <button class="btn btn-primary btn-sm" id="tpl-btn-salva" onclick="EmailModule.salvaTemplate()">
            ${template ? "Salva Modifiche" : "Crea Template"}
          </button>
        </div>
      </div>
    `;

    // Focus sul primo campo
    document.getElementById("tpl-nome").focus();
  }

  async function salvaTemplate() {
    const nome = document.getElementById("tpl-nome").value.trim();
    const oggetto = document.getElementById("tpl-oggetto").value.trim();
    const corpo = document.getElementById("tpl-corpo").value.trim();

    if (!nome) {
      alert("Il nome del template è obbligatorio.");
      return;
    }

    const btn = document.getElementById("tpl-btn-salva");
    btn.disabled = true;
    btn.textContent = "Salvataggio...";

    const dati = { nome, oggetto, corpo };

    try {
      if (templateEditId) {
        await db.collection("emailTemplates").doc(templateEditId).update(dati);
        // Aggiorna localmente
        const idx = templateLista.findIndex(t => t.id === templateEditId);
        if (idx !== -1) templateLista[idx] = { ...templateLista[idx], ...dati };
      } else {
        dati.creatoIl = firebase.firestore.FieldValue.serverTimestamp();
        const ref = await db.collection("emailTemplates").add(dati);
        templateLista.push({ id: ref.id, ...dati });
        templateLista.sort((a, b) => a.nome.localeCompare(b.nome));
      }

      templateEditId = null;
      renderListaTemplate();
    } catch (err) {
      console.error("Errore salvataggio template:", err);
      alert("Errore durante il salvataggio. Riprova.");
      btn.disabled = false;
      btn.textContent = "Riprova";
    }
  }

  async function eliminaTemplate(id) {
    const template = templateLista.find(t => t.id === id);
    if (!template) return;

    if (!confirm(`Eliminare il template "${template.nome}"?`)) return;

    try {
      await db.collection("emailTemplates").doc(id).delete();
      templateLista = templateLista.filter(t => t.id !== id);
      renderListaTemplate();
    } catch (err) {
      console.error("Errore eliminazione template:", err);
      alert("Errore durante l'eliminazione. Riprova.");
    }
  }

  // ══════════════════════════════════════════
  // UTILITY
  // ══════════════════════════════════════════
  function escapeHtmlEmail(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return "";
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // ══════════════════════════════════════════
  // API PUBBLICA
  // ══════════════════════════════════════════
  return {
    init,
    apriComponi,
    chiudi,
    toggleDestinatari,
    applicaTemplate,
    inviaMailto,
    copiaDestinatari,
    apriGestisciTemplate,
    chiudiGestisciTemplate,
    renderListaTemplate,
    mostraFormTemplate,
    salvaTemplate,
    eliminaTemplate
  };

})();
