/* ================================================================
   ESPACE-ADMIN.JS — Panneau d'administration
   Accès réservé au rôle "admin"
   ================================================================ */

// db, auth et googleProvider sont déclarés dans firebase-config.js

let currentAdminUser = null;
let currentColoId = null; // Pour la gestion des participants
let currentColoNom = ''; // Pour l'export
let currentAdminGroups = []; // Noms des groupes thématiques
let deleteTarget = null; // { type: 'colo'|'participant', id, coloId? }
let adminParticipantColView = 'note'; // 'spec' | 'note'

// Générateur de couleur pseudo-aléatoire basé sur un mot
function getStringColorStyle(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `background-color: hsla(${h}, 70%, 50%, 0.1); color: hsl(${h}, 70%, 40%); border-color: hsla(${h}, 70%, 50%, 0.3);`;
}

// ----------------------------------------------------------------
// AUTH STATE — Vérifier le rôle admin
// ----------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }

    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) { auth.signOut(); window.location.href = 'index.html'; return; }
    const role = userDoc.data().role;
    const userData = userDoc.data();

    // Mettre à jour lastLogin
    db.collection('users').doc(user.uid).update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });

    if (role !== 'admin') {
        document.getElementById('adminLoader')?.classList.add('hidden');
        document.getElementById('accessDenied')?.classList.remove('hidden');
        return;
    }

    currentAdminUser = user;
    updateTopbarUser(user, role, userData);
    document.getElementById('adminLoader')?.classList.add('hidden');
    document.getElementById('adminContent')?.classList.remove('hidden');

    initAdminTabs();
    loadColos();
    loadPendingBadge(); // badge demandes en attente dès l'ouverture
});

// ----------------------------------------------------------------
// ONGLETS ADMIN
// ----------------------------------------------------------------
function initAdminTabs() {
    document.querySelectorAll('#adminTabs .es-nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#adminTabs .es-nav-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            ['colos', 'demandes', 'utilisateurs', 'config'].forEach(t => {
                document.getElementById(`tab-${t}`)?.classList.toggle('hidden', t !== tab);
            });
            // Charger les données de l'onglet sélectionné à la demande
            if (tab === 'demandes') loadDemandes();
            if (tab === 'utilisateurs') loadUsers();
            if (tab === 'config') loadConfig();
        });
    });
}

// ----------------------------------------------------------------
// BADGE DEMANDES EN ATTENTE (temps réel dès l'init)
// ----------------------------------------------------------------
function loadPendingBadge() {
    if (window.pendingBadgeUnsub) window.pendingBadgeUnsub(); // détacher l'ancien listener

    const badge = document.getElementById('badgePending');
    if (!badge) return;

    // Écoute en temps réel : se met à jour automatiquement
    window.pendingBadgeUnsub = db.collection('accessRequests')
        .where('status', '==', 'pending')
        .onSnapshot(snapshot => {
            const count = snapshot.size;
            if (count > 0) {
                badge.textContent = count;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }
        }, err => {
            console.error('loadPendingBadge snapshot:', err);
        });
}
// ----------------------------------------------------------------
// ONGLET CONFIGURATION (Gemini Key)
// ----------------------------------------------------------------
async function loadConfig() {
    if (!currentAdminUser) return;
    try {
        const doc = await db.collection('users').doc(currentAdminUser.uid).get();
        if (doc.exists) {
            const data = doc.data();
            const input = document.getElementById('adminGeminiKey');
            if (input) input.value = data.geminiKey || '';
        }

        const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
        if (globalDoc.exists) {
            const checkSignup = document.getElementById('checkAllowSignup');
            if (checkSignup) {
                checkSignup.checked = globalDoc.data().allowSignup !== false; // true par défaut
            }
        }
    } catch (err) {
        console.error("loadConfig error:", err);
    }
}

document.getElementById('checkAllowSignup')?.addEventListener('change', async (e) => {
    const val = e.target.checked;
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            allowSignup: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast(val ? "Création de compte activée." : "Création de compte désactivée.", "success");
    } catch (err) {
        console.error("Erreur sauvegarde allowSignup:", err);
        showToast("Erreur lors de la modification.", "error");
        e.target.checked = !val; // revert on error
    }
});

