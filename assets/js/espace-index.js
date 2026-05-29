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
// GESTION COLO (Créer / Modifier) - INDEX
// ================================================================

const AVAILABLE_EMOJIS_INDEX = [
    { emoji: '🏖️', desc: 'plage' }, { emoji: '🏔️', desc: 'montagne' },
    { emoji: '🌲', desc: 'forêt' }, { emoji: '🌳', desc: 'campagne' },
    { emoji: '🌊', desc: 'mer' }, { emoji: '🏕️', desc: 'camping' },
    { emoji: '🏥️', desc: 'randonnée' }, { emoji: '⛷️', desc: 'ski' },
    { emoji: '🏄', desc: 'surf' }, { emoji: '🧗', desc: 'escalade' },
    { emoji: '🚣', desc: 'kayak' }, { emoji: '🏹', desc: 'tir à l\'arc' },
    { emoji: '⚽', desc: 'football' }, { emoji: '🏀', desc: 'basket' },
    { emoji: '🏐', desc: 'volley' }, { emoji: '🎨', desc: 'peinture' },
    { emoji: '🎠', desc: 'parc attraction' }, { emoji: '🎓', desc: 'formation BAFA' },
    { emoji: '🎤', desc: 'musique' }, { emoji: '💃', desc: 'danse' },
    { emoji: '🐴', desc: 'équitation' }, { emoji: '✈️', desc: 'voyage' },
    { emoji: '🌍', desc: 'culture' }, { emoji: '🏗️', desc: 'ALSH' },
    { emoji: '🎩', desc: 'jeux' }, { emoji: '🎒', desc: 'itinérance' },
    { emoji: '🚲', desc: 'vélo' }, { emoji: '🍳', desc: 'cuisine' },
];

document.getElementById('btnNewColoIndex')?.addEventListener('click', () => openColoFormIndex());
document.getElementById('btnCloseColoFormIndex')?.addEventListener('click', () => closeModal('overlayColoFormIndex'));
document.getElementById('btnCancelColoFormIndex')?.addEventListener('click', () => closeModal('overlayColoFormIndex'));

