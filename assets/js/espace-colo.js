/* ================================================================
   ESPACE-COLO.JS — Vue d'une colonie : groupes + participants
   URL : espace.html?id=<espaceId>
   ================================================================ */

// db, auth et googleProvider sont déclarés dans firebase-config.js

// Récupérer l'ID de la colo depuis l'URL
const urlParams = new URLSearchParams(window.location.search);
const espaceId = urlParams.get('id');

let currentUser = null;
let currentRole = null;
let currentLocked = true;
let participants = [];

// ----------------------------------------------------------------
// AUTH STATE
// ----------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const userDoc = await db.collection('users').doc(user.uid).get();
    if (!userDoc.exists) { auth.signOut(); window.location.href = 'index.html'; return; }
    const role = userDoc.data().role;
    const userData = userDoc.data();

    // Mettre à jour lastLogin
    db.collection('users').doc(user.uid).update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });

    currentUser = user;
    currentRole = role;
    updateTopbarUser(user, role, userData);

    if (!espaceId) {
        showAccessDenied('❓', 'Espace introuvable', 'Aucun identifiant d\'espace fourni.');
        return;
    }

    // Vérifier si l'espace existe
    try {
        const espaceDoc = await db.collection('espaces').doc(espaceId).get();
        if (!espaceDoc.exists) {
            showAccessDenied('❓', 'Espace introuvable', 'Cet espace n\'existe pas ou a été supprimé.');
            return;
        }

        const colo = { id: espaceDoc.id, ...espaceDoc.data() };

        // Admin → accès direct
        if (role === 'admin') {
            initColoContent(colo, role);
            return;
        }

        // Anim → vérifier le statut d'accès
        const reqSnap = await db.collection('accessRequests')
            .where('userId', '==', user.uid)
            .where('espaceId', '==', espaceId)
            .get();

        if (reqSnap.empty) {
            showAccessDenied('🔒', 'Accès non demandé', 'Tu n\'as pas encore demandé l\'accès à cet espace.');
            return;
        }

        const req = reqSnap.docs[0].data();
        if (req.status === 'pending') {
            showAccessDenied('⏳', 'Demande en attente', 'Ta demande d\'accès est en cours de validation par le directeur.', true);
            return;
        }
        if (req.status === 'refused') {
            showAccessDenied('🚫', 'Accès refusé', 'Ton accès à cet espace a été refusé. Contacte le directeur.', false, true);
            return;
        }

        // approved
        initColoContent(colo, role);

    } catch (err) {
        console.error('Erreur vérification accès:', err);
        showAccessDenied('⚠️', 'Erreur', 'Impossible de vérifier tes droits d\'accès.');
    }
});

// ----------------------------------------------------------------
// AFFICHER LE MESSAGE DE REFUS
// ----------------------------------------------------------------
function showAccessDenied(icon, title, text, isPending = false, isRefused = false) {
    document.getElementById('pageLoader').classList.add('hidden');
    document.getElementById('coloContent').classList.add('hidden');
    document.getElementById('accessDenied').classList.remove('hidden');
    document.getElementById('deniedIcon').textContent = icon;
    document.getElementById('deniedTitle').textContent = title;
    document.getElementById('deniedText').textContent = text;
}

