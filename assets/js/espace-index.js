/* ================================================================
   ESPACE-INDEX.JS — Dashboard : login + liste des colos
   ================================================================ */

// db, auth et googleProvider sont déclarés dans firebase-config.js

// Éléments
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');
const pageLoader = document.getElementById('pageLoader');

// ----------------------------------------------------------------
// GESTION DU BOUTON D'INSCRIPTION (Désactivable par l'admin)
// ----------------------------------------------------------------
db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
    const enabledContent = document.getElementById('signupEnabledContent');
    const disabledContent = document.getElementById('signupDisabledContent');
    
    if (enabledContent && disabledContent) {
        // La création est désactivée si allowSignup === false ou "false"
        const isSignupDisabled = doc.exists && (doc.data().allowSignup === false || doc.data().allowSignup === 'false');
        if (isSignupDisabled) {
            enabledContent.classList.add('hidden');
            disabledContent.classList.remove('hidden');
        } else {
            enabledContent.classList.remove('hidden');
            disabledContent.classList.add('hidden');
        }
    }

    // Mise à jour dynamique du rôle par défaut d'inscription
    const defaultRole = (doc.exists && doc.data().signupDefaultRole) ? doc.data().signupDefaultRole : 'anim';
    const labelEl = document.getElementById('signupRoleLabel');
    if (labelEl) {
        labelEl.textContent = (defaultRole === 'stagiaire') ? 'Stagiaire BAFA' : 'Anim';
    }

    // Mise à jour dynamique du titre du tableau de bord
    const titleEl = document.getElementById('pageDashboardTitle');
    if (titleEl) {
        let rawTitle = (doc.exists && doc.data().dashboardTitle) ? doc.data().dashboardTitle : 'Le [QG] de tes colos';
        let formattedTitle = rawTitle.replace(/\[(.*?)\]/g, `<span style="color:var(--clr-accent);">$1</span>`);
        titleEl.innerHTML = `${formattedTitle} <span id="pageDirectorName" style="display:none;"></span>`;
    }
}, err => {
    // Si Firebase bloque la lecture pour les non-connectés, on ignore l'erreur
    // car la sécurité est quand même assurée lors de la tentative d'inscription.
    if (err.code !== 'permission-denied') {
        console.error("Erreur lecture settings signup:", err);
    }
});

// ----------------------------------------------------------------
// ONGLETS LOGIN / INSCRIPTION
// ----------------------------------------------------------------
document.getElementById('tabLogin')?.addEventListener('click', () => {
    document.getElementById('tabLogin').classList.add('active');
    document.getElementById('tabSignup').classList.remove('active');
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('signupForm').classList.add('hidden');
});

document.getElementById('tabSignup')?.addEventListener('click', () => {
    document.getElementById('tabSignup').classList.add('active');
    document.getElementById('tabLogin').classList.remove('active');
    document.getElementById('signupForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
});

// ----------------------------------------------------------------
// LOGIN EMAIL
// ----------------------------------------------------------------
document.getElementById('loginFormEl')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnLogin');
    const errorEl = document.getElementById('loginError');
    const msgEl = document.getElementById('loginErrorMsg');
    errorEl.classList.add('hidden');
    btnLoading(btn, true);

    try {
        await auth.signInWithEmailAndPassword(
            document.getElementById('emailLogin').value.trim(),
            document.getElementById('passwordLogin').value
        );
    } catch (err) {
        btnLoading(btn, false);
        msgEl.textContent = authErrorMessage(err.code);
        errorEl.classList.remove('hidden');
    }
});

// Mot de passe oublié
document.getElementById('btnForgotPwd')?.addEventListener('click', async () => {
    const email = document.getElementById('emailLogin').value.trim();
    if (!email) {
        showToast("Saisis ton email pour recevoir le lien de réinitialisation.", "warning");
        document.getElementById('emailLogin').focus();
        return;
    }

    try {
        await auth.sendPasswordResetEmail(email);
        showToast("Email de réinitialisation envoyé ! Pense à vérifier tes spams.", "success");
    } catch (err) {
        console.error(err);
        showToast(authErrorMessage(err.code), "error");
    }
});

// ----------------------------------------------------------------
// INSCRIPTION EMAIL
// ----------------------------------------------------------------
document.getElementById('signupFormEl')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSignup');
    const errorEl = document.getElementById('signupError');
    const msgEl = document.getElementById('signupErrorMsg');

    const firstName = document.getElementById('firstNameSignup').value.trim();
    const lastName = document.getElementById('lastNameSignup').value.trim();
    const birthdate = document.getElementById('birthdateSignup').value;

    if (!firstName || !lastName || !birthdate) {
        msgEl.textContent = "Le prénom, le nom et la date de naissance sont obligatoires.";
        errorEl.classList.remove('hidden');
        return;
    }

    errorEl.classList.add('hidden');
    btnLoading(btn, true);

    window.isSigningUp = true; // Empêcher onAuthStateChanged de couper le processus

    try {
        // 1. Pré-vérification si Firestore autorise la lecture
        try {
            const preDoc = await db.collection('globalSettings').doc('dashboard').get();
            if (preDoc.exists && (preDoc.data().allowSignup === false || preDoc.data().allowSignup === 'false')) {
                window.isSigningUp = false;
                btnLoading(btn, false);
                msgEl.textContent = "La création de compte est actuellement fermée par le directeur.";
                errorEl.classList.remove('hidden');
                return;
            }
        } catch (settingsErr) {
            console.warn("Pré-vérification signup:", settingsErr);
        }

        // 2. Création du compte Firebase Auth
        const cred = await auth.createUserWithEmailAndPassword(
            document.getElementById('emailSignup').value.trim(),
            document.getElementById('passwordSignup').value
        );

        // 3. VÉRIFICATION STRICTE POST-AUTH : Maintenant que l'utilisateur est authentifié, il peut lire globalSettings
        let allowSignup = true;
        try {
            const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
            if (globalDoc.exists && (globalDoc.data().allowSignup === false || globalDoc.data().allowSignup === 'false')) {
                allowSignup = false;
            }
        } catch (postCheckErr) {
            console.warn("Erreur vérification allowSignup post-auth:", postCheckErr);
        }

        if (!allowSignup) {
            // Inscription fermée : supprimer immédiatement l'utilisateur dans Firebase Auth et déconnecter
            try {
                await cred.user.delete();
            } catch (delErr) {
                console.warn("Impossible de supprimer le compte auth:", delErr);
            }
            await auth.signOut();
            window.isSigningUp = false;
            btnLoading(btn, false);
            msgEl.textContent = "La création de compte est actuellement fermée par le directeur.";
            errorEl.classList.remove('hidden');
            return;
        }
        
        // 4. Inscription autorisée : récupérer le rôle par défaut et créer le document utilisateur dans Firestore
        let assignedRole = 'anim';
        try {
            const gDoc = await db.collection('globalSettings').doc('dashboard').get();
            if (gDoc.exists && gDoc.data().signupDefaultRole) {
                assignedRole = gDoc.data().signupDefaultRole;
            }
        } catch (e) {}

        const newUserDoc = {
            email: cred.user.email,
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            birthdate: birthdate,
            role: assignedRole,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Si compte stagiaire, enregistrer uniquement le promoId de la promotion actuelle
        if (assignedRole === 'stagiaire') {
            try {
                const formSetDoc = await db.collection('globalSettings').doc('formation').get();
                if (formSetDoc.exists && formSetDoc.data().activePromoId) {
                    newUserDoc.promoId = formSetDoc.data().activePromoId;
                }
            } catch (errP) {
                console.warn("Erreur attachement promoId au stagiaire:", errP);
            }
        }

        await db.collection('users').doc(cred.user.uid).set(newUserDoc);

        // Si tout est ok, on recharge la page pour charger le dashboard proprement
        window.location.reload();
    } catch (err) {
        window.isSigningUp = false;
        btnLoading(btn, false);
        if (err.code === 'permission-denied') {
            msgEl.textContent = "La création de compte est actuellement fermée par le directeur.";
        } else {
            msgEl.textContent = authErrorMessage(err.code);
        }
        errorEl.classList.remove('hidden');
    }
});