document.getElementById('btnSaveAdminKey')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAdminKey');
    const input = document.getElementById('adminGeminiKey');
    const key = input?.value.trim() || '';

    btnLoading(btn, true);
    try {
        await db.collection('users').doc(currentAdminUser.uid).update({
            geminiKey: key,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast("Clé API enregistrée avec succès.", "success");
    } catch (err) {
        console.error("Save admin key error:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnToggleAdminKeyVisibility')?.addEventListener('click', () => {
    const input = document.getElementById('adminGeminiKey');
    const icon = document.querySelector('#btnToggleAdminKeyVisibility i');
    if (input) {
        if (input.type === 'password') {
            input.type = 'text';
            icon.className = 'bi bi-eye-slash';
        } else {
            input.type = 'password';
            icon.className = 'bi bi-eye';
        }
    }
});


// ================================================================
// ONGLET COLONIES
// ================================================================

async function loadColos() {

    const loader = document.getElementById('colosLoader2');
    const list = document.getElementById('colosAdminList');
    const empty = document.getElementById('colosAdminEmpty');

    loader?.classList.remove('hidden');
    list.innerHTML = '';
    empty?.classList.add('hidden');

    try {
        const snap = await db.collection('espaces').orderBy('dateDebut', 'desc').get();
        loader?.classList.add('hidden');

        // Calcul et affichage de la bannière de statistiques globales admin
        let totalEspaces = snap.docs.length;
        let nbFormations = 0;
        let nbColos = 0;

        snap.docs.forEach(doc => {
            if (doc.data().isFormation === true) {
                nbFormations++;
            } else {
                nbColos++;
            }
        });

        const adminBanner = document.getElementById('adminGlobalStatsBanner');
        if (adminBanner) {
            adminBanner.innerHTML = `
                <div class="es-admin-stats-banner">
                    <div class="es-admin-stat-card active" id="statCardTotal" onclick="filterAdminColos('all')" title="Afficher tous les espaces">
                        <div class="es-admin-stat-card__icon es-admin-stat-card__icon--total">
                            <i class="bi bi-grid-fill"></i>
                        </div>
                        <div class="es-admin-stat-card__content">
                            <div class="es-admin-stat-card__value">${totalEspaces}</div>
                            <div class="es-admin-stat-card__label">Total Espaces</div>
                        </div>
                    </div>
                    <div class="es-admin-stat-card" id="statCardFormation" onclick="filterAdminColos('formation')" title="Filtrer les formations">
                        <div class="es-admin-stat-card__icon es-admin-stat-card__icon--formation">
                            <i class="bi bi-mortarboard-fill"></i>
                        </div>
                        <div class="es-admin-stat-card__content">
                            <div class="es-admin-stat-card__value">${nbFormations}</div>
                            <div class="es-admin-stat-card__label">Formations</div>
                        </div>
                    </div>
                    <div class="es-admin-stat-card" id="statCardColo" onclick="filterAdminColos('colo')" title="Filtrer les colonies">
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
        }

        if (snap.empty) {
            empty?.classList.remove('hidden');
            return;
        }

        for (const doc of snap.docs) {
            const colo = { id: doc.id, ...doc.data() };
            list.appendChild(buildColoAdminCard(colo));
        }
    } catch (err) {
        loader?.classList.add('hidden');
        console.error('loadColos admin:', err);
        showToast('Erreur lors du chargement des espaces.', 'error');
    }
}

function buildColoAdminCard(colo) {
    const div = document.createElement('div');
    div.className = 'es-colo-admin-card';
    div.dataset.type = colo.isFormation ? 'formation' : 'colo';

    if (colo.bgImage) {
        div.style.backgroundImage = `linear-gradient(to bottom, rgba(0, 0, 0, 0.15) 0%, rgba(0, 0, 0, 0.65) 100%), url('${colo.bgImage}')`;
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
    }

    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : 'Dates non définies';

    const visible = colo.visible !== false; // true par défaut
    const locked = colo.participantsLocked !== false; // true par défaut

    const now = new Date();
    now.setHours(0,0,0,0);
    const startDate = colo.dateDebut ? new Date(colo.dateDebut) : null;
    const isUpcoming = startDate && startDate > now;

    div.innerHTML = `
        <div class="es-colo-admin-card__header">
            <div>
                <div class="es-colo-admin-card__title">
                    ${colo.emoji || '🏕️'} ${colo.nom || 'Sans nom'}
                    ${isUpcoming ? `
                        <span style="background:rgba(52,152,219,0.25);color:#ffffff;border:1px solid rgba(52,152,219,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;margin-left:8px;font-weight:800;vertical-align:middle;text-shadow:none;">
                            À venir
                        </span>
                    ` : ''}
                    ${!visible ? `
                        <span style="background:rgba(255,165,0,0.25);color:#ffffff;border:1px solid rgba(255,165,0,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;margin-left:8px;font-weight:800;text-shadow:none;">
                            <i class="bi bi-eye-slash-fill"></i> Caché
                        </span>
                    ` : ''}
                </div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:2px;display:flex;align-items:center;gap:8px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">
                    ${dateStr}
                    <span style="
                        padding:1px 7px;border-radius:20px;font-size:0.7rem;font-weight:700;text-shadow:none;
                        ${locked
                            ? 'background:rgba(231,76,60,0.25);color:#ffffff;border:1px solid rgba(231,76,60,0.4);'
                            : 'background:rgba(39,174,96,0.25);color:#ffffff;border:1px solid rgba(39,174,96,0.4);'}
                    ">
                        ${locked ? '🔒 Participants verrouillés' : '🔓 Participants ouverts'}
                    </span>
                </div>
            </div>
        </div>
        <div class="es-colo-admin-card__body" style="font-size:0.87rem; display:flex; justify-content:space-between; align-items:flex-start; gap:16px;">
            <div style="flex:1; display:flex; flex-direction:column; gap:6px;">
                <div style="font-weight:600;">
                    ${colo.organisme ? colo.organisme : '<span style="opacity:0.5;font-style:italic;">Organisme non défini.</span>'}
                </div>
                <div style="font-size:0.72rem; color:rgba(255,255,255,0.45); display:flex; flex-wrap:wrap; gap:10px; align-items:center; text-shadow:none;">
                    ${colo.createdAt ? `<span><i class="bi bi-plus-circle"></i> Créé le ${formatFullDate(colo.createdAt)}</span>` : ''}
                    ${colo.updatedAt ? `<span><i class="bi bi-pencil-square"></i> Modifié le ${formatFullDate(colo.updatedAt)}</span>` : ''}
                </div>
            </div>
            <div class="es-colo-admin-card__actions" style="display: flex; justify-content: flex-end; align-items: flex-start; gap: 8px; flex-wrap: wrap; flex-shrink: 0; z-index: 10;">
                <button class="es-card-action-btn"
                        title="Invisibilité pour les animateurs"
                        onclick="toggleColoVisibility('${colo.id}', ${visible})">
                    <i class="bi bi-${visible ? 'eye' : 'eye-slash'}"></i>
                </button>
                <div style="width:1px;height:24px;background:rgba(255,255,255,0.15);margin:4px 4px 0 4px;"></div>
                <button class="es-card-action-btn es-card-action-btn--pill ${locked ? 'es-card-action-btn--danger' : 'es-card-action-btn--success'}"
                        title="${locked ? 'Déverrouiller la gestion des participants' : 'Verrouiller la gestion des participants'}"
                        onclick="toggleParticipantsLock('${colo.id}', ${locked})">
                    <i class="bi bi-${locked ? 'unlock' : 'lock'}"></i>
                    <span class="brand-label" style="color:inherit; font-size: inherit; font-weight: inherit;">${locked ? 'Déverrouiller' : 'Verrouiller'}</span>
                </button>
                <button class="es-card-action-btn"
                        title="Modifier"
                        onclick="openEditColo('${colo.id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="es-card-action-btn es-card-action-btn--danger"
                        title="Supprimer la colonie"
                        onclick="confirmDeleteColo('${colo.id}', ${escapeHtml(JSON.stringify(colo.nom || ''))})">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        </div>
    `;
    return div;
}

async function toggleParticipantsLock(coloId, currentlyLocked) {
    const newLocked = !currentlyLocked;
    const label = newLocked ? 'verrouillés' : 'ouverts aux animateurs';
    try {
        await db.collection('espaces').doc(coloId).update({ participantsLocked: newLocked });
        showToast(`Participants ${label}.`, newLocked ? 'default' : 'success');
        loadColos();
    } catch (err) {
        console.error('toggleParticipantsLock:', err);
        showToast('Erreur lors du changement de verrou.', 'error');
    }
}

async function toggleColoVisibility(coloId, currentVisible) {
    const newVisible = !currentVisible;
    try {
        await db.collection('espaces').doc(coloId).update({ visible: newVisible });
        showToast(newVisible ? "La colonie est maintenant visible pour les animateurs." : "La colonie est désormais cachée pour les animateurs.", "success");
        loadColos();
    } catch (err) {
        console.error('toggleColoVisibility:', err);
        showToast('Erreur lors du changement de visibilité.', 'error');
    }
}


// ----------------------------------------------------------------
// NOUVEAU / MODIFIER COLO
// ----------------------------------------------------------------
const AVAILABLE_EMOJIS = [
    { emoji: '🏖️', desc: 'plage' },
    { emoji: '🏔️', desc: 'montagne' },
    { emoji: '🌲', desc: 'forêt / nature' },
    { emoji: '🌳', desc: 'campagne / parc' },
    { emoji: '🌊', desc: 'mer / océan' },
    { emoji: '🏕️', desc: 'camping / plein air' },
    { emoji: '🏞️', desc: 'randonnée / paysage' },
    { emoji: '⛷️', desc: 'ski / sports d’hiver' },
    { emoji: '🏄', desc: 'surf / sports nautiques' },
    { emoji: '🧗', desc: 'escalade / aventure' },
    { emoji: '🚣', desc: 'kayak / canoë' },
    { emoji: '🏹', desc: 'tir à l’arc / jeux plein air' },
    { emoji: '⚽', desc: 'football / sport collectif' },
    { emoji: '🏀', desc: 'basket / sport collectif' },
    { emoji: '🏐', desc: 'volley / plage' },
    { emoji: '🎨', desc: 'peinture / arts plastiques' },
    { emoji: '🎭', desc: 'théâtre / spectacle' },
    { emoji: '🎢', desc: 'parc d’attraction / sensations' },
    { emoji: '🎓', desc: 'formation / apprentissage / BAFA' },
    { emoji: '🎤', desc: 'musique / chant' },
    { emoji: '💃', desc: 'danse' },
    { emoji: '🐴', desc: 'poney / équitation' },
    { emoji: '🐾', desc: 'animaux / observation nature' },
    { emoji: '🦉', desc: 'observation animaux nocturnes' },
    { emoji: '🐟', desc: 'pêche / activités nature' },
    { emoji: '✈️', desc: 'voyage / étranger' },
    { emoji: '🌍', desc: 'découverte du monde / culture' },
    { emoji: '🏛️', desc: 'visite culturelle / musée' },
    { emoji: '🍳', desc: 'cuisine' },
    { emoji: '🧩', desc: 'jeux / activités manuelles / puzzle' },
    { emoji: '🎒', desc: 'itinérance / sac à dos' },
    { emoji: '🗣️', desc: 'linguistique / langues' },
    { emoji: '⚜️', desc: 'scoutisme' },
    { emoji: '🏫', desc: 'centre de loisirs / ALSH' },
    { emoji: '🏎️', desc: 'karting / sports mécaniques' },
    { emoji: '🚂', desc: 'voyage en train' }
];

document.getElementById('btnNewColo')?.addEventListener('click', () => ColoFormManager.open('admin'));

async function openEditColo(id) {
    try {
        const doc = await db.collection('espaces').doc(id).get();
        if (doc.exists) ColoFormManager.open('admin', { id: doc.id, ...doc.data() });
    } catch (err) {
        showToast('Erreur lors du chargement.', 'error');
    }
}

// ----------------------------------------------------------------
// SUPPRIMER COLO
// ----------------------------------------------------------------
function confirmDeleteColo(id, nom) {
    deleteTarget = { type: 'colo', id };
    document.getElementById('confirmDeleteText').textContent =
        `Supprimer la colonie "${nom}" ? Tous ses participants et accès seront perdus (irréversible).`;
    openModal('overlayConfirmDelete');
}

document.getElementById('btnCloseConfirmDelete')?.addEventListener('click', () => closeModal('overlayConfirmDelete'));
document.getElementById('btnCancelDelete')?.addEventListener('click', () => closeModal('overlayConfirmDelete'));

document.getElementById('btnConfirmDelete')?.addEventListener('click', async () => {
    if (!deleteTarget) return;
    const btn = document.getElementById('btnConfirmDelete');
    btnLoading(btn, true);

    try {
        if (deleteTarget.type === 'colo') {
            // Supprimer les participants de la sous-collection
            const pSnap = await db.collection('espaces').doc(deleteTarget.id).collection('participants').get();
            const batch = db.batch();
            pSnap.forEach(d => batch.delete(d.ref));
            await batch.commit();

            // Supprimer les demandes d'accès associées
            const reqSnap = await db.collection('accessRequests')
                .where('espaceId', '==', deleteTarget.id).get();
            const batch2 = db.batch();
            reqSnap.forEach(d => batch2.delete(d.ref));
            await batch2.commit();

            // Supprimer la colo
            await db.collection('espaces').doc(deleteTarget.id).delete();
            showToast('Colonie supprimée.', 'success');
            closeModal('overlayConfirmDelete');
            loadColos();

        }
    } catch (err) {
        console.error('delete:', err);
        showToast('Erreur lors de la suppression.', 'error');
    } finally {
        btnLoading(btn, false);
        deleteTarget = null;
    }
});


// ================================================================
// ONGLET DEMANDES D'ACCÈS
// ================================================================

async function loadDemandes() {
    const loader = document.getElementById('demandesLoader');
    const content = document.getElementById('demandesContent');
    const empty = document.getElementById('demandesEmpty');
    const tbody = document.getElementById('demandesTbody');
    const badge = document.getElementById('badgePending');

    loader.classList.remove('hidden');
    content.classList.add('hidden');
    empty.classList.add('hidden');

    try {
        const snap = await db.collection('accessRequests')
            .orderBy('requestedAt', 'desc').get();

        loader.classList.add('hidden');

        if (snap.empty) {
            empty.classList.remove('hidden');
            return;
        }

        const demandes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pendingCount = demandes.filter(d => d.status === 'pending').length;

        if (pendingCount > 0) {
            badge.textContent = pendingCount;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        tbody.innerHTML = demandes.map(d => `
            <tr>
                <td>
                    <strong>${d.userName || ''}</strong><br>
                    <span style="font-size:0.78rem;color:var(--clr-text-muted)">${d.userEmail || ''}</span>
                </td>
                <td style="text-align: center;">${d.espaceName || d.espaceId || ''}</td>
                <td style="text-align: center; font-size:0.82rem;color:var(--clr-text-muted);">
                    ${formatFullDate(d.requestedAt)}
                </td>
                <td style="text-align: center;">
                    <span class="es-badge ${d.status === 'pending' ? 'es-badge--pending' : d.status === 'approved' ? 'es-badge--approved' : 'es-badge--refused'}">
                        ${d.status === 'pending' ? '⏳ En attente' : d.status === 'approved' ? '✅ Validé' : '❌ Refusé'}
                    </span>
                </td>
                <td class="es-table__actions" style="vertical-align: middle;">
                    <div style="display:flex; gap:6px; align-items:center; justify-content: center;">
                        ${d.status === 'pending' ? `
                            <button class="es-btn es-btn--success es-btn--sm" onclick="reviewDemande('${d.id}', 'approved')">
                                <i class="bi bi-check-lg"></i> Valider
                            </button>
                            <button class="es-btn es-btn--danger es-btn--sm" onclick="reviewDemande('${d.id}', 'refused')">
                                <i class="bi bi-x-lg"></i> Refuser
                            </button>
                        ` : `<button class="es-btn es-btn--ghost es-btn--sm" onclick="reviewDemande('${d.id}', 'pending')">Remettre en attente</button>`}
                    </div>
                </td>
                <td style="text-align: center; vertical-align: middle;">
                    <button class="es-btn es-btn--ghost" style="color:var(--clr-danger); padding:6px 10px; border-radius:50%; margin:0 auto; opacity:0.8; transition:all 0.2s; outline:none; box-shadow:none; background:transparent; border:none;"
                        onmouseover="this.style.opacity='1'; this.style.transform='scale(1.1)';"
                          onmouseout="this.style.opacity='0.8'; this.style.transform='scale(1)';"
                          onfocus="this.blur()"
                          onclick="deleteDemande('${d.id}')" title="Supprimer définitivement la demande">
                          <i class="bi bi-trash" style="font-size:1.1rem;"></i>
                    </button>
                </td>
            </tr>
        `).join('');

        content.classList.remove('hidden');
    } catch (err) {
        loader.classList.add('hidden');
        console.error('loadDemandes:', err);
        showToast('Erreur lors du chargement des demandes.', 'error');
    }
}

async function reviewDemande(id, status) {
    try {
        await db.collection('accessRequests').doc(id).update({
            status,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentAdminUser.uid
        });
        const msg = status === 'approved' ? 'Accès accordé !' : status === 'refused' ? 'Demande refusée.' : 'Demande remise en attente.';
        showToast(msg, status === 'approved' ? 'success' : 'default');
        loadDemandes();
    } catch (err) {
        console.error('reviewDemande:', err);
        showToast('Erreur lors de la mise à jour.', 'error');
    }
}

let pendingDeleteDemandeId = null;

function deleteDemande(id) {
    pendingDeleteDemandeId = id;
    openModal('overlayConfirmDeleteDemande');
}

document.getElementById('btnCancelDeleteDemande')?.addEventListener('click', () => {
    pendingDeleteDemandeId = null;
    closeModal('overlayConfirmDeleteDemande');
});

document.getElementById('btnConfirmDeleteDemande')?.addEventListener('click', async () => {
    if (!pendingDeleteDemandeId) return;

    const id = pendingDeleteDemandeId;
    const btn = document.getElementById('btnConfirmDeleteDemande');
    btnLoading(btn, true);

    try {
        await db.collection('accessRequests').doc(id).delete();
        showToast("Demande supprimée.", "success");
        loadDemandes();
        closeModal('overlayConfirmDeleteDemande');
    } catch (err) {
        console.error('deleteDemande:', err);
        showToast('Erreur lors de la suppression.', 'error');
    } finally {
        btnLoading(btn, false);
        pendingDeleteDemandeId = null;
    }
});

// ================================================================
// ONGLET UTILISATEURS
// ================================================================

async function loadUsers() {
    const loader = document.getElementById('usersLoader');
    const content = document.getElementById('usersContent');
    const tbody = document.getElementById('usersTbody');

    loader.classList.remove('hidden');
    content.classList.add('hidden');

    try {
        const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
        loader.classList.add('hidden');

        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:24px;">Aucun utilisateur.</td></tr>`;
            content.classList.remove('hidden');
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td style="font-size:0.87rem;">${u.email || ''}</td>
                <td style="text-align: center;">${u.displayName || '<span style="color:var(--clr-text-light)">–</span>'}</td>
                <td style="text-align: center; font-size:0.82rem;color:var(--clr-text-muted);">${formatFullDate(u.lastLogin)}</td>
                <td style="text-align: center;">
                    <span class="es-badge ${u.role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}">
                        ${u.role === 'admin' ? '👑 Admin' : '🎨 Anim'}
                    </span>
                </td>
                <td class="es-table__actions" style="vertical-align: middle;">
                    <div style="display:flex; gap:6px; align-items:center; justify-content: center;">
                        ${u.id !== currentAdminUser?.uid ? `
                            <button class="es-btn es-btn--sm"
                                    style="color:var(--clr-info);border:1.5px solid rgba(41,128,185,0.3);background:rgba(41,128,185,0.08);"
                                    onclick="openUserRightsPanel('${u.id}', ${escapeHtml(JSON.stringify(u.email || ''))}, ${escapeHtml(JSON.stringify(u.displayName || u.email || ''))})"
                            >
                                <i class="bi bi-shield-check"></i> Gérer droits
                            </button>
                        ` : '<span style="font-size:0.78rem;color:var(--clr-text-light)">Vous</span>'}
                    </div>
                </td>
            </tr>
        `).join('');

        content.classList.remove('hidden');
    } catch (err) {
        loader.classList.add('hidden');
        console.error('loadUsers:', err);
        showToast('Erreur lors du chargement des utilisateurs.', 'error');
    }
}

// ================================================================
// PANEL DROITS UTILISATEUR
// ================================================================

let rightsUserId = null;
let rightsUserName = null;

document.getElementById('btnCloseUserRights')?.addEventListener('click', () => closeModal('overlayUserRights'));
document.getElementById('btnCloseUserRights2')?.addEventListener('click', () => closeModal('overlayUserRights'));

async function openUserRightsPanel(uid, email, displayName) {
    rightsUserId = uid;
    rightsUserName = displayName || email;

    document.getElementById('userRightsTitle').textContent = `Droits — ${rightsUserName}`;
    document.getElementById('userRightsEmail').textContent = email;

    // Reset
    document.getElementById('userRightsLoader').classList.remove('hidden');
    document.getElementById('userRightsList').classList.add('hidden');
    document.getElementById('userRightsEmpty').classList.add('hidden');
    document.getElementById('userRightsList').innerHTML = '';

    openModal('overlayUserRights');

    try {
        const espacesSnap = await db.collection('espaces').orderBy('dateDebut', 'desc').get();

        if (espacesSnap.empty) {
            document.getElementById('userRightsLoader').classList.add('hidden');
            document.getElementById('userRightsEmpty').classList.remove('hidden');
            return;
        }

        const espaces = espacesSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Charger toutes les accessRequests de cet utilisateur
        const reqSnap = await db.collection('accessRequests').where('userId', '==', uid).get();
        const accessMap = {};
        reqSnap.forEach(d => { accessMap[d.data().espaceId] = { requestId: d.id, ...d.data() }; });

        const list = document.getElementById('userRightsList');
        list.innerHTML = espaces.map((espace, idx) => {
            const access = accessMap[espace.id];
            const status = access?.status || 'none';
            const dateStr = (espace.dateDebut && espace.dateFin)
                ? `${formatDate(espace.dateDebut)} → ${formatDate(espace.dateFin)}`
                : espace.dateDebut ? formatDate(espace.dateDebut) : 'Dates à définir';

            return `
            <div style="
                display:flex;align-items:center;justify-content:space-between;
                padding:14px 0;
                ${idx < espaces.length - 1 ? 'border-bottom:1px solid var(--clr-surface-3);' : ''}
                gap:12px;flex-wrap:wrap;
            ">
                <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;">
                    <div style="
                        width:40px;height:40px;
                        background:linear-gradient(135deg,var(--clr-bg-dark),var(--clr-bg-mid));
                        border-radius:10px;display:flex;align-items:center;justify-content:center;
                        font-size:18px;flex-shrink:0;
                    ">${espace.emoji || '🏕️'}</div>
                    <div style="min-width:0;">
                        <div style="font-weight:700;font-size:0.9rem;color:var(--clr-text);">${espace.nom || 'Sans nom'}</div>
                        <div style="font-size:0.75rem;color:var(--clr-text-muted);">${dateStr}</div>
                    </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                    ${buildStatusBadge(status)}
                    ${buildRightsActionBtn(espace, access, status)}
                </div>
            </div>`;
        }).join('');

        document.getElementById('userRightsLoader').classList.add('hidden');
        list.classList.remove('hidden');

    } catch (err) {
        console.error('openUserRightsPanel:', err);
        document.getElementById('userRightsLoader').classList.add('hidden');
        showToast('Erreur lors du chargement des droits.', 'error');
    }
}

function buildStatusBadge(status) {
    const map = {
        'approved': '<span class="es-badge es-badge--approved"><i class="bi bi-check-circle"></i> Accordé</span>',
        'pending': '<span class="es-badge es-badge--pending"><i class="bi bi-hourglass-split"></i> En attente</span>',
        'refused': '<span class="es-badge es-badge--refused"><i class="bi bi-x-circle"></i> Refusé</span>',
        'none': '<span class="es-badge" style="background:var(--clr-surface-3);color:var(--clr-text-light)"><i class="bi bi-dash"></i> Aucune demande</span>',
    };
    return map[status] || map['none'];
}

function buildRightsActionBtn(espace, access, status) {
    const rId = access?.requestId || '';
    if (status === 'approved') {
        return `<button class="es-btn es-btn--sm es-btn--danger"
                        onclick="revokeAccess('${rId}', '${espace.id}', ${escapeHtml(JSON.stringify(espace.nom || ''))})"
                ><i class="bi bi-lock"></i> Révoquer</button>`;
    }
    if (status === 'none') {
        return `<button class="es-btn es-btn--sm es-btn--success"
                        onclick="grantAccess('${espace.id}', ${escapeHtml(JSON.stringify(espace.nom || ''))})"
                ><i class="bi bi-unlock"></i> Autoriser</button>`;
    }
    if (status === 'pending') {
        return `
            <button class="es-btn es-btn--sm es-btn--success"
                    onclick="reviewDemandeFromRights('${rId}', 'approved', '${espace.id}', ${escapeHtml(JSON.stringify(espace.nom || ''))})"
            ><i class="bi bi-check-lg"></i> Valider</button>
            <button class="es-btn es-btn--sm es-btn--danger"
                    onclick="reviewDemandeFromRights('${rId}', 'refused', '${espace.id}', ${escapeHtml(JSON.stringify(espace.nom || ''))})"
            ><i class="bi bi-x-lg"></i> Refuser</button>`;
    }
    if (status === 'refused') {
        return `<button class="es-btn es-btn--sm es-btn--success"
                        onclick="reviewDemandeFromRights('${rId}', 'approved', '${espace.id}', ${escapeHtml(JSON.stringify(espace.nom || ''))})"
                ><i class="bi bi-check-lg"></i> Autoriser quand même</button>`;
    }
    return '';
}

async function grantAccess(espaceId, espaceName) {
    if (!rightsUserId) return;
    try {
        await db.collection('accessRequests').doc(`${rightsUserId}_${espaceId}`).set({
            userId: rightsUserId,
            userEmail: document.getElementById('userRightsEmail').textContent || '',
            userName: rightsUserName || '',
            espaceId,
            espaceName,
            status: 'approved',
            grantedDirectly: true,
            requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentAdminUser.uid
        });
        showToast(`Accès accordé à "${espaceName}".`, 'success');
        openUserRightsPanel(rightsUserId, document.getElementById('userRightsEmail').textContent, rightsUserName);
    } catch (err) {
        console.error('grantAccess:', err);
        showToast('Erreur lors de l\'attribution.', 'error');
    }
}

async function revokeAccess(requestId, espaceId, espaceName) {
    try {
        await db.collection('accessRequests').doc(requestId).update({
            status: 'refused',
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentAdminUser.uid
        });
        showToast(`Accès révoqué pour "${espaceName}".`, 'default');
        openUserRightsPanel(rightsUserId, document.getElementById('userRightsEmail').textContent, rightsUserName);
    } catch (err) {
        console.error('revokeAccess:', err);
        showToast('Erreur lors de la révocation.', 'error');
    }
}

async function reviewDemandeFromRights(requestId, status, espaceId, espaceName) {
    try {
        await db.collection('accessRequests').doc(requestId).update({
            status,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            reviewedBy: currentAdminUser.uid
        });
        const msg = status === 'approved'
            ? `Accès accordé pour "${espaceName}".`
            : `Accès refusé pour "${espaceName}".`;
        showToast(msg, status === 'approved' ? 'success' : 'default');
        openUserRightsPanel(rightsUserId, document.getElementById('userRightsEmail').textContent, rightsUserName);
    } catch (err) {
        console.error('reviewDemandeFromRights:', err);
        showToast('Erreur lors de la mise à jour.', 'error');
    }
}

// ----------------------------------------------------------------
// GESTION DES GROUPES (Admin Panel)
// ----------------------------------------------------------------

async function loadAdminGroups(coloId) {
    if (!coloId) return;
    try {
        const snap = await db.collection('espaces').doc(coloId).collection('groups').orderBy('name').get();
        currentAdminGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Afficher/Cacher le champ groupe dans le formulaire participant
        const field = document.getElementById('fieldAdminParticipantGroup');
        if (field) {
            field.classList.toggle('hidden', currentAdminGroups.length === 0);
        }

        // Mettre à jour le select dans le formulaire participant
        const select = document.getElementById('pAdminGroup');
        if (select) {
            const val = select.value;
            select.innerHTML = '<option value="">-- Aucun groupe --</option>' +
                currentAdminGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
            select.value = val;
        }

        // Re-render le tableau pour la colonne groupe
        loadParticipantsAdmin(coloId);
    } catch (err) {
        console.error('loadAdminGroups error:', err);
    }
}

document.getElementById('btnManageGroupsAdmin')?.addEventListener('click', () => {
    renderGroupsNameListAdmin();
    openModal('overlayManageGroupsAdmin');
});

document.getElementById('btnCloseManageGroupsAdmin')?.addEventListener('click', () => closeModal('overlayManageGroupsAdmin'));
document.getElementById('btnFinishGroupsAdmin')?.addEventListener('click', () => closeModal('overlayManageGroupsAdmin'));

let editingAdminGroupId = null;

function renderGroupsNameListAdmin() {
    const listEl = document.getElementById('groupsNameListAdmin');
    if (!listEl) return;

    if (currentAdminGroups.length === 0) {
        listEl.innerHTML = '<div class="text-center text-muted" style="padding:15px;">Aucun groupe créé.</div>';
        return;
    }

    listEl.innerHTML = currentAdminGroups.map(g => {
        if (g.id === editingAdminGroupId) {
            return `
            <div class="es-anim-item" style="padding: 8px 12px; display:flex; gap:8px;">
                <input type="text" id="editGroupInputAdmin_${g.id}" class="es-input" style="flex:1; padding:4px 8px; font-size:0.9rem;" value="${escapeHtml(g.name)}" onkeydown="if(event.key==='Enter') saveEditedAdminGroupName('${g.id}')">
                <button class="es-btn es-btn--primary es-btn--sm" onclick="saveEditedAdminGroupName('${g.id}')" title="Enregistrer"><i class="bi bi-check-lg"></i></button>
                <button class="es-btn es-btn--secondary es-btn--sm" onclick="cancelEditAdminGroupName()" title="Annuler"><i class="bi bi-x-lg"></i></button>
            </div>`;
        } else {
            return `
            <div class="es-anim-item" style="padding: 8px 12px;">
                <div class="es-anim-item__info">
                    <div class="es-anim-item__name" style="font-size:0.9rem;">${escapeHtml(g.name)}</div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="es-btn es-btn--secondary es-btn--sm" onclick="setEditingAdminGroupId('${g.id}')" title="Modifier">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="es-btn es-btn--danger es-btn--sm" onclick="deleteAdminGroupName('${g.id}', ${escapeHtml(JSON.stringify(g.name))})" title="Supprimer">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </div>`;
        }
    }).join('');

    if (editingAdminGroupId) {
        setTimeout(() => {
            const input = document.getElementById(`editGroupInputAdmin_${editingAdminGroupId}`);
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
    }
}

document.getElementById('btnAddGroupNameAdmin')?.addEventListener('click', async () => {
    const input = document.getElementById('inputNewGroupNameAdmin');
    const name = input.value.trim();
    if (!name) return;

    try {
        await db.collection('espaces').doc(currentColoId).collection('groups').add({ name });
        input.value = '';
        await loadAdminGroups(currentColoId);
        renderGroupsNameListAdmin();
        showToast('Groupe créé.', 'success');
    } catch (err) {
        console.error('addGroupAdmin error:', err);
        showToast('Erreur lors de la création du groupe.', 'error');
    }
});

async function deleteAdminGroupName(id, name) {
    if (!confirm(`Supprimer le groupe "${name}" ?`)) return;

    try {
        await db.collection('espaces').doc(currentColoId).collection('groups').doc(id).delete();
        await loadAdminGroups(currentColoId);
        renderGroupsNameListAdmin();
        showToast('Groupe supprimé.', 'success');
    } catch (err) {
        console.error('deleteGroupAdmin error:', err);
        showToast('Erreur lors de la suppression.', 'error');
    }
}

function setEditingAdminGroupId(id) {
    editingAdminGroupId = id;
    renderGroupsNameListAdmin();
}

function cancelEditAdminGroupName() {
    editingAdminGroupId = null;
    renderGroupsNameListAdmin();
}

async function saveEditedAdminGroupName(id) {
    const input = document.getElementById(`editGroupInputAdmin_${id}`);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) return;
    
    const oldGroup = currentAdminGroups.find(x => x.id === id);
    if (!oldGroup || oldGroup.name === newName) {
        cancelEditAdminGroupName();
        return;
    }

    try {
        await db.collection('espaces').doc(currentColoId).collection('groups').doc(id).update({ name: newName });
        editingAdminGroupId = null;
        await loadAdminGroups(currentColoId);
        renderGroupsNameListAdmin();
        showToast('Groupe renommé.', 'success');
    } catch (err) {
        console.error('editGroupAdmin error:', err);
        showToast('Erreur lors du renommage.', 'error');
    }
}

function showAdminNote(note) {
    alert(note); // Utilisation simple pour l'admin, peut être amélioré avec une modale si nécessaire
}

// ----------------------------------------------------------------
// FIX / MIGRATION SCRIPT FOR ACCESS REQUESTS
// ----------------------------------------------------------------
async function migrateOldAccessRequests() {
    try {
        const snap = await db.collection('accessRequests').get();
        if (snap.empty) return;

        let migratedCount = 0;
        const batch = db.batch();

        snap.forEach(doc => {
            const data = doc.data();
            const expectedId = `${data.userId}_${data.espaceId}`;
            // Si l'ID actuel n'est pas userId_espaceId, on migre
            if (doc.id !== expectedId && data.userId && data.espaceId) {
                const newRef = db.collection('accessRequests').doc(expectedId);
                batch.set(newRef, data); // Créer nouveau
                batch.delete(doc.ref);   // Supprimer l'ancien
                migratedCount++;
            }
        });

        if (migratedCount > 0) {
            await batch.commit();
            console.log(`Migrated ${migratedCount} accessRequests to correctly formatted IDs.`);
        }
    } catch (e) {
        console.error("Migration error: ", e);
    }
}

// Lancement automatique à l'ouverture de la page admin (ou une seule fois)
setTimeout(migrateOldAccessRequests, 2000);

async function migrateDescriptionToOrganisme() {
    try {
        const snap = await db.collection('espaces').get();
        if (snap.empty) return;

        let migratedCount = 0;
        for (const doc of snap.docs) {
            const data = doc.data();
            if ('description' in data) {
                const org = data.organisme || data.description || '';
                await db.collection('espaces').doc(doc.id).update({
                    organisme: org,
                    description: firebase.firestore.FieldValue.delete()
                });
                migratedCount++;
            }
        }

        if (migratedCount > 0) {
            console.log(`Migrated ${migratedCount} spaces to remove description and use organisme.`);
        }
    } catch (e) {
        console.error("Migration description to organisme error: ", e);
    }
}

setTimeout(migrateDescriptionToOrganisme, 3000);

// Initialisation du formulaire de création/modification de colonie
ColoFormManager.init('admin', loadColos);

window.filterAdminColos = function(type) {
    const btn = document.getElementById(type === 'all' ? 'statCardTotal' : type === 'formation' ? 'statCardFormation' : 'statCardColo');
    let targetType = type;
    if (btn && btn.classList.contains('active') && type !== 'all') {
        targetType = 'all';
    }

    const cards = document.querySelectorAll('#colosAdminList .es-colo-admin-card');
    cards.forEach(card => {
        if (targetType === 'all') {
            card.classList.remove('es-card--filtered-out');
        } else if (card.dataset.type === targetType) {
            card.classList.remove('es-card--filtered-out');
        } else {
            card.classList.add('es-card--filtered-out');
        }
    });

    const btnTotal = document.getElementById('statCardTotal');
    const btnFormation = document.getElementById('statCardFormation');
    const btnColo = document.getElementById('statCardColo');

    btnTotal?.classList.toggle('active', targetType === 'all');
    btnFormation?.classList.toggle('active', targetType === 'formation');
    btnColo?.classList.toggle('active', targetType === 'colo');
};

