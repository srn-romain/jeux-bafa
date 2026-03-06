/* ================================================================
   ESPACE-INDEX.JS — Dashboard : login + liste des colos
   ================================================================ */

// db, auth et googleProvider sont déclarés dans firebase-config.js

// Éléments
const loginView = document.getElementById('loginView');
const dashboardView = document.getElementById('dashboardView');

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

// ----------------------------------------------------------------
// INSCRIPTION EMAIL
// ----------------------------------------------------------------
document.getElementById('signupFormEl')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnSignup');
    const errorEl = document.getElementById('signupError');
    const msgEl = document.getElementById('signupErrorMsg');
    errorEl.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const cred = await auth.createUserWithEmailAndPassword(
            document.getElementById('emailSignup').value.trim(),
            document.getElementById('passwordSignup').value
        );
        await db.collection('users').doc(cred.user.uid).set({
            email: cred.user.email,
            displayName: '',
            role: 'anim',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        btnLoading(btn, false);
        msgEl.textContent = authErrorMessage(err.code);
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
    if (!user) {
        loginView.classList.remove('hidden');
        dashboardView.classList.add('hidden');
        return;
    }

    // Récupérer les données utilisateur (rôle)
    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) {
        await auth.signOut();
        return;
    }
    const userData = userDoc.data();
    const role = userData.role;

    // Masquer login, afficher dashboard
    loginView.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    updateTopbarUser(user, role, userData);

    // Mettre à jour la date de dernière connexion
    try {
        await db.collection('users').doc(user.uid).update({
            lastLogin: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        console.error("Erreur mise à jour profil :", err);
    }

    // Éléments Admin Only
    if (role === 'admin') {
        document.getElementById('linkAdmin')?.classList.remove('hidden');
        document.getElementById('adminStatsToggle')?.classList.remove('hidden');
    }

    // Écouter le réglage global d'affichage des stats
    db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
        if (doc.exists) {
            showStats = doc.data().showColoStats !== false;
        } else {
            showStats = true; // Par défaut
        }

        // Mettre à jour l'état du toggle (si présent)
        const toggle = document.getElementById('checkShowStats');
        if (toggle) toggle.checked = showStats;

        // Appliquer aux cartes existantes sans recharger tout
        document.querySelectorAll('.es-colo-card__stats').forEach(el => {
            el.classList.toggle('es-stats--hidden', !showStats);
        });
    });

    loadColos(user, role);
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

// ----------------------------------------------------------------
// MENU PROFIL & PARAMETRES
// ----------------------------------------------------------------

// Toggle Dropdown
document.getElementById('btnUserMenu')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('userDropdown')?.classList.toggle('hidden');
});

document.addEventListener('click', () => {
    document.getElementById('userDropdown')?.classList.add('hidden');
});

// Ouvrir paramètres
document.getElementById('btnOpenSettings')?.addEventListener('click', async () => {
    const user = auth.currentUser;
    if (!user) return;

    const doc = await db.collection('users').doc(user.uid).get();
    const data = doc.data();

    document.getElementById('settingsUserEmail').textContent = user.email;
    document.getElementById('settingsUserRole').textContent = data.role === 'admin' ? 'Directeur' : 'Animateur';
    document.getElementById('settingsDisplayName').value = data.displayName || '';

    const img = document.getElementById('settingsAvatarImg');
    const placeholder = document.getElementById('settingsAvatarPlaceholder');
    if (data.photoURL || user.photoURL) {
        img.src = data.photoURL || user.photoURL;
        img.classList.remove('hidden');
        placeholder.classList.add('hidden');
    } else {
        img.classList.add('hidden');
        placeholder.classList.remove('hidden');
    }

    openModal('overlaySettings');
});

document.getElementById('btnCloseSettings')?.addEventListener('click', () => closeModal('overlaySettings'));
document.getElementById('btnCancelSettings')?.addEventListener('click', () => closeModal('overlaySettings'));

