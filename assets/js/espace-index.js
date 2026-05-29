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
        // La création est désactivée si allowSignup === false
        if (doc.exists && doc.data().allowSignup === false) {
            enabledContent.classList.add('hidden');
            disabledContent.classList.remove('hidden');
        } else {
            enabledContent.classList.remove('hidden');
            disabledContent.classList.add('hidden');
        }
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

    if (!firstName || !lastName) {
        msgEl.textContent = "Le prénom et le nom sont obligatoires.";
        errorEl.classList.remove('hidden');
        return;
    }

    errorEl.classList.add('hidden');
    btnLoading(btn, true);

    window.isSigningUp = true; // Empêcher onAuthStateChanged de couper le processus

    try {
        const cred = await auth.createUserWithEmailAndPassword(
            document.getElementById('emailSignup').value.trim(),
            document.getElementById('passwordSignup').value
        );
        
        // Créer le document utilisateur D'ABORD pour satisfaire les règles Firebase
        await db.collection('users').doc(cred.user.uid).set({
            email: cred.user.email,
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`,
            role: 'anim',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Sécurité supplémentaire : vérifier l'autorisation
        const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
        if (globalDoc.exists && globalDoc.data().allowSignup === false) {
            await db.collection('users').doc(cred.user.uid).delete();
            await cred.user.delete();
            await auth.signOut();
            throw new Error("signup_disabled");
        }
        // Si tout est ok, on recharge la page pour charger le dashboard proprement
        window.location.reload();
    } catch (err) {
        window.isSigningUp = false;
        btnLoading(btn, false);
        if (err.message === "signup_disabled") {
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
        document.getElementById('adminColoActions')?.classList.remove('hidden');
    }

    // Gérer les désabonnements pour éviter les doublons
    if (window.dashStatsUnsub) window.dashStatsUnsub();
    if (window.dashMsgUnsub) window.dashMsgUnsub();

    // Écouter le réglage global d'affichage des stats
    window.dashStatsUnsub = db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
        if (doc.exists) {
            showStats = doc.data().showColoStats !== false;
            showOrg = doc.data().showColoOrg !== false;
        } else {
            showStats = true; // Par défaut
            showOrg = true; // Par défaut
        }

        // Mettre à jour l'état du toggle (si présent)
        const toggle = document.getElementById('checkShowStats');
        if (toggle) toggle.checked = showStats;

        const toggleOrg = document.getElementById('checkShowOrg');
        if (toggleOrg) toggleOrg.checked = showOrg;

        // Appliquer aux cartes existantes sans recharger tout
        document.querySelectorAll('.es-colo-card__stats').forEach(el => {
            el.classList.toggle('es-stats--hidden', !showStats);
        });
        document.querySelectorAll('.es-colo-card__lock').forEach(el => {
            el.classList.toggle('es-org--hidden', !showOrg);
        });
    });

    // Écouter le message global du directeur
    window.dashMsgUnsub = db.collection('globalSettings').doc('dashboard').onSnapshot(doc => {
        const wrap = document.getElementById('dashDirectorMsgWrap');
        const viewAdmin = document.getElementById('dashDirectorMsgAdmin');
        const viewAnim = document.getElementById('dashDirectorMsgAnim');
        const textArea = document.getElementById('inputDirectorMsg');
        const textDisplay = document.getElementById('dashDirectorMsgText');

        if (doc.exists && doc.data().directorMessage) {
            const msg = doc.data().directorMessage;
            wrap.classList.remove('hidden');

            if (role === 'admin') {
                viewAdmin.classList.remove('hidden');
                viewAnim.classList.add('hidden');
                // On n'écrase pas le textarea s'il est focus pour laisser l'admin écrire
                if (document.activeElement !== textArea) textArea.value = msg;
            } else {
                viewAnim.classList.remove('hidden');
                viewAdmin.classList.add('hidden');
                textDisplay.textContent = msg;
            }
        } else {
            // Pas de message ou supprimé
            if (role === 'admin') {
                wrap.classList.remove('hidden');
                viewAdmin.classList.remove('hidden');
                viewAnim.classList.add('hidden');
            } else {
                wrap.classList.add('hidden');
            }
        }
    });

    loadColos(user, role);
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

// ----------------------------------------------------------------
// CHARGEMENT DES COLOS
// ----------------------------------------------------------------
let currentColoId = null;
let currentColoData = null;
let currentUser = null;
let currentRole = null;
let showStats = true;
let showOrg = true;

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
        // Récupérer toutes les colos triées par date de début (la plus récente en haut)
        const snapshot = await db.collection('espaces').orderBy('dateDebut', 'desc').get();

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
            const visible = colo.visible !== false;

            // SI ANIMATEUR : On cache totalement si non visible
            if (role === 'anim' && !visible) continue;

            let accessStatus = role === 'admin' ? 'admin' : (accessMap[colo.id] || 'none');
            const nbAnims = animCounts[colo.id] || 0;

            // Compter participants (Utilise le champ 'nbParticipants' s'il existe, sinon 0 pour éviter N+1 reads)
            // Note: Pour une optimisation totale, incrémenter ce champ lors de l'ajout d'un participant.
            let nbParticipants = colo.nbParticipants || 0;

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

    card.innerHTML = `
        <div class="es-colo-card__header">
            <div>
                <div class="es-colo-card__name">
                    ${colo.nom || 'Sans nom'}
                    ${isUpcoming ? `
                        <span style="background:rgba(52,152,219,0.25);color:#ffffff;border:1px solid rgba(52,152,219,0.4);padding:1px 6px;border-radius:4px;font-size:0.6rem;text-transform:uppercase;margin-left:5px;font-weight:800;vertical-align:middle;text-shadow:none;">
                            À venir
                        </span>
                    ` : ''}
                    ${!visible ? `
                        <span style="background:rgba(255,165,0,0.25);color:#ffffff;border:1px solid rgba(255,165,0,0.4);padding:1px 6px;border-radius:4px;font-size:0.6rem;text-transform:uppercase;margin-left:5px;font-weight:800;vertical-align:middle;text-shadow:none;">
                            <i class="bi bi-eye-slash-fill"></i> Caché
                        </span>
                    ` : ''}
                </div>
                <div class="es-colo-card__dates">${dateStr}</div>
            </div>
            ${role === 'admin' ? `
                <div style="margin-left:auto;display:flex;align-items:center;gap:6px;z-index:10;">
                    <button class="es-card-action-btn" 
                            title="Modifier la colonie"
                            onclick="event.stopPropagation(); openEditColoIndex('${colo.id}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="es-card-action-btn" 
                            title="Changer la visibilité pour les animateurs"
                            onclick="event.stopPropagation(); toggleColoVisibility('${colo.id}', ${visible})">
                        <i class="bi bi-${visible ? 'eye' : 'eye-slash'}"></i>
                    </button>
                </div>
            ` : ''}
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
            <div style="margin-left: auto; display: flex; align-items: center;">
                ${statusBadge[accessStatus] || ''}
            </div>
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

// ================================================================
// GESTION COLO (Créer / Modifier) - INDEX (Via Formulaire Partagé)
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

// Initialisation du formulaire partagé au chargement
ColoFormManager.init('index', () => loadColos(currentUser, currentRole));