function openColoFormIndex(colo = null) {
    document.getElementById('coloIndexId').value = colo?.id || '';
    document.getElementById('coloIndexNom').value = colo?.nom || '';
    
    // Set Organisme field and handle "Autre"
    const predefinedOrganisms = [
        "UCPA", "Telligo", "Djuringa", "Cap Monde", "CGCV", "Compagnons Des Jours Heureux",
        "Haute Pyrénées Sport & Nature", "Nouvelles Aventures Junior", "Sports Elite Jeunes", "SNU",
        "Temps Jeunes", "UFCV", "Croq Vacances", "Léo Lagrange", "Avea", "CIE Thales", "Zigo",
        "Le Zèbre", "Cap Juniors", "Mondiale Junior", "Agence Nature", "Les séjours de l'AJD",
        "Association Regards", "CE SNCF", "CE Air France", "Chemins du Monde", "Chic Planet",
        "GoColo", "Le Temps des Copains", "Nouvelles Vagues", "Passion Aventure Junior",
        "Sans Frontières", "SILC", "Visas Loisirs", "Afocal", "FFSS", "Les Francas", "Cemea",
        "ALEF", "IFAC", "Guides et scouts de France (SGDF)", "Éclaireuses et éclaireurs de France (EEDF)",
        "Éclaireuses éclaireurs unionistes de France (EEUF)", "Éclaireuses et éclaireurs israélites de France (EEIF)",
        "Scouts musulmans de France (SMF)", "Éclaireuses et éclaireurs de la nature (EEDLN)",
        "Association des guides et scouts d'Europe (AGSE)", "Éclaireurs neutres de France (ENF)",
        "Fédération des éclaireurs et éclaireuses (FEE)", "Scouts unitaires de France (SUF)"
    ];
    
    if (colo?.organisme && !predefinedOrganisms.includes(colo.organisme)) {
        document.getElementById('coloIndexOrganisme').value = 'Autre';
        document.getElementById('coloIndexOrganismeAutre').value = colo.organisme;
        document.getElementById('coloIndexOrganismeAutreWrap').classList.remove('hidden');
    } else {
        document.getElementById('coloIndexOrganisme').value = colo?.organisme || '';
        document.getElementById('coloIndexOrganismeAutre').value = '';
        document.getElementById('coloIndexOrganismeAutreWrap').classList.add('hidden');
    }

    document.getElementById('coloIndexDateDebut').value = colo?.dateDebut || '';
    document.getElementById('coloIndexDateFin').value = colo?.dateFin || '';
    document.getElementById('coloIndexDriveId').value = colo?.driveId || '';
    document.getElementById('coloIndexPPId').value = colo?.ppId || '';
    
    const cbFormation = document.getElementById('coloIndexIsFormation');
    if (cbFormation) cbFormation.checked = colo?.isFormation === true;

    // Image de fond
    const bgInput = document.getElementById('coloIndexBgInput');
    const bgBase64 = document.getElementById('coloIndexBgBase64');
    const bgPreview = document.getElementById('coloIndexBgPreview');
    const bgPreviewContainer = document.getElementById('coloIndexBgPreviewContainer');
    if (bgInput) bgInput.value = '';
    if (bgBase64) bgBase64.value = colo?.bgImage || '';
    if (bgPreview && bgPreviewContainer) {
        if (colo?.bgImage) {
            bgPreview.src = colo.bgImage;
            bgPreviewContainer.classList.remove('hidden');
        } else {
            bgPreview.src = '';
            bgPreviewContainer.classList.add('hidden');
        }
    }

    // Emoji
    const currentEmoji = colo?.emoji || '🏕️';
    document.getElementById('coloIndexEmoji').value = currentEmoji;
    const emojiSelector = document.getElementById('coloIndexEmojiSelector');
    if (emojiSelector) {
        emojiSelector.innerHTML = AVAILABLE_EMOJIS_INDEX.map(item =>
            `<button type="button" title="${item.desc}" class="${item.emoji === currentEmoji ? 'selected' : ''}" onclick="selectColoEmojiIndex('${item.emoji}', this)">${item.emoji}</button>`
        ).join('');
    }

    // Dates
    const dateInfoEl = document.getElementById('coloIndexDateInfo');
    const createdEl = document.getElementById('coloIndexCreatedAtInfo');
    const updatedEl = document.getElementById('coloIndexUpdatedAtInfo');
    if (colo && (colo.createdAt || colo.updatedAt)) {
        dateInfoEl?.classList.remove('hidden');
        if (createdEl) createdEl.innerHTML = colo.createdAt ? `<i class="bi bi-plus-circle"></i> Créé le ${formatFullDate(colo.createdAt)}` : '';
        if (updatedEl) updatedEl.innerHTML = colo.updatedAt ? `<i class="bi bi-pencil-square"></i> Modifié le ${formatFullDate(colo.updatedAt)}` : '';
    } else {
        dateInfoEl?.classList.add('hidden');
    }

    document.getElementById('coloFormIndexTitle').textContent = colo ? 'Modifier la colonie' : 'Nouvelle colonie';
    document.getElementById('coloFormIndexError')?.classList.add('hidden');
    openModal('overlayColoFormIndex');
}

function selectColoEmojiIndex(emoji, btnEl) {
    document.getElementById('coloIndexEmoji').value = emoji;
    document.getElementById('coloIndexEmojiSelector').querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    btnEl.classList.add('selected');
}

async function openEditColoIndex(id) {
    try {
        const doc = await db.collection('espaces').doc(id).get();
        if (doc.exists) openColoFormIndex({ id: doc.id, ...doc.data() });
    } catch (err) {
        showToast('Erreur lors du chargement.', 'error');
    }
}

