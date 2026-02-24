# 🎓 GestioneDocenti

Sistema di Gestione Docenti per scuola — applicazione web per amministrare docenti, orari scolastici, ripetizioni e compensi.

## Stack tecnologico

- **Frontend**: HTML, CSS, JavaScript vanilla (nessun framework)
- **Database**: Firebase Firestore
- **Hosting**: GitHub Pages (o qualsiasi hosting statico)

## Funzionalità

### Admin (Silvia)
- **Dashboard** — panoramica generale con statistiche
- **Anagrafica Docenti** — CRUD completo dei docenti
- **Orario Scolastico** — griglia settimanale con assegnazione lezioni
- **Ripetizioni** — calendario pomeridiano con gestione ripetizioni
- **Riepilogo Mensile** — calcolo automatico compensi (lezioni × tariffa + ore ripetizioni × tariffa)
- **Impostazioni** — configurazione orari giornalieri e tariffe

### Docente
- **Il Mio Orario** — visualizzazione (sola lettura) del proprio orario settimanale
- **Le Mie Ripetizioni** — visualizzazione (sola lettura) delle proprie ripetizioni

## Struttura del progetto

```
gestione-docenti/
├── css/style.css
├── js/
│   ├── firebase-config.js
│   ├── auth.js
│   ├── template.js
│   ├── utils.js
│   ├── dashboard.js
│   ├── docenti.js
│   ├── calendario.js
│   ├── ripetizioni.js
│   ├── riepilogo.js
│   ├── impostazioni.js
│   └── export-csv.js
├── index.html (login)
├── dashboard.html
├── docenti.html
├── calendario.html
├── ripetizioni.html
├── riepilogo.html
├── impostazioni.html
├── mio-orario.html
├── mie-ripetizioni.html
└── README.md
```

## Collezioni Firestore

| Collezione | Descrizione |
|---|---|
| `docenti` | Anagrafica docenti con credenziali e tariffe |
| `orarioScolastico` | Lezioni assegnate nella griglia settimanale |
| `ripetizioni` | Ripetizioni pomeridiane prenotate |
| `impostazioniOrari` | Configurazione fasce orarie per giorno |

## Setup

1. Clona il repository
2. Apri `index.html` in un browser (o usa un server locale)
3. Accedi come admin: username `Silvia`

## Autore

Progetto sviluppato per la gestione interna di una scuola.
