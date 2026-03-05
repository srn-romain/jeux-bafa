/* ================================================================
   ESPACE-ADMIN.JS — Panneau d'administration
   Accès réservé au rôle "admin"
   ================================================================ */

// db, auth et googleProvider sont déclarés dans firebase-config.js

let currentAdminUser = null;
let currentColoId = null; // Pour la gestion des participants
let deleteTarget = null; // { type: 'colo'|'participant', id, coloId? }

// ----------------------------------------------------------------
// AUTH STATE — Vérifier le rôle admin
// ----------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }

    const role = await getUserRole(user.uid);
    document.getElementById('adminLoader')?.classList.add('hidden');

    if (role !== 'admin') {
        document.getElementById('accessDenied')?.classList.remove('hidden');
        return;
    }

    currentAdminUser = user;
    updateTopbarUser(user, role);
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
            ['colos', 'demandes', 'utilisateurs'].forEach(t => {
                document.getElementById(`tab-${t}`)?.classList.toggle('hidden', t !== tab);
            });
            // Charger les données de l'onglet sélectionné à la demande
            if (tab === 'demandes') loadDemandes();
            if (tab === 'utilisateurs') loadUsers();
        });
    });
}

// ----------------------------------------------------------------
// BADGE DEMANDES EN ATTENTE (temps réel dès l'init)
// ----------------------------------------------------------------
let pendingBadgeUnsub = null;

function loadPendingBadge() {
    if (pendingBadgeUnsub) pendingBadgeUnsub(); // détacher l'ancien listener

    const badge = document.getElementById('badgePending');
    if (!badge) return;

    // Écoute en temps réel : se met à jour automatiquement
    pendingBadgeUnsub = db.collection('accessRequests')
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
        const snap = await db.collection('espaces').orderBy('createdAt', 'desc').get();
        loader?.classList.add('hidden');

        if (snap.empty) {
            empty?.classList.remove('hidden');
            return;
        }

        for (const doc of snap.docs) {
            const colo = { id: doc.id, ...doc.data() };
            // Compter participants
            let nbP = 0;
            try {
                const pSnap = await db.collection('espaces').doc(colo.id).collection('participants').get();
                nbP = pSnap.size;
            } catch (_) { }
            list.appendChild(buildColoAdminCard(colo, nbP));
        }
    } catch (err) {
        loader?.classList.add('hidden');
        console.error('loadColos admin:', err);
        showToast('Erreur lors du chargement des espaces.', 'error');
    }
}

function buildColoAdminCard(colo, nbParticipants) {
    const div = document.createElement('div');
    div.className = 'es-colo-admin-card';
    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : 'Dates non définies';

    div.innerHTML = `
        <div class="es-colo-admin-card__header">
            <div>
                <div class="es-colo-admin-card__title">${colo.emoji || '🏕️'} ${colo.nom || 'Sans nom'}</div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.5);margin-top:2px;">${dateStr} · ${nbParticipants} participant${nbParticipants !== 1 ? 's' : ''}</div>
            </div>
            <div class="es-colo-admin-card__actions">
                <button class="es-btn es-btn--sm" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.7);border:1px solid rgba(255,255,255,0.15);"
                        onclick="openParticipantsModal('${colo.id}', '${escapeHtml(colo.nom || '')}')">
                    <i class="bi bi-people"></i> Participants
                </button>
                <button class="es-btn es-btn--sm" style="background:rgba(166,216,102,0.12);color:#a6d866;border:1px solid rgba(166,216,102,0.25);"
                        onclick="openEditColo('${colo.id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="es-btn es-btn--sm es-btn--danger"
                        onclick="confirmDeleteColo('${colo.id}', '${escapeHtml(colo.nom || '')}')">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
        </div>
        ${colo.description ? `<div class="es-colo-admin-card__body" style="font-size:0.87rem;color:var(--clr-text-muted);">${colo.description}</div>` : ''}
    `;
    return div;
}