// Google login
document.getElementById('btnGoogleLogin')?.addEventListener('click', signInWithGoogle);
document.getElementById('btnGoogleSignup')?.addEventListener('click', signInWithGoogle);

// ----------------------------------------------------------------
// ÉTAT AUTHENTIFICATION
// ----------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
    if (window.isSigningUp) return; // Ignorer pendant la création de compte manuelle ou Google

    if (pageLoader) pageLoader.classList.add('hidden');

    if (!user) {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        return;
    }

    // Récupérer les données utilisateur (rôle) avec fallback hors ligne
    let userData = null;
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await auth.signOut();
            return;
        }
        userData = userDoc.data();
        if (typeof setCachedUserData === 'function') {
            setCachedUserData(user.uid, userData);
        }
    } catch (err) {
        if (err && (err.code === 'permission-denied' || String(err).includes('permission') || String(err.message).includes('permission'))) {
            console.warn("Profil bloqué par Firestore (bannissement)");
            loginView?.classList.add('hidden');
            dashboardView?.classList.add('hidden');
            document.getElementById('dashOfflineBanner')?.classList.add('hidden');
            if (typeof showBannedScreen === 'function') showBannedScreen();
            return;
        }
        console.warn("Offline auth fallback for userDoc:", err);
        if (typeof getCachedUserData === 'function') {
            userData = getCachedUserData(user.uid);
        }
        if (!userData) {
            userData = {
                displayName: user.displayName || user.email,
                email: user.email,
                role: localStorage.getItem('offline_user_role_' + user.uid) || localStorage.getItem('offline_user_role') || 'anim'
            };
        }
    }

    if (userData.banned === true || userData.isBanned === true) {
        if (typeof showBannedScreen === 'function') {
            showBannedScreen();
        }
        return;
    }

    // Si le compte est un stagiaire, vérifier s'il correspond à la promo en cours avant redirection
    if (userData.role === 'stagiaire') {
        let currentPromoId = window.globalFormationActivePromoId || '';
        if (!currentPromoId) {
            try {
                const formSetDoc = await db.collection('globalSettings').doc('formation').get();
                if (formSetDoc.exists && formSetDoc.data().activePromoId) {
                    currentPromoId = formSetDoc.data().activePromoId;
                    window.globalFormationActivePromoId = currentPromoId;
                }
            } catch (e) {}
        }
        if (typeof isStagiairePromoMismatch === 'function' && isStagiairePromoMismatch(userData, currentPromoId)) {
            if (typeof showFormationExpiredScreen === 'function') {
                showFormationExpiredScreen();
            }
            return;
        }
        window.location.replace('formation.html');
        return;
    }
    
    // Initialiser les données de l'utilisateur
    currentUser = user;
    actualRole = userData.role || 'anim';
    actualUserData = userData;

    // Masquer login, afficher dashboard
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');

    // Déterminer le rôle simulé/actif
    const roleToggle = document.getElementById('checkRoleToggle');
    const activeRole = (actualRole === 'admin' && roleToggle && roleToggle.checked) ? 'anim' : actualRole;

    // Éléments Admin Only (Panneau de contrôle d'administration)
    if (actualRole === 'admin') {
        document.getElementById('adminControlsPanel')?.classList.remove('hidden');
    } else {
        document.getElementById('adminControlsPanel')?.classList.add('hidden');
    }

    // Mettre à jour la date de dernière connexion si en ligne
    if (navigator.onLine) {
        try {
            await db.collection('users').doc(user.uid).update({
                lastLogin: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (err) {
            console.warn("Erreur mise à jour lastLogin profil :", err);
        }
    }

    // Gérer les désabonnements pour éviter les doublons
    if (window.dashStatsUnsub) window.dashStatsUnsub();
    if (window.dashMsgUnsub) window.dashMsgUnsub();

    // Écouter le réglage global d'affichage des stats
    window.dashStatsUnsub = db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
        if (doc.exists) {
            showStats = doc.data().showColoStats !== false;
            showOrg = doc.data().showColoOrg !== false;
            showTags = doc.data().showColoTags !== false;
        } else {
            showStats = true; // Par défaut
            showOrg = true; // Par défaut
            showTags = true; // Par défaut
        }

        // Mettre à jour l'état du toggle (si présent)
        const toggle = document.getElementById('checkShowStats');
        if (toggle) toggle.checked = showStats;

        const toggleOrg = document.getElementById('checkShowOrg');
        if (toggleOrg) toggleOrg.checked = showOrg;

        const toggleTags = document.getElementById('checkShowTags');
        if (toggleTags) toggleTags.checked = showTags;

        // Appliquer aux cartes existantes sans recharger tout
        document.querySelectorAll('.es-colo-card__stats, .es-stats-target').forEach(el => {
            el.classList.toggle('es-stats--hidden', !showStats);
        });
        document.querySelectorAll('.es-colo-card__lock, .es-org-target').forEach(el => {
            el.classList.toggle('es-org--hidden', !showOrg);
        });
        document.querySelectorAll('.es-colo-card__badge-tag').forEach(el => {
            el.classList.toggle('es-tags--hidden', !showTags);
        });
    });

    // Écouter le message global du directeur
    window.dashMsgUnsub = db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
        currentDirectorMessage = doc.exists ? (doc.data().directorMessage || '') : '';
        const currentActiveRole = (actualRole === 'admin' && document.getElementById('checkRoleToggle')?.checked) ? 'anim' : actualRole;
        updateDirectorMsgView(currentActiveRole);
    });

    applyRoleSimulation(activeRole);
});

// Listener enregistrement message directeur
document.getElementById('btnSaveDirectorMsg')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveDirectorMsg');
    const msg = document.getElementById('inputDirectorMsg').value.trim();

    btnLoading(btn, true);
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            directorMessage: msg,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Message direction mis à jour.", "success");
    } catch (err) {
        console.error("Save director msg:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

// Listener toggle stats (Admins seulement car visible que pour eux)
document.getElementById('checkShowStats')?.addEventListener('change', async (e) => {
    const val = e.target.checked;
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            showColoStats: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(`Visibilité des stats mise à jour.`, 'success');
    } catch (err) {
        console.error("Erreur sauvegarde global stats:", err);
        showToast("Erreur lors de la modification globale.", "error");
    }
});

// Listener toggle organisme (Admins seulement car visible que pour eux)
document.getElementById('checkShowOrg')?.addEventListener('change', async (e) => {
    const val = e.target.checked;
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            showColoOrg: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(`Visibilité des organismes mise à jour.`, 'success');
    } catch (err) {
        console.error("Erreur sauvegarde global org:", err);
        showToast("Erreur lors de la modification globale.", "error");
    }
});

// Listener toggle tags (Admins seulement car visible que pour eux)
document.getElementById('checkShowTags')?.addEventListener('change', async (e) => {
    const val = e.target.checked;
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            showColoTags: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(`Visibilité des tags mise à jour.`, 'success');
    } catch (err) {
        console.error("Erreur sauvegarde global tags:", err);
        showToast("Erreur lors de la modification globale.", "error");
    }
});

