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

function formatDate(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatFullDate(date) {
    if (!date) return 'Jamais';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
        d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function escapeHtml(text) {
    if (!text) return "";
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.toString().replace(/[&<>"']/g, m => map[m]);
}

function togglePwd(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = type === 'password' ? 'bi bi-eye' : 'bi bi-eye-slash';
    }
}

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
function updateTopbarUser(user, role, userData = null) {
    const nameEl = document.getElementById('userDisplayName');
    const badgeEl = document.getElementById('userBadge');
    const avatarEl = document.getElementById('userAvatar');

    const displayName = userData?.displayName || user.displayName || user.email || '';
    const photoURL = userData?.photoURL || user.photoURL || '';

    if (nameEl) nameEl.textContent = displayName;
    if (badgeEl) {
        badgeEl.textContent = role === 'admin' ? '👑 Admin' : '🎨 Anim';
        badgeEl.className = `es-badge ${role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}`;
    }
    if (avatarEl) {
        if (photoURL) {
            avatarEl.innerHTML = `<img src="${photoURL}" alt="">`;
        } else {
            avatarEl.innerHTML = `<i class="bi bi-person-circle"></i>`;
        }
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
                photoURL: user.photoURL || '',
                role: 'anim',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // Uniquement si pas déjà de photo (ou si l'admin veut forcer la synchro)
            const currentData = doc.data();
            if (!currentData.photoURL) {
                await firebase.firestore().collection('users').doc(user.uid).update({
                    photoURL: user.photoURL || ''
                });
            }
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
