// ============================================================
// CONFIGURATION FIREBASE
// Remplace ces valeurs par celles de ton projet Firebase
// Console Firebase : https://console.firebase.google.com/
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyA13yzmc33qygFAa-PkS-PPbD1d38orTAk",
    authDomain: "repertoirecolo.firebaseapp.com",
    projectId: "repertoirecolo",
    storageBucket: "repertoirecolo.firebasestorage.app",
    messagingSenderId: "209396252707",
    appId: "1:209396252707:web:9d26e076a97a598a43f196",
    measurementId: "G-3WN5QK4J41"
};

// Initialisation Firebase
if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

var auth = firebase.auth();
var db = firebase.firestore();
var storage = firebase.storage();

window.auth = auth;
window.db = db;
window.storage = storage;

// Activer la persistance hors ligne pour Firestore
if (db && db.enablePersistence) {
    db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
        if (err.code === 'failed-precondition') {
            console.warn('Persistance Firestore : plusieurs onglets ouverts.');
        } else if (err.code === 'unimplemented') {
            console.warn('Persistance Firestore non supportée par ce navigateur.');
        } else {
            console.warn('Erreur activation persistance Firestore:', err);
        }
    });
}

// Provider Google
var googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
window.googleProvider = googleProvider;