// Sauvegarder paramètres
document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveSettings');
    const name = document.getElementById('settingsDisplayName').value.trim();
    const errorEl = document.getElementById('settingsError');
    const msgEl = document.getElementById('settingsErrorMsg');

    if (!name) {
        msgEl.textContent = "Le pseudo ne peut pas être vide.";
        errorEl.classList.remove('hidden');
        return;
    }

    btnLoading(btn, true);
    errorEl.classList.add('hidden');

    try {
        await db.collection('users').doc(auth.currentUser.uid).update({
            displayName: name
        });
        showToast("Profil mis à jour !", "success");
        closeModal('overlaySettings');
        // Rafraîchir l'UI locale
        const role = await getUserRole(auth.currentUser.uid);
        const doc = await db.collection('users').doc(auth.currentUser.uid).get();
        updateTopbarUser(auth.currentUser, role, doc.data());
    } catch (err) {
        msgEl.textContent = "Erreur lors de la sauvegarde.";
        errorEl.classList.remove('hidden');
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
        const uid = auth.currentUser.uid;
        // 1. Supprimer les demandes d'accès
        const reqs = await db.collection('accessRequests').where('userId', '==', uid).get();
        const batch = db.batch();
        reqs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();

        // 2. Supprimer le doc utilisateur
        await db.collection('users').doc(uid).delete();

        // 3. Supprimer le compte auth (nécessite connexion récente)
        await auth.currentUser.delete();

        showToast("Compte supprimé avec succès.", "success");
        window.location.href = "../../index.html";
    } catch (err) {
        console.error(err);
        if (err.code === 'auth/requires-recent-login') {
            showToast("Action sensible : reconnectez-vous avant de supprimer.", "error");
            auth.signOut();
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

    const user = auth.currentUser;
    if (!user) return;

    const btn = document.getElementById('btnEditAvatar');
    btn.disabled = true;
    const icon = btn.querySelector('i');
    if (icon) icon.className = "bi bi-hourglass-split";

    try {
        // Lire le fichier comme Base64
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = async () => {
            let base64 = reader.result;

            // Optionnel : On peut ajouter une petite compression ici via Canvas si besoin
            // Pour l'instant on stocke le base64 brut si < 500kb
            if (base64.length > 550000) { // ~400kb réel après encodage
                showToast("Image trop lourde. Choisis une photo plus petite.", "error");
                btn.disabled = false;
                if (icon) icon.className = "bi bi-camera";
                return;
            }

            // Mettre à jour Firestore
            await db.collection('users').doc(user.uid).update({
                photoURL: base64
            });

            // Mettre à jour l'aperçu dans la modale
            const img = document.getElementById('settingsAvatarImg');
            const placeholder = document.getElementById('settingsAvatarPlaceholder');
            img.src = base64;
            img.classList.remove('hidden');
            placeholder.classList.add('hidden');

            // Mettre à jour la topbar
            const role = await getUserRole(user.uid);
            const doc = await db.collection('users').doc(user.uid).get();
            updateTopbarUser(user, role, doc.data());

            showToast("Photo de profil mise à jour !", "success");

            btn.disabled = false;
            if (icon) icon.className = "bi bi-camera";
        };
        reader.onerror = () => {
            throw new Error("Erreur de lecture du fichier.");
        };

    } catch (err) {
        console.error("Erreur base64:", err);
        showToast("Erreur lors du traitement de l'image.", "error");
        btn.disabled = false;
        if (icon) icon.className = "bi bi-camera";
    }
});

// ----------------------------------------------------------------
// CHARGEMENT DES COLOS
// ----------------------------------------------------------------
let currentColoId = null;
let currentColoData = null;
let currentUser = null;
let currentRole = null;
let showStats = true;