// ----------------------------------------------------------------
// SIMULATION VISUELLE DU RÔLE ANIMATEUR (Pour l'Admin)
// ----------------------------------------------------------------
let currentDirectorMessage = '';

function updateDirectorMsgView(activeRole) {
    const wrap = document.getElementById('dashDirectorMsgWrap');
    const viewAdmin = document.getElementById('dashDirectorMsgAdmin');
    const viewAnim = document.getElementById('dashDirectorMsgAnim');
    const textArea = document.getElementById('inputDirectorMsg');
    const textDisplay = document.getElementById('dashDirectorMsgText');
    const msg = currentDirectorMessage;

    if (msg) {
        wrap.classList.remove('hidden');
        if (activeRole === 'admin') {
            viewAdmin.classList.remove('hidden');
            viewAnim.classList.add('hidden');
            if (document.activeElement !== textArea) textArea.value = msg;
        } else {
            viewAnim.classList.remove('hidden');
            viewAdmin.classList.add('hidden');
            textDisplay.textContent = msg;
        }
    } else {
        if (activeRole === 'admin') {
            wrap.classList.remove('hidden');
            viewAdmin.classList.remove('hidden');
            viewAnim.classList.add('hidden');
            if (document.activeElement !== textArea) textArea.value = '';
        } else {
            wrap.classList.add('hidden');
        }
    }
}

function applyRoleSimulation(activeRole) {
    if (!currentUser) return;

    // 1. Mettre à jour la Topbar
    updateTopbarUser(currentUser, activeRole, actualUserData);

    // 2. Initialiser le Switcher d'espaces / Dropdown Brand
    initSpaceSwitcher();

    // 3. Afficher/Masquer les options et actions Admin
    const adminOnlyElements = document.querySelectorAll('#adminControlsPanel .admin-only-toggle');
    const adminPanel = document.getElementById('adminControlsPanel');
    const brandChevron = document.getElementById('brandChevron');
    const brandCurrentSpace = document.getElementById('brandCurrentSpace');
    const btnBrandDropdown = document.getElementById('btnBrandDropdown');

    if (actualRole === 'admin') {
        btnBrandDropdown?.classList.add('es-topbar__brand--interactive');
        brandChevron?.classList.remove('hidden');
        brandCurrentSpace?.classList.remove('hidden');

        if (activeRole === 'admin') {
            adminOnlyElements.forEach(el => el.classList.remove('hidden'));
            adminPanel?.classList.remove('es-admin-panel--simulated');
            updateViewModeUI(currentViewMode);
        } else {
            adminOnlyElements.forEach(el => el.classList.add('hidden'));
            adminPanel?.classList.add('es-admin-panel--simulated');
        }
    } else {
        btnBrandDropdown?.classList.remove('es-topbar__brand--interactive');
        brandChevron?.classList.add('hidden');
        brandCurrentSpace?.classList.add('hidden');
        document.getElementById('brandDropdownMenu')?.classList.add('hidden');
        btnBrandDropdown?.classList.remove('open');

        adminOnlyElements.forEach(el => el.classList.add('hidden'));
        adminPanel?.classList.add('hidden');
    }

    // 4. Mettre à jour le message du directeur
    updateDirectorMsgView(activeRole);

    // 5. Charger les colos
    loadColos(currentUser, activeRole);
}

// Écouteur pour la case à cocher de simulation du rôle
document.getElementById('checkRoleToggle')?.addEventListener('change', (e) => {
    const simulateAnim = e.target.checked;
    const targetRole = simulateAnim ? 'anim' : 'admin';
    applyRoleSimulation(targetRole);
});

// ----------------------------------------------------------------
// CHARGEMENT DES COLOS
// ----------------------------------------------------------------
let currentColoId = null;
let currentColoData = null;
let currentUser = null;
let currentRole = null;
let actualRole = null;
let actualUserData = null;
let showStats = true;
let showOrg = true;
let showTags = true;
let activeTypeFilter = 'all';
let activeYearFilter = 'all';
let globalRecapBafaUrl = '';
let currentViewMode = localStorage.getItem('dashboard_colos_view') || 'grid';

function updateViewModeUI(mode) {
    const check = document.getElementById('checkViewMode');
    if (check) check.checked = (mode === 'list');
    const label = document.getElementById('labelViewMode');
    const icon = document.getElementById('iconViewMode');
    if (label) label.textContent = mode === 'list' ? 'Vue Liste' : 'Vue Cartes';
    if (icon) icon.className = mode === 'list' ? 'bi bi-view-stacked' : 'bi bi-grid-fill';
}

document.getElementById('checkViewMode')?.addEventListener('change', (e) => {
    currentViewMode = e.target.checked ? 'list' : 'grid';
    localStorage.setItem('dashboard_colos_view', currentViewMode);
    updateViewModeUI(currentViewMode);
    if (currentUser && currentRole) {
        loadColos(currentUser, currentRole);
    }
});

