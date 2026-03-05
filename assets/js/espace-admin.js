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
                        <button class="es-btn es-btn--sm es-btn--ghost" onclick="toggleUserRole('${u.id}', '${u.role}')">
                            <i class="bi bi-arrow-left-right"></i>
                            Passer ${u.role === 'admin' ? 'Anim' : 'Admin'}
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

async function toggleUserRole(uid, currentRole) {
    const newRole = currentRole === 'admin' ? 'anim' : 'admin';
    if (!confirm(`Changer ce compte en "${newRole}" ?`)) return;

    try {
        await db.collection('users').doc(uid).update({ role: newRole });
        showToast(`Rôle mis à jour : ${newRole}.`, 'success');
        loadUsers();
    } catch (err) {
        console.error('toggleUserRole:', err);
        showToast('Erreur lors de la mise à jour.', 'error');
    }
}
