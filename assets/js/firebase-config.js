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
    appId: "1:209396252707:web:9d26e076a97a598a43f196"
};

// Initialisation Firebase
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Provider Google
const googleProvider = new firebase.auth.GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
