/* ================================================================
   ESPACE-AUTH.JS — Module d'authentification partagé
   Chargé sur toutes les pages de l'espace
   ================================================================ */

// ----------------------------------------------------------------
// Utilitaires globaux (toasts, modals, formating)
// ----------------------------------------------------------------

function showToast(msg, type = 'default', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `es-toast es-toast--${type}`;
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', default: 'info-circle' };
    t.innerHTML = `<i class="bi bi-${icons[type] || 'info-circle'}"></i><span>${msg}</span>`;
    container.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, duration);
}

function btnLoading(btn, on) {
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('loading', on);
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

// Fermer les modals en cliquant sur l'overlay (pas le modal lui-même)
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('es-overlay')) {
        e.target.classList.add('hidden');
    }
});

// ----------------------------------------------------------------
// Auth Google Provider (déclaré dans firebase-config.js)
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// Récupérer le rôle depuis Firestore
// ----------------------------------------------------------------
async function getUserRole(uid) {
    try {
        const doc = await firebase.firestore().collection('users').doc(uid).get();
        return doc.exists ? (doc.data().role || null) : null;
    } catch (e) {
        console.error('getUserRole:', e);
        return null;
    }
}

// ----------------------------------------------------------------
// Mettre à jour le nom affiché dans la topbar
// ----------------------------------------------------------------
function updateTopbarUser(user, role) {
    const nameEl = document.getElementById('userDisplayName');
    const badgeEl = document.getElementById('userBadge');
    if (nameEl) nameEl.textContent = user.displayName || user.email || '';
    if (badgeEl) {
        badgeEl.textContent = role === 'admin' ? '👑 Admin' : '🎨 Anim';
        badgeEl.className = `es-badge ${role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}`;
    }
}

// ----------------------------------------------------------------
// Déconnexion (bouton présent sur toutes les pages)
// ----------------------------------------------------------------
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await firebase.auth().signOut();
    window.location.href = 'index.html';
});

// ----------------------------------------------------------------
// Fonctions de login (utilisées sur index.html)
// ----------------------------------------------------------------

async function signInWithGoogle() {
    try {
        const result = await firebase.auth().signInWithPopup(googleProvider);
        const user = result.user;
        const doc = await firebase.firestore().collection('users').doc(user.uid).get();
        if (!doc.exists) {
            await firebase.firestore().collection('users').doc(user.uid).set({
                email: user.email,
                displayName: user.displayName || '',
                role: 'anim',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            console.error('Google sign-in error:', err);
            showToast('Erreur Google : ' + err.message, 'error');
        }
    }
}

function authErrorMessage(code) {
    const map = {
        'auth/user-not-found': 'Aucun compte avec cet email.',
        'auth/wrong-password': 'Mot de passe incorrect.',
        'auth/invalid-email': 'Adresse email invalide.',
        'auth/too-many-requests': 'Trop de tentatives. Réessaie plus tard.',
        'auth/email-already-in-use': 'Cet email est déjà utilisé.',
        'auth/weak-password': 'Mot de passe trop faible (6 caractères minimum).',
        'auth/invalid-credential': 'Identifiants incorrects.',
    };
    return map[code] || 'Une erreur est survenue.';
}