// ----------------------------------------------------------------
// INITIALISER LE CONTENU DE LA COLO
// ----------------------------------------------------------------
function initColoContent(colo, role) {
    document.getElementById('pageLoader').classList.add('hidden');
    document.getElementById('accessDenied').classList.add('hidden');
    document.getElementById('coloContent').classList.remove('hidden');

    // Remplir les infos
    document.getElementById('coloNameTopbar').textContent = colo.nom || 'Colo';
    document.getElementById('coloBreadcrumb').textContent = colo.nom || 'Colo';
    document.getElementById('coloTitle').textContent = colo.nom || 'Colo';
    document.title = `${colo.nom || 'Colo'} – Espace Anim`;

    const dateStr = (colo.dateDebut && colo.dateFin)
        ? `${formatDate(colo.dateDebut)} → ${formatDate(colo.dateFin)}`
        : '';
    document.getElementById('coloDates').textContent = dateStr;

    // Drive
    if (colo.driveId) {
        const driveBtn = document.getElementById('driveLinkBtn');
        driveBtn.href = `https://drive.google.com/drive/folders/${colo.driveId}`;
        driveBtn.classList.remove('hidden');
    }

    // Gestion du verrou participants
    currentLocked = colo.participantsLocked !== false; // true par défaut

    if (role === 'admin') {
        // L'admin voit et interagit toujours
        document.getElementById('btnAddParticipant')?.classList.remove('hidden');
        document.getElementById('btnExportParticipantsColo')?.classList.remove('hidden');
        document.getElementById('btnImportParticipantsColo')?.classList.remove('hidden');
        document.querySelectorAll('.anim-can').forEach(el => el.classList.remove('hidden'));
    } else if (role === 'anim') {
        // L'anim voit les boutons, mais disabled si verrouillé
        const addBtn = document.getElementById('btnAddParticipant');
        document.querySelectorAll('.anim-can').forEach(el => el.classList.remove('hidden'));
        if (currentLocked) {
            addBtn?.setAttribute('disabled', 'true');
            addBtn?.setAttribute('title', 'Le directeur a verrouillé la gestion des participants.');
            addBtn?.style.setProperty('opacity', '0.45');
            addBtn?.style.setProperty('cursor', 'not-allowed');
        } else {
            addBtn?.removeAttribute('disabled');
            addBtn?.classList.remove('hidden');
        }
    }

    // Charger les participants
    loadParticipants(colo.id, role);
    // Charger les animateurs
    loadAnimateurs(colo.id);

    // Onglets
    initTabs();
}

// ----------------------------------------------------------------
// ONGLETS INTERNES
// ----------------------------------------------------------------
function initTabs() {
    document.querySelectorAll('.es-nav-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.es-nav-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.getAttribute('data-tab');
            document.getElementById('tab-groupes').classList.toggle('hidden', tab !== 'groupes');
            document.getElementById('tab-participants').classList.toggle('hidden', tab !== 'participants');
            document.getElementById('tab-animateurs').classList.toggle('hidden', tab !== 'animateurs');
        });
    });
}

// ----------------------------------------------------------------
// CHARGER LES PARTICIPANTS
// ----------------------------------------------------------------
async function loadParticipants(coloId, role) {
    try {
        const snap = await db.collection('espaces').doc(coloId).collection('participants').get();
        participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        renderParticipantsTable(role);
        buildAgeGroupCheckboxes();
        updateStats();
        regenerateGroups();
    } catch (err) {
        console.error('loadParticipants:', err);
        showToast('Erreur lors du chargement des participants.', 'error');
    }
}