// Image upload
document.getElementById('coloIndexBgInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('Seules les images sont acceptées.', 'error'); return; }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
        const base64 = reader.result;
        if (base64.length > 5500000) { showToast('Image trop lourde (max ~4Mo).', 'error'); return; }
        document.getElementById('coloIndexBgBase64').value = base64;
        const bgPreview = document.getElementById('coloIndexBgPreview');
        const bgPreviewContainer = document.getElementById('coloIndexBgPreviewContainer');
        if (bgPreview && bgPreviewContainer) { bgPreview.src = base64; bgPreviewContainer.classList.remove('hidden'); }
    };
    reader.onerror = () => showToast('Erreur de lecture de l\'image.', 'error');
});

document.getElementById('btnRemoveColoIndexBg')?.addEventListener('click', () => {
    document.getElementById('coloIndexBgInput').value = '';
    document.getElementById('coloIndexBgBase64').value = '';
    document.getElementById('coloIndexBgPreview').src = '';
    document.getElementById('coloIndexBgPreviewContainer').classList.add('hidden');
});

// Sauvegarde
document.getElementById('btnSaveColoFormIndex')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveColoFormIndex');
    const errEl = document.getElementById('coloFormIndexError');
    const errMsg = document.getElementById('coloFormIndexErrorMsg');

    const nom = document.getElementById('coloIndexNom')?.value.trim();
    if (!nom) {
        errMsg.textContent = 'Le nom de la colonie est obligatoire.';
        errEl.classList.remove('hidden');
        return;
    }

    const dateDebut = document.getElementById('coloIndexDateDebut')?.value;
    const dateFin = document.getElementById('coloIndexDateFin')?.value;
    if (dateDebut && dateFin && new Date(dateFin) <= new Date(dateDebut)) {
        errMsg.textContent = 'La date de fin doit être après la date de début.';
        errEl.classList.remove('hidden');
        return;
    }

    const organismeInput = document.getElementById('coloIndexOrganisme');
    const organismeAutreInput = document.getElementById('coloIndexOrganismeAutre');
    let organismeValue = organismeInput?.value.trim() || '';
    if (organismeValue === 'Autre') {
        organismeValue = organismeAutreInput?.value.trim() || '';
        if (!organismeValue) {
            errMsg.textContent = "Veuillez préciser le nom de l'organisme.";
            errEl.classList.remove('hidden');
            return;
        }
    }

    errEl.classList.add('hidden');
    btnLoading(btn, true);

    const data = {
        nom,
        organisme: organismeValue,
        dateDebut: dateDebut || '',
        dateFin: dateFin || '',
        driveId: document.getElementById('coloIndexDriveId')?.value.trim() || '',
        ppId: document.getElementById('coloIndexPPId')?.value.trim() || '',
        isFormation: document.getElementById('coloIndexIsFormation')?.checked || false,
        bgImage: document.getElementById('coloIndexBgBase64')?.value || '',
        emoji: document.getElementById('coloIndexEmoji')?.value.trim() || '🏕️',
        description: firebase.firestore.FieldValue.delete(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const coloId = document.getElementById('coloIndexId')?.value;

    try {
        if (coloId) {
            await db.collection('espaces').doc(coloId).update(data);
            showToast('Colonie mise à jour.', 'success');
        } else {
            data.createdBy = currentUser.uid;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('espaces').add(data);
            showToast('Colonie créée !', 'success');
        }
        closeModal('overlayColoFormIndex');
        loadColos(currentUser, currentRole);
    } catch (err) {
        console.error('saveColoIndex:', err);
        errMsg.textContent = 'Erreur lors de l\'enregistrement.';
        errEl.classList.remove('hidden');
    } finally {
        btnLoading(btn, false);
    }
});

