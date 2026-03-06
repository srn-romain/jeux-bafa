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

    // Gérer la visibilité du lien admin
    const linkAdmin = document.getElementById('linkAdmin');
    if (linkAdmin) {
        if (role === 'admin') linkAdmin.classList.remove('hidden');
        else linkAdmin.classList.add('hidden');
    }
}

// ----------------------------------------------------------------
// Déconnexion (bouton présent sur toutes les pages)
// ----------------------------------------------------------------
// ----------------------------------------------------------------
// MENU PROFIL & PARAMETRES (Partagé)
// ----------------------------------------------------------------

// Toggle Dropdown
document.addEventListener('click', (e) => {
    const btn = document.getElementById('btnUserMenu');
    const dropdown = document.getElementById('userDropdown');

    if (btn && btn.contains(e.target)) {
        e.stopPropagation();
        dropdown?.classList.toggle('hidden');
    } else {
        dropdown?.classList.add('hidden');
    }
});

// Ouvrir paramètres
document.getElementById('btnOpenSettings')?.addEventListener('click', async () => {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    const data = doc.data();

    const emailEl = document.getElementById('settingsUserEmail');
    const roleEl = document.getElementById('settingsUserRole');
    const nameInput = document.getElementById('settingsDisplayName');

    if (emailEl) emailEl.textContent = user.email;
    if (roleEl) roleEl.textContent = data.role === 'admin' ? 'Directeur' : 'Animateur';
    if (nameInput) nameInput.value = data.displayName || '';

    const img = document.getElementById('settingsAvatarImg');
    const placeholder = document.getElementById('settingsAvatarPlaceholder');
    if (img && placeholder) {
        if (data.photoURL || user.photoURL) {
            img.src = data.photoURL || user.photoURL;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');
        } else {
            img.classList.add('hidden');
            placeholder.classList.remove('hidden');
        }
    }

    openModal('overlaySettings');
});

document.getElementById('btnCloseSettings')?.addEventListener('click', () => closeModal('overlaySettings'));
document.getElementById('btnCancelSettings')?.addEventListener('click', () => closeModal('overlaySettings'));

// Sauvegarder paramètres
document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveSettings');
    const name = document.getElementById('settingsDisplayName')?.value.trim();
    const errorEl = document.getElementById('settingsError');
    const msgEl = document.getElementById('settingsErrorMsg');

    if (!name) {
        if (msgEl && errorEl) {
            msgEl.textContent = "Le pseudo ne peut pas être vide.";
            errorEl.classList.remove('hidden');
        }
        return;
    }

    btnLoading(btn, true);
    errorEl?.classList.add('hidden');

    try {
        const uid = firebase.auth().currentUser.uid;
        await firebase.firestore().collection('users').doc(uid).update({
            displayName: name
        });
        showToast("Profil mis à jour !", "success");
        closeModal('overlaySettings');

        // Rafraîchir l'UI
        const user = firebase.auth().currentUser;
        const role = await getUserRole(uid);
        const doc = await firebase.firestore().collection('users').doc(uid).get();
        updateTopbarUser(user, role, doc.data());
    } catch (err) {
        if (msgEl && errorEl) {
            msgEl.textContent = "Erreur lors de la sauvegarde.";
            errorEl.classList.remove('hidden');
        }
    } finally {
        btnLoading(btn, false);
    }
});

// Supprimer le compte
document.getElementById('btnDeleteAccount')?.addEventListener('click', async () => {
    if (!confirm("⚠️ ATTENTION : La suppression de votre compte est définitive. Continuer ?")) return;

    const btn = document.getElementById('btnDeleteAccount');
    btnLoading(btn, true);

    try {
        const user = firebase.auth().currentUser;
        const uid = user.uid;

        // 1. Supprimer les demandes d'accès
        const reqs = await firebase.firestore().collection('accessRequests').where('userId', '==', uid).get();
        const batch = firebase.firestore().batch();
        reqs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // 2. Supprimer le doc utilisateur
        await firebase.firestore().collection('users').doc(uid).delete();

        // 3. Supprimer le compte auth (nécessite connexion récente)
        await user.delete();

        showToast("Compte supprimé avec succès.", "success");
        window.location.href = window.location.pathname.includes('/espace/') ? 'index.html' : 'pages/espace/index.html';
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/requires-recent-login') {
            showToast("Action sensible : reconnectez-vous avant de supprimer.", "error");
            firebase.auth().signOut();
        } else {
            showToast("Erreur lors de la suppression.", "error");
        }
    } finally {
        btnLoading(btn, false);
    }
});

// Photo : Changement d'avatar
document.getElementById('btnEditAvatar')?.addEventListener('click', () => {
    document.getElementById('inputAvatar')?.click();
});

document.getElementById('inputAvatar')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Seul les images sont acceptées.", "error");
        return;
    }

    const user = firebase.auth().currentUser;
    if (!user) return;

    const btn = document.getElementById('btnEditAvatar');
    if (btn) btn.disabled = true;
    const icon = btn?.querySelector('i');
    if (icon) icon.className = "bi bi-hourglass-split";

    try {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            let base64 = reader.result;

            if (base64.length > 550000) {
                showToast("Image trop lourde. Choisis une photo plus petite.", "error");
                if (btn) btn.disabled = false;
                if (icon) icon.className = "bi bi-camera";
                return;
            }

            // Mettre à jour Firestore
            await firebase.firestore().collection('users').doc(user.uid).update({
                photoURL: base64
            });

            // Mettre à jour l'aperçu
            const img = document.getElementById('settingsAvatarImg');
            const placeholder = document.getElementById('settingsAvatarPlaceholder');
            if (img) {
                img.src = base64;
                img.classList.remove('hidden');
            }
            placeholder?.classList.add('hidden');

            // Mettre à jour la topbar
            const role = await getUserRole(user.uid);
            const doc = await firebase.firestore().collection('users').doc(user.uid).get();
            updateTopbarUser(user, role, doc.data());

            showToast("Photo de profil mise à jour !", "success");

            if (btn) btn.disabled = false;
            if (icon) icon.className = "bi bi-camera";
        };
        reader.onerror = () => {
            throw new Error("Erreur de lecture du fichier.");
        };

    } catch (err) {
        console.error("Erreur base64:", err);
        showToast("Erreur lors du traitement de l'image.", "error");
        if (btn) btn.disabled = false;
        if (icon) icon.className = "bi bi-camera";
    }
});

// Déconnexion
document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await firebase.auth().signOut();
    // Rediriger vers l'index de l'espace
    const isSubDir = window.location.pathname.includes('/espace/') && !window.location.pathname.endsWith('/index.html');
    window.location.href = isSubDir ? 'index.html' : 'index.html';
    // Note: Si on est déjà sur pages/espace/index.html, on y reste. 
    // Sinon, on y retourne.
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
