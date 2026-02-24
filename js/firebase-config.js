// ============================================================
// firebase-config.js — Configurazione Firebase + Firestore
// ============================================================
// Firebase viene caricato via CDN negli script tag delle pagine HTML.
// Qui inizializziamo l'app e rendiamo "db" disponibile globalmente.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDmTmZ67t5jPAfvoJHoVkG7a4NfkUQzJbc",
  authDomain: "gestione-docenti-5f4f1.firebaseapp.com",
  projectId: "gestione-docenti-5f4f1",
  storageBucket: "gestione-docenti-5f4f1.firebasestorage.app",
  messagingSenderId: "1097917190310",
  appId: "1:1097917190310:web:dc11650039bf6c7cefa467"
};

// Inizializza Firebase
firebase.initializeApp(firebaseConfig);

// Inizializza Firestore e rendilo globale
const db = firebase.firestore();
window.db = db;

console.log("✅ Firebase inizializzato correttamente");