async function loadColos(user, role) {
    if (user) currentUser = user;
    if (role) currentRole = role;
    const effectiveRole = role || currentRole || actualRole || 'anim';
    currentRole = effectiveRole;
    activeTypeFilter = 'all';
    activeYearFilter = 'all';

    // Toujours synchroniser le mode d'affichage depuis localStorage
    currentViewMode = localStorage.getItem('dashboard_colos_view') || 'grid';
    updateViewModeUI(currentViewMode);

    const loader = document.getElementById('colosLoader');
    const grid = document.getElementById('colosGrid');
    const empty = document.getElementById('colosEmpty');
    const subtitle = document.getElementById('dashSubtitle');

    loader.classList.remove('hidden');
    grid.classList.add('hidden');
    empty.classList.add('hidden');

    // Cacher la bannière hors ligne par défaut
    const existingOfflineBanner = document.getElementById('dashOfflineBanner');
    if (existingOfflineBanner) existingOfflineBanner.classList.add('hidden');

    let colosList = [];
    let animCounts = {};
    let accessMap = {};
    let isOfflineMode = !navigator.onLine;

    try {
        // Récupérer toutes les colos triées par date de début (la plus récente en haut)
        const snapshot = await db.collection('espaces').orderBy('dateDebut', 'desc').get();
        colosList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Récupérer la configuration globale Récap BAFA
        try {
            const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
            globalRecapBafaUrl = globalDoc.exists ? (globalDoc.data().recapBafaUrl || '') : '';
            if (globalDoc.exists) {
                localStorage.setItem('offline_global_settings', JSON.stringify(globalDoc.data()));
            }
        } catch (e) {}

        // Récupérer tous les accès approuvés pour compter les anims par colo
        try {
            const allApprovedSnap = await db.collection('accessRequests').where('status', '==', 'approved').get();
            allApprovedSnap.forEach(d => {
                const eid = d.data().espaceId;
                animCounts[eid] = (animCounts[eid] || 0) + 1;
            });
        } catch (e) {}

        // Si animateur, récupérer ses propres demandes d'accès
        if (role === 'anim') {
            try {
                const accessSnap = await db.collection('accessRequests')
                    .where('userId', '==', user.uid).get();
                accessSnap.forEach(d => {
                    accessMap[d.data().espaceId] = d.data().status;
                });
            } catch (e) {}
        }

        // Sauvegarder dans le cache local (en nettoyant les images base64 lourdes pour éviter QuotaExceededError)
        try {
            const sanitizedColos = colosList.map(c => ({
                id: c.id,
                nom: c.nom || '',
                emoji: c.emoji || '🏕️',
                organisme: c.organisme || '',
                dateDebut: c.dateDebut || '',
                dateFin: c.dateFin || '',
                isFormation: !!c.isFormation,
                archived: !!c.archived,
                visible: c.visible !== false,
                nbParticipants: c.nbParticipants || 0,
                bgImage: (c.bgImage && !c.bgImage.startsWith('data:')) ? c.bgImage : ''
            }));
            localStorage.setItem('offline_espaces_list', JSON.stringify(sanitizedColos));
            localStorage.setItem('offline_anim_counts', JSON.stringify(animCounts));
            localStorage.setItem('offline_access_map_' + user.uid, JSON.stringify(accessMap));
            localStorage.setItem('offline_dashboard_sync', Date.now().toString());
        } catch (storageErr) {
            console.warn("Erreur sauvegarde cache colos:", storageErr);
        }

    } catch (err) {
        if (err && (err.code === 'permission-denied' || String(err).includes('permission') || String(err.message).includes('permission'))) {
            console.warn('Accès refusé par Firestore sur les colos -> Affichage écran ban');
            loader.classList.add('hidden');
            grid.classList.add('hidden');
            document.getElementById('dashOfflineBanner')?.classList.add('hidden');
            if (typeof showBannedScreen === 'function') {
                showBannedScreen();
            } else if (typeof showGlobalAccessDenied === 'function') {
                showGlobalAccessDenied('accessDenied');
            }
            return;
        }
        console.warn('Mode hors ligne ou échec réseau sur le dashboard:', err);
        isOfflineMode = true;

        // Fallback local storage
        try {
            const cachedList = localStorage.getItem('offline_espaces_list');
            if (cachedList) {
                colosList = JSON.parse(cachedList);
            }
            const cachedAnimCounts = localStorage.getItem('offline_anim_counts');
            if (cachedAnimCounts) {
                animCounts = JSON.parse(cachedAnimCounts);
            }
            const cachedAccess = localStorage.getItem('offline_access_map_' + user.uid);
            if (cachedAccess) {
                accessMap = JSON.parse(cachedAccess);
            }
            const cachedGlobal = localStorage.getItem('offline_global_settings');
            if (cachedGlobal) {
                const gData = JSON.parse(cachedGlobal);
                globalRecapBafaUrl = gData.recapBafaUrl || '';
            }
        } catch (parseErr) {
            console.error("Erreur lecture cache local:", parseErr);
        }
    }

    loader.classList.add('hidden');

    // Afficher la bannière hors ligne si en mode hors ligne
    if (isOfflineMode) {
        let banner = document.getElementById('dashOfflineBanner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'dashOfflineBanner';
            banner.className = 'es-offline-banner';
            grid.parentElement.insertBefore(banner, grid);
        }
        const syncTime = localStorage.getItem('offline_dashboard_sync');
        const syncDateStr = syncTime ? new Date(parseInt(syncTime, 10)).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
        banner.innerHTML = `
            <i class="bi bi-wifi-off"></i>
            <div>
                <strong>Mode hors ligne</strong>
                <span class="es-offline-time">Affichage des séjours enregistrés en cache ${syncDateStr ? `(dernière synchronisation : ${syncDateStr})` : ''}.</span>
            </div>
        `;
        banner.classList.remove('hidden');
    }

    // Calcul et affichage de la bannière de statistiques globales admin
    let totalEspaces = colosList.length;
    let nbFormations = 0;
    let nbColos = 0;

    colosList.forEach(colo => {
        if (colo.isFormation === true) {
            nbFormations++;
        } else {
            nbColos++;
        }
    });

    const adminBanner = document.getElementById('adminGlobalStatsBanner');
    if (role === 'admin' && adminBanner) {
        adminBanner.innerHTML = `
            <div class="es-admin-stats-banner">
                <div class="es-admin-stat-card active" id="statCardTotal" onclick="filterColos('all')" title="Afficher tous les espaces">
                    <div class="es-admin-stat-card__icon es-admin-stat-card__icon--total">
                        <i class="bi bi-grid-fill"></i>
                    </div>
                    <div class="es-admin-stat-card__content">
                        <div class="es-admin-stat-card__value">${totalEspaces}</div>
                        <div class="es-admin-stat-card__label">Total Espaces</div>
                    </div>
                </div>
                <div class="es-admin-stat-card" id="statCardFormation" onclick="filterColos('formation')" title="Filtrer les formations">
                    <div class="es-admin-stat-card__icon es-admin-stat-card__icon--formation">
                        <i class="bi bi-mortarboard-fill"></i>
                    </div>
                    <div class="es-admin-stat-card__content">
                        <div class="es-admin-stat-card__value">${nbFormations}</div>
                        <div class="es-admin-stat-card__label">Formations</div>
                    </div>
                </div>
                <div class="es-admin-stat-card" id="statCardColo" onclick="filterColos('colo')" title="Filtrer les colonies">
                    <div class="es-admin-stat-card__icon es-admin-stat-card__icon--colo">
                        <i class="bi bi-tree-fill"></i>
                    </div>
                    <div class="es-admin-stat-card__content">
                        <div class="es-admin-stat-card__value">${nbColos}</div>
                        <div class="es-admin-stat-card__label">Colonies</div>
                    </div>
                </div>
            </div>
        `;
        adminBanner.classList.remove('hidden');
    } else if (adminBanner) {
        adminBanner.classList.add('hidden');
        adminBanner.innerHTML = '';
    }

    // Calcul et affichage de la barre de filtrage par année
    const yearsSet = new Set();
    colosList.forEach(colo => {
        const visible = colo.visible !== false;
        if (role === 'anim' && !visible) return;

        if (colo.dateDebut) {
            const year = colo.dateDebut.split('-')[0];
            if (year && year.length === 4) {
                yearsSet.add(year);
            }
        }
    });
    const uniqueYears = Array.from(yearsSet).sort((a, b) => b - a);

    const yearBanner = document.getElementById('yearFilterBar');
    if (yearBanner && uniqueYears.length > 0) {
        let pillsHtml = `
            <div class="es-year-filter-bar">
                <div class="es-year-filter-label">
                    <i class="bi bi-calendar3"></i> Années :
                </div>
                <div class="es-year-filter-pill active" data-year="all" onclick="filterColosYear('all')">
                    Toutes
                </div>
        `;
        uniqueYears.forEach(yr => {
            pillsHtml += `
                <div class="es-year-filter-pill" data-year="${yr}" onclick="filterColosYear('${yr}')">
                    ${yr}
                </div>
            `;
        });
        pillsHtml += `</div>`;
        yearBanner.innerHTML = pillsHtml;
        yearBanner.classList.remove('hidden');
    } else if (yearBanner) {
        yearBanner.classList.add('hidden');
        yearBanner.innerHTML = '';
    }

    if (colosList.length === 0) {
        empty.classList.remove('hidden');
        if (isOfflineMode) {
            empty.innerHTML = `
                <div class="es-empty__icon" style="color:var(--clr-primary); opacity:1;">
                    <i class="bi bi-wifi-off"></i>
                </div>
                <div class="es-empty__title" style="color:var(--clr-text); font-size:1.2rem; font-weight:700;">Aucun séjour disponible hors ligne</div>
                <p class="es-empty__text" style="color:var(--clr-text); opacity:0.85; font-size:0.95rem; margin-top:8px; line-height:1.5;">Connectez-vous une première fois à Internet pour synchroniser vos séjours.</p>
            `;
        }
        return;
    }

    grid.innerHTML = '';
    const isListView = (effectiveRole === 'admin' && currentViewMode === 'list');
    if (isListView) {
        grid.className = 'es-colos-list';
    } else {
        grid.className = 'es-colos-grid';
    }

    for (const colo of colosList) {
        const visible = colo.visible !== false;

        // SI ANIMATEUR : On cache totalement si non visible
        if (effectiveRole === 'anim' && !visible) continue;

        let accessStatus = effectiveRole === 'admin' ? 'admin' : (accessMap[colo.id] || 'none');
        const nbAnims = animCounts[colo.id] || 0;
        let nbParticipants = colo.nbParticipants || 0;

        if (isListView) {
            grid.appendChild(buildColoAdminHorizontalCard(colo, accessStatus, nbParticipants, nbAnims, effectiveRole));
        } else {
            grid.appendChild(buildColoCard(colo, accessStatus, nbParticipants, nbAnims, effectiveRole));
        }
    }

    grid.classList.remove('hidden');

    if (effectiveRole === 'anim') {
        subtitle.textContent = 'Clique sur une colonie pour demander ou accéder à son espace.';
    } else {
        subtitle.textContent = 'Gérez vos espaces ci-dessous ou ouvrez le panneau admin.';
    }
}