function escapeHtml(str) {
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

// ----------------------------------------------------------------
// NOUVEAU / MODIFIER COLO
// ----------------------------------------------------------------
document.getElementById('btnNewColo')?.addEventListener('click', () => openColoForm());

function openColoForm(colo = null) {
    document.getElementById('coloId').value = colo?.id || '';
    document.getElementById('coloNom').value = colo?.nom || '';
    document.getElementById('coloDesc').value = colo?.description || '';
    document.getElementById('coloDateDebut').value = colo?.dateDebut || '';
    document.getElementById('coloDateFin').value = colo?.dateFin || '';
    document.getElementById('coloDriveId').value = colo?.driveId || '';
    document.getElementById('coloEmoji').value = colo?.emoji || '🏕️';

    document.getElementById('coloFormTitle').textContent = colo ? 'Modifier la colonie' : 'Nouvelle colonie';
    document.getElementById('coloFormError')?.classList.add('hidden');
    openModal('overlayColoForm');
}

async function openEditColo(id) {
    try {
        const doc = await db.collection('espaces').doc(id).get();
        if (doc.exists) openColoForm({ id: doc.id, ...doc.data() });
    } catch (err) {
        showToast('Erreur lors du chargement.', 'error');
    }
}

document.getElementById('btnCloseColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));
document.getElementById('btnCancelColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));

document.getElementById('btnSaveColoForm')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveColoForm');
    const errEl = document.getElementById('coloFormError');
    const errMsg = document.getElementById('coloFormErrorMsg');

    const nom = document.getElementById('coloNom')?.value.trim();
    if (!nom) {
        errMsg.textContent = 'Le nom de la colonie est obligatoire.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    btnLoading(btn, true);

    const data = {
        nom,
        description: document.getElementById('coloDesc')?.value.trim() || '',
        dateDebut: document.getElementById('coloDateDebut')?.value || '',
        dateFin: document.getElementById('coloDateFin')?.value || '',
        driveId: document.getElementById('coloDriveId')?.value.trim() || '',
        emoji: document.getElementById('coloEmoji')?.value.trim() || '🏕️',
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const coloId = document.getElementById('coloId')?.value;

    try {
        if (coloId) {
            await db.collection('espaces').doc(coloId).update(data);
            showToast('Colonie mise à jour.', 'success');
        } else {
            data.createdBy = currentAdminUser.uid;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('espaces').add(data);
            showToast('Colonie créée !', 'success');
        }
        closeModal('overlayColoForm');
        loadColos();
    } catch (err) {
        console.error('saveColo:', err);
        errMsg.textContent = 'Erreur lors de l\'enregistrement.';
        errEl.classList.remove('hidden');
    } finally {
        btnLoading(btn, false);
    }
});

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

        } else if (deleteTarget.type === 'participant') {
            await db.collection('espaces').doc(deleteTarget.coloId).collection('participants').doc(deleteTarget.id).delete();
            showToast('Participant supprimé.', 'success');
            closeModal('overlayConfirmDelete');
            loadParticipantsAdmin(deleteTarget.coloId);
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
// GESTION PARTICIPANTS (modal admin)
// ================================================================

let adminEditingParticipantId = null;

async function openParticipantsModal(coloId, coloNom) {
    currentColoId = coloId;
    document.getElementById('participantsAdminTitle').textContent = `Participants – ${coloNom}`;
    openModal('overlayParticipantsAdmin');
    loadParticipantsAdmin(coloId);
}

async function loadParticipantsAdmin(coloId) {
    const tbody = document.getElementById('participantsAdminTbody');
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:20px;">Chargement…</td></tr>`;

    try {
        const snap = await db.collection('espaces').doc(coloId).collection('participants').get();
        const participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (participants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:20px;">Aucun participant.</td></tr>`;
            return;
        }

        tbody.innerHTML = participants.map(p => `
            <tr>
                <td><strong>${p.prenom || ''}</strong></td>
                <td>${p.nom || ''}</td>
                <td><span class="es-pill es-pill--age">${p.age} ans</span></td>
                <td><span class="es-pill ${p.genre === 'masculin' ? 'es-pill--m' : 'es-pill--f'}">
                    ${p.genre === 'masculin' ? '♂' : '♀'}
                </span></td>
                <td class="es-table__actions">
                    <button class="es-btn es-btn--ghost es-btn--sm" onclick="editParticipantAdmin('${p.id}', '${escapeHtml(JSON.stringify(p))}')">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="es-btn es-btn--danger es-btn--sm" onclick="confirmDeleteParticipant('${p.id}', '${escapeHtml(p.prenom + ' ' + p.nom)}')">
                        <i class="bi bi-trash3"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('loadParticipantsAdmin:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="text-center" style="color:var(--clr-danger);padding:20px;">Erreur de chargement.</td></tr>`;
    }
}

document.getElementById('btnCloseParticipantsAdmin')?.addEventListener('click', () => closeModal('overlayParticipantsAdmin'));
document.getElementById('btnCloseParticipantsAdmin2')?.addEventListener('click', () => closeModal('overlayParticipantsAdmin'));

document.getElementById('btnAddParticipantAdmin')?.addEventListener('click', () => {
    adminEditingParticipantId = null;
    document.getElementById('participantFormTitle').textContent = 'Ajouter un participant';
    document.getElementById('participantFormAdmin')?.reset();
    document.getElementById('pAdminError')?.classList.add('hidden');
    openModal('overlayParticipantForm');
});

function editParticipantAdmin(id, pJson) {
    try {
        const p = JSON.parse(pJson.replace(/&quot;/g, '"'));
        adminEditingParticipantId = id;
        document.getElementById('participantFormTitle').textContent = 'Modifier le participant';
        document.getElementById('pAdminPrenom').value = p.prenom || '';
        document.getElementById('pAdminNom').value = p.nom || '';
        document.getElementById('pAdminAge').value = p.age || '';
        document.getElementById('pAdminGenre').value = p.genre || 'feminin';
        document.getElementById('pAdminError')?.classList.add('hidden');
        openModal('overlayParticipantForm');
    } catch (_) { }
}

function confirmDeleteParticipant(id, nom) {
    deleteTarget = { type: 'participant', id, coloId: currentColoId };
    document.getElementById('confirmDeleteText').textContent = `Supprimer le participant "${nom}" ? Action irréversible.`;
    openModal('overlayConfirmDelete');
}

document.getElementById('btnCloseParticipantForm')?.addEventListener('click', () => closeModal('overlayParticipantForm'));
document.getElementById('btnCancelParticipantForm')?.addEventListener('click', () => closeModal('overlayParticipantForm'));

document.getElementById('btnSaveParticipantForm')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveParticipantForm');
    const errEl = document.getElementById('pAdminError');
    const errMsg = document.getElementById('pAdminErrorMsg');

    const prenom = document.getElementById('pAdminPrenom')?.value.trim();
    const nom = document.getElementById('pAdminNom')?.value.trim();
    const age = parseInt(document.getElementById('pAdminAge')?.value);
    const genre = document.getElementById('pAdminGenre')?.value;

    if (!prenom || !nom || isNaN(age)) {
        errMsg.textContent = 'Prénom, nom et âge sont obligatoires.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const colRef = db.collection('espaces').doc(currentColoId).collection('participants');
        const data = { prenom, nom, age, genre };

        if (adminEditingParticipantId) {
            await colRef.doc(adminEditingParticipantId).update(data);
            showToast('Participant modifié.', 'success');
        } else {
            await colRef.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            showToast('Participant ajouté.', 'success');
        }

        closeModal('overlayParticipantForm');
        loadParticipantsAdmin(currentColoId);
    } catch (err) {
        console.error('saveParticipantAdmin:', err);
        errMsg.textContent = 'Erreur lors de l\'enregistrement.';
        errEl.classList.remove('hidden');
    } finally {
        btnLoading(btn, false);
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
                <td>${d.espaceName || d.espaceId || ''}</td>
                <td style="font-size:0.82rem;color:var(--clr-text-muted);">
                    ${d.requestedAt ? new Date(d.requestedAt.toDate()).toLocaleDateString('fr-FR') : '–'}
                </td>
                <td>
                    <span class="es-badge ${d.status === 'pending' ? 'es-badge--pending' : d.status === 'approved' ? 'es-badge--approved' : 'es-badge--refused'}">
                        ${d.status === 'pending' ? '⏳ En attente' : d.status === 'approved' ? '✅ Validé' : '❌ Refusé'}
                    </span>
                </td>
                <td class="es-table__actions">
                    ${d.status === 'pending' ? `
                        <button class="es-btn es-btn--success es-btn--sm" onclick="reviewDemande('${d.id}', 'approved')">
                            <i class="bi bi-check-lg"></i> Valider
                        </button>
                        <button class="es-btn es-btn--danger es-btn--sm" onclick="reviewDemande('${d.id}', 'refused')">
                            <i class="bi bi-x-lg"></i> Refuser
                        </button>
                    ` : `<button class="es-btn es-btn--ghost es-btn--sm" onclick="reviewDemande('${d.id}', 'pending')">Remettre en attente</button>`}
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
                <td>${u.displayName || '<span style="color:var(--clr-text-light)">–</span>'}</td>
                <td>
                    <span class="es-badge ${u.role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}">
                        ${u.role === 'admin' ? '👑 Admin' : '🎨 Anim'}
                    </span>
                </td>
                <td class="es-table__actions">
                    ${u.id !== currentAdminUser?.uid ? `
                        <button class="es-btn es-btn--sm"
                                style="color:var(--clr-info);border:1.5px solid rgba(41,128,185,0.3);background:rgba(41,128,185,0.08);"
                                onclick="openUserRightsPanel('${u.id}', '${escapeHtml(u.email || '')}', '${escapeHtml(u.displayName || u.email || '')}')"
                        >
                            <i class="bi bi-shield-check"></i> Gérer droits
                        </button>
                    ` : '<span style="font-size:0.78rem;color:var(--clr-text-light)">Vous</span>'}
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
        const espacesSnap = await db.collection('espaces').orderBy('createdAt', 'desc').get();

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
                        onclick="revokeAccess('${rId}', '${espace.id}', '${escapeHtml(espace.nom || '')}')"
                ><i class="bi bi-lock"></i> Révoquer</button>`;
    }
    if (status === 'none') {
        return `<button class="es-btn es-btn--sm es-btn--success"
                        onclick="grantAccess('${espace.id}', '${escapeHtml(espace.nom || '')}')"
                ><i class="bi bi-unlock"></i> Autoriser</button>`;
    }
    if (status === 'pending') {
        return `
            <button class="es-btn es-btn--sm es-btn--success"
                    onclick="reviewDemandeFromRights('${rId}', 'approved', '${espace.id}', '${escapeHtml(espace.nom || '')}')"
            ><i class="bi bi-check-lg"></i> Valider</button>
            <button class="es-btn es-btn--sm es-btn--danger"
                    onclick="reviewDemandeFromRights('${rId}', 'refused', '${espace.id}', '${escapeHtml(espace.nom || '')}')"
            ><i class="bi bi-x-lg"></i> Refuser</button>`;
    }
    if (status === 'refused') {
        return `<button class="es-btn es-btn--sm es-btn--success"
                        onclick="reviewDemandeFromRights('${rId}', 'approved', '${espace.id}', '${escapeHtml(espace.nom || '')}')"
                ><i class="bi bi-check-lg"></i> Autoriser quand même</button>`;
    }
    return '';
}

async function grantAccess(espaceId, espaceName) {
    if (!rightsUserId) return;
    try {
        await db.collection('accessRequests').add({
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