// ================================================================
// COMBOBOX SYSTEM FOR ORGANISME FIELD
// ================================================================
function initOrganismeCombobox(inputId, dropdownId) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const organisms = [
        { value: "ALEF", label: "ALEF" },
        { value: "Afocal", label: "Afocal" },
        { value: "Agence Nature", label: "Agence Nature" },
        { value: "Association Regards", label: "Association Regards" },
        { value: "Avea", label: "Avea" },
        { value: "Cap Juniors", label: "Cap Juniors" },
        { value: "Cap Monde", label: "Cap Monde" },
        { value: "CE Air France", label: "CE Air France" },
        { value: "CE SNCF", label: "CE SNCF" },
        { value: "CGCV", label: "CGCV" },
        { value: "Chemins du Monde", label: "Chemins du Monde" },
        { value: "Chic Planet", label: "Chic Planet" },
        { value: "CIE Thales", label: "CIE Thales" },
        { value: "Cemea", label: "Cemea" },
        { value: "Compagnons Des Jours Heureux", label: "Compagnons Des Jours Heureux" },
        { value: "Croq Vacances", label: "Croq Vacances" },
        { value: "Djuringa", label: "Djuringa" },
        { value: "FFSS", label: "FFSS" },
        { value: "GoColo", label: "GoColo" },
        { value: "Haute Pyrénées Sport & Nature", label: "Haute Pyrénées Sport & Nature" },
        { value: "IFAC", label: "IFAC" },
        { value: "Léo Lagrange", label: "Léo Lagrange" },
        { value: "Le Temps des Copains", label: "Le Temps des Copains" },
        { value: "Le Zèbre", label: "Le Zèbre" },
        { value: "Les Francas", label: "Les Francas" },
        { value: "Les séjours de l'AJD", label: "Les séjours de l'AJD" },
        { value: "Mondiale Junior", label: "Mondiale Junior" },
        { value: "Nouvelles Aventures Junior", label: "Nouvelles Aventures Junior" },
        { value: "Nouvelles Vagues", label: "Nouvelles Vagues" },
        { value: "Passion Aventure Junior", label: "Passion Aventure Junior" },
        { value: "Sans Frontières", label: "Sans Frontières" },
        { value: "SILC", label: "SILC" },
        { value: "SNU", label: "SNU" },
        { value: "Sports Elite Jeunes", label: "Sports Elite Jeunes" },
        { value: "Temps Jeunes", label: "Temps Jeunes" },
        { value: "Telligo", label: "Telligo" },
        { value: "UCPA", label: "UCPA" },
        { value: "UFCV", label: "UFCV" },
        { value: "Visas Loisirs", label: "Visas Loisirs" },
        { value: "Zigo", label: "Zigo" },
        
        // Group FSF (Scout groups - unsorted by user request, kept in scout groups)
        { value: "Guides et scouts de France (SGDF)", label: "Guides et scouts de France (SGDF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs de France (EEDF)", label: "Éclaireuses et éclaireurs de France (EEDF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses éclaireurs unionistes de France (EEUF)", label: "Éclaireuses éclaireurs unionistes de France (EEUF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs israélites de France (EEIF)", label: "Éclaireuses et éclaireurs israélites de France (EEIF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Scouts musulmans de France (SMF)", label: "Scouts musulmans de France (SMF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs de la nature (EEDLN)", label: "Éclaireuses et éclaireurs de la nature (EEDLN)", group: "Fédération du scoutisme français (FSF)" },
        
        // Group CSF
        { value: "Association des guides et scouts d'Europe (AGSE)", label: "Association des guides et scouts d'Europe (AGSE)", group: "Conférence française du scoutisme (CSF)" },
        { value: "Éclaireurs neutres de France (ENF)", label: "Éclaireurs neutres de France (ENF)", group: "Conférence française du scoutisme (CSF)" },
        
        // Group Indépendant
        { value: "Fédération des éclaireurs et éclaireuses (FEE)", label: "Fédération des éclaireurs et éclaireuses (FEE)", group: "Indépendant" },
        { value: "Scouts unitaires de France (SUF)", label: "Scouts unitaires de France (SUF)", group: "Indépendant" },
        
        { value: "Autre", label: "Autre (préciser)" }
    ];

    let highlightedIndex = -1;
    const wrap = input.parentElement;

    if (wrap) {
        wrap.classList.add('es-combobox__wrap');
        // Add open/close chevron icon
        if (!wrap.querySelector('.es-combobox__toggle')) {
            const toggle = document.createElement('i');
            toggle.className = 'bi bi-chevron-down es-combobox__toggle';
            wrap.appendChild(toggle);
        }
    }

    function renderList(filterText = '') {
        const query = filterText.toLowerCase().trim();
        
        // Filter options based on label or group name
        const filtered = organisms.filter(org => 
            org.label.toLowerCase().includes(query) || 
            (org.group && org.group.toLowerCase().includes(query))
        );
        
        dropdown.innerHTML = '';
        highlightedIndex = -1;

        if (filtered.length === 0) {
            const emptyItem = document.createElement('div');
            emptyItem.className = 'es-combobox__item es-combobox__item--empty';
            emptyItem.textContent = 'Aucun organisme trouvé';
            dropdown.appendChild(emptyItem);
            return;
        }

        let currentGroup = null;
        let itemIndex = 0;

        filtered.forEach((org) => {
            // Group header rendering
            if (org.group && org.group !== currentGroup) {
                currentGroup = org.group;
                const header = document.createElement('div');
                header.className = 'es-combobox__header';
                header.textContent = currentGroup;
                dropdown.appendChild(header);
            } else if (!org.group && currentGroup !== null) {
                currentGroup = null;
            }

            const item = document.createElement('div');
            item.className = 'es-combobox__item';
            item.dataset.index = itemIndex;
            itemIndex++;

            if (org.value === input.value) {
                item.classList.add('active');
            }
            
            item.innerHTML = `<i class="bi bi-building"></i> <span>${org.label}</span>`;
            
            item.addEventListener('click', () => {
                input.value = org.value;
                const autreWrap = document.getElementById(inputId + 'AutreWrap');
                const autreInput = document.getElementById(inputId + 'Autre');
                
                if (org.value === 'Autre') {
                    if (autreWrap && autreInput) {
                        autreWrap.classList.remove('hidden');
                        autreInput.value = '';
                        autreInput.focus();
                    }
                } else {
                    if (autreWrap && autreInput) {
                        autreWrap.classList.add('hidden');
                        autreInput.value = '';
                    }
                }
                closeDropdown();
                input.dispatchEvent(new Event('change'));
            });
            dropdown.appendChild(item);
        });
    }

    function showDropdown() {
        renderList(input.value);
        dropdown.classList.remove('hidden');
        dropdown.classList.add('show');
        if (wrap) wrap.classList.add('open');
    }

    function closeDropdown() {
        dropdown.classList.remove('show');
        dropdown.classList.add('hidden');
        if (wrap) wrap.classList.remove('open');
        highlightedIndex = -1;
    }

    input.addEventListener('focus', showDropdown);
    input.addEventListener('input', showDropdown);

    // Watch for manual inputs or changes
    input.addEventListener('change', () => {
        const autreWrap = document.getElementById(inputId + 'AutreWrap');
        const autreInput = document.getElementById(inputId + 'Autre');
        if (autreWrap && autreInput) {
            if (input.value === 'Autre') {
                autreWrap.classList.remove('hidden');
                autreInput.focus();
            } else {
                autreWrap.classList.add('hidden');
            }
        }
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        const items = dropdown.querySelectorAll('.es-combobox__item:not(.es-combobox__item--empty)');
        if (!dropdown.classList.contains('show')) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                showDropdown();
                e.preventDefault();
            }
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % items.length;
            updateHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
            updateHighlight(items);
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && highlightedIndex < items.length) {
                e.preventDefault();
                items[highlightedIndex].click();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeDropdown();
            input.blur();
        }
    });

    function updateHighlight(items) {
        items.forEach((item, idx) => {
            if (idx === highlightedIndex) {
                item.classList.add('active');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('active');
            }
        });
    }
}

// Initialisation au chargement
initOrganismeCombobox('coloIndexOrganisme', 'coloIndexOrganismeDropdown');