// ----------------------------------------------------------------
// TABLEAU DES PARTICIPANTS
// ----------------------------------------------------------------
function renderParticipantsTable(role) {
    const tbody = document.getElementById('participantsTbody');
    if (!tbody) return;

    // Bannière de verrou pour les anims
    const lockBanner = document.getElementById('lockBanner');
    if (lockBanner) {
        if (role === 'anim' && currentLocked) {
            lockBanner.classList.remove('hidden');
        } else {
            lockBanner.classList.add('hidden');
        }
    }

    if (participants.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:24px;">Aucun participant enregistré.</td></tr>`;
        return;
    }

    const canEdit = role === 'admin' || (role === 'anim' && !currentLocked);

    tbody.innerHTML = participants.map(p => `
        <tr>
            <td><strong>${p.prenom || ''}</strong></td>
            <td>${p.nom || ''}</td>
            <td><span class="es-pill es-pill--age">${p.age} ans</span></td>
            <td>
                <span class="es-pill ${p.genre === 'masculin' ? 'es-pill--m' : 'es-pill--f'}">
                    ${p.genre === 'masculin' ? '♂ Garçon' : '♀ Fille'}
                </span>
            </td>
            <td class="es-table__actions">
                <button class="es-btn es-btn--ghost es-btn--sm"
                        onclick="${canEdit ? `editParticipant('${p.id}')` : 'void(0)'}"
                        ${!canEdit ? 'disabled title="Verrouillé par le directeur"' : 'title="Modifier"'}
                        style="${!canEdit && role === 'anim' ? 'opacity:0.4;cursor:not-allowed;' : ''}">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="es-btn es-btn--danger es-btn--sm" 
                        onclick="${canEdit ? `deleteParticipant('${p.id}', '${escapeHtml(p.prenom)} ${escapeHtml(p.nom)}')` : 'void(0)'}"
                        ${!canEdit ? 'disabled title="Verrouillé par le directeur"' : 'title="Supprimer"'}
                        style="${!canEdit && role === 'anim' ? 'opacity:0.4;cursor:not-allowed;' : ''}">
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

// ----------------------------------------------------------------
// CASES À COCHER DES ÂGES (générées dynamiquement)
// ----------------------------------------------------------------
function buildAgeGroupCheckboxes() {
    const ages = [...new Set(participants.map(p => p.age))].sort((a, b) => a - b);
    const wrap = document.getElementById('ageGroupsWrap');
    if (!wrap) return;

    if (ages.length === 0) {
        wrap.innerHTML = '<span class="text-muted" style="font-size:0.83rem;">Aucun participant</span>';
        return;
    }

    wrap.innerHTML = ages.map(age => `
        <label class="es-checkbox-label">
            <input type="checkbox" name="ageGroups" value="${age}" checked> ${age} ans
        </label>
    `).join('');

    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => { updateStats(); regenerateGroups(); });
    });
}

// ================================================================
// SYSTÈME DE GROUPES
// ================================================================

function getSelectedFilters() {
    const selectedAges = Array.from(document.querySelectorAll('input[name="ageGroups"]:checked'))
        .map(cb => parseInt(cb.value));
    const selectedGenders = Array.from(document.querySelectorAll('input[name="genderSelection"]:checked'))
        .map(cb => cb.value);
    return { selectedAges, selectedGenders };
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function distributeEvenly(list, groups) {
    list.forEach(p => {
        groups.sort((a, b) => a.length - b.length);
        groups[0].push(p);
    });
}

function createBalancedGroups() {
    const groupCount = parseInt(document.getElementById('groupCount')?.value || 3);
    const balanceMode = document.getElementById('balanceMode')?.value || 'both';
    const { selectedAges, selectedGenders } = getSelectedFilters();

    let filtered = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );

    const groups = Array.from({ length: groupCount }, () => []);

    if (balanceMode === 'gender') {
        distributeEvenly(shuffleArray(filtered.filter(p => p.genre === 'masculin')), groups);
        distributeEvenly(shuffleArray(filtered.filter(p => p.genre === 'feminin')), groups);
    } else if (balanceMode === 'age') {
        const ages = [...new Set(filtered.map(p => p.age))];
        ages.forEach(age => distributeEvenly(shuffleArray(filtered.filter(p => p.age === age)), groups));
    } else if (balanceMode === 'both') {
        const ages = [...new Set(filtered.map(p => p.age))];
        ages.forEach(age => {
            selectedGenders.forEach(genre => {
                const cat = filtered.filter(p => p.age === age && p.genre === genre);
                if (cat.length > 0) distributeEvenly(shuffleArray(cat), groups);
            });
        });
    } else {
        distributeEvenly(shuffleArray(filtered), groups);
    }

    return groups.map(g => shuffleArray(g));
}

function displayGroups(groups) {
    const container = document.getElementById('groupsContainer');
    if (!container) return;

    if (groups.every(g => g.length === 0)) {
        container.innerHTML = `
            <div class="es-empty" style="grid-column:1/-1">
                <div class="es-empty__icon">👥</div>
                <div class="es-empty__title">Aucun participant</div>
                <p class="es-empty__text">Ajuste les filtres ou ajoute des participants.</p>
            </div>`;
        return;
    }

    container.innerHTML = groups.filter(g => g.length > 0).map((group, i) => {
        const boys = group.filter(p => p.genre === 'masculin').length;
        const girls = group.filter(p => p.genre === 'feminin').length;
        const avgAge = group.length > 0
            ? (group.reduce((s, p) => s + p.age, 0) / group.length).toFixed(1)
            : '-';

        return `
        <div class="es-group-card">
            <div class="es-group-card__header">
                Groupe ${i + 1}
                <span style="font-weight:400;color:var(--clr-text-muted);font-size:0.83rem;margin-left:8px;">
                    ${group.length} jeunes · ${boys}♂ ${girls}♀ · moy. ${avgAge} ans
                </span>
            </div>
            <ul class="es-group-card__list">
                ${group.map(p => `
                    <li class="es-participant">
                        <span class="es-participant__name">
                            ${p.prenom} <span>${p.nom}</span>
                        </span>
                        <div class="es-participant__info">
                            <span class="es-pill es-pill--age">${p.age} ans</span>
                            <span class="es-pill ${p.genre === 'masculin' ? 'es-pill--m' : 'es-pill--f'}">
                                ${p.genre === 'masculin' ? '♂' : '♀'}
                            </span>
                        </div>
                    </li>
                `).join('')}
            </ul>
        </div>`;
    }).join('');
}

function updateStats() {
    const { selectedAges, selectedGenders } = getSelectedFilters();
    const filtered = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );
    const boys = filtered.filter(p => p.genre === 'masculin').length;
    const girls = filtered.filter(p => p.genre === 'feminin').length;
    const avg = filtered.length > 0
        ? (filtered.reduce((s, p) => s + p.age, 0) / filtered.length).toFixed(1).replace('.', ',')
        : '–';

    document.getElementById('statTotal').textContent = filtered.length;
    document.getElementById('statBoys').textContent = boys;
    document.getElementById('statGirls').textContent = girls;
    document.getElementById('statAge').textContent = avg;
}

function regenerateGroups() {
    const groups = createBalancedGroups();
    displayGroups(groups);
}

// Listener sur les selects
document.getElementById('groupCount')?.addEventListener('change', regenerateGroups);
document.getElementById('balanceMode')?.addEventListener('change', regenerateGroups);
document.querySelectorAll('input[name="genderSelection"]').forEach(cb => {
    cb.addEventListener('change', () => { updateStats(); regenerateGroups(); });
});

// ================================================================
// CRUD PARTICIPANTS (admin seulement)
// ================================================================

let editingParticipantId = null;

document.getElementById('btnAddParticipant')?.addEventListener('click', () => {
    editingParticipantId = null;
    document.getElementById('participantModalTitle').textContent = 'Ajouter un participant';
    document.getElementById('participantForm')?.reset();
    document.getElementById('participantError')?.classList.add('hidden');
    openModal('overlayParticipant');
});

function editParticipant(id) {
    const p = participants.find(x => x.id === id);
    if (!p) return;
    editingParticipantId = id;
    document.getElementById('participantModalTitle').textContent = 'Modifier le participant';
    document.getElementById('pPrenom').value = p.prenom || '';
    document.getElementById('pNom').value = p.nom || '';
    document.getElementById('pAge').value = p.age || '';
    document.getElementById('pGenre').value = p.genre || 'feminin';
    document.getElementById('participantError')?.classList.add('hidden');
    openModal('overlayParticipant');
}

document.getElementById('btnCloseParticipant')?.addEventListener('click', () => closeModal('overlayParticipant'));
document.getElementById('btnCancelParticipant')?.addEventListener('click', () => closeModal('overlayParticipant'));

document.getElementById('btnSaveParticipant')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveParticipant');
    const errEl = document.getElementById('participantError');
    const errMsg = document.getElementById('participantErrorMsg');

    const prenom = document.getElementById('pPrenom')?.value.trim();
    const nom = document.getElementById('pNom')?.value.trim();
    const age = parseInt(document.getElementById('pAge')?.value);
    const genre = document.getElementById('pGenre')?.value;

    if (!prenom || !nom || isNaN(age)) {
        errMsg.textContent = 'Prénom, nom et âge sont obligatoires.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const data = { prenom, nom, age, genre };
        const colRef = db.collection('espaces').doc(espaceId).collection('participants');

        if (editingParticipantId) {
            await colRef.doc(editingParticipantId).update(data);
            showToast('Participant modifié.', 'success');
        } else {
            await colRef.add({ ...data, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            showToast('Participant ajouté.', 'success');
        }

        closeModal('overlayParticipant');
        await loadParticipants(espaceId, currentRole);

    } catch (err) {
        console.error('saveParticipant:', err);
        errMsg.textContent = 'Erreur lors de l\'enregistrement.';
        errEl.classList.remove('hidden');
    } finally {
        btnLoading(btn, false);
    }
});

async function deleteParticipant(id, nom) {
    if (!confirm(`Supprimer ${nom} ? Cette action est irréversible.`)) return;
    try {
        await db.collection('espaces').doc(espaceId).collection('participants').doc(id).delete();
        showToast('Participant supprimé.', 'success');
        await loadParticipants(espaceId, currentRole);
    } catch (err) {
        console.error('deleteParticipant:', err);
        showToast('Erreur lors de la suppression.', 'error');
    }
}

// ----------------------------------------------------------------
// IMPORT / EXPORT JSON (Colo)
// ----------------------------------------------------------------

document.getElementById('btnExportParticipantsColo')?.addEventListener('click', async () => {
    if (!espaceId) return;
    const coloDoc = await db.collection('espaces').doc(espaceId).get();
    const coloNom = coloDoc.exists ? (coloDoc.data().nom || 'Colo') : 'Colo';
    exportParticipantsColo(espaceId, coloNom);
});

async function exportParticipantsColo(coloId, coloNom) {
    try {
        const snap = await db.collection('espaces').doc(coloId).collection('participants')
            .orderBy('nom', 'asc').get();
        const pts = snap.docs.map(d => {
            const data = d.data();
            return {
                prenom: data.prenom,
                nom: data.nom,
                age: data.age,
                genre: data.genre
            };
        });

        const exportData = {
            coloId,
            coloNom,
            exportDate: new Date().toISOString(),
            participants: pts
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `participants_${coloNom.replace(/\s+/g, '_').toLowerCase()}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast('Export réussi !', 'success');
    } catch (err) {
        console.error('export error:', err);
        showToast("Erreur lors de l'export.", 'error');
    }
}