// Rafraîchir automatiquement le dashboard lorsque la connexion revient
window.addEventListener('online', () => {
    if (currentUser && currentRole) {
        loadColos(currentUser, currentRole);
    }
});

// Rafraîchir lors du retour arrière navigateur (BFCache)
window.addEventListener('pageshow', () => {
    currentViewMode = localStorage.getItem('dashboard_colos_view') || 'grid';
    updateViewModeUI(currentViewMode);
    if (currentUser) {
        loadColos(currentUser, currentRole || actualRole);
    }
});

// ----------------------------------------------------------------
// CONSTRUCTION D'UNE CARTE COLO
// ----------------------------------------------------------------
function buildColoCard(colo, accessStatus, nbParticipants, nbAnims, role) {
    const card = document.createElement('div');
    card.className = 'es-colo-card';
    card.dataset.type = colo.isFormation ? 'formation' : 'colo';
    card.dataset.year = colo.dateDebut ? colo.dateDebut.split('-')[0] : 'none';
    if (accessStatus === 'pending') card.classList.add('es-colo-card--pending');
    if (accessStatus === 'approved' || accessStatus === 'admin') card.classList.add('es-colo-card--approved');
    if (accessStatus === 'none' || accessStatus === 'refused') card.classList.add('es-colo-card--locked');

    if (colo.bgImage) {
        card.style.backgroundImage = `linear-gradient(to bottom, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.65) 100%), url('${colo.bgImage}')`;
        card.style.backgroundSize = 'cover';
        card.style.backgroundPosition = 'center';
    }

    const emoji = colo.emoji || '🏕️';
    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : colo.dateDebut ? `Début : ${formatDate(colo.dateDebut)}` : 'Dates à définir';

    const statusBadge = {
        'admin': '<span class="es-badge es-badge--approved"><i class="bi bi-check-circle"></i> Accès admin</span>',
        'approved': '<span class="es-badge es-badge--approved"><i class="bi bi-check-circle"></i> Accès accordé</span>',
        'pending': '<span class="es-badge es-badge--pending"><i class="bi bi-hourglass-split"></i> En attente</span>',
        'refused': '<span class="es-badge es-badge--refused"><i class="bi bi-x-circle"></i> Refusé</span>',
        'none': '<span class="es-badge" style="background:rgba(255,255,255,0.15);color:#ffffff;"><i class="bi bi-lock"></i> Non autorisé</span>',
    };

    const organismMarkup = `<i class="bi bi-building" style="color:var(--clr-primary)"></i> ${colo.organisme || 'Organisme non défini'}`;

    const visible = colo.visible !== false;
    const now = new Date();
    now.setHours(0,0,0,0);
    const startDate = colo.dateDebut ? new Date(colo.dateDebut) : null;
    if (startDate) {
        startDate.setHours(0,0,0,0);
    }
    const isUpcoming = startDate && startDate > now;

    let jXBadge = '';
    if (isUpcoming && startDate) {
        const diffTime = startDate - now;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 0) {
            jXBadge = `
                <div class="es-colo-card__stat es-colo-card__j-countdown" 
                     style="display: flex; align-items: center; gap: 4px; font-size: 0.7rem; font-weight: 800; color: #ffffff; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.15); padding: 4px 8px; border-radius: 6px; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); margin-left: auto;" 
                     title="Le séjour commence dans ${diffDays} jours">
                    <i class="bi bi-hourglass-split" style="color: #f39c12; font-size: 0.75rem;"></i>
                    J-${diffDays}
                </div>
            `;
        }
    }

    let nbJoursStr = '';
    if (colo.dateDebut && colo.dateFin) {
        const start = new Date(colo.dateDebut);
        const end = new Date(colo.dateFin);
        start.setHours(12, 0, 0, 0);
        end.setHours(12, 0, 0, 0);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
        nbJoursStr = `<div class="es-colo-card__stat" title="Durée du séjour"><i class="bi bi-calendar3"></i> ${diffDays} jour${diffDays !== 1 ? 's' : ''}</div>`;
    } else {
        nbJoursStr = `<div class="es-colo-card__stat" title="Durée du séjour"><i class="bi bi-calendar3"></i> -- jours</div>`;
    }

    let recapBadge = '';
    if (globalRecapBafaUrl) {
        let finalUrl = globalRecapBafaUrl;
        if (colo.dateDebut && colo.dateFin) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}startDate=${colo.dateDebut}&endDate=${colo.dateFin}`;
        }
        recapBadge = `
            <a href="${finalUrl}" target="_blank" onclick="event.stopPropagation();" class="es-card-action-btn es-card-action-btn--sm" style="background: rgba(155, 89, 182, 0.2); border: 1px solid rgba(155, 89, 182, 0.45); text-decoration: none; display: inline-flex;" onmouseover="this.style.background='rgba(155, 89, 182, 0.35)'" onmouseout="this.style.background='rgba(155, 89, 182, 0.2)'" title="Ouvrir la fiche Récap BAFA">
                <i class="bi bi-journal-check" style="color: #c39bd3 !important;"></i>
            </a>
        `;
    } else if (role === 'admin') {
        recapBadge = `
            <button class="es-card-action-btn es-card-action-btn--sm" onclick="event.stopPropagation(); showToast('Aucune URL Récap BAFA configurée dans les paramètres admin.', 'warning');" title="Fiche Récap BAFA (non configurée)" style="background: rgba(155, 89, 182, 0.12); border: 1px solid rgba(155, 89, 182, 0.25); opacity: 0.5;">
                <i class="bi bi-journal-check" style="color: #c39bd3 !important;"></i>
            </button>
        `;
    }

    const isOfflineReady = !!localStorage.getItem('offline_participants_' + colo.id);

    card.innerHTML = `
        <div class="es-colo-card__header">
            <div>
                <div class="es-colo-card__name">
                    ${colo.nom || 'Sans nom'}
                    ${isOfflineReady ? `
                        <span title="Liste des participants enregistrée pour consultation hors ligne" style="color:var(--clr-primary); margin-left:4px; font-size:0.85rem; vertical-align:middle; display:inline-flex; align-items:center;" class="offline-ready-icon">
                            <i class="bi bi-cloud-check-fill"></i>
                        </span>
                    ` : ''}
                    ${isUpcoming ? `
                        <span class="es-colo-card__badge-tag ${!showTags ? 'es-tags--hidden' : ''}" style="background:rgba(52,152,219,0.25);color:#ffffff;border:1px solid rgba(52,152,219,0.4);padding:1px 6px;border-radius:4px;font-size:0.6rem;text-transform:uppercase;margin-left:5px;font-weight:800;vertical-align:middle;text-shadow:none;white-space:nowrap;">
                            À venir
                        </span>
                    ` : ''}
                    ${!visible ? `
                        <span style="background:rgba(255,165,0,0.25);color:#ffffff;border:1px solid rgba(255,165,0,0.4);padding:1px 6px;border-radius:4px;font-size:0.6rem;text-transform:uppercase;margin-left:5px;font-weight:800;vertical-align:middle;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-eye-slash-fill"></i> Caché
                        </span>
                    ` : ''}
                    ${colo.archived && (role === 'admin' || accessStatus === 'approved' || accessStatus === 'admin') ? `
                        <span class="es-colo-card__badge-tag ${!showTags ? 'es-tags--hidden' : ''}" style="background:rgba(243,156,18,0.25);color:#ffffff;border:1px solid rgba(243,156,18,0.4);padding:1px 6px;border-radius:4px;font-size:0.6rem;text-transform:uppercase;margin-left:5px;font-weight:800;vertical-align:middle;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-archive-fill"></i> Archivé
                        </span>
                    ` : ''}
                </div>
                <div class="es-colo-card__dates">${dateStr}</div>
            </div>
            ${role === 'admin' ? `
                <div class="es-colo-card__actions-grid">
                    <!-- Ligne 1 (haut) : Récap BAFA & Modifier -->
                    ${recapBadge}
                    <button class="es-card-action-btn es-card-action-btn--sm" 
                            title="Modifier la colonie"
                            onclick="event.stopPropagation(); openEditColoIndex('${colo.id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <!-- Ligne 2 (bas) : Visibilité & Supprimer -->
                    <button class="es-card-action-btn es-card-action-btn--sm" 
                            title="Changer la visibilité pour les animateurs"
                            onclick="event.stopPropagation(); toggleColoVisibility('${colo.id}', ${visible})">
                        <i class="bi bi-${visible ? 'eye' : 'eye-slash'}"></i>
                    </button>
                    <button class="es-card-action-btn es-card-action-btn--sm es-card-action-btn--danger" 
                            title="Supprimer la colonie"
                            onclick="event.stopPropagation(); confirmDeleteColoIndex('${colo.id}', ${escapeHtml(JSON.stringify(colo.nom || ''))})">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            ` : (recapBadge ? `
                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;z-index:10;">
                    ${recapBadge}
                </div>
            ` : '')}
        </div>
        <div class="es-colo-card__body">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-top: auto; width: 100%;">
                <div class="es-colo-card__stats ${!showStats ? 'es-stats--hidden' : ''}">
                     <div class="es-colo-card__stat" title="Nombre de participants">
                        <i class="bi bi-people"></i> 
                        ${nbParticipants} ${colo.isFormation ? 'stagiaire' : 'jeune'}${nbParticipants !== 1 ? 's' : ''}
                    </div>
                    ${nbJoursStr}
                </div>
                ${jXBadge}
            </div>
        </div>
        <div class="es-colo-card__footer">
            <div class="es-colo-card__lock ${!showOrg ? 'es-org--hidden' : ''}">${organismMarkup}</div>
            <div style="margin-left: auto; display: flex; align-items: center; gap: 8px;">
                ${statusBadge[accessStatus] || ''}
            </div>
        </div>
    `;

    card.addEventListener('click', () => handleColoClick(colo, accessStatus));
    return card;
}

// ----------------------------------------------------------------
// CONSTRUCTION D'UNE CARTE HORIZONTALE (VUE LISTE ADMIN)
// ----------------------------------------------------------------
function buildColoAdminHorizontalCard(colo, accessStatus, nbParticipants, nbAnims, role) {
    const div = document.createElement('div');
    div.className = 'es-colo-admin-card';
    div.dataset.type = colo.isFormation ? 'formation' : 'colo';
    div.dataset.year = colo.dateDebut ? colo.dateDebut.split('-')[0] : 'none';

    if (colo.bgImage) {
        div.style.backgroundImage = `linear-gradient(to bottom, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.7) 100%), url('${colo.bgImage}')`;
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
    }

    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : colo.dateDebut ? `Début : ${formatDate(colo.dateDebut)}` : 'Dates non définies';

    const visible = colo.visible !== false; // true par défaut
    const locked = colo.participantsLocked !== false; // true par défaut

    const now = new Date();
    now.setHours(0,0,0,0);
    const startDate = colo.dateDebut ? new Date(colo.dateDebut) : null;
    if (startDate) startDate.setHours(0,0,0,0);
    const isUpcoming = startDate && startDate > now;

    let recapBtn = '';
    if (globalRecapBafaUrl) {
        let finalUrl = globalRecapBafaUrl;
        if (colo.dateDebut && colo.dateFin) {
            const separator = finalUrl.includes('?') ? '&' : '?';
            finalUrl = `${finalUrl}${separator}startDate=${colo.dateDebut}&endDate=${colo.dateFin}`;
        }
        recapBtn = `
            <a href="${finalUrl}" target="_blank" onclick="event.stopPropagation();" class="es-card-action-btn" style="background: rgba(155, 89, 182, 0.25); border: 1px solid rgba(155, 89, 182, 0.45); text-decoration: none; display: inline-flex;" onmouseover="this.style.background='rgba(155, 89, 182, 0.35)'" onmouseout="this.style.background='rgba(155, 89, 182, 0.25)'" title="Ouvrir la fiche Récap BAFA">
                <i class="bi bi-journal-check" style="color: #c39bd3 !important;"></i>
            </a>
        `;
    }

    const isOfflineReady = !!localStorage.getItem('offline_participants_' + colo.id);

    div.innerHTML = `
        <div class="es-colo-admin-card__header" style="position: relative;">
            <div style="padding-right: 48px; width: 100%;">
                <div class="es-colo-admin-card__title" style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span>${colo.emoji || '🏕️'} ${colo.nom || 'Sans nom'}</span>
                    ${isOfflineReady ? `
                        <span title="Liste des participants enregistrée pour consultation hors ligne" style="color:var(--clr-primary); font-size:0.9rem; display:inline-flex; align-items:center;">
                            <i class="bi bi-cloud-check-fill"></i>
                        </span>
                    ` : ''}
                    ${isUpcoming ? `
                        <span class="es-colo-card__badge-tag ${!showTags ? 'es-tags--hidden' : ''}" style="background:rgba(52,152,219,0.25);color:#ffffff;border:1px solid rgba(52,152,219,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;font-weight:800;vertical-align:middle;text-shadow:none;white-space:nowrap;">
                            À venir
                        </span>
                    ` : ''}
                    ${!visible ? `
                        <span style="background:rgba(255,165,0,0.25);color:#ffffff;border:1px solid rgba(255,165,0,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;font-weight:800;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-eye-slash-fill"></i> Caché
                        </span>
                    ` : ''}
                    ${colo.archived ? `
                        <span class="es-colo-card__badge-tag ${!showTags ? 'es-tags--hidden' : ''}" style="background:rgba(243,156,18,0.25);color:#ffffff;border:1px solid rgba(243,156,18,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;font-weight:800;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-archive-fill"></i> Archivé
                        </span>
                    ` : ''}
                </div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;text-shadow:0 1px 2px rgba(0,0,0,0.5);">
                    <span><i class="bi bi-calendar3"></i> ${dateStr}</span>
                    <span style="
                        padding:2px 9px;border-radius:20px;font-size:0.7rem;font-weight:700;text-shadow:none;
                        ${locked
                            ? 'background:rgba(231,76,60,0.25);color:#ffffff;border:1px solid rgba(231,76,60,0.4);'
                            : 'background:rgba(39,174,96,0.25);color:#ffffff;border:1px solid rgba(39,174,96,0.4);'}
                    ">
                        ${locked ? '🔒 Participants verrouillés' : '🔓 Participants ouverts'}
                    </span>
                </div>
            </div>
            <a href="espace.html?id=${colo.id}" onclick="event.stopPropagation();" class="es-card-action-btn" style="position: absolute; top: 18px; right: 18px; text-decoration: none; z-index: 10;" title="Accéder à l'espace">
                <i class="bi bi-arrow-right" style="font-size: 1.1rem; color: #ffffff !important;"></i>
            </a>
        </div>
        <div class="es-colo-admin-card__body">
            <div class="es-colo-admin-card__info">
                <div class="es-colo-admin-card__organisme es-org-target ${!showOrg ? 'es-org--hidden' : ''}">
                    <i class="bi bi-building" style="color:var(--clr-primary)"></i> ${colo.organisme ? colo.organisme : '<span style="opacity:0.5;font-style:italic;">Organisme non défini.</span>'}
                </div>
                <div class="es-colo-admin-card__meta">
                    <span class="es-stats-target ${!showStats ? 'es-stats--hidden' : ''}"><i class="bi bi-people"></i> ${nbParticipants} ${colo.isFormation ? 'stagiaire' : 'jeune'}${nbParticipants !== 1 ? 's' : ''}</span>
                    ${colo.createdAt ? `<span><i class="bi bi-plus-circle"></i> Créé le ${formatFullDate(colo.createdAt)}</span>` : ''}
                    ${colo.updatedAt ? `<span><i class="bi bi-pencil-square"></i> Modifié le ${formatFullDate(colo.updatedAt)}</span>` : ''}
                </div>
            </div>
            <div class="es-colo-admin-card__actions">
                ${recapBtn}
                <button class="es-card-action-btn"
                        title="Visibilité pour les animateurs"
                        onclick="event.stopPropagation(); toggleColoVisibility('${colo.id}', ${visible})">
                    <i class="bi bi-${visible ? 'eye' : 'eye-slash'}"></i>
                </button>
                <button class="es-card-action-btn ${colo.archived ? 'es-card-action-btn--warning' : ''}"
                        title="${colo.archived ? 'Désarchiver l\'espace' : 'Archiver l\'espace'}"
                        onclick="event.stopPropagation(); toggleColoArchived('${colo.id}', ${colo.archived === true})">
                    <i class="bi bi-${colo.archived ? 'folder-symlink' : 'archive'}"></i>
                </button>
                <div style="width:1px;height:24px;background:rgba(255,255,255,0.15);margin:4px 2px 0 2px;"></div>
                <button class="es-card-action-btn es-card-action-btn--pill ${locked ? 'es-card-action-btn--danger' : 'es-card-action-btn--success'}"
                        title="${locked ? 'Déverrouiller la gestion des participants' : 'Verrouiller la gestion des participants'}"
                        onclick="event.stopPropagation(); toggleParticipantsLock('${colo.id}', ${locked})">
                    <i class="bi bi-${locked ? 'unlock' : 'lock'}"></i>
                    <span class="brand-label" style="color:inherit; font-size: inherit; font-weight: inherit;">${locked ? 'Déverrouiller' : 'Verrouiller'}</span>
                </button>
                <button class="es-card-action-btn"
                        title="Modifier la colonie"
                        onclick="event.stopPropagation(); openEditColoIndex('${colo.id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="es-card-action-btn es-card-action-btn--danger"
                        title="Supprimer la colonie"
                        onclick="event.stopPropagation(); confirmDeleteColoIndex('${colo.id}', ${escapeHtml(JSON.stringify(colo.nom || ''))})">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        </div>
    `;

    div.addEventListener('click', (e) => {
        if (e.target.closest('button') || e.target.closest('a') || e.target.closest('.es-card-action-btn')) return;
        handleColoClick(colo, accessStatus);
    });
    return div;
}

// ----------------------------------------------------------------
// CLIC SUR UNE COLO
// ----------------------------------------------------------------
function handleColoClick(colo, accessStatus) {
    currentColoId = colo.id;
    currentColoData = colo;

    if (accessStatus === 'admin' || accessStatus === 'approved') {
        // Accès direct → rediriger vers espace.html?id=...
        window.location.href = `espace.html?id=${colo.id}`;
        return;
    }

    if (!navigator.onLine) {
        showToast("Vous êtes hors ligne. La demande d'accès nécessite une connexion internet.", "warning");
        return;
    }

    if (accessStatus === 'pending') {
        showToast('Ta demande est déjà en attente de validation.', 'warning');
        return;
    }

    if (accessStatus === 'refused') {
        showToast('Ta demande a été refusée. Contacte le directeur.', 'error');
        return;
    }

    // 'none' → afficher popup de demande d'accès
    showRequestModal(colo);
}

// ----------------------------------------------------------------
// POPUP DE DEMANDE D'ACCÈS
// ----------------------------------------------------------------
function showRequestModal(colo) {
    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `du ${formatDate(colo.dateDebut)} au ${formatDate(colo.dateFin)}`
        : '';

    document.getElementById('requestEmoji').textContent = colo.emoji || '🏕️';
    document.getElementById('requestTitle').textContent = `Demander l'accès`;
    document.getElementById('requestText').innerHTML =
        `Veux-tu demander l'habilitation pour la colo <strong>${colo.nom}</strong> ${dateStr} ?`;

    openModal('overlayRequest');
}