async function loadColos(user, role) {
    currentUser = user;
    currentRole = role;

    const loader = document.getElementById('colosLoader');
    const grid = document.getElementById('colosGrid');
    const empty = document.getElementById('colosEmpty');
    const subtitle = document.getElementById('dashSubtitle');

    loader.classList.remove('hidden');
    grid.classList.add('hidden');
    empty.classList.add('hidden');

    try {
        // Récupérer toutes les colos
        const snapshot = await db.collection('espaces').orderBy('createdAt', 'desc').get();

        // Récupérer tous les accès approuvés pour compter les anims par colo (une seule requête)
        const animCounts = {};
        const allApprovedSnap = await db.collection('accessRequests').where('status', '==', 'approved').get();
        allApprovedSnap.forEach(d => {
            const eid = d.data().espaceId;
            animCounts[eid] = (animCounts[eid] || 0) + 1;
        });

        loader.classList.add('hidden');

        if (snapshot.empty) {
            empty.classList.remove('hidden');
            return;
        }

        // Si animateur, récupérer ses propres demandes d'accès
        let accessMap = {};
        if (role === 'anim') {
            const accessSnap = await db.collection('accessRequests')
                .where('userId', '==', user.uid).get();
            accessSnap.forEach(d => {
                accessMap[d.data().espaceId] = d.data().status;
            });
        }

        grid.innerHTML = '';
        for (const doc of snapshot.docs) {
            const colo = { id: doc.id, ...doc.data() };

            let accessStatus = role === 'admin' ? 'admin' : (accessMap[colo.id] || 'none');
            const nbAnims = animCounts[colo.id] || 0;

            // Compter participants (sous-collection)
            let nbParticipants = 0;
            try {
                const pSnap = await db.collection('espaces').doc(colo.id).collection('participants').get();
                nbParticipants = pSnap.size;
            } catch (_) { }

            grid.appendChild(buildColoCard(colo, accessStatus, nbParticipants, nbAnims, role));
        }

        grid.classList.remove('hidden');

        if (role === 'anim') {
            subtitle.textContent = 'Clique sur une colonie pour demander ou accéder à son espace.';
        } else {
            subtitle.textContent = 'Gérez vos espaces ci-dessous ou ouvrez le panneau admin.';
        }

    } catch (err) {
        loader.classList.add('hidden');
        console.error('Erreur chargement colos:', err);
        showToast('Erreur lors du chargement des espaces.', 'error');
    }
}

// ----------------------------------------------------------------
// CONSTRUCTION D'UNE CARTE COLO
// ----------------------------------------------------------------
function buildColoCard(colo, accessStatus, nbParticipants, nbAnims, role) {
    const card = document.createElement('div');
    card.className = 'es-colo-card';
    if (accessStatus === 'pending') card.classList.add('es-colo-card--pending');
    if (accessStatus === 'approved' || accessStatus === 'admin') card.classList.add('es-colo-card--approved');
    if (accessStatus === 'none' || accessStatus === 'refused') card.classList.add('es-colo-card--locked');

    const emoji = colo.emoji || '🏕️';
    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : colo.dateDebut ? `Début : ${formatDate(colo.dateDebut)}` : 'Dates à définir';

    const statusBadge = {
        'admin': '<span class="es-badge es-badge--admin">Admin</span>',
        'approved': '<span class="es-badge es-badge--approved"><i class="bi bi-check-circle"></i> Accès accordé</span>',
        'pending': '<span class="es-badge es-badge--pending"><i class="bi bi-hourglass-split"></i> En attente</span>',
        'refused': '<span class="es-badge es-badge--refused"><i class="bi bi-x-circle"></i> Refusé</span>',
        'none': '<span class="es-badge" style="background:var(--clr-surface-3);color:var(--clr-text-light)"><i class="bi bi-lock"></i> Non autorisé</span>',
    };

    const lockIcon = (accessStatus === 'approved' || accessStatus === 'admin')
        ? '<i class="bi bi-unlock-fill" style="color:var(--clr-success)"></i> Accès libre'
        : '<i class="bi bi-lock-fill" style="color:var(--clr-text-light)"></i> Accès restreint';

    card.innerHTML = `
        <div class="es-colo-card__header">
            <div class="es-colo-card__emoji">${emoji}</div>
            <div>
                <div class="es-colo-card__name">${colo.nom || 'Sans nom'}</div>
                <div class="es-colo-card__dates">${dateStr}</div>
            </div>
        </div>
        <div class="es-colo-card__body">
            <div class="es-colo-card__desc">${colo.description || 'Aucune description.'}</div>
            <div class="es-colo-card__stats ${!showStats ? 'es-stats--hidden' : ''}">
                <div class="es-colo-card__stat"><i class="bi bi-people"></i> ${nbParticipants} jeune${nbParticipants !== 1 ? 's' : ''}</div>
                <div class="es-colo-card__stat"><i class="bi bi-person-badge"></i> ${nbAnims} anim${nbAnims !== 1 ? 's' : ''}</div>
            </div>
        </div>
        <div class="es-colo-card__footer">
            <div class="es-colo-card__lock">${lockIcon}</div>
            ${statusBadge[accessStatus] || ''}
        </div>
    `;

    card.addEventListener('click', () => handleColoClick(colo, accessStatus));
    return card;
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

        await db.collection('accessRequests').add({
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