document.getElementById('btnImportParticipantsColo')?.addEventListener('click', () => {
    document.getElementById('inputImportParticipantsColo')?.click();
});

document.getElementById('inputImportParticipantsColo')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleImportJSONColo(file);
});

async function handleImportJSONColo(file) {
    if (!file || !espaceId) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const list = Array.isArray(data) ? data : data.participants;

            if (!list || !Array.isArray(list)) {
                throw new Error("Format invalide");
            }

            if (!confirm(`Importer ${list.length} participants dans cette colonie ?`)) {
                document.getElementById('inputImportParticipantsColo').value = '';
                return;
            }

            const colRef = db.collection('espaces').doc(espaceId).collection('participants');
            let added = 0;
            let errors = 0;

            for (const p of list) {
                if (p.prenom && p.nom && p.age) {
                    await colRef.add({
                        prenom: p.prenom.trim(),
                        nom: p.nom.trim(),
                        age: parseInt(p.age),
                        genre: p.genre || 'feminin',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    added++;
                } else {
                    errors++;
                }
            }

            showToast(`${added} importés ! ${errors > 0 ? `(${errors} erreurs)` : ''}`, added > 0 ? 'success' : 'error');
            loadParticipants(espaceId, currentRole);
        } catch (err) {
            console.error('import error:', err);
            showToast("Fichier JSON invalide ou corrompu.", 'error');
        } finally {
            document.getElementById('inputImportParticipantsColo').value = '';
        }
    };
    reader.readAsText(file);
}
// ----------------------------------------------------------------
// CHARGER LES ANIMATEURS
// ----------------------------------------------------------------
async function loadAnimateurs(coloId) {
    const listEl = document.getElementById('animateursList');
    if (!listEl) return;

    try {
        // 1. Récupérer les demandes approuvées pour cette colo
        const snap = await db.collection('accessRequests')
            .where('espaceId', '==', coloId)
            .where('status', '==', 'approved')
            .get();

        const userIds = snap.docs.map(doc => doc.data().userId);

        // On récupère aussi l'admin qui a créé la colo s'il n'est pas déjà dans la liste
        const coloDoc = await db.collection('espaces').doc(coloId).get();
        if (coloDoc.exists && coloDoc.data().createdBy) {
            if (!userIds.includes(coloDoc.data().createdBy)) {
                userIds.push(coloDoc.data().createdBy);
            }
        }

        if (userIds.length === 0) {
            listEl.innerHTML = `<div class="text-center text-muted" style="padding:24px;">Aucun animateur sur cet espace.</div>`;
            return;
        }

        // 2. Récupérer les données de chaque utilisateur
        const animsData = [];
        for (const uid of userIds) {
            const uDoc = await db.collection('users').doc(uid).get();
            if (uDoc.exists) {
                animsData.push({ id: uDoc.id, ...uDoc.data() });
            }
        }

        // 3. Afficher
        listEl.innerHTML = animsData.map(anim => `
            <div class="es-anim-item">
                <div class="es-anim-item__avatar">
                    ${anim.photoURL
                ? `<img src="${anim.photoURL}" alt="${anim.displayName}">`
                : `<i class="bi bi-person-circle" style="font-size:24px; opacity:0.5;"></i>`}
                </div>
                <div class="es-anim-item__info">
                    <div class="es-anim-item__name">${anim.displayName || 'Anonyme'}</div>
                    <div class="es-anim-item__email">${anim.email || ''}</div>
                </div>
                <div class="es-badge ${anim.role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}">
                    ${anim.role === 'admin' ? 'Directeur' : 'Animateur'}
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error('loadAnimateurs error:', err);
        listEl.innerHTML = `<div class="text-center text-danger" style="padding:24px;">Erreur lors du chargement de l'équipe.</div>`;
    }
}