document.getElementById('btnCloseRequest')?.addEventListener('click', () => closeModal('overlayRequest'));
document.getElementById('btnCancelRequest')?.addEventListener('click', () => closeModal('overlayRequest'));

document.getElementById('btnConfirmRequest')?.addEventListener('click', async () => {
    if (!currentColoId || !currentUser) return;

    const btn = document.getElementById('btnConfirmRequest');
    btnLoading(btn, true);

    try {
        // Vérifier qu'il n'y a pas déjà une demande
        const existing = await db.collection('accessRequests')
            .where('userId', '==', currentUser.uid)
            .where('espaceId', '==', currentColoId)
            .get();

        if (!existing.empty) {
            showToast('Tu as déjà une demande pour cette colo.', 'warning');
            closeModal('overlayRequest');
            btnLoading(btn, false);
            return;
        }

        await db.collection('accessRequests').doc(`${currentUser.uid}_${currentColoId}`).set({
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: currentUser.displayName || currentUser.email,
            espaceId: currentColoId,
            espaceName: currentColoData?.nom || '',
            status: 'pending',
            requestedAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        closeModal('overlayRequest');
        showToast('Demande envoyée ! Le directeur va la traiter.', 'success');
        // Recharger les cartes pour mettre à jour le statut
        loadColos(currentUser, currentRole);

    } catch (err) {
        console.error('Erreur demande accès:', err);
        showToast('Erreur lors de l\'envoi. Réessaie.', 'error');
    } finally {
        btnLoading(btn, false);
    }
});

async function toggleColoVisibility(coloId, currentVisible) {
    const newVisible = !currentVisible;
    try {
        await db.collection('espaces').doc(coloId).update({ visible: newVisible });
        showToast(newVisible ? "La colonie est maintenant visible pour les animateurs." : "La colonie est désormais cachée pour les animateurs.", "success");
        loadColos(currentUser, currentRole);
    } catch (err) {
        console.error('toggleColoVisibility dashboard:', err);
        showToast('Erreur lors du changement de visibilité.', 'error');
    }
}

async function toggleParticipantsLock(coloId, currentlyLocked) {
    const newLocked = !currentlyLocked;
    const label = newLocked ? 'verrouillés' : 'ouverts aux animateurs';
    try {
        await db.collection('espaces').doc(coloId).update({ participantsLocked: newLocked });
        showToast(`Participants ${label} pour cette colo.`, 'success');
        loadColos(currentUser, currentRole);
    } catch (err) {
        console.error('toggleParticipantsLock:', err);
        showToast('Erreur lors du changement de verrouillage.', 'error');
    }
}

async function toggleColoArchived(coloId, currentlyArchived) {
    const newArchived = !currentlyArchived;
    try {
        await db.collection('espaces').doc(coloId).update({ archived: newArchived });
        showToast(newArchived ? 'Espace archivé.' : 'Espace restauré (désarchivé).', 'success');
        loadColos(currentUser, currentRole);
    } catch (err) {
        console.error('toggleColoArchived:', err);
        showToast('Erreur lors du changement d\'archivage.', 'error');
    }
}

// ================================================================
// GESTION COLO (Créer / Modifier / Supprimer) - INDEX
// ================================================================

document.getElementById('btnNewColoIndex')?.addEventListener('click', () => ColoFormManager.open('index'));

async function openEditColoIndex(id) {
    try {
        const doc = await db.collection('espaces').doc(id).get();
        if (doc.exists) ColoFormManager.open('index', { id: doc.id, ...doc.data() });
    } catch (err) {
        showToast('Erreur lors du chargement.', 'error');
    }
}

let deleteColoTargetId = null;

function confirmDeleteColoIndex(id, nom) {
    deleteColoTargetId = id;
    const textEl = document.getElementById('confirmDeleteColoText');
    if (textEl) {
        textEl.textContent = `Supprimer la colonie "${nom}" ? Tous ses participants et accès seront perdus (irréversible).`;
    }
    openModal('overlayConfirmDeleteColo');
}

document.getElementById('btnCloseConfirmDeleteColo')?.addEventListener('click', () => closeModal('overlayConfirmDeleteColo'));
document.getElementById('btnCancelDeleteColo')?.addEventListener('click', () => closeModal('overlayConfirmDeleteColo'));

document.getElementById('btnConfirmDeleteColo')?.addEventListener('click', async () => {
    if (!deleteColoTargetId) return;
    const btn = document.getElementById('btnConfirmDeleteColo');
    btnLoading(btn, true);

    try {
        // Supprimer les participants de la sous-collection
        const pSnap = await db.collection('espaces').doc(deleteColoTargetId).collection('participants').get();
        const batch = db.batch();
        pSnap.forEach(d => batch.delete(d.ref));
        await batch.commit();

        // Supprimer les demandes d'accès associées
        const reqSnap = await db.collection('accessRequests')
            .where('espaceId', '==', deleteColoTargetId).get();
        const batch2 = db.batch();
        reqSnap.forEach(d => batch2.delete(d.ref));
        await batch2.commit();

        // Supprimer la colonie
        await db.collection('espaces').doc(deleteColoTargetId).delete();
        showToast('Colonie supprimée.', 'success');
        closeModal('overlayConfirmDeleteColo');
        loadColos(currentUser, currentRole);
    } catch (err) {
        console.error('delete colo dashboard:', err);
        showToast('Erreur lors de la suppression.', 'error');
    } finally {
        btnLoading(btn, false);
        deleteColoTargetId = null;
    }
});

// Initialisation du formulaire partagé au chargement
ColoFormManager.init('index', () => loadColos(currentUser, currentRole));

window.applyEspaceFilters = function() {
    const cards = document.querySelectorAll('#colosGrid > *');
    cards.forEach(card => {
        const matchesType = (activeTypeFilter === 'all' || card.dataset.type === activeTypeFilter);
        const matchesYear = (activeYearFilter === 'all' || card.dataset.year === activeYearFilter);

        if (matchesType && matchesYear) {
            card.classList.remove('es-card--filtered-out');
        } else {
            card.classList.add('es-card--filtered-out');
        }
    });

    const btnTotal = document.getElementById('statCardTotal');
    const btnFormation = document.getElementById('statCardFormation');
    const btnColo = document.getElementById('statCardColo');

    btnTotal?.classList.toggle('active', activeTypeFilter === 'all');
    btnFormation?.classList.toggle('active', activeTypeFilter === 'formation');
    btnColo?.classList.toggle('active', activeTypeFilter === 'colo');

    document.querySelectorAll('.es-year-filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.year === activeYearFilter);
    });
};

window.filterColos = function(type) {
    if (activeTypeFilter === type && type !== 'all') {
        activeTypeFilter = 'all';
    } else {
        activeTypeFilter = type;
    }
    applyEspaceFilters();
};

window.filterColosYear = function(year) {
    if (activeYearFilter === year && year !== 'all') {
        activeYearFilter = 'all';
    } else {
        activeYearFilter = year;
    }
    applyEspaceFilters();
};

// ================================================================
// ESPACE SWITCHER (Colos / Stagiaires Navigation)
// ================================================================
let spaceSwitcherInitialized = false;

function initSpaceSwitcher() {
    if (spaceSwitcherInitialized) return;
    spaceSwitcherInitialized = true;

    const btnBrandDropdown = document.getElementById('btnBrandDropdown');
    const brandDropdownMenu = document.getElementById('brandDropdownMenu');
    const menuItemColos = document.getElementById('menuItemColos');
    const menuItemStagiaires = document.getElementById('menuItemStagiaires');

    // Clic sur le brand pour ouvrir/fermer le menu (réservé admin)
    btnBrandDropdown?.addEventListener('click', (e) => {
        if (actualRole !== 'admin') return;
        e.stopPropagation();
        const isHidden = brandDropdownMenu?.classList.contains('hidden');
        if (isHidden) {
            brandDropdownMenu?.classList.remove('hidden');
            btnBrandDropdown?.classList.add('open');
            btnBrandDropdown?.setAttribute('aria-expanded', 'true');
        } else {
            brandDropdownMenu?.classList.add('hidden');
            btnBrandDropdown?.classList.remove('open');
            btnBrandDropdown?.setAttribute('aria-expanded', 'false');
        }
    });

    // Sélection de l'espace Colos -> Déjà sur place
    menuItemColos?.addEventListener('click', (e) => {
        e.stopPropagation();
        brandDropdownMenu?.classList.add('hidden');
        btnBrandDropdown?.classList.remove('open');
        btnBrandDropdown?.setAttribute('aria-expanded', 'false');
    });

    // Sélection de l'espace Stagiaires -> Redirection vers formation.html
    menuItemStagiaires?.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = 'formation.html';
    });

    // Fermeture du dropdown lors d'un clic extérieur
    document.addEventListener('click', (e) => {
        if (!brandDropdownMenu || brandDropdownMenu.classList.contains('hidden')) return;
        const wrap = document.getElementById('brandDropdownWrap');
        if (wrap && !wrap.contains(e.target)) {
            brandDropdownMenu.classList.add('hidden');
            btnBrandDropdown?.classList.remove('open');
            btnBrandDropdown?.setAttribute('aria-expanded', 'false');
        }
    });
}


