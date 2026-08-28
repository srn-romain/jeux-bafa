/* ================================================================
   ESPACE-AUTH.JS — Module d'authentification partagé
   Chargé sur toutes les pages de l'espace
   ================================================================ */

// ----------------------------------------------------------------
// Utilitaires globaux (toasts, modals, formating)
// ----------------------------------------------------------------

function escapeHtml(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return str.replace(/[&<>"']/g, m => map[m]);
}

function showToast(msg, type = 'default', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `es-toast es-toast--${type}`;
    const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', default: 'info-circle' };
    
    const isInfinite = duration === Infinity || duration === 0;

    t.innerHTML = `
        <i class="bi bi-${icons[type] || 'info-circle'}" style="flex-shrink: 0;"></i>
        <span style="flex: 1; min-width: 0;">${msg}</span>
        ${isInfinite ? `<i class="bi bi-x es-toast-close-btn" style="cursor: pointer; font-size: 1.2rem; opacity: 0.7; margin-left: 8px; transition: opacity var(--transition); flex-shrink: 0;"></i>` : ''}
    `;
    
    if (isInfinite) {
        const closeBtn = t.querySelector('.es-toast-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                t.style.opacity = '0';
                t.style.transition = 'opacity .3s';
                setTimeout(() => t.remove(), 300);
            });
            closeBtn.addEventListener('mouseover', () => { closeBtn.style.opacity = '1'; });
            closeBtn.addEventListener('mouseout', () => { closeBtn.style.opacity = '0.7'; });
        }
    }

    container.appendChild(t);
    
    if (!isInfinite) {
        setTimeout(() => { 
            t.style.opacity = '0'; 
            t.style.transition = 'opacity .3s'; 
            setTimeout(() => t.remove(), 300); 
        }, duration);
    }
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

function openModal(id) { 
    document.getElementById(id)?.classList.remove('hidden'); 
    document.body.classList.add('modal-open');
}
function closeModal(id) { 
    document.getElementById(id)?.classList.add('hidden'); 
    if (!document.querySelector('.es-overlay:not(.hidden)')) {
        document.body.classList.remove('modal-open');
    }
}

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
        e.preventDefault();
        e.target.classList.add('hidden');
        if (!document.querySelector('.es-overlay:not(.hidden)')) {
            document.body.classList.remove('modal-open');
        }
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
    const brandNameEl = document.getElementById('brandName');
    const pageDirectorNameEl = document.getElementById('pageDirectorName');

    const firstName = userData?.firstName || '';
    const lastName = userData?.lastName || '';
    const fullName = (firstName && lastName) ? `${firstName} ${lastName}` : (userData?.displayName || user.displayName || user.email || '');
    const displayFirstName = userData?.firstName || userData?.displayName?.split(' ')[0] || user.displayName?.split(' ')[0] || user.email || '';

    if (nameEl) nameEl.textContent = displayFirstName;
    if (badgeEl) {
        badgeEl.textContent = role === 'admin' ? '👑 Admin' : '🎨 Anim';
        badgeEl.className = `es-badge ${role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}`;
    }
    if (avatarEl) {
        if (userData?.photoURL || user.photoURL) {
            avatarEl.innerHTML = `<img src="${userData?.photoURL || user.photoURL}" alt="">`;
        } else {
            avatarEl.innerHTML = `<i class="bi bi-person-circle"></i>`;
        }
    }

    // Mise à jour dynamique du nom du directeur (si admin) ou de l'utilisateur
    if (role === 'admin') {
        if (brandNameEl) brandNameEl.textContent = `Dashboard de ${firstName}`;
        if (pageDirectorNameEl) pageDirectorNameEl.textContent = fullName;
    } else {
        // Si c'est un animateur, on cherche le nom d'un directeur (admin) pour l'afficher
        firebase.firestore().collection('users').where('role', '==', 'admin').limit(1).get()
            .then(snap => {
                if (!snap.empty) {
                    const adminData = snap.docs[0].data();
                    const adminFullName = `${adminData.firstName || ''} ${adminData.lastName || ''}`.trim() || adminData.displayName || 'Directeur';
                    const adminFirstName = adminData.firstName || adminData.displayName?.split(' ')[0] || 'Directeur';
                    if (brandNameEl) brandNameEl.textContent = `Dashboard de ${adminFirstName}`;
                    if (pageDirectorNameEl) pageDirectorNameEl.textContent = adminFullName;
                }
            }).catch(err => console.error("Erreur fetch admin info:", err));
    }

    // Gérer la visibilité du lien admin
    const linkAdmin = document.getElementById('linkAdmin');
    const btnAdminLink = document.getElementById('btnAdminLink');
    if (role === 'admin') {
        linkAdmin?.classList.remove('hidden');
        btnAdminLink?.classList.remove('hidden');
    } else {
        linkAdmin?.classList.add('hidden');
        btnAdminLink?.classList.add('hidden');
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
async function triggerOpenSettings() {
    const user = firebase.auth().currentUser;
    if (!user) return;

    const doc = await firebase.firestore().collection('users').doc(user.uid).get();
    const data = doc.data();

    const emailEl = document.getElementById('settingsUserEmail');
    const roleEl = document.getElementById('settingsUserRole');
    const firstNameInput = document.getElementById('settingsFirstName');
    const lastNameInput = document.getElementById('settingsLastName');
    const birthdateInput = document.getElementById('settingsBirthdate');

    if (emailEl) emailEl.textContent = user.email;
    if (roleEl) roleEl.textContent = data.role === 'admin' ? 'Directeur' : 'Animateur';
    if (firstNameInput) firstNameInput.value = data.firstName || data.displayName || '';
    if (lastNameInput) lastNameInput.value = data.lastName || '';
    if (birthdateInput) birthdateInput.value = data.birthdate || '';

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
}
window.triggerOpenSettings = triggerOpenSettings;
document.getElementById('btnOpenSettings')?.addEventListener('click', triggerOpenSettings);

document.getElementById('btnCloseSettings')?.addEventListener('click', () => closeModal('overlaySettings'));
document.getElementById('btnCancelSettings')?.addEventListener('click', () => closeModal('overlaySettings'));

// Sauvegarder paramètres
document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveSettings');
    const firstName = document.getElementById('settingsFirstName')?.value.trim();
    const lastName = document.getElementById('settingsLastName')?.value.trim();
    const birthdate = document.getElementById('settingsBirthdate')?.value;
    const errorEl = document.getElementById('settingsError');
    const msgEl = document.getElementById('settingsErrorMsg');

    if (!firstName || !lastName || !birthdate) {
        if (msgEl && errorEl) {
            msgEl.textContent = "Le prénom, le nom et la date de naissance ne peuvent pas être vides.";
            errorEl.classList.remove('hidden');
        }
        return;
    }

    btnLoading(btn, true);
    errorEl?.classList.add('hidden');

    try {
        const uid = firebase.auth().currentUser.uid;
        await firebase.firestore().collection('users').doc(uid).update({
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            birthdate: birthdate
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
    window.isSigningUp = true; // Empêcher onAuthStateChanged d'interférer
    try {
        // 1. Vérifier si l'inscription globale est autorisée
        const globalDoc = await firebase.firestore().collection('globalSettings').doc('dashboard').get();
        const allowSignup = !globalDoc.exists || globalDoc.data().allowSignup !== false;

        // 2. Connexion / Auth Google via popup
        const result = await firebase.auth().signInWithPopup(googleProvider);
        const user = result.user;

        // 3. Vérifier si le profil utilisateur existe dans Firestore
        const doc = await firebase.firestore().collection('users').doc(user.uid).get();

        if (!doc.exists) {
            // NOUVELLE INSCRIPTION !
            if (!allowSignup) {
                // Inscription fermée : ne PAS créer le document Firestore
                // Supprimer le compte Auth temporaire généré par Google
                try {
                    await user.delete();
                } catch (delErr) {
                    console.warn("Impossible de supprimer le compte auth Google:", delErr);
                }
                await firebase.auth().signOut();
                window.isSigningUp = false;

                const msg = "La création de compte est actuellement fermée par le directeur.";
                showToast(msg, "error");

                // Afficher l'erreur également dans les alertes de la page d'accueil si présentes
                const loginErr = document.getElementById('loginError');
                const loginErrMsg = document.getElementById('loginErrorMsg');
                if (loginErr && loginErrMsg) {
                    loginErrMsg.textContent = msg;
                    loginErr.classList.remove('hidden');
                }
                const signupErr = document.getElementById('signupError');
                const signupErrMsg = document.getElementById('signupErrorMsg');
                if (signupErr && signupErrMsg) {
                    signupErrMsg.textContent = msg;
                    signupErr.classList.remove('hidden');
                }

                if (window.loginView) {
                    window.loginView.classList.remove('hidden');
                    window.dashboardView?.classList.add('hidden');
                }
                return;
            }

            // Inscription autorisée : créer le document Firestore
            await firebase.firestore().collection('users').doc(user.uid).set({
                email: user.email,
                displayName: user.displayName || '',
                photoURL: user.photoURL || '',
                role: 'anim',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } else {
            // UTILISATEUR EXISTANT : Connexion normale
            const currentData = doc.data();
            if (!currentData.photoURL && user.photoURL) {
                await firebase.firestore().collection('users').doc(user.uid).update({
                    photoURL: user.photoURL
                });
            }
        }
        
        // Si tout est ok (nouvelle inscription autorisée ou login existant), on recharge
        window.location.reload();
    } catch (err) {
        window.isSigningUp = false;
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
    return map[code] || 'Identifiant ou mot de passe incorrect.';
}

// ----------------------------------------------------------------
// ENREGISTREMENT SERVICE WORKER (PWA & Notifications)
// ----------------------------------------------------------------
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = window.location.pathname.includes('/pages/') ? '../../sw.js' : 'sw.js';
        navigator.serviceWorker.register(swPath)
            .then(reg => console.log('SW Registered'))
            .catch(err => console.log('SW Registration Failed', err));
    });
}

// ----------------------------------------------------------------
// GESTION DU BANNISSEMENT
// ----------------------------------------------------------------

function showBannedScreen() {
    // Hide standard page loaders
    document.getElementById('pageLoader')?.classList.add('hidden');
    document.getElementById('adminLoader')?.classList.add('hidden');

    if (!document.getElementById('ban-screen-styles')) {
        const style = document.createElement('style');
        style.id = 'ban-screen-styles';
        style.innerHTML = `
            .es-ban-screen {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background-color: var(--clr-bg-dark, #121212);
                color: var(--clr-text, #ffffff);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: 'Inter', system-ui, -apple-system, sans-serif;
                padding: 20px;
                box-sizing: border-box;
            }
            .es-ban-card {
                background: var(--clr-surface-2, #1e1e1e);
                border: 1px solid var(--clr-surface-3, rgba(255,255,255,0.08));
                padding: 40px;
                border-radius: var(--radius-lg, 16px);
                max-width: 480px;
                width: 100%;
                text-align: center;
                box-shadow: var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.5));
                animation: es-ban-fadein 0.4s ease-out;
            }
            @keyframes es-ban-fadein {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .es-ban-icon {
                font-size: 3.5rem;
                color: var(--clr-danger, #e74c3c);
                margin-bottom: 24px;
                display: flex;
                justify-content: center;
                align-items: center;
            }
            .es-ban-title {
                font-size: 1.5rem;
                font-weight: 800;
                margin-top: 0;
                margin-bottom: 16px;
                color: var(--clr-text, #ffffff);
            }
            .es-ban-message {
                font-size: 0.95rem;
                line-height: 1.6;
                color: var(--clr-text-muted, rgba(255,255,255,0.7));
                margin-bottom: 32px;
            }
            .es-ban-actions {
                display: flex;
                flex-direction: column;
                gap: 12px;
            }
        `;
        document.head.appendChild(style);
    }

    const banHtml = `
        <div class="es-ban-screen">
            <div class="es-ban-card">
                <div class="es-ban-icon">
                    <i class="bi bi-shield-slash-fill"></i>
                </div>
                <h1 class="es-ban-title">Accès restreint</h1>
                <p class="es-ban-message">
                    L'administrateur de l'app vous a restreint les accès à cet espace, veuillez nous contacter si vous pensez que cela est une erreur.
                </p>
                <div class="es-ban-actions">
                    <button id="btnBanLogout" class="es-btn es-btn--danger es-btn--full es-btn--lg">
                        <i class="bi bi-box-arrow-right"></i> Déconnexion
                    </button>
                </div>
            </div>
        </div>
    `;

    let banContainer = document.getElementById('banScreenContainer');
    if (!banContainer) {
        banContainer = document.createElement('div');
        banContainer.id = 'banScreenContainer';
        document.body.appendChild(banContainer);
    }
    banContainer.innerHTML = banHtml;
    document.body.style.overflow = 'hidden';

    document.getElementById('btnBanLogout')?.addEventListener('click', async () => {
        await firebase.auth().signOut();
        window.location.reload();
    });
}

// Écouteur global pour intercepter et bloquer en temps réel si banni
firebase.auth().onAuthStateChanged((user) => {
    if (user) {
        if (window.currentUserUnsub) window.currentUserUnsub();
        window.currentUserUnsub = firebase.firestore().collection('users').doc(user.uid).onSnapshot(doc => {
            if (doc.exists) {
                const userData = doc.data();
                if (userData.banned === true) {
                    showBannedScreen();
                } else {
                    // Si le membre a été débanni en temps réel, on supprime l'écran de ban s'il existe
                    const container = document.getElementById('banScreenContainer');
                    if (container) {
                        container.remove();
                        document.body.style.overflow = '';
                        window.location.reload(); // Recharger pour restaurer l'état
                    }

                    // VÉRIFIER SI LE COMPTE EST INCOMPLET
                    if (!userData.firstName || !userData.lastName || !userData.birthdate) {
                        setTimeout(() => {
                            const overlay = document.getElementById('overlaySettings');
                            if (overlay && overlay.classList.contains('hidden')) {
                                window.triggerOpenSettings();
                                showToast("Merci de compléter ton profil (Prénom, Nom et Date de naissance) pour continuer.", "default", 8000);
                            }
                        }, 500);
                    }
                }
            }
        }, err => {
            if (err.code !== 'permission-denied') {
                console.error("Erreur écoute statut ban:", err);
            }
        });
    } else {
        if (window.currentUserUnsub) {
            window.currentUserUnsub();
            window.currentUserUnsub = null;
        }
    }
});
