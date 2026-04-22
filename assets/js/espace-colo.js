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
let isAnimAdmin = false;
let currentLocked = true;
let participants = [];
let currentGroups = []; // { id, name }
let isScheduledAlertsExpanded = false;
let participantColView = 'note'; // 'spec' | 'note' — colonne visible dans le tableau participants
let currentViewIndex = -1;       // Index dans currentFilteredParticipants pour la modale fiche
let sortColumn    = 'nom';      // Colonne de tri active ('prenom'|'nom'|'age'|'genre'|'groupe')
let sortDirection = 'asc';       // 'asc' | 'desc'
let isColoFormation = false;     // Si la colo est marquée comme "Formation"
let currentColoDateFin = null;   // Date de fin de la colo
let currentGeminiKey = "";       // Clé API Gemini de la session (depuis Firestore)
let isAIGeneratorEnabled = true; // Si les anims ont le droit d'utiliser l'IA
let currentAICredits = 0;        // Crédits IA restants pour l'utilisateur actuel
let defaultAICredits = 5;        // Crédits par défaut configurés pour l'espace

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
        const visible = colo.visible !== false;

        // SI ANIMATEUR : On bloque l'accès si la colo est masquée par le directeur
        if (role === 'anim' && !visible) {
            showAccessDenied('🔒', 'Bientôt disponible', 'Le directeur a temporairement masqué cet espace le temps de sa préparation.', true);
            return;
        }

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
        isAnimAdmin = (req.espaceRole === 'anim-admin');
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
async function initColoContent(colo, role) {
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

    currentColoDateFin = colo.dateFin ? new Date(colo.dateFin) : null;

    isColoFormation = colo.isFormation === true;
    const btnAppr = document.getElementById('btnShowAppreciation');
    const btnInfoD = document.getElementById('btnInfoDRAJES');
    if (isColoFormation) {
        if (btnAppr) btnAppr.classList.remove('hidden');
        if (btnInfoD) btnInfoD.classList.remove('hidden');
        // Révéler les boutons bulk liés aux formations
        document.getElementById('btnBulkClearAppreciation')?.classList.remove('hidden');
        document.getElementById('btnBulkAppreciation')?.classList.remove('hidden');

        // Mise à jour des labels spécifiques "Formation"
        const statTotalLabel = document.getElementById('statTotal')?.parentElement;
        if (statTotalLabel) statTotalLabel.innerHTML = statTotalLabel.innerHTML.replace('participants', 'stagiaires');
        
        const manageGroupsDesc = document.querySelector('#overlayManageGroups .es-modal__body p');
        if (manageGroupsDesc) manageGroupsDesc.innerHTML = manageGroupsDesc.innerHTML.replace('jeunes', 'stagiaires');

        const searchInput = document.getElementById('searchParticipant');
        if (searchInput) searchInput.placeholder = searchInput.placeholder.replace('participant', 'stagiaire');
        
        document.getElementById('aiActivityGeneratorSection')?.classList.add('hidden');
    } else {
        if (btnAppr) btnAppr.classList.add('hidden');
        if (btnInfoD) btnInfoD.classList.add('hidden');
        document.getElementById('btnBulkClearAppreciation')?.classList.add('hidden');
        document.getElementById('btnBulkAppreciation')?.classList.add('hidden');
        
        // Afficher le générateur d'activités pour les colos
        document.getElementById('aiActivityGeneratorSection')?.classList.remove('hidden');
    }

    // Drive
    if (colo.driveId) {
        const driveBtn = document.getElementById('driveLinkBtn');
        driveBtn.href = `https://drive.google.com/drive/folders/${colo.driveId}`;
        driveBtn.classList.remove('hidden');
    }

    // Gestion du verrou participants
    currentLocked = colo.participantsLocked !== false; // true par défaut

    if (role === 'admin' || isAnimAdmin) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
    
    if (role === 'admin') {
        document.querySelectorAll('.director-only').forEach(el => el.classList.remove('hidden'));
    }

    if (role === 'admin' || isAnimAdmin) {
        // L'admin et l'anim-admin voient les boutons d'import/export
        document.getElementById('btnExportParticipantsColo')?.classList.remove('hidden');
        document.getElementById('btnImportParticipantsColo')?.classList.remove('hidden');
        
        const addBtn = document.getElementById('btnAddParticipant');
        document.querySelectorAll('.anim-can').forEach(el => el.classList.remove('hidden'));
        
        if (role === 'anim' && isAnimAdmin && currentLocked) {
            addBtn?.setAttribute('disabled', 'true');
            addBtn?.setAttribute('title', 'Le directeur a verrouillé la gestion des participants.');
            addBtn?.style.setProperty('opacity', '0.45');
            addBtn?.style.setProperty('cursor', 'not-allowed');
        } else {
            addBtn?.removeAttribute('disabled');
            addBtn?.classList.remove('hidden');
        }
    }

    // Charger les groupes EN PREMIER (les participants en dépendent pour le filtre)
    await loadGroups(colo.id, role);
    // Charger les participants (buildFilters s'exécute avec currentGroups déjà remplis)
    loadParticipants(colo.id, role);
    // Charger les animateurs
    loadAnimateurs(colo.id);
    // Charger les alertes
    loadAlerts(colo.id, role);
    // Charger la météo dynamique
    loadWeather(colo.id, role);
    // Charger la bibliothèque
    loadPhotos(colo, role);

    // IA - Chargement de la config session
    currentGeminiKey = colo.geminiKey || "";
    isAIGeneratorEnabled = colo.allowAnimAI !== false; // true par défaut
    defaultAICredits = colo.defaultAICredits || 5;
    
    const usageCount = colo.iaUsageCount || 0;
    if (currentGeminiKey) {
        document.getElementById('iaStatusInfo')?.classList.remove('hidden');
        const usageEl = document.getElementById('iaUsageCounter');
        if (usageEl) usageEl.textContent = usageCount;
    } else {
        document.getElementById('iaStatusInfo')?.classList.add('hidden');
    }

    // Charger les crédits IA de l'utilisateur actuel (si anim)
    if (role === 'anim' || isAnimAdmin) {
        try {
            const reqSnap = await db.collection('accessRequests')
                .where('userId', '==', currentUser.uid)
                .where('espaceId', '==', colo.id)
                .get();
            if (!reqSnap.empty) {
                const reqData = reqSnap.docs[0].data();
                currentAICredits = (reqData.aiCredits !== undefined) ? reqData.aiCredits : defaultAICredits;
            }
        } catch (e) { console.error("Err credits:", e); }
    } else if (role === 'admin') {
        currentAICredits = 9999; // Illimité pour le directeur
    }

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
            document.getElementById('tab-bibliotheque')?.classList.toggle('hidden', tab !== 'bibliotheque');
        });
    });
}

// ----------------------------------------------------------------
// CHARGER LES PARTICIPANTS
// ----------------------------------------------------------------
async function loadParticipants(coloId, role) {
    try {
        const snap = await db.collection('espaces').doc(coloId).collection('participants').orderBy('nom').get();
        participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Gérer la visibilité du bouton réinitialiser (uniquement si admin et liste non vide)
        const deleteAllBtn = document.getElementById('btnDeleteAllParticipants');
        if (deleteAllBtn && (role === 'admin' || isAnimAdmin)) {
            deleteAllBtn.parentElement.classList.toggle('hidden', participants.length === 0);
        }

        buildFilters();
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

    let filteredParticipants = [...participants];

    // Application des filtres et recherche
    const searchVal = document.getElementById('searchParticipant')?.value.toLowerCase().trim() || '';
    const filterGroup = document.getElementById('filterGroup')?.value || '';
    const filterGenre = document.getElementById('filterGenre')?.value || '';
    const filterAge = document.getElementById('filterAge')?.value || '';

    if (searchVal) {
        filteredParticipants = filteredParticipants.filter(p => {
            const nomComplet = `${p.prenom || ''} ${p.nom || ''}`.toLowerCase();
            const tags = (p.spec || []).join(' ').toLowerCase();
            return nomComplet.includes(searchVal) || tags.includes(searchVal);
        });
    }
    if (filterGroup) {
        filteredParticipants = filteredParticipants.filter(p => p.groupeId === filterGroup);
    }
    if (filterGenre) {
        filteredParticipants = filteredParticipants.filter(p => p.genre === filterGenre);
    }
    if (filterAge) {
        filteredParticipants = filteredParticipants.filter(p => String(p.age) === filterAge);
    }

    window.currentFilteredParticipants = filteredParticipants;

    const pLabel = isColoFormation ? 'stagiaire' : 'participant';
    const counter = document.getElementById('participantsCounter');
    if (counter) {
        if (participants.length === 0) {
            counter.textContent = '';
        } else if (filteredParticipants.length === participants.length) {
            counter.textContent = `${participants.length} ${pLabel}${participants.length > 1 ? 's' : ''} au total`;
        } else {
            counter.innerHTML = `<strong>${filteredParticipants.length}</strong> affiché${filteredParticipants.length > 1 ? 's' : ''} <span style="opacity:0.6;">/ ${participants.length} ${pLabel}${participants.length > 1 ? 's' : ''} au total</span>`;
        }
    }

    if (filteredParticipants.length === 0) {
        const msg = participants.length > 0 ? "Aucun participant ne correspond à vos filtres." : "Aucun participant enregistré.";
        tbody.innerHTML = `<tr><td colspan="9" class="text-center text-muted" style="padding:24px;">${msg}</td></tr>`;
        return;
    }

    const canEdit = role === 'admin' || (role === 'anim' && !currentLocked);
    const hasGroups = currentGroups.length > 0;

    // Exposer la liste filtrée pour la modale de fiche (avec tri appliqué)
    const displayList = applySort(filteredParticipants);
    window.currentFilteredParticipants = displayList;
    updateSortIndicators();

    // Afficher/Cacher la colonne groupe
    document.querySelectorAll('.col-groupe').forEach(el => el.classList.toggle('hidden', !hasGroups));

    tbody.innerHTML = displayList.map((p, idx) => {
        const g = hasGroups ? currentGroups.find(x => x.id === p.groupeId) : null;
        const note = p.note || '';
        const appreciation = p.appreciation || '';
        const isLongNote = note.length > 50;
        const isLongApp = appreciation.length > 50;

        const specIsVisible = participantColView === 'spec';
        const noteIsVisible = participantColView === 'note';
        const appreIsVisible = participantColView === 'appreciation';

        const isSelected = selectedParticipantIds.has(p.id);

        // Cellule # : pour admin, hover affiche une checkbox de sélection individuelle
        const numCell = currentRole === 'admin'
            ? `<td class="es-td-num--admin${isSelected ? ' es-td-num--selected' : ''}"
                   data-html2canvas-ignore="true"
                   onclick="event.stopPropagation(); toggleParticipantSelection('${p.id}', !selectedParticipantIds.has('${p.id}'), this.closest('tr'))"
                   title="Sélectionner">
                   <span class="es-num-label">${isSelected ? '' : idx + 1}</span>
                   <i class="bi ${isSelected ? 'bi-check-circle-fill' : 'bi-circle'} es-num-cb-icon"></i>
               </td>`
            : `<td style="text-align:center; font-size:0.75rem; color:var(--clr-text-muted); font-weight:600; user-select:none;">${idx + 1}</td>`;

        return `
        <tr onclick="openParticipantView(${idx})" style="cursor:pointer;" class="${isSelected ? 'es-row--selected' : ''}">
            ${numCell}
            <td><strong>${escapeHtml(p.prenom || '')}</strong></td>
            <td>${escapeHtml(p.nom || '')}</td>
            <td style="text-align:center;"><span class="es-pill es-pill--age">${p.age} ans</span></td>
            <td style="text-align:center;">
                <span class="es-pill ${p.genre === 'masculin' ? 'es-pill--m' : 'es-pill--f'}">
                    ${p.genre === 'masculin' ? '♂ Garçon' : '♀ Fille'}
                </span>
            </td>
            <td class="col-groupe ${!hasGroups ? 'hidden' : ''}" style="text-align:center;">
                ${g ? `<span class="es-badge es-badge--anim" style="background:var(--clr-surface-3); border:1px solid var(--clr-surface-4); color:var(--clr-text);">${escapeHtml(g.name)}</span>` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td class="col-spec${!specIsVisible ? ' hidden' : ''}">
                ${(p.spec || []).length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${p.spec.map(s => `<span class="es-tag" style="${getStringColorStyle(s)}">${escapeHtml(s)}</span>`).join('')}</div>` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td style="font-size:0.85rem;" class="col-note${!noteIsVisible ? ' hidden' : ''}">
                ${note ? `
                    <div style="display:flex;align-items:center;gap:0;width:100%;min-width:0;">
                        <span class="es-note-text">${escapeHtml(note)}</span>
                        <span style="flex-shrink:0;width:22px;height:20px;display:inline-flex;align-items:center;justify-content:center;">
                            ${isLongNote ? `<button style="padding:0;height:18px;width:18px;border:none;color:var(--clr-primary);background:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;" onclick="event.stopPropagation();openNoteModal(${escapeHtml(JSON.stringify(note))})"><i class="bi bi-eye" style="font-size:0.82rem;"></i></button>` : ''}
                        </span>
                    </div>
                ` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td style="font-size:0.85rem;" class="col-appreciation${!appreIsVisible ? ' hidden' : ''}">
                ${appreciation ? `
                    <div style="display:flex;align-items:center;gap:0;width:100%;min-width:0;">
                        <span class="es-note-text">${escapeHtml(appreciation)}</span>
                        <span style="flex-shrink:0;width:22px;height:20px;display:inline-flex;align-items:center;justify-content:center;">
                            ${isLongApp ? `<button style="padding:0;height:18px;width:18px;border:none;color:var(--clr-primary);background:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;" onclick="event.stopPropagation();openNoteModal(${escapeHtml(JSON.stringify(appreciation))})"><i class="bi bi-eye" style="font-size:0.82rem;"></i></button>` : ''}
                        </span>
                    </div>
                ` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td class="es-table__actions" data-html2canvas-ignore="true" onclick="event.stopPropagation()" style="text-align:center;">
                <button class="es-btn es-btn--ghost es-btn--sm" title="Modifier"
                        onclick="editParticipant('${p.id}')">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="es-btn es-btn--danger es-btn--sm" 
                        onclick="${canEdit ? `deleteParticipant('${p.id}', ${escapeHtml(JSON.stringify(p.prenom + ' ' + p.nom))})` : 'void(0)'}"
                        ${!canEdit ? 'disabled title="Verrouillé par le directeur"' : 'title="Supprimer"'}
                        style="${!canEdit && role === 'anim' ? 'opacity:0.4;cursor:not-allowed;' : ''}">
                    <i class="bi bi-trash3"></i>
                </button>
            </td>
        </tr>
    `;
    }).join('');

    // Mettre à jour la barre d'actions de masse + l'en-tête après rendu
    updateBulkBar();
    _updateSelectAllHeader();
}

// Met à jour l'en-tête # pour admin : checkbox select-all ou simple #
function _updateSelectAllHeader() {
    const th = document.getElementById('thRowNum');
    if (!th) return;
    if (currentRole === 'admin') {
        const total = (window.currentFilteredParticipants || []).length;
        const n = selectedParticipantIds.size;
        const isAll = n > 0 && n === total;
        const isSome = n > 0 && n < total;
        th.onclick = null; // désactiver le reset tri
        th.title = 'Tout sélectionner / désélectionner';
        th.style.cursor = 'pointer';
        th.innerHTML = `<input type="checkbox" id="checkboxSelectAll"
            title="Tout sélectionner/désélectionner"
            style="accent-color:var(--clr-primary);width:15px;height:15px;cursor:pointer;"
            ${isAll ? 'checked' : ''} onchange="toggleSelectAllParticipants(this.checked)">`;
        const cb = document.getElementById('checkboxSelectAll');
        if (cb) cb.indeterminate = isSome;
    } else {
        th.onclick = () => setSortColumn(null);
        th.title = 'Réinitialiser le tri';
        th.style.cursor = 'pointer';
        th.textContent = '#';
    }
}



// ----------------------------------------------------------------
// TOGGLE COLONNE SPEC / NOTE
// ----------------------------------------------------------------
function setParticipantColView(view) {
    participantColView = view;

    const views = ['spec', 'note', 'appreciation'];
    views.forEach(v => {
        const btn = document.getElementById(`btnShow${v.charAt(0).toUpperCase() + v.slice(1)}`);
        if (btn) {
            if (view === v) {
                btn.style.background = 'var(--clr-primary)';
                btn.style.color = '#fff';
                btn.style.fontWeight = '700';
            } else {
                btn.style.background = 'transparent';
                btn.style.color = 'rgba(255,255,255,0.45)';
                btn.style.fontWeight = '500';
            }
        }
    });

    // Thead
    document.querySelectorAll('.col-spec').forEach(el => el.classList.toggle('hidden', view !== 'spec'));
    document.querySelectorAll('.col-note').forEach(el => el.classList.toggle('hidden', view !== 'note'));
    document.querySelectorAll('.col-appreciation').forEach(el => el.classList.toggle('hidden', view !== 'appreciation'));
    // Re-render tbody
    renderParticipantsTable(currentRole);
}

// ----------------------------------------------------------------
// TRI DES COLONNES
// ----------------------------------------------------------------
function setSortColumn(col) {
    if (col === null) {
        sortColumn = null;
        sortDirection = 'asc';
    } else if (sortColumn === col) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = col;
        sortDirection = 'asc';
    }
    renderParticipantsTable(currentRole);
}

function applySort(arr) {
    if (!sortColumn) return arr;
    return [...arr].sort((a, b) => {
        let va, vb;
        switch (sortColumn) {
            case 'prenom': va = (a.prenom || '').toLowerCase(); vb = (b.prenom || '').toLowerCase(); break;
            case 'nom':    va = (a.nom    || '').toLowerCase(); vb = (b.nom    || '').toLowerCase(); break;
            case 'age':    va = Number(a.age) || 0;            vb = Number(b.age) || 0;            break;
            case 'genre':  va = a.genre || '';                 vb = b.genre || '';                 break;
            case 'groupe': {
                const ga = currentGroups.find(x => x.id === a.groupeId);
                const gb = currentGroups.find(x => x.id === b.groupeId);
                va = ga ? ga.name.toLowerCase() : '\xFF'; // pas de groupe = fin de liste
                vb = gb ? gb.name.toLowerCase() : '\xFF';
                break;
            }
            default: return 0;
        }
        if (va < vb) return sortDirection === 'asc' ? -1 : 1;
        if (va > vb) return sortDirection === 'asc' ?  1 : -1;
        return 0;
    });
}

function updateSortIndicators() {
    document.querySelectorAll('.es-th-sortable').forEach(th => {
        const col  = th.dataset.sort;
        const icon = th.querySelector('.sort-icon');
        if (!icon) return;
        const isActive = col === sortColumn;
        th.classList.toggle('sort-active', isActive);
        icon.className = isActive
            ? (sortDirection === 'asc' ? 'bi bi-sort-up sort-icon' : 'bi bi-sort-down sort-icon')
            : 'bi bi-arrow-down-up sort-icon';
    });
    // Réinitialisation : si aucun tri, l'icône # reprend sa couleur normale
    const resetTh = document.querySelector('.es-th-reset');
    if (resetTh) resetTh.style.color = sortColumn ? 'var(--clr-primary-dark)' : '';
}

// ----------------------------------------------------------------
// FICHE PARTICIPANT — Modale lecture seule + navigation chevrons
// ----------------------------------------------------------------
function openParticipantView(index) {
    currentViewIndex = index;
    renderParticipantView();
    openModal('overlayParticipantView');
}

function navigateParticipantView(dir) {
    const list = window.currentFilteredParticipants || [];
    const next = currentViewIndex + dir;
    if (next >= 0 && next < list.length) {
        currentViewIndex = next;
        renderParticipantView();
    }
}

function renderParticipantView() {
    const list = window.currentFilteredParticipants || [];
    const p = list[currentViewIndex];
    if (!p) return;

    // Avatar
    const avatar = document.getElementById('pvAvatar');
    const initials = ((p.prenom||'')[0]||'').toUpperCase() + ((p.nom||'')[0]||'').toUpperCase();
    const isFeminin = p.genre !== 'masculin';
    avatar.textContent = initials;
    avatar.style.background = isFeminin
        ? 'linear-gradient(135deg, #f093fb, #f5576c)'
        : 'linear-gradient(135deg, #4facfe, #00f2fe)';

    // Nom & sous-titre
    document.getElementById('pvName').textContent = `${p.prenom||''} ${p.nom||''}`;
    document.getElementById('pvSubtitle').innerHTML =
        `<span class="es-pill ${isFeminin?'es-pill--f':'es-pill--m'}" style="font-size:0.72rem;padding:2px 8px;">
            ${isFeminin ? '♀ Fille' : '♂ Garçon'}
         </span>
         &nbsp;·&nbsp;
         <span class="es-pill es-pill--age" style="font-size:0.72rem;padding:2px 8px;">${p.age} ans</span>`;

    const g = currentGroups.find(x => x.id === p.groupeId);
    const specList = p.spec || [];
    const note = p.note || '';
    const appreciation = p.appreciation || '';

    document.getElementById('pvBody').innerHTML = `
        <div class="es-pv-grid">
            ${g ? `
            <div class="es-pv-row">
                <span class="es-pv-label"><i class="bi bi-people"></i> Groupe</span>
                <span class="es-pv-value">
                    <span class="es-badge" style="background:var(--clr-surface-3);border:1px solid var(--clr-surface-4);color:var(--clr-text);">
                        ${escapeHtml(g.name)}
                    </span>
                </span>
            </div>` : ''}

            <div class="es-pv-row${specList.length > 0 ? ' es-pv-row--block' : ''}">
                <span class="es-pv-label"><i class="bi bi-tag"></i> Spécificités</span>
                ${specList.length > 0
                    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${specList.map(s => `<span class="es-tag" style="${getStringColorStyle(s)}">${escapeHtml(s)}</span>`).join('')}</div>`
                    : `<span class="es-pv-value" style="color:var(--clr-text-muted);font-style:italic;font-size:0.85rem;">Aucune</span>`}
            </div>

            <div class="es-pv-row${note ? ' es-pv-row--block' : ''}">
                <span class="es-pv-label"><i class="bi bi-chat-left-text"></i> Remarque</span>
                ${note
                    ? `<p class="es-pv-note">${escapeHtml(note)}</p>`
                    : `<span class="es-pv-value" style="color:var(--clr-text-muted);font-style:italic;font-size:0.85rem;">Aucune</span>`}
            </div>

            ${isColoFormation ? `
            <div class="es-pv-row${appreciation ? ' es-pv-row--block' : ''}">
                <span class="es-pv-label"><i class="bi bi-star"></i> Appréciation</span>
                ${appreciation
                    ? `<p class="es-pv-note" style="background: rgba(166, 216, 102, 0.05); border-color: rgba(166, 216, 102, 0.2);">${escapeHtml(appreciation)}</p>`
                    : `<span class="es-pv-value" style="color:var(--clr-text-muted);font-style:italic;font-size:0.85rem;">Aucune</span>`}
            </div>` : ''}
        </div>
    `;

    document.getElementById('pvCounter').textContent = `${currentViewIndex + 1}\u00a0/\u00a0${list.length}`;
    document.getElementById('btnParticipantPrev').disabled = currentViewIndex === 0;
    document.getElementById('btnParticipantNext').disabled = currentViewIndex === list.length - 1;

    // Bouton Modifier — visible seulement si droits d'édition
    const pvBtnEdit = document.getElementById('pvBtnEdit');
    if (pvBtnEdit) {
        const canEdit = currentRole === 'admin' || (currentRole === 'anim' && !currentLocked);
        pvBtnEdit.classList.toggle('hidden', !canEdit);
        pvBtnEdit.onclick = () => {
            closeModal('overlayParticipantView');
            editParticipant(p.id);
        };
    }
}

// Navigation clavier gauche/droite dans la modale fiche
document.addEventListener('keydown', (e) => {
    if (document.getElementById('overlayParticipantView')?.classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft')  navigateParticipantView(-1);
    if (e.key === 'ArrowRight') navigateParticipantView(1);
    if (e.key === 'Escape')     closeModal('overlayParticipantView');
});

// ----------------------------------------------------------------
// FILTRES ET RECHERCHE
// ----------------------------------------------------------------
function buildFilters() {
    // 1. Groupes
    const filterGroup = document.getElementById('filterGroup');
    if (filterGroup) {
        const val = filterGroup.value;
        filterGroup.innerHTML = '<option value="">Tous les groupes</option>' + currentGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
        filterGroup.value = val;
    }

    // 2. Ages
    const filterAge = document.getElementById('filterAge');
    if (filterAge) {
        const val = filterAge.value;
        const ages = [...new Set(participants.map(p => p.age))].sort((a, b) => a - b);
        filterAge.innerHTML = '<option value="">Tous âges</option>' + ages.map(a => `<option value="${a}">${a} ans</option>`).join('');
        filterAge.value = val;
    }
}

const searchParticipantInput = document.getElementById('searchParticipant');
const clearSearchParticipantBtn = document.getElementById('clearSearchParticipant');

if (searchParticipantInput) {
    searchParticipantInput.addEventListener('input', (e) => {
        if (clearSearchParticipantBtn) {
            if (e.target.value.length > 0) {
                clearSearchParticipantBtn.classList.remove('hidden');
            } else {
                clearSearchParticipantBtn.classList.add('hidden');
            }
        }
        renderParticipantsTable(currentRole);
    });
}
if (clearSearchParticipantBtn) {
    clearSearchParticipantBtn.addEventListener('click', () => {
        if (searchParticipantInput) {
            searchParticipantInput.value = '';
            clearSearchParticipantBtn.classList.add('hidden');
            renderParticipantsTable(currentRole);
            searchParticipantInput.focus();
        }
    });
}
document.getElementById('filterGroup')?.addEventListener('change', () => renderParticipantsTable(currentRole));
document.getElementById('filterGenre')?.addEventListener('change', () => renderParticipantsTable(currentRole));
document.getElementById('filterAge')?.addEventListener('change', () => renderParticipantsTable(currentRole));

document.getElementById('btnExportImage')?.addEventListener('click', async () => {
    const tableContainer = document.getElementById('participantsTableContainer');
    const btn = document.getElementById('btnExportImage');
    if (!tableContainer || !btn) return;

    // Etat chargement
    btnLoading(btn, true);

    // Sauvegarde des styles pour annuler le scroll bar sur mobile
    // Cela permet à html2canvas de "voir" toute la largeur du tableau
    const originalOverflow = tableContainer.style.overflow || '';
    const originalWidth = tableContainer.style.width || '';
    const originalMaxWidth = tableContainer.style.maxWidth || '';

    // Forcer l'affichage entier (débordement)
    tableContainer.style.overflow = 'visible';
    tableContainer.style.width = 'max-content';
    tableContainer.style.maxWidth = 'none';

    try {
        const canvas = await html2canvas(tableContainer, {
            backgroundColor: '#ffffff',
            scale: 2 // Export HD
        });

        const coloTitle = document.getElementById('coloTitle')?.textContent.trim() || 'colo';
        const fileName = `participants-${coloTitle.replace(/[^a-z0-9]/gi, '_')}.png`;

        const link = document.createElement('a');
        link.download = fileName;
        link.href = canvas.toDataURL('image/png');
        link.click();

        showToast('Image enregistrée avec succès', 'success');
    } catch (e) {
        console.error('Export PNG:', e);
        showToast('Erreur lors de la capture d\'écran', 'error');
    } finally {
        // Restaurer styles originaux
        tableContainer.style.overflow = originalOverflow;
        tableContainer.style.width = originalWidth;
        tableContainer.style.maxWidth = originalMaxWidth;
        btnLoading(btn, false);
    }
});

document.getElementById('btnExportPdf')?.addEventListener('click', () => {
    const btn = document.getElementById('btnExportPdf');
    if (!btn) return;

    try {
        btnLoading(btn, true);
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const coloTitle = document.getElementById('coloTitle')?.textContent.trim() || 'Colo';
        const hasGroups = currentGroups.length > 0;

        doc.setFontSize(18);
        doc.text(`Liste des participants - ${coloTitle}`, 14, 20);

        doc.setFontSize(10);
        doc.text(`Généré le: ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 28);

        let dynamicColName = '';
        let tagColIndex = -1;
        
        if (participantColView === 'spec') {
            dynamicColName = 'Spécificités';
            tagColIndex = hasGroups ? 5 : 4;
        } else if (participantColView === 'note') {
            dynamicColName = 'Remarques';
        } else if (participantColView === 'appreciation') {
            dynamicColName = 'Appréciation';
        }

        const dataList = window.currentFilteredParticipants || participants || [];
        const tableData = dataList.map(p => {
            const g = hasGroups ? currentGroups.find(x => x.id === p.groupeId) : null;
            let dynamicVal = '';
            if (participantColView === 'spec') dynamicVal = p.spec || [];
            else if (participantColView === 'note') dynamicVal = p.note || '';
            else if (participantColView === 'appreciation') dynamicVal = p.appreciation || '';

            return [
                p.prenom || '',
                p.nom || '',
                `${p.age} ans`,
                p.genre === 'masculin' ? 'Garçon' : 'Fille',
                ...(hasGroups ? [g ? g.name : ''] : []),
                dynamicVal
            ];
        });

        const head = [
            ['Prénom', 'Nom', 'Âge', 'Genre', ...(hasGroups ? ['Groupe'] : []), dynamicColName]
        ];

        doc.autoTable({
            startY: 35,
            head: head,
            body: tableData,
            theme: 'striped',
            styles: { fontSize: 9, valign: 'middle' },
            headStyles: { fillColor: [41, 128, 185] }, // Code couleur approchant du primary
            didParseCell: function (data) {
                if (data.section === 'body') {
                    // Âge en gras et bleu
                    if (data.column.index === 2) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = [41, 128, 185];
                    }
                    // Genre coloré
                    if (data.column.index === 3) {
                        data.cell.styles.fontStyle = 'bold';
                        if (data.cell.raw === 'Garçon') {
                            data.cell.styles.textColor = [52, 152, 219];
                        } else {
                            data.cell.styles.textColor = [232, 62, 140];
                        }
                    }
                    // Groupe
                    if (hasGroups && data.column.index === 4) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.textColor = [100, 100, 100];
                    }
                }
            },
            willDrawCell: function (data) {
                // Vider le texte pour la colonne des tags (dessin manuel)
                if (data.section === 'body' && data.column.index === tagColIndex) {
                    data.customTags = data.cell.raw;
                    data.cell.text = [];
                }
            },
            didDrawCell: function (data) {
                // Dessiner les petits tags arrondis
                if (data.section === 'body' && data.column.index === tagColIndex && data.customTags) {
                    const tags = data.customTags;
                    if (!Array.isArray(tags) || tags.length === 0) {
                        doc.setTextColor(150);
                        doc.setFont("helvetica", "normal");
                        doc.text('-', data.cell.x + data.cell.padding('left'), data.cell.y + data.cell.height / 2, { baseline: 'middle' });
                        return;
                    }

                    let cursorX = data.cell.x + data.cell.padding('left');
                    const cursorY = data.cell.y + data.cell.height / 2;

                    tags.forEach(t => {
                        let hash = 0;
                        for (let i = 0; i < t.length; i++) hash = t.charCodeAt(i) + ((hash << 5) - hash);
                        const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
                        const hex = "00000".substring(0, 6 - c.length) + c;

                        const r = parseInt(hex.substring(0, 2), 16) || 0;
                        const g = parseInt(hex.substring(2, 4), 16) || 0;
                        const b = parseInt(hex.substring(4, 6), 16) || 0;

                        doc.setFont("helvetica", "bold");
                        doc.setFontSize(8);
                        const textWidth = doc.getTextWidth(t);
                        const paddingX = 2;
                        const w = textWidth + paddingX * 2;
                        const h = 5;

                        // Eviter que ça ne déborde de la cellule horizontalement
                        if (cursorX + w > data.cell.x + data.cell.width - data.cell.padding('right')) {
                            return;
                        }

                        // Background: on l'éclaircit de 75%
                        const bgR = Math.min(255, Math.floor((r + 255 * 3) / 4));
                        const bgG = Math.min(255, Math.floor((g + 255 * 3) / 4));
                        const bgB = Math.min(255, Math.floor((b + 255 * 3) / 4));
                        doc.setFillColor(bgR, bgG, bgB);
                        doc.roundedRect(cursorX, cursorY - h / 2, w, h, 1, 1, 'F');

                        // Texte: on l'assombrit un peu
                        doc.setTextColor(Math.max(0, Math.floor(r * 0.8)), Math.max(0, Math.floor(g * 0.8)), Math.max(0, Math.floor(b * 0.8)));
                        doc.text(t, cursorX + paddingX, cursorY, { baseline: 'middle' });

                        cursorX += w + 2;
                    });
                }
            }
        });

        doc.setFontSize(10);
        const finalY = doc.lastAutoTable.finalY || 35;

        const part1 = "Document généré via ";
        const linkText = "cette application web";
        const part2 = " (© Romain SIEURIN)";

        let cursorX = 14;
        const textY = finalY + 15;

        doc.setTextColor(100);
        doc.text(part1, cursorX, textY);
        cursorX += doc.getTextWidth(part1);

        doc.setTextColor(41, 128, 185);
        doc.text(linkText, cursorX, textY);
        const linkWidth = doc.getTextWidth(linkText);
        // Souligné
        doc.setLineWidth(0.3);
        doc.setDrawColor(41, 128, 185);
        doc.line(cursorX, textY + 0.8, cursorX + linkWidth, textY + 0.8);
        // Lien cliquable
        doc.link(cursorX, textY - 3, linkWidth, 4, { url: "https://srn-romain.github.io/jeux-bafa/" });

        cursorX += linkWidth;
        doc.setTextColor(100);
        doc.text(part2, cursorX, textY);

        doc.save(`participants-${coloTitle.replace(/[^a-z0-9]/gi, '_')}.pdf`);
        showToast('PDF généré avec succès', 'success');
    } catch (e) {
        console.error('Export PDF error:', e);
        showToast("Erreur lors de la génération du PDF", "error");
    } finally {
        btnLoading(btn, false);
    }
});

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

        const pLabel = isColoFormation ? 'stagiaires' : 'jeunes';
        return `
        <div class="es-group-card">
            <div class="es-group-card__header">
                Groupe ${i + 1}
                <span style="font-weight:400;color:var(--clr-text-muted);font-size:0.83rem;margin-left:8px;">
                    ${group.length} ${pLabel} · ${boys}♂ ${girls}♀ · moy. ${avgAge} ans
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

document.getElementById('btnInfoDRAJES')?.addEventListener('click', () => {
    openModal('overlayInfoDRAJES');
});

document.getElementById('btnAddParticipant')?.addEventListener('click', () => {
    editingParticipantId = null;
    document.getElementById('participantModalTitle').textContent = 'Ajouter un participant';
    document.getElementById('participantForm')?.reset();

    // Réinitialiser les disabled
    ['pPrenom', 'pNom', 'pAge', 'pGenre', 'pGroup', 'pAppreciation'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    const groupSelect = document.getElementById('pGroup');
    if (groupSelect) groupSelect.value = '';

    const fieldAppreciation = document.getElementById('fieldParticipantAppreciation');
    if (fieldAppreciation) {
        fieldAppreciation.classList.toggle('hidden', !isColoFormation);
        // Visibilité du bouton IA selon les droits
        const canUseAI = (currentRole === 'admin') || isAIGeneratorEnabled;
        document.getElementById('btnOpenAIGenerator')?.classList.toggle('hidden', !canUseAI);
    }

    document.getElementById('participantError')?.classList.add('hidden');
    openModal('overlayParticipant');
});

function editParticipant(id) {
    const p = participants.find(x => x.id === id);
    if (!p) return;
    editingParticipantId = id;
    document.getElementById('participantModalTitle').textContent = 'Modifier le participant';

    const fieldAppreciation = document.getElementById('fieldParticipantAppreciation');
    if (fieldAppreciation) {
        fieldAppreciation.classList.toggle('hidden', !isColoFormation);
    }

    // Si verrouillé et anim, on ne peut changer que la remarque (et l'appréciation)
    const isLockedAnim = (currentRole === 'anim' && currentLocked);
    ['pPrenom', 'pNom', 'pAge', 'pGenre', 'pGroup', 'pSpec', 'pAppreciation'].forEach(fId => {
        const el = document.getElementById(fId);
        if (el && fId !== 'pAppreciation') el.disabled = isLockedAnim;
    });

    document.getElementById('pPrenom').value = p.prenom || '';
    document.getElementById('pNom').value = p.nom || '';
    document.getElementById('pAge').value = p.age || '';
    document.getElementById('pGenre').value = p.genre || 'feminin';
    document.getElementById('pSpec').value = Array.isArray(p.spec) ? p.spec.join(', ') : (p.spec || '');
    document.getElementById('pNote').value = p.note || '';
    if (isColoFormation) {
        const pAppreciationEl = document.getElementById('pAppreciation');
        if (pAppreciationEl) pAppreciationEl.value = p.appreciation || '';
        // Visibilité du bouton IA selon les droits
        const canUseAI = (currentRole === 'admin') || isAIGeneratorEnabled;
        document.getElementById('btnOpenAIGenerator')?.classList.toggle('hidden', !canUseAI);
    }

    const groupSelect = document.getElementById('pGroup');
    if (groupSelect) groupSelect.value = p.groupeId || '';

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
    const specRaw = document.getElementById('pSpec')?.value.trim() || '';
    const note = document.getElementById('pNote')?.value.trim();
    const appreciation = document.getElementById('pAppreciation')?.value.trim();
    const groupeId = document.getElementById('pGroup')?.value || null;

    const spec = specRaw ? specRaw.split(',').map(s => s.trim().toLowerCase()).filter(s => s) : [];

    if (!prenom || !nom || isNaN(age)) {
        errMsg.textContent = 'Prénom, nom et âge sont obligatoires.';
        errEl.classList.remove('hidden');
        return;
    }

    errEl.classList.add('hidden');
    btnLoading(btn, true);

    try {
        let data = { prenom, nom, age, genre, note, spec, groupeId };
        if (isColoFormation && appreciation !== undefined) {
            data.appreciation = appreciation;
        }
        const colRef = db.collection('espaces').doc(espaceId).collection('participants');

        if (editingParticipantId) {
            // Sécurité : si verrouillé par le directeur, les animateurs ne peuvent changer QUE la remarque
            if (currentRole === 'anim' && currentLocked) {
                data = { note };
                if (isColoFormation && appreciation !== undefined) {
                    data.appreciation = appreciation;
                }
            }
            await colRef.doc(editingParticipantId).update(data);
            showToast('Participant modifié.', 'success');
        } else {
            // Les animateurs ne peuvent pas ajouter si c'est verrouillé
            if (currentRole === 'anim' && currentLocked) {
                throw new Error("La création est verrouillée par le directeur.");
            }
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
    const pLabel = isColoFormation ? 'le stagiaire' : 'le participant';
    const msgEl = document.getElementById('confirmDeleteMsg');
    if (msgEl) msgEl.textContent = `Voulez-vous vraiment supprimer ${pLabel} "${nom}" ? Cette action est irréversible.`;

    const btn = document.getElementById('btnConfirmDeleteAction');
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        btnLoading(newBtn, true);
        try {
            await db.collection('espaces').doc(espaceId).collection('participants').doc(id).delete();
            showToast('Participant supprimé.', 'success');
            closeModal('overlayConfirmDelete');
            await loadParticipants(espaceId, currentRole);
        } catch (err) {
            console.error('deleteParticipant:', err);
            showToast('Erreur lors de la suppression.', 'error');
        } finally {
            btnLoading(newBtn, false);
        }
    });

    openModal('overlayConfirmDelete');
}

// ================================================================
// GÉNÉRATEUR D'APPRÉCIATION IA (BAFA)
// ================================================================

// Variable pour stocker la clé API Gemini (Placeholder à remplir par l'utilisateur)
// Une meilleure pratique serait de la stocker dans Firestore (config) ou une variable d'env
let GEMINI_API_KEY = ""; 

document.getElementById('btnOpenAIGenerator')?.addEventListener('click', () => {
    // Pré-remplir les notes avec la remarque actuelle (pNote)
    const currentNote = document.getElementById('pNote')?.value.trim();
    const aiNotes = document.getElementById('aiNotes');
    if (aiNotes) aiNotes.value = currentNote || "";
    
    // Auto-détection du type de stage via le nom de la colo
    const coloTitle = document.getElementById('coloTitle')?.textContent.toLowerCase() || "";
    const isBase = coloTitle.includes('base') || coloTitle.includes('générale');
    const isAppro = coloTitle.includes('appro') || coloTitle.includes('qualif');
    
    if (isBase) document.querySelector('input[name="aiStageType"][value="base"]').checked = true;
    if (isAppro) document.querySelector('input[name="aiStageType"][value="approfondissement"]').checked = true;

    // Réinitialiser la zone de résultat
    document.getElementById('aiResultArea')?.classList.add('hidden');
    document.getElementById('btnApplyAI')?.classList.add('hidden');
    document.getElementById('aiGeneratorError')?.classList.add('hidden');
    
    openModal('overlayAIGenerator');
});

document.getElementById('btnGenerateAI')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnGenerateAI');
    const notes = document.getElementById('aiNotes')?.value.trim();
    const stageType = document.querySelector('input[name="aiStageType"]:checked')?.value;
    const errorEl = document.getElementById('aiGeneratorError');
    const resultArea = document.getElementById('aiResultArea');
    const resultText = document.getElementById('aiResultText');

    if (!notes) {
        _showAIError("Veuillez saisir quelques remarques ou mots-clés sur le stagiaire.");
        return;
    }

    // Vérification des crédits (si anim)
    if (currentRole !== 'admin' && currentAICredits <= 0) {
        _showAIError("Vous avez épuisé vos crédits IA pour cette session. Contactez le directeur pour en obtenir de nouveaux.");
        return;
    }

    // Choix de la clé : Priorité à la clé de session (Directeur), sinon clé personnelle
    let effectiveKey = currentGeminiKey || GEMINI_API_KEY;

    if (!effectiveKey) {
        const savedKey = localStorage.getItem('GEMINI_API_KEY');
        if (savedKey) {
            effectiveKey = savedKey.trim();
            GEMINI_API_KEY = effectiveKey;
        } else {
            const key = prompt("Aucune clé IA n'est configurée pour cette session. Veuillez saisir votre clé personnelle Google AI (Gemini) :");
            if (key) {
                effectiveKey = key.trim();
                GEMINI_API_KEY = effectiveKey;
                localStorage.setItem('GEMINI_API_KEY', effectiveKey);
            } else {
                _showAIError("Clé API manquante. Impossible de générer l'appréciation.");
                return;
            }
        }
    }

    btnLoading(btn, true);
    errorEl.classList.add('hidden');
    resultArea.classList.add('hidden');

    try {
        const context = _getDRAJESContext();
        const pPrenom = document.getElementById('pPrenom')?.value || "Le stagiaire";
        const pGenre = document.getElementById('pGenre')?.value || "feminin";
        
        const prompt = `Tu es un formateur BAFA expert. Ta mission est de rédiger l'appréciation finale de stage BAFA pour ${pPrenom} (${pGenre === 'masculin' ? 'un homme' : 'une femme'}).
        
        CONTEXTE DU STAGE :
        - Type de session : ${stageType === 'base' ? 'Session de Formation Générale (Base)' : 'Session d\'Approfondissement'}
        - Remarques de l'équipe : ${notes}
        
        CADRE RÉGLEMENTAIRE DRAJES (Contexte) :
        ${context}
        
        CONSIGNES DE RÉDACTION :
        1. Rédige l'appréciation à la 3ème personne exclusivement.
        2. Sois factuel : décris ce que le stagiaire a FAIT et ACQUIS, et dans quel CONTEXTE.
        3. Longueur : environ 4 à 5 phrases (une par grand critère).
        4. INTERDIT : Jugements de valeur (dynamique, sérieux, bienveillant...), conseils ("il devra veiller à..."), félicitations, ou mention de noms de jeux précis.
        5. L'appréciation doit être parfaitement cohérente avec un AVIS FAVORABLE (aucune réserve).
        
        RÉPONSE ATTENDUE : Uniquement le texte de l'appréciation, sans introduction ni conclusion.`;

        const response = await _callGemini(effectiveKey, prompt);
        
        if (response) {
            resultText.innerText = response.trim();
            resultArea.classList.remove('hidden');
            document.getElementById('btnApplyAI')?.classList.remove('hidden');

            // Décompte des crédits et usage
            await _decrementAICredits();
        } else {
            throw new Error("L'IA n'a pas renvoyé de réponse exploitable.");
        }
    } catch (err) {
        console.error('AI Generation Error:', err);
        let errorMsg = err.message;
        
        // Diagnostic si "Not Found"
        if (errorMsg.includes('not found')) {
            try {
                const diagUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
                const diagResp = await fetch(diagUrl);
                const diagData = await diagResp.json();
                const availableModels = diagData.models ? diagData.models.map(m => m.name.replace('models/', '')) : [];
                
                if (availableModels.length > 0) {
                    errorMsg += "\n\nModèles réellement dispos sur votre clé : " + availableModels.join(', ');
                } else {
                    errorMsg += "\n\nAucun modèle n'est associé à cette clé. Vérifiez que 'Generative Language API' est activée dans votre console Google Cloud.";
                }
            } catch (diagErr) {
                console.error("Erreur diagnostic:", diagErr);
            }
        }
        
        _showAIError("Erreur : " + errorMsg);
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnApplyAI')?.addEventListener('click', () => {
    const result = document.getElementById('aiResultText').innerText;
    const pAppreciation = document.getElementById('pAppreciation');
    if (pAppreciation) {
        pAppreciation.value = result;
        showToast("Appréciation importée !", "success");
        closeModal('overlayAIGenerator');
    }
});

document.getElementById('btnCopyAIResult')?.addEventListener('click', () => {
    const text = document.getElementById('aiResultText').innerText;
    navigator.clipboard.writeText(text).then(() => {
        showToast("Texte copié.", "success");
    });
});

function _showAIError(msg) {
    const errorEl = document.getElementById('aiGeneratorError');
    const errorMsg = document.getElementById('aiGeneratorErrorMsg');
    if (errorEl && errorMsg) {
        errorMsg.textContent = msg;
        errorEl.classList.remove('hidden');
    }
}

function _getDRAJESContext() {
    const modal = document.getElementById('overlayInfoDRAJES');
    if (!modal) return "Respecter les règles de rédaction BAFA (3ème personne, factuel, pas de jugement).";
    // On récupère les règles d'or et erreurs à éviter
    const body = modal.querySelector('.es-modal__body');
    if (!body) return "";
    // On prend les premiers paragraphes et listes (jusqu'aux modèles)
    let content = "";
    const children = Array.from(body.children);
    for (const child of children) {
        if (child.tagName === 'H4' && child.innerText.includes('Modèles')) break;
        content += child.innerText + "\n";
    }
    return content;
}

async function _callGemini(apiKey, prompt) {
    // Liste des modèles mis à jour selon les disponibilités réelles de votre clé (2026)
    const models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-pro-latest'];
    let lastError = "";

    for (const model of models) {
        try {
            // Utilisation de v1beta pour ces modèles récents
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.candidates && data.candidates[0]?.content?.parts[0]?.text) {
                    return data.candidates[0].content.parts[0].text;
                }
            } else {
                const errData = await response.json();
                lastError = errData.error?.message || "Erreur inconnue";
                // Si c'est une erreur de clé API, on s'arrête tout de suite
                if (lastError.includes('API key not valid')) {
                    throw new Error("Clé API non valide.");
                }
                // Sinon on continue la boucle pour essayer le modèle suivant
                console.warn(`Modèle ${model} non trouvé ou non supporté, essai suivant...`);
            }
        } catch (e) {
            lastError = e.message;
            console.error(`Erreur avec le modèle ${model}:`, e);
        }
    }

    throw new Error(lastError || "Impossible de trouver un modèle compatible sur votre compte Google AI.");
}

// ----------------------------------------------------------------
// CONFIGURATION IA SESSION (Directeur)
// ----------------------------------------------------------------
document.getElementById('btnConfigIA')?.addEventListener('click', () => {
    document.getElementById('espaceGeminiKey').value = currentGeminiKey || "";
    document.getElementById('allowAnimAI').checked = isAIGeneratorEnabled;
    document.getElementById('defaultAICredits').value = defaultAICredits;
    document.getElementById('resetAllCredits').checked = false;
    // Reset visibility to password
    document.getElementById('espaceGeminiKey').type = 'password';
    document.querySelector('#btnToggleKeyVisibility i').className = 'bi bi-eye';
    openModal('overlayIASettings');
});

// Toggle visibilité clé
document.getElementById('btnToggleKeyVisibility')?.addEventListener('click', () => {
    const input = document.getElementById('espaceGeminiKey');
    const icon = document.querySelector('#btnToggleKeyVisibility i');
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'bi bi-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'bi bi-eye';
    }
});

// Copier la clé
document.getElementById('btnCopySpaceKey')?.addEventListener('click', () => {
    const key = document.getElementById('espaceGeminiKey').value;
    if (!key) return;
    navigator.clipboard.writeText(key).then(() => {
        showToast("Clé copiée !", "success");
    });
});

document.getElementById('btnSaveIASettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveIASettings');
    const keyInput = document.getElementById('espaceGeminiKey');
    const allowAnimCheck = document.getElementById('allowAnimAI');
    const defaultCreditsInput = document.getElementById('defaultAICredits');
    const resetCreditsCheck = document.getElementById('resetAllCredits');

    const newKey = keyInput.value.trim();
    const allowAnim = allowAnimCheck.checked;
    const newDefaultCredits = parseInt(defaultCreditsInput.value) || 0;
    const doReset = resetCreditsCheck.checked;

    btnLoading(btn, true);
    try {
        // Validation de la clé si elle est modifiée et non vide
        if (newKey && newKey !== currentGeminiKey) {
            try {
                await _testGeminiKey(newKey);
            } catch (err) {
                showToast("Clé API invalide ou non supportée : " + err.message, "error");
                btnLoading(btn, false);
                return;
            }
        }

        const updateData = {
            geminiKey: newKey,
            allowAnimAI: allowAnim,
            defaultAICredits: newDefaultCredits
        };
        await db.collection('espaces').doc(espaceId).update(updateData);
        
        currentGeminiKey = newKey;
        isAIGeneratorEnabled = allowAnim;
        defaultAICredits = newDefaultCredits;

        // Réinitialisation massive si demandée
        if (doReset) {
            const snap = await db.collection('accessRequests')
                .where('espaceId', '==', espaceId)
                .where('status', '==', 'approved')
                .get();
            
            const batch = db.batch();
            snap.docs.forEach(doc => {
                batch.update(doc.ref, { aiCredits: newDefaultCredits });
            });
            await batch.commit();
            showToast("Paramètres et crédits réinitialisés.", "success");
        } else {
            showToast("Paramètres IA mis à jour.", "success");
        }
        
        // Update UI
        if (newKey) {
            document.getElementById('iaStatusInfo')?.classList.remove('hidden');
        } else {
            document.getElementById('iaStatusInfo')?.classList.add('hidden');
        }
        
        closeModal('overlayIASettings');
        if (doReset) loadAnimateurs(espaceId);
    } catch (err) {
        console.error('saveIASettings:', err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

async function editAnimCredits(requestId, currentCredits) {
    const input = document.getElementById('inputEditCredits');
    if (input) input.value = currentCredits;
    
    const btn = document.getElementById('btnSaveEditCredits');
    // On remplace le bouton par un clone pour supprimer les anciens event listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        const credits = parseInt(input.value);
        if (isNaN(credits)) return;

        btnLoading(newBtn, true);
        try {
            await db.collection('accessRequests').doc(requestId).update({ aiCredits: credits });
            showToast("Crédits mis à jour.", "success");
            closeModal('overlayEditCredits');
            loadAnimateurs(espaceId);
        } catch (err) {
            console.error("editAnimCredits:", err);
            showToast("Erreur lors de la mise à jour.", "error");
        } finally {
            btnLoading(newBtn, false);
        }
    });

    openModal('overlayEditCredits');
}

/**
 * Teste la validité d'une clé Gemini via un appel minimal
 */
async function _testGeminiKey(key) {
    const prompt = "Réponds simplement par 'OK' si tu reçois ce message.";
    try {
        await _callGemini(key, prompt);
        return true;
    } catch (err) {
        throw err;
    }
}

/**
 * Décrémente les crédits de l'utilisateur actuel
 */
async function _decrementAICredits() {
    // 1. Toujours incrémenter l'usage global de la session si on utilise la clé du directeur
    if (currentGeminiKey) {
        try {
            await db.collection('espaces').doc(espaceId).update({
                iaUsageCount: firebase.firestore.FieldValue.increment(1)
            });
            const usageEl = document.getElementById('iaUsageCounter');
            if (usageEl) {
                const currentVal = parseInt(usageEl.textContent || "0");
                usageEl.textContent = currentVal + 1;
            }
        } catch (err) {
            console.warn("Usage counter update failed:", err);
        }
    }

    // 2. Décrémenter les crédits personnels si l'utilisateur est un animateur
    if (currentRole !== 'admin' && currentAICredits < 9000) {
        currentAICredits--;
        try {
            const reqSnap = await db.collection('accessRequests')
                .where('userId', '==', currentUser.uid)
                .where('espaceId', '==', espaceId)
                .get();
            if (!reqSnap.empty) {
                await reqSnap.docs[0].ref.update({ aiCredits: currentAICredits });
            }
        } catch (err) {
            console.error("Error decrementing credits:", err);
        }
    }
}

// ----------------------------------------------------------------
// GÉNÉRATEUR D'IDÉES D'ANIMATION IA
// ----------------------------------------------------------------

document.getElementById('btnGenerateActivity')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnGenerateActivity');
    const type = document.querySelector('input[name="activityType"]:checked')?.value;
    const location = document.getElementById('activityLocation')?.value;
    const season = document.getElementById('activitySeason')?.value;
    const material = document.getElementById('activityMaterial')?.value;
    
    // Récupérer les tranches d'âge (multiples)
    const ageEls = document.querySelectorAll('input[name="activityAge"]:checked');
    const ages = Array.from(ageEls).map(el => el.value).join(', ') || "tous âges";
    
    const resultArea = document.getElementById('activityResultArea');
    const resultContent = document.getElementById('activityResultContent');

    // ... (Vérification crédits et clé identique) ...
    // Vérification des crédits (si anim)
    if (currentRole !== 'admin' && currentAICredits <= 0) {
        showToast("Vous avez épuisé vos crédits IA pour cette session.", "error");
        return;
    }

    let effectiveKey = currentGeminiKey || GEMINI_API_KEY;
    if (!effectiveKey) {
        showToast("Aucune clé API configurée pour la session.", "error");
        return;
    }

    btnLoading(btn, true);
    try {
        const prompt = `Tu es un assistant expert en animation socioculturelle (BAFA). 
Ta mission est de proposer une idée d'animation unique et pertinente pour une colonie de vacances.

CRITÈRES :
- Type : ${type}
- Lieu : ${location}
- Saison : ${season}
- Tranches d'âge : ${ages}
- Matériel disponible : ${material}

CONTEXTE : 
Tu dois t'appuyer sur l'esprit des activités proposées sur le site "Jeux-BAFA", qui contient des sections sur les grands jeux (activites.html), les veillées (veillees.html), les chants (musique.html), la réglementation (reglementation.html) et les manuels de formation.

RÉPONSE ATTENDUE (en français, ton enthousiaste et professionnel, format Markdown léger) :
1. **Titre accrocheur**
2. **Objectif pédagogique / But du jeu**
3. **Matériel nécessaire** (respecte impérativement la contrainte : ${material})
4. **Déroulement détaillé** (Préparation, Lancement, Jeu, Retour au calme)
5. **Conseils d'animateur** (Sécurité, variantes, ou lien vers un site externe comme 'Planet'Anim' ou 'Le Journal de l'Animation' si pertinent).

Sois précis et assure-toi que l'activité est réalisable avec les critères donnés.`;

        const result = await _callGemini(effectiveKey, prompt);
        
        // Conversion basique markdown vers HTML pour les étoiles et gras
        let htmlResult = result
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');
            
        resultContent.innerHTML = htmlResult;
        resultArea.classList.remove('hidden');

        // Décompte des crédits et usage
        await _decrementAICredits();
        
        showToast("Idée générée !", "success");
    } catch (err) {
        console.error("AI Activity error:", err);
        showToast("Erreur lors de la génération. " + err.message, "error");
    } finally {
        btnLoading(btn, false);
    }
});

// ----------------------------------------------------------------
// RÉINITIALISATION MASSIVE (Admin seulement)
// ----------------------------------------------------------------
document.getElementById('btnDeleteAllParticipants')?.addEventListener('click', () => {
    const input = document.getElementById('inputResetConfirmText');
    const btn = document.getElementById('btnExecuteMassReset');
    if (input) {
        input.value = '';
        input.oninput = (e) => {
            btn.disabled = e.target.value !== 'SUPPRIMER';
        };
    }
    
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);
    newBtn.disabled = true;

    newBtn.addEventListener('click', async () => {
        btnLoading(newBtn, true);
        try {
            const snap = await db.collection('espaces').doc(espaceId).collection('participants').get();
            if (snap.empty) {
                showToast("Il n'y a aucun participant à supprimer.", "info");
                closeModal('overlayMassReset');
                return;
            }

            const batchSize = 500;
            let docs = [...snap.docs];
            while (docs.length > 0) {
                const batch = db.batch();
                const chunk = docs.splice(0, batchSize);
                chunk.forEach(d => batch.delete(d.ref));
                await batch.commit();
            }

            showToast("Liste des participants réinitialisée.", "success");
            closeModal('overlayMassReset');
            await loadParticipants(espaceId, currentRole);
        } catch (err) {
            console.error('Delete all participants error:', err);
            showToast("Erreur lors de la suppression.", "error");
        } finally {
            btnLoading(newBtn, false);
        }
    });

    openModal('overlayMassReset');
});

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
                genre: data.genre,
                groupeId: data.groupeId || null,
                note: data.note || '',
                appreciation: data.appreciation || '',
                spec: data.spec || []
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
                        groupeId: p.groupeId || null,
                        note: p.note || '',
                        appreciation: p.appreciation || '',
                        spec: Array.isArray(p.spec) ? p.spec : (p.spec ? p.spec.split(',').map(s=>s.trim()) : []),
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

        const reqMap = {};
        snap.docs.forEach(doc => {
            const data = doc.data();
            reqMap[data.userId] = { requestId: doc.id, espaceRole: data.espaceRole || 'anim' };
        });
        const userIds = Object.keys(reqMap);

        // On récupère aussi l'admin qui a créé la colo s'il n'est pas déjà dans la liste
        const coloDoc = await db.collection('espaces').doc(coloId).get();
        if (coloDoc.exists && coloDoc.data().createdBy) {
            const creatorId = coloDoc.data().createdBy;
            if (!userIds.includes(creatorId)) {
                userIds.push(creatorId);
                reqMap[creatorId] = { requestId: null, espaceRole: 'admin' };
            }
        }

        // 2. Si ADMIN : Récupérer aussi les demandes EN ATTENTE
        const pendingAnimsData = [];
        if (currentRole === 'admin') {
            const pendingSnap = await db.collection('accessRequests')
                .where('espaceId', '==', coloId)
                .where('status', '==', 'pending')
                .get();

            for (const doc of pendingSnap.docs) {
                const req = doc.data();
                // On récupère les infos de l'user pour avoir sa photo etc.
                const uDoc = await db.collection('users').doc(req.userId).get();
                if (uDoc.exists) {
                    pendingAnimsData.push({
                        id: uDoc.id,
                        requestId: doc.id,
                        isPending: true,
                        requestedAt: req.requestedAt,
                        ...uDoc.data()
                    });
                }
            }
        }

        // 3. Récupérer les données de chaque utilisateur APPROUVÉ
        const approvedAnimsData = [];
        for (const uid of userIds) {
            const uDoc = await db.collection('users').doc(uid).get();
            if (uDoc.exists) {
                const req = reqMap[uid];
                // Récupérer les crédits IA depuis la demande d'accès
                let animCredits = defaultAICredits;
                if (req.requestId) {
                    const rDoc = await db.collection('accessRequests').doc(req.requestId).get();
                    if (rDoc.exists && rDoc.data().aiCredits !== undefined) {
                        animCredits = rDoc.data().aiCredits;
                    }
                }

                approvedAnimsData.push({ 
                    id: uDoc.id, 
                    isPending: false, 
                    requestId: req.requestId,
                    espaceRole: req.espaceRole || 'anim',
                    aiCredits: animCredits,
                    ...uDoc.data() 
                });
            }
        }

        const allAnims = [...pendingAnimsData, ...approvedAnimsData];

        // Mettre à jour les points de notification si ADMIN
        if (currentRole === 'admin') {
            const hasPending = pendingAnimsData.length > 0;
            document.getElementById('userMenuDot')?.classList.toggle('hidden', !hasPending);
            document.getElementById('navDotAnims')?.classList.toggle('hidden', !hasPending);
        }

        if (allAnims.length === 0) {
            listEl.innerHTML = `<div class="text-center text-muted" style="padding:24px;">Aucun animateur sur cet espace.</div>`;
            return;
        }

        // 4. Afficher
        listEl.innerHTML = allAnims.map(anim => `
            <div class="es-anim-item ${anim.isPending ? 'es-anim-item--pending' : ''}">
                <div class="es-anim-item__avatar">
                    ${anim.photoURL
                ? `<img src="${anim.photoURL}" alt="${anim.displayName}">`
                : `<i class="bi bi-person-circle" style="font-size:24px; opacity:0.5;"></i>`}
                </div>
                <div class="es-anim-item__info">
                    <div class="es-anim-item__name">
                        ${anim.displayName || 'Anonyme'}
                        ${anim.isPending ? '<span style="font-size:0.65rem; color:var(--clr-warning); margin-left:5px; font-weight:800; text-transform:uppercase;">(En attente)</span>' : ''}
                    </div>
                    ${anim.isPending ? `
                        <div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:2px;">
                            <i class="bi bi-clock"></i> Demandé le ${formatFullDate(anim.requestedAt)}
                        </div>
                    ` : `
                        <div class="es-anim-item__email">${anim.email || ''}</div>
                    `}
                </div>
                
                ${anim.isPending ? `
                    <div style="display:flex; gap:6px;">
                        <button class="es-btn es-btn--sm" style="background:var(--clr-success); color:#fff; padding:4px 8px;" 
                                onclick="handleRequestStatus('${anim.requestId}', 'approved')">
                            <i class="bi bi-check-lg"></i>
                        </button>
                        <button class="es-btn es-btn--sm" style="background:var(--clr-danger); color:#fff; padding:4px 8px;" 
                                onclick="handleRequestStatus('${anim.requestId}', 'refused')">
                            <i class="bi bi-x-lg"></i>
                        </button>
                    </div>
                ` : `
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="es-badge ${anim.role === 'admin' || anim.espaceRole === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}" style="white-space:nowrap;">
                            ${anim.role === 'admin' || anim.espaceRole === 'admin' ? 'Directeur' : (anim.espaceRole === 'anim-admin' ? 'Anim Admin' : 'Animateur')}
                        </div>

                        ${currentGeminiKey && anim.espaceRole !== 'admin' ? `
                            <div class="es-credits-badge" style="display:flex; align-items:center; gap:8px; background:rgba(var(--clr-primary-rgb), 0.1); padding:4px 10px; border-radius:8px; border:1px solid rgba(var(--clr-primary-rgb), 0.2); font-size:0.85rem; font-weight:600;">
                                <i class="bi bi-robot" style="color:var(--clr-primary);"></i>
                                <span style="color:var(--clr-text);">${anim.aiCredits}</span>
                                ${currentRole === 'admin' ? `
                                    <button class="es-btn es-btn--ghost es-btn--sm" style="padding:0; min-width:24px; height:24px; font-size:0.75rem; margin-left:2px; color:var(--clr-primary);" onclick="editAnimCredits('${anim.requestId}', ${anim.aiCredits})" title="Ajuster les crédits">
                                        <i class="bi bi-pencil-square"></i>
                                    </button>
                                ` : ''}
                            </div>
                        ` : ''}

                        ${(currentRole === 'admin' && anim.role !== 'admin' && anim.espaceRole !== 'admin' && anim.requestId) ? `
                            <button class="es-btn es-btn--sm es-btn--secondary" 
                                    onclick="toggleAnimAdmin('${anim.requestId}', '${anim.espaceRole === 'anim-admin' ? 'anim' : 'anim-admin'}')"
                                    title="${anim.espaceRole === 'anim-admin' ? 'Retirer les droits Admin' : 'Donner les droits Admin'}"
                                    style="padding:2px 6px; font-size:0.7rem;">
                                ${anim.espaceRole === 'anim-admin' ? '<i class="bi bi-arrow-down-circle"></i>' : '<i class="bi bi-arrow-up-circle"></i>'}
                            </button>
                        ` : ''}
                    </div>
                `}
            </div>
        `).join('');

    } catch (err) {
        console.error('loadAnimateurs error:', err);
        listEl.innerHTML = `<div class="text-center text-danger" style="padding:24px;">Erreur lors du chargement de l'équipe.</div>`;
    }
}

async function handleRequestStatus(requestId, newStatus) {
    if (!confirm(newStatus === 'approved' ? 'Accepter cette demande ?' : 'Refuser cette demande ?')) return;

    try {
        await db.collection('accessRequests').doc(requestId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(newStatus === 'approved' ? 'Accès accordé.' : 'Accès refusé.', 'success');
        // Recharger la liste
        loadAnimateurs(espaceId);
    } catch (err) {
        console.error('handleRequestStatus error:', err);
        showToast('Erreur lors du traitement.', 'error');
    }
}

async function toggleAnimAdmin(requestId, newRole) {
    const msgEl = document.getElementById('confirmAdminMsg');
    if (msgEl) {
        msgEl.textContent = newRole === 'anim-admin' 
            ? "Voulez-vous donner les droits d'administration de cet espace à cet animateur ? Il pourra alors gérer les participants et les réglages de la session."
            : "Voulez-vous retirer les droits d'administration de cet espace à cet utilisateur ?";
    }

    const btn = document.getElementById('btnConfirmAdminAction');
    // On remplace le bouton par un clone pour supprimer les anciens event listeners
    const newBtn = btn.cloneNode(true);
    btn.parentNode.replaceChild(newBtn, btn);

    newBtn.addEventListener('click', async () => {
        btnLoading(newBtn, true);
        try {
            await db.collection('accessRequests').doc(requestId).update({
                espaceRole: newRole
            });
            showToast("Rôle mis à jour.", "success");
            closeModal('overlayConfirmAdmin');
            loadAnimateurs(espaceId);
        } catch (e) {
            console.error("toggleAnimAdmin error:", e);
            showToast("Erreur lors de la modification.", "error");
        } finally {
            btnLoading(newBtn, false);
        }
    });

    openModal('overlayConfirmAdmin');
}
// ----------------------------------------------------------------
// GESTION DES GROUPES (Directeur)
// ----------------------------------------------------------------

async function loadGroups(id, role) {
    if (!id) return;
    try {
        const snap = await db.collection('espaces').doc(id).collection('groups').orderBy('name').get();
        currentGroups = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Afficher/Cacher le champ groupe dans le formulaire participant
        const field = document.getElementById('fieldParticipantGroup');
        if (field) {
            field.classList.toggle('hidden', currentGroups.length === 0);
        }

        // Mettre à jour le select dans le formulaire participant
        const select = document.getElementById('pGroup');
        if (select) {
            const val = select.value;
            select.innerHTML = '<option value="">-- Aucun groupe --</option>' +
                currentGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
            select.value = val;
        }

        // Afficher le bouton de gestion pour les admins et anims-admins
        if (role === 'admin' || isAnimAdmin) {
            document.getElementById('btnManageGroups')?.classList.remove('hidden');
        }

        // Mettre à jour les filtres de la table participants
        buildFilters();

        // Re-render le tableau pour la colonne groupe
        renderParticipantsTable(role);

    } catch (err) {
        console.error('loadGroups error:', err);
    }
}

document.getElementById('btnManageGroups')?.addEventListener('click', () => {
    renderGroupsNameList();
    openModal('overlayManageGroups');
});

document.getElementById('btnCloseManageGroups')?.addEventListener('click', () => closeModal('overlayManageGroups'));
document.getElementById('btnFinishGroups')?.addEventListener('click', () => closeModal('overlayManageGroups'));

let editingGroupId = null;

function renderGroupsNameList() {
    const listEl = document.getElementById('groupsNameList');
    if (!listEl) return;

    if (currentGroups.length === 0) {
        listEl.innerHTML = '<div class="text-center text-muted" style="padding:15px;">Aucun groupe créé.</div>';
        return;
    }

    listEl.innerHTML = currentGroups.map(g => {
        if (g.id === editingGroupId) {
            return `
            <div class="es-anim-item" style="padding: 8px 12px; display:flex; gap:8px;">
                <input type="text" id="editGroupInput_${g.id}" class="es-input" style="flex:1; padding:4px 8px; font-size:0.9rem;" value="${escapeHtml(g.name)}" onkeydown="if(event.key==='Enter') saveEditedGroupName('${g.id}')">
                <button class="es-btn es-btn--primary es-btn--sm" onclick="saveEditedGroupName('${g.id}')" title="Enregistrer"><i class="bi bi-check-lg"></i></button>
                <button class="es-btn es-btn--secondary es-btn--sm" onclick="cancelEditGroupName()" title="Annuler"><i class="bi bi-x-lg"></i></button>
            </div>`;
        } else {
            return `
            <div class="es-anim-item" style="padding: 8px 12px;">
                <div class="es-anim-item__info">
                    <div class="es-anim-item__name" style="font-size:0.9rem;">${escapeHtml(g.name)}</div>
                </div>
                <div style="display:flex;gap:4px;">
                    <button class="es-btn es-btn--secondary es-btn--sm" onclick="setEditingGroupId('${g.id}')" title="Modifier">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="es-btn es-btn--danger es-btn--sm" onclick="deleteGroupName('${g.id}', ${escapeHtml(JSON.stringify(g.name))})" title="Supprimer">
                        <i class="bi bi-trash3"></i>
                    </button>
                </div>
            </div>`;
        }
    }).join('');

    if (editingGroupId) {
        setTimeout(() => {
            const input = document.getElementById(`editGroupInput_${editingGroupId}`);
            if (input) {
                input.focus();
                input.select();
            }
        }, 10);
    }

}

document.getElementById('btnAddGroupName')?.addEventListener('click', async () => {
    const input = document.getElementById('inputNewGroupName');
    const name = input.value.trim();
    if (!name) return;

    try {
        await db.collection('espaces').doc(espaceId).collection('groups').add({ name });
        input.value = '';
        await loadGroups(espaceId, currentRole);
        renderGroupsNameList();
        showToast('Groupe créé.', 'success');
    } catch (err) {
        console.error('addGroup error:', err);
        showToast('Erreur lors de la création du groupe.', 'error');
    }
});

async function deleteGroupName(id, name) {
    const pLabel = isColoFormation ? 'stagiaires' : 'jeunes';
    if (!confirm(`Supprimer le groupe "${name}" ? Cela ne supprimera pas les ${pLabel}, mais ils n'auront plus de groupe attribué.`)) return;

    try {
        await db.collection('espaces').doc(espaceId).collection('groups').doc(id).delete();
        await loadGroups(espaceId, currentRole);
        renderGroupsNameList();
        showToast('Groupe supprimé.', 'success');
    } catch (err) {
        console.error('deleteGroup error:', err);
        showToast('Erreur lors de la suppression.', 'error');
    }
}

function setEditingGroupId(id) {
    editingGroupId = id;
    renderGroupsNameList();
}

function cancelEditGroupName() {
    editingGroupId = null;
    renderGroupsNameList();
}

async function saveEditedGroupName(id) {
    const input = document.getElementById(`editGroupInput_${id}`);
    if (!input) return;
    const newName = input.value.trim();
    if (!newName) return;
    
    const oldGroup = currentGroups.find(x => x.id === id);
    if (!oldGroup || oldGroup.name === newName) {
        cancelEditGroupName();
        return;
    }

    try {
        await db.collection('espaces').doc(espaceId).collection('groups').doc(id).update({ name: newName });
        editingGroupId = null;
        await loadGroups(espaceId, currentRole);
        renderGroupsNameList();
        showToast('Groupe renommé.', 'success');
    } catch (err) {
        console.error('editGroup error:', err);
        showToast('Erreur lors du renommage.', 'error');
    }
}
// ----------------------------------------------------------------
// MODALE REMARQUE
// ----------------------------------------------------------------
function openNoteModal(fullNote) {
    const textEl = document.getElementById('viewNoteText');
    if (textEl) textEl.textContent = fullNote;
    openModal('overlayViewNote');
}

document.getElementById('btnCloseViewNote')?.addEventListener('click', () => closeModal('overlayViewNote'));
document.getElementById('btnFinishViewNote')?.addEventListener('click', () => closeModal('overlayViewNote'));

// ----------------------------------------------------------------
// GESTION DES ALERTES / ÉVÉNEMENTS
// ----------------------------------------------------------------
let alertsUnsubscribe = null;
let lastAlertsData = [];
let lastUserRole = '';
let notifiedAlertIds = new Set();

// ----------------------------------------------------------------
// NOTIFICATIONS PUSH (SERVICE WORKER)
// ----------------------------------------------------------------

function requestNotificationPermission() {
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                console.log("Accès aux notifications accordé.");
            }
        });
    }
}

function sendLocalPush(alert) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const payload = {
        title: "📢 Nouveau message BAFA",
        body: alert.message,
        icon: '/jeux-bafa/public/images/favicon.webp',
        data: { url: window.location.href, id: alert.id }
    };

    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'SHOW_NOTIFICATION',
            payload: payload
        });
    } else {
        new Notification(payload.title, { body: payload.body, icon: payload.icon });
    }
}

function loadAlerts(coloId, role) {
    lastUserRole = role;
    if (alertsUnsubscribe) alertsUnsubscribe();

    requestNotificationPermission();
    let isInitialLoad = true;

    alertsUnsubscribe = db.collection('espaces').doc(coloId).collection('alerts')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (!isInitialLoad) {
                snap.docChanges().forEach(change => {
                    if (change.type === "added") {
                        const alert = change.doc.data();
                        alert.id = change.doc.id;
                        const scheduledTime = alert.scheduledAt ? (alert.scheduledAt.toDate ? alert.scheduledAt.toDate() : new Date(alert.scheduledAt)) : null;
                        const isNow = !scheduledTime || scheduledTime <= new Date();
                        if (isNow && !notifiedAlertIds.has(alert.id)) {
                            sendLocalPush(alert);
                            notifiedAlertIds.add(alert.id);
                        }
                    }
                });
            } else {
                data.forEach(alert => {
                    const scheduledTime = alert.scheduledAt ? (alert.scheduledAt.toDate ? alert.scheduledAt.toDate() : new Date(alert.scheduledAt)) : null;
                    const isNow = !scheduledTime || scheduledTime <= new Date();
                    if (isNow) {
                        notifiedAlertIds.add(alert.id);
                    }
                });
            }
            isInitialLoad = false;

            lastAlertsData = data;
            renderAlerts(lastAlertsData, role);
        }, err => console.error("Alerts error:", err));
}

function renderAlerts(alerts, role) {
    const container = document.getElementById('alertsContainer');
    const scheduledContainer = document.getElementById('scheduledAlertsContainer');
    const scheduledList = document.getElementById('scheduledAlertsList');
    if (!container) return;

    const now = new Date();

    // Séparer les alertes actives des programmées
    const activeAlerts = [];
    const futureAlerts = [];

    alerts.forEach(alert => {
        const scheduledTime = alert.scheduledAt ? (alert.scheduledAt.toDate ? alert.scheduledAt.toDate() : new Date(alert.scheduledAt)) : null;
        if (!scheduledTime || scheduledTime <= now) {
            activeAlerts.push(alert);
        } else {
            futureAlerts.push(alert);
        }
    });

    if (activeAlerts.length === 0) {
        container.innerHTML = '';
    } else {
        // Fonction simple pour parser le markdown (**gras**, *italique*)
        const parseMarkdown = (text) => {
            if (!text) return "";
            const escaped = escapeHtml(text);
            return escaped
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/_(.*?)_/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        };

        const colors = {
            low: { bg: 'rgba(52, 152, 219, 0.3)', border: 'rgba(52, 152, 219, 0.6)', color: '#ffffff', icon: 'bi-info-circle' },
            medium: { bg: 'rgba(243, 156, 18, 0.15)', border: 'rgba(243, 156, 18, 0.4)', color: '#f39c12', icon: 'bi-exclamation-triangle' },
            high: { bg: 'rgba(231, 76, 60, 0.35)', border: 'rgba(231, 76, 60, 0.6)', color: '#ffffff', icon: 'bi-exclamation-octagon-fill' }
        };

        container.innerHTML = activeAlerts.map(alert => {
            const theme = colors[alert.severity] || colors.medium;
            let icon = theme.icon;
            if (alert.type === 'meds') icon = 'bi-capsule';
            else if (alert.type === 'activity') icon = 'bi-calendar-event';
            else if (alert.type === 'warning') icon = 'bi-shield-exclamation';

            const isWeatherAlert = alert.createdBy === 'Météo Auto';
            const canDelete = role === 'admin' || isAnimAdmin || (!alert.locked && !isWeatherAlert);
            const parsedMessage = parseMarkdown(alert.message);

            let dateInfo = '';
            let isTodayMsg = false;
            const timestamp = alert.scheduledAt || alert.createdAt;
            if (timestamp) {
                const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
                const isToday = d.toDateString() === now.toDateString();
                const timeStr = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                if (isToday) {
                    isTodayMsg = true;
                    dateInfo = ` à ${timeStr}`;
                } else {
                    const dateStr = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
                    dateInfo = ` le ${dateStr} à ${timeStr}`;
                }
            }

            const postedStr = isTodayMsg
                ? `Posté aujourd'hui par ${alert.createdBy || 'Système'}${dateInfo}`
                : `Posté par ${alert.createdBy || 'Système'}${dateInfo}`;

            return `
                <div class="es-alert-item" style="display:flex; align-items:flex-start; justify-content:space-between; padding:13px 18px; border-radius:12px; border:1px solid ${theme.border}; background:${theme.bg}; color:${theme.color}; gap: 15px; backdrop-filter: blur(8px); transition: all 0.3s ease; width: 100%; box-sizing: border-box; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                    <div style="display:flex; align-items:flex-start; gap:14px; flex: 1; min-width: 0;">
                        <i class="bi ${icon}" style="font-size:1.35rem; flex-shrink: 0; margin-top: 2px;"></i>
                        <div style="display:flex; flex-direction:column; gap:4px; flex: 1; min-width: 0;">
                            <span style="font-weight:600; font-size:0.96rem; line-height:1.5; overflow-wrap: anywhere; word-break: normal; white-space: normal;">${parsedMessage}</span>
                            <span style="font-size:0.75rem; opacity:0.8; font-style:italic;">${postedStr}</span>
                        </div>
                    </div>
                    ${canDelete ? `
                        <button onclick="deleteAlert('${alert.id}')" style="background:rgba(255,255,255,0.15); border:none; width:30px; height:30px; border-radius:50%; color:inherit; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; transition: all 0.2s; margin-top: 2px;" onmouseover="this.style.background='rgba(255,255,255,0.3)'; this.style.transform='scale(1.1)';" onmouseout="this.style.background='rgba(255,255,255,0.15)'; this.style.transform='scale(1)';" title="Marquer comme fait / Supprimer">
                            <i class="bi bi-x-lg" style="font-size:0.85rem;"></i>
                        </button>
                    ` : `
                        <div style="width:30px; height:30px; display:flex; align-items:center; justify-content:center; opacity:0.35; flex-shrink:0; margin-top: 2px;" title="Verrouillé par le directeur">
                            <i class="bi bi-lock-fill" style="font-size:0.95rem;"></i>
                        </div>
                    `}
                </div>
            `;
        }).join('');
    }

    // Gérer l'affichage des alertes futures (pour le créateur/admin)
    if (scheduledContainer && scheduledList) {
        if (futureAlerts.length > 0) {
            scheduledContainer.classList.remove('hidden');

            // Tri : de la plus proche (bientôt) à la plus lointaine
            futureAlerts.sort((a, b) => {
                const da = a.scheduledAt.toDate ? a.scheduledAt.toDate() : new Date(a.scheduledAt);
                const db = b.scheduledAt.toDate ? b.scheduledAt.toDate() : new Date(b.scheduledAt);
                return da - db;
            });

            // Affichage partiel si non déplié
            const visibleAlerts = isScheduledAlertsExpanded ? futureAlerts : futureAlerts.slice(0, 3);

            let html = visibleAlerts.map(alert => {
                const date = alert.scheduledAt.toDate ? alert.scheduledAt.toDate() : new Date(alert.scheduledAt);
                const dateStr = date.toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                return `
                    <div style="background:rgba(255,255,255,0.05); padding:10px 14px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                            <i class="bi bi-calendar-check" style="color:var(--clr-primary); font-size:1.1rem;"></i>
                            <div style="display:flex; flex-direction:column; min-width:0;">
                                <span style="font-size:0.85rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${alert.message}</span>
                                <span style="font-size:0.75rem; opacity:0.6;">Prévu pour le ${dateStr}</span>
                            </div>
                        </div>
                        ${(role === 'admin' || isAnimAdmin || alert.createdBy !== 'Météo Auto') ? `
                        <button onclick="deleteAlert('${alert.id}')" style="background:none; border:none; color:var(--clr-danger); cursor:pointer; padding:5px; opacity:0.7;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.7'" title="Annuler la programmation">
                            <i class="bi bi-trash"></i>
                        </button>
                        ` : `
                        <div style="padding:5px; opacity:0.35;" title="Programmé par la météo">
                            <i class="bi bi-lock-fill"></i>
                        </div>
                        `}
                    </div>
                `;
            }).join('');

            // Bouton Voir plus / Replier
            if (futureAlerts.length > 3) {
                html += `
                    <button onclick="toggleScheduledAlerts()" style="background:none; border:none; color:var(--clr-primary); font-size:0.75rem; font-weight:700; cursor:pointer; padding:8px 0; margin-top:4px; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:5px; align-self:center;">
                        ${isScheduledAlertsExpanded ? '<i class="bi bi-chevron-up"></i> Replier' : `<i class="bi bi-chevron-down"></i> Voir plus (${futureAlerts.length - 3})`}
                    </button>
                `;
            }

            scheduledList.innerHTML = html;
        } else {
            scheduledContainer.classList.add('hidden');
            scheduledList.innerHTML = '';
        }
    }
}

function toggleScheduledAlerts() {
    isScheduledAlertsExpanded = !isScheduledAlertsExpanded;
    if (lastAlertsData && lastUserRole) {
        renderAlerts(lastAlertsData, lastUserRole);
    }
}

// Rafraîchir l'affichage toutes les 30 secondes pour activer les alertes programmées
function checkAndTriggerAlerts() {
    if (typeof lastAlertsData !== 'undefined' && typeof lastUserRole !== 'undefined') {
        const now = new Date();
        // Vérifier si des alertes programmées doivent maintenant s'afficher et notifier
        lastAlertsData.forEach(alert => {
            const scheduledTime = alert.scheduledAt ? (alert.scheduledAt.toDate ? alert.scheduledAt.toDate() : new Date(alert.scheduledAt)) : null;
            if (scheduledTime && scheduledTime <= now && !notifiedAlertIds.has(alert.id)) {
                sendLocalPush(alert);
                notifiedAlertIds.add(alert.id);
            }
        });
        renderAlerts(lastAlertsData, lastUserRole);
    }
}

setInterval(checkAndTriggerAlerts, 30000);

// Écouter quand l'utilisateur réactive son téléphone ou revient sur l'onglet 
// (Permet de faire "popper" la notification manquante dès le déverrouillage du téléphone)
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === 'visible') {
        checkAndTriggerAlerts();
    }
});

document.getElementById('formCreateAlert')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btnCreateAlert');
    const message = document.getElementById('alertMessage').value.trim();
    const type = document.getElementById('alertType').value;
    const severity = document.getElementById('alertSeverity').value;
    const locked = document.getElementById('alertLocked')?.checked || false;

    if (!message || !espaceId) return;

    // Gestion de la programmation
    const isScheduled = document.getElementById('alertIsScheduled')?.checked || false;
    let scheduledAt = null;
    if (isScheduled) {
        const dateVal = document.getElementById('alertDate').value;
        const timeVal = document.getElementById('alertTime').value;
        if (!dateVal || !timeVal) {
            showToast("Veuillez choisir une date et une heure pour la programmation.", "warning");
            return;
        }
        scheduledAt = new Date(`${dateVal}T${timeVal}`);
        if (scheduledAt <= new Date()) {
            showToast("La date programmée doit être dans le futur.", "warning");
            return;
        }
    }

    btnLoading(btn, true);
    try {
        await db.collection('espaces').doc(espaceId).collection('alerts').add({
            message,
            type,
            severity,
            locked,
            scheduledAt: scheduledAt ? firebase.firestore.Timestamp.fromDate(scheduledAt) : null,
            createdBy: currentUser.displayName || (currentUser.email ? currentUser.email.split('@')[0] : 'Inconnu'),
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('formCreateAlert').reset();
        document.getElementById('scheduleInputs')?.classList.add('hidden');
        showToast(scheduledAt ? "L'événement a été programmé." : "Événement créé avec succès !", "success");
    } catch (err) {
        console.error("CreateAlert error:", err);
        showToast("Erreur lors de la création.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

async function deleteAlert(alertId) {
    try {
        await db.collection('espaces').doc(espaceId).collection('alerts').doc(alertId).delete();
        showToast("Alerte levée.", "success");
    } catch (err) {
        console.error("DeleteAlert error:", err);
        showToast("Erreur lors de la suppression.", "error");
    }
}

// ----------------------------------------------------------------
// METEO
// ----------------------------------------------------------------
let currentMeteoParams = { lat: null, lon: null, locationName: null };

async function loadWeather(coloId, role) {
    db.collection('espaces').doc(coloId).onSnapshot(async snap => {
        if (!snap.exists) return;
        const data = snap.data();
        if (role === 'admin' || isAnimAdmin) {
            document.getElementById('weatherAdminContainer')?.classList.remove('hidden');
            const deleteBtn = document.getElementById('btnDeleteLocation');
            if (data.meteoLocation) {
                const meteoLocationInput = document.getElementById('meteoLocation');
                if (meteoLocationInput && !meteoLocationInput.value) {
                    meteoLocationInput.value = data.meteoLocation;
                }
                deleteBtn?.classList.remove('hidden');
            } else {
                deleteBtn?.classList.add('hidden');
            }
        }

        if (data.meteoLat && data.meteoLon) {
            document.getElementById('weatherEmptyState')?.classList.add('hidden');
            document.getElementById('weatherForecastContainer')?.classList.remove('hidden');

            const locNameEl = document.getElementById('weatherLocationName');
            const locationName = data.meteoLocationName || data.meteoLocation;
            if (locNameEl) locNameEl.textContent = `📍 ${locationName}`;

            currentMeteoParams = { lat: data.meteoLat, lon: data.meteoLon, locationName };
            await fetchAndDisplayWeather(data.meteoLat, data.meteoLon, role, locationName);
        } else {
            document.getElementById('weatherEmptyState')?.classList.remove('hidden');
            document.getElementById('weatherForecastContainer')?.classList.add('hidden');
        }

        // --- GESTION PP ---
        const sectionPP = document.getElementById('sectionPP');
        if (sectionPP) {
            if (data.ppId) {
                sectionPP.classList.remove('hidden');
                const btnViewPP = document.getElementById('btnViewPP');
                const ppIframe = document.getElementById('ppIframe');
                const ppPreviewArea = document.getElementById('ppPreviewArea');

                if (ppIframe) {
                    const previewUrl = `https://drive.google.com/file/d/${data.ppId}/preview`;
                    if (ppIframe.src !== previewUrl) {
                        ppIframe.src = previewUrl;
                    }
                    ppPreviewArea?.classList.remove('hidden');
                    document.getElementById('ppEmptyState')?.classList.add('hidden');
                }

                if (btnViewPP) {
                    btnViewPP.href = `https://drive.google.com/file/d/${data.ppId}/view?usp=sharing`;
                    btnViewPP.classList.remove('disabled');
                    btnViewPP.style.opacity = '1';
                    btnViewPP.style.pointerEvents = 'auto';
                    btnViewPP.style.cursor = 'pointer';
                }
            } else {
                sectionPP.classList.add('hidden');
            }
        }
    });
}

function getWeatherWMO(code) {
    if ([0, 1].includes(code)) return { icon: 'bi-sun', name: 'Soleil', bad: false, color: '#f1c40f' };
    if ([2, 3].includes(code)) return { icon: 'bi-cloud-sun', name: 'Nuages', bad: false, color: '#bdc3c7' };
    if ([45, 48].includes(code)) return { icon: 'bi-cloud-haze', name: 'Brouillard', bad: false, color: '#95a5a6' };
    if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return { icon: 'bi-cloud-rain', name: 'Pluie', bad: true, color: '#3498db' };
    if ([71, 73, 75, 77, 85, 86, 56, 57, 66, 67].includes(code)) return { icon: 'bi-cloud-snow', name: 'Neige', bad: true, color: '#ecf0f1' };
    if ([95, 96, 99].includes(code)) return { icon: 'bi-cloud-lightning-rain', name: 'Orage', bad: true, color: '#9b59b6' };
    return { icon: 'bi-cloud', name: 'Inconnu', bad: false, color: '#bdc3c7' };
}

async function fetchAndDisplayWeather(lat, lon, role, locationName) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=weathercode,temperature_2m&timezone=Europe%2FParis&forecast_days=5`);
        const data = await res.json();

        const daily = data.daily;
        const hourly = data.hourly;
        const container = document.getElementById('weatherDaysList');
        if (!container) return;

        let html = '';
        for (let i = 0; i < daily.time.length; i++) {
            const dateStr = daily.time[i];
            const code = daily.weathercode[i];
            const maxT = Math.round(daily.temperature_2m_max[i]);
            const minT = Math.round(daily.temperature_2m_min[i]);
            const d = new Date(dateStr);
            const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

            const morningIdx = i * 24 + 10;
            const afternoonIdx = i * 24 + 15;
            const eveningIdx = i * 24 + 20;

            const wMorning = getWeatherWMO(hourly.weathercode[morningIdx]);
            const wAfternoon = getWeatherWMO(hourly.weathercode[afternoonIdx]);
            const wEvening = getWeatherWMO(hourly.weathercode[eveningIdx]);
            const tempMorning = Math.round(hourly.temperature_2m[morningIdx]);
            const tempAfternoon = Math.round(hourly.temperature_2m[afternoonIdx]);
            const tempEvening = Math.round(hourly.temperature_2m[eveningIdx]);

            html += `
                <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:15px 8px; text-align:center; display:flex; flex-direction:column; gap:10px; min-width:160px; flex:1;">
                    <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--clr-text-light);">${dayName}</span>
                    <div style="display:flex; gap:6px; justify-content:center;">
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:0.6rem; text-transform:uppercase; opacity:0.5; font-weight:700;">Matin</span>
                            <i class="bi ${wMorning.icon}" style="font-size:1.3rem; color:${wMorning.color};" title="${wMorning.name}"></i>
                            <span style="font-size:0.8rem; font-weight:700;">${tempMorning}°</span>
                        </div>
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:0.6rem; text-transform:uppercase; opacity:0.5; font-weight:700;">Aprem</span>
                            <i class="bi ${wAfternoon.icon}" style="font-size:1.3rem; color:${wAfternoon.color};" title="${wAfternoon.name}"></i>
                            <span style="font-size:0.8rem; font-weight:700;">${tempAfternoon}°</span>
                        </div>
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:0.6rem; text-transform:uppercase; opacity:0.5; font-weight:700;">Soir</span>
                            <i class="bi ${wEvening.icon}" style="font-size:1.3rem; color:${wEvening.color};" title="${wEvening.name}"></i>
                            <span style="font-size:0.8rem; font-weight:700;">${tempEvening}°</span>
                        </div>
                    </div>
                    <div style="display:flex; justify-content:center; gap:8px; font-size:0.7rem; opacity:0.6; font-weight:500;">
                        <span>Min ${minT}°</span>
                        <span>Max ${maxT}°</span>
                    </div>
                </div>
            `;
        }
        container.innerHTML = html;

        // Déclencher la vérification automatique des alertes (admin uniquement)
        if (role === 'admin' || isAnimAdmin) {
            await checkAndCreateWeatherAlerts(data, locationName, role);
        }

    } catch (e) {
        console.error("Météo error:", e);
    }
}

async function checkAndCreateWeatherAlerts(weatherData, locationName, role) {
    if (role !== 'admin' && !isAnimAdmin) return 0;
    
    let limitDate = null;
    if (currentColoDateFin && !isNaN(new Date(currentColoDateFin).getTime())) {
        const endDate = new Date(currentColoDateFin);
        endDate.setHours(0, 0, 0, 0);
        
        limitDate = new Date(endDate);
        limitDate.setDate(limitDate.getDate() + 2);
        
        const todayAtMidnight = new Date();
        todayAtMidnight.setHours(0, 0, 0, 0);
        
        const wInfoMsg = document.getElementById('weatherEndInfo');
        if (todayAtMidnight > limitDate) {
            if (wInfoMsg) {
                wInfoMsg.classList.remove('hidden');
                wInfoMsg.innerHTML = `<i class="bi bi-info-circle"></i> ${isColoFormation ? "La formation est terminée. Plus aucune alerte météo ne sera générée." : "La colo est terminée. Plus aucune alerte météo ne sera générée."}`;
            }
            return 0;
        } else {
            if (wInfoMsg) wInfoMsg.classList.add('hidden');
        }
    }

    const daily = weatherData.daily;
    const hourly = weatherData.hourly;
    let newlyCreated = 0;

    for (let i = 0; i < daily.time.length; i++) {
        const dateStr = daily.time[i];
        const code = daily.weathercode[i];
        const wTableau = getWeatherWMO(code);

        // On ne génère des alertes que pour le futur (demain et +)
        const d = new Date(dateStr);
        d.setHours(0, 0, 0, 0);
        const todayAtMidnight = new Date();
        todayAtMidnight.setHours(0, 0, 0, 0);
        if (d <= todayAtMidnight) continue;
        
        // On stoppe la génération si la date prévue est au-delà des +2 jours de fin
        if (limitDate && d > limitDate) continue;

        if (wTableau.bad) {
            const morningIdx = i * 24 + 10;
            const afternoonIdx = i * 24 + 15;
            const eveningIdx = i * 24 + 20;

            const wMorning = getWeatherWMO(hourly.weathercode[morningIdx]);
            const wAfternoon = getWeatherWMO(hourly.weathercode[afternoonIdx]);
            const wEvening = getWeatherWMO(hourly.weathercode[eveningIdx]);

            let periods = [];
            if (wMorning.bad) periods.push("le matin");
            if (wAfternoon.bad) periods.push("l'aprem");
            if (wEvening.bad) periods.push("le soir");

            let timing = "";
            if (periods.length === 3 || periods.length === 0) timing = "la journée complète";
            else if (periods.length === 2) timing = periods.join(" et ");
            else timing = periods[0];

            const phenomenon = wTableau.name;
            const location = locationName || 'votre camp';
            const displayDate = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });

            // Calculer la date de programmation (la veille à midi)
            const scheduledAt = new Date(d);
            scheduledAt.setDate(scheduledAt.getDate() - 1);
            scheduledAt.setHours(12, 0, 0, 0);

            // Important : on vérifie si une alerte existe déjà pour cette DATE météo
            const existingSnap = await db.collection('espaces').doc(espaceId).collection('alerts')
                .where('weatherDate', '==', dateStr)
                .where('createdBy', '==', 'Météo Auto')
                .get();

            let shouldCreate = false;
            if (existingSnap.empty) {
                shouldCreate = true;
            } else {
                // Si l'alerte existe mais que le LIEU a changé, on la remplace
                const existingDoc = existingSnap.docs[0];
                const existingData = existingDoc.data();
                if (!existingData.message.includes(`à ${location}`)) {
                    await existingDoc.ref.delete();
                    shouldCreate = true;
                }
            }

            if (shouldCreate) {
                try {
                    let alertSeverity = 'high';
                    if (phenomenon.toLowerCase().includes('brouillard')) alertSeverity = 'medium';

                    await db.collection('espaces').doc(espaceId).collection('alerts').add({
                        message: `⚠️ ${phenomenon} prévu pour le ${displayDate} à ${location} ${timing} ! Prévoir un plan B !`,
                        type: 'warning',
                        severity: alertSeverity,
                        locked: true,
                        scheduledAt: firebase.firestore.Timestamp.fromDate(scheduledAt),
                        weatherDate: dateStr,
                        createdBy: 'Météo Auto',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    newlyCreated++;
                } catch (err) {
                    console.error("Erreur de création de l'alerte météo :", err);
                }
            }
        }
    }
    return newlyCreated;
}

document.getElementById('btnGenerateWeatherAlerts')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnGenerateWeatherAlerts');
    if (!currentMeteoParams.lat || !currentMeteoParams.lon) {
        showToast("Veuillez d'abord définir un lieu pour la météo.", "warning");
        return;
    }

    btnLoading(btn, true);
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${currentMeteoParams.lat}&longitude=${currentMeteoParams.lon}&daily=weathercode,temperature_2m_max,temperature_2m_min&hourly=weathercode,temperature_2m&timezone=Europe%2FParis&forecast_days=5`);
        const data = await res.json();
        const count = await checkAndCreateWeatherAlerts(data, currentMeteoParams.locationName, currentRole);

        if (count > 0) showToast(`${count} nouvelle(s) alerte(s) météo générée(s).`, "success");
        else showToast("Aucune nouvelle alerte météo à générer sur les 5 jours à venir.", "info");
    } catch (err) {
        console.error("Manual weather check error:", err);
        showToast("Erreur lors de la vérification météo.", "error");
    } finally {
        btnLoading(btn, false);
    }
});
// ----------------------------------------------------------------
// AUTOCOMPLETION METEO
// ----------------------------------------------------------------
const meteoLocationInput = document.getElementById('meteoLocation');
const meteoSuggestionsCont = document.getElementById('meteoSuggestions');
let meteoDebounceTimeout = null;

if (meteoLocationInput && meteoSuggestionsCont) {
    meteoLocationInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        // Réinitialiser les datas
        delete meteoLocationInput.dataset.lat;
        delete meteoLocationInput.dataset.lon;
        delete meteoLocationInput.dataset.name;

        if (query.length < 4) {
            meteoSuggestionsCont.classList.add('hidden');
            meteoSuggestionsCont.innerHTML = '';
            return;
        }

        clearTimeout(meteoDebounceTimeout);
        meteoDebounceTimeout = setTimeout(async () => {
            try {
                const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=fr&format=json`);
                const data = await res.json();
                if (data.results && data.results.length > 0) {
                    meteoSuggestionsCont.innerHTML = data.results.map(city => {
                        const fullName = `${city.name}${city.admin1 ? ', ' + city.admin1 : ''}${city.country ? ' (' + city.country + ')' : ''}`;
                        // Mettre en gras ce qui a été tapé
                        const regex = new RegExp(`(${query})`, 'gi');
                        const highlightedName = fullName.replace(regex, '<strong>$1</strong>');
                        return `<div class="meteo-suggestion-item" style="padding: 10px 14px; cursor: pointer; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 0.9rem;" data-name="${city.name}" data-fullname="${fullName}" data-lat="${city.latitude}" data-lon="${city.longitude}">
                            ${highlightedName}
                        </div>`;
                    }).join('');

                    meteoSuggestionsCont.classList.remove('hidden');

                    document.querySelectorAll('.meteo-suggestion-item').forEach(item => {
                        item.addEventListener('click', () => {
                            meteoLocationInput.value = item.getAttribute('data-fullname');
                            meteoLocationInput.dataset.lat = item.getAttribute('data-lat');
                            meteoLocationInput.dataset.lon = item.getAttribute('data-lon');
                            meteoLocationInput.dataset.name = item.getAttribute('data-name');
                            meteoSuggestionsCont.classList.add('hidden');
                        });
                        item.addEventListener('mouseover', () => item.style.background = 'rgba(0,0,0,0.05)');
                        item.addEventListener('mouseout', () => item.style.background = 'transparent');
                    });
                } else {
                    meteoSuggestionsCont.classList.add('hidden');
                }
            } catch (err) {
                console.error("Erreur de recherche météo:", err);
            }
        }, 350);
    });

    // Cacher si on clique à l'extérieur
    document.addEventListener('click', (e) => {
        if (!meteoLocationInput.contains(e.target) && !meteoSuggestionsCont.contains(e.target)) {
            meteoSuggestionsCont.classList.add('hidden');
        }
    });
}

document.getElementById('formSetLocation')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loc = document.getElementById('meteoLocation').value.trim();
    if (!loc) return;
    const btn = document.getElementById('btnSetLocation');
    const input = document.getElementById('meteoLocation');
    btnLoading(btn, true);

    try {
        let cityObj = null;
        // Si cliqué dans la liste, on a les data
        if (input.dataset.lat && input.dataset.lon && input.dataset.name) {
            cityObj = {
                name: input.dataset.name,
                latitude: parseFloat(input.dataset.lat),
                longitude: parseFloat(input.dataset.lon),
                country: loc.split('(')[1]?.replace(')', '') || ''
            };
        } else {
            // Sinon on fait une requête avec le premier résultat
            const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(loc)}&count=1&language=fr&format=json`);
            const data = await res.json();
            if (data.results && data.results.length > 0) {
                cityObj = data.results[0];
            }
        }

        if (!cityObj) {
            showToast("Ville non trouvée.", "warning");
        } else {
            await db.collection('espaces').doc(espaceId).update({
                meteoLocation: loc,
                meteoLocationName: `${cityObj.name} (${cityObj.country || ''})`,
                meteoLat: cityObj.latitude,
                meteoLon: cityObj.longitude
            });
            // Nettoyage
            delete input.dataset.lat;
            delete input.dataset.lon;
            delete input.dataset.name;
            meteoSuggestionsCont?.classList.add('hidden');

            showToast("Lieu enregistré et météo mise à jour.", "success");
        }
    } catch (e) {
        showToast("Erreur lors de la configuration de la météo.", "error");
    }
    btnLoading(btn, false);
});

document.getElementById('btnDeleteLocation')?.addEventListener('click', async () => {
    if (!confirm("Supprimer le lieu du séjour ? Cela arrêtera l'affichage de la météo.")) return;

    const btn = document.getElementById('btnDeleteLocation');
    const input = document.getElementById('meteoLocation');

    btnLoading(btn, true);
    try {
        await db.collection('espaces').doc(espaceId).update({
            meteoLocation: firebase.firestore.FieldValue.delete(),
            meteoLocationName: firebase.firestore.FieldValue.delete(),
            meteoLat: firebase.firestore.FieldValue.delete(),
            meteoLon: firebase.firestore.FieldValue.delete()
        });

        if (input) {
            input.value = '';
            delete input.dataset.lat;
            delete input.dataset.lon;
            delete input.dataset.name;
        }

        showToast("Le lieu a été supprimé.", "success");
    } catch (e) {
        console.error("DeleteLocation error:", e);
        showToast("Erreur lors de la suppression.", "error");
    }
    btnLoading(btn, false);
});

// ================================================================
// BIBLIOTHEQUE (PHOTOS)
// ================================================================

let currentPhotos = [];
let lightboxPhotos = [];
let currentLightboxIndex = 0;

function openLightbox(index) {
    currentLightboxIndex = index;
    updateLightboxUI();
    document.getElementById('overlayLightbox').classList.remove('hidden');
}

function updateLightboxUI() {
    const img = document.getElementById('lightboxImg');
    const info = document.getElementById('lightboxInfo');
    const photo = lightboxPhotos[currentLightboxIndex];
    if (img && photo) {
        img.style.opacity = '0';
        setTimeout(() => {
            img.src = photo.src;
            img.style.opacity = '1';
        }, 150);
    }
    if (info && photo) {
        info.innerHTML = `<strong>${escapeHtml(photo.author)}</strong> — ${currentLightboxIndex + 1} / ${lightboxPhotos.length}`;
    }
}

function navigateLightbox(dir) {
    currentLightboxIndex += dir;
    if (currentLightboxIndex < 0) currentLightboxIndex = lightboxPhotos.length - 1;
    if (currentLightboxIndex >= lightboxPhotos.length) currentLightboxIndex = 0;
    updateLightboxUI();
}

// Listeners Lightbox
document.getElementById('btnCloseLightbox')?.addEventListener('click', () => {
    document.getElementById('overlayLightbox').classList.add('hidden');
});
document.getElementById('btnPrevLightbox')?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(-1);
});
document.getElementById('btnNextLightbox')?.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateLightbox(1);
});
document.getElementById('overlayLightbox')?.addEventListener('click', (e) => {
    if (e.target.id === 'overlayLightbox' || e.target.classList.contains('lightbox-container')) {
        document.getElementById('overlayLightbox').classList.add('hidden');
    }
});

// Clavier
document.addEventListener('keydown', (e) => {
    if (document.getElementById('overlayLightbox').classList.contains('hidden')) return;
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
    if (e.key === 'Escape') document.getElementById('overlayLightbox').classList.add('hidden');
});

function loadPhotos(colo, role) {
    const uploadBtn = document.getElementById('btnUploadPhoto');
    const uploadDisabledMsg = document.getElementById('photoUploadDisabledMsg');
    const toggleUpload = document.getElementById('toggleAnimUpload');

    // Toggle state for admin
    if (toggleUpload) {
        toggleUpload.checked = colo.photoUploadEnabled === true;
        toggleUpload.addEventListener('change', async (e) => {
            try {
                await db.collection('espaces').doc(colo.id).update({
                    photoUploadEnabled: e.target.checked
                });
                showToast("Option mise à jour", "success");
            } catch (err) {
                showToast("Erreur", "error");
                e.target.checked = !e.target.checked;
            }
        });
    }

    // Upload permissions
    const canUpload = role === 'admin' || isAnimAdmin || (role === 'anim' && colo.photoUploadEnabled === true);
    if (canUpload) {
        uploadBtn?.classList.remove('hidden');
        uploadDisabledMsg?.classList.add('hidden');
    } else {
        uploadBtn?.classList.add('hidden');
        if (role === 'anim') {
            uploadDisabledMsg?.classList.remove('hidden');
        }
    }

    // Render once immediately for the background image
    renderPhotos(colo, role);

    try {
        db.collection('espaces').doc(colo.id).collection('photos')
            .orderBy('createdAt', 'desc')
            .onSnapshot(snap => {
                currentPhotos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                renderPhotos(colo, role);
            }, err => {
                console.warn("Snapshot photos échoué (règles Firebase ?) :", err);
            });
    } catch (err) {
        console.error("Photos:", err);
    }
}

function renderPhotos(colo, role) {
    const grid = document.getElementById('photosGrid');
    const empty = document.getElementById('photosEmpty');
    if (!grid || !empty) return;

    let allPhotosHTML = '';
    lightboxPhotos = [];

    // First photo is always the cover of the colony (if exists)
    if (colo.bgImage) {
        lightboxPhotos.push({ src: colo.bgImage, author: 'Image de couverture' });
        allPhotosHTML += `
            <div class="es-photo-item">
                <img src="${colo.bgImage}" alt="Cover photo" onclick="openLightbox(0)" style="cursor:zoom-in;">
                <div class="es-photo-author">Image de couverture</div>
            </div>
        `;
    }

    // Then subcollection photos
    currentPhotos.forEach((p, idx) => {
        const canDelete = role === 'admin' || (role === 'anim' && currentUser && currentUser.uid === p.authorId);
        const actualIdx = lightboxPhotos.length;
        lightboxPhotos.push({ src: p.base64, author: p.authorName });

        allPhotosHTML += `
            <div class="es-photo-item">
                <img src="${p.base64}" alt="Photo" onclick="openLightbox(${actualIdx})" style="cursor:zoom-in;">
                <div class="es-photo-author">${escapeHtml(p.authorName)}</div>
                ${canDelete ? `
                    <button class="es-photo-delete delete-photo-btn" data-id="${p.id}" title="Supprimer la photo">
                        <i class="bi bi-trash3"></i>
                    </button>
                ` : ''}
            </div>
        `;
    });

    if (allPhotosHTML === '') {
        empty.classList.remove('hidden');
        grid.innerHTML = '';
    } else {
        empty.classList.add('hidden');
        grid.innerHTML = allPhotosHTML;

        // Add delete listeners
        grid.querySelectorAll('.delete-photo-btn').forEach(btn => {
            btn.addEventListener('click', () => deletePhoto(colo.id, btn.getAttribute('data-id')));
        });
    }
}

document.getElementById('btnUploadPhoto')?.addEventListener('click', () => {
    document.getElementById('photoUploadInput').click();
});

document.getElementById('photoUploadInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
        showToast("Seules les images sont acceptées.", "error");
        return;
    }

    const btn = document.getElementById('btnUploadPhoto');
    const errUI = document.getElementById('photoUploadError');
    if (errUI) errUI.classList.add('hidden');
    btnLoading(btn, true);

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
        const img = new Image();
        img.onload = async () => {
            let width = img.width;
            let height = img.height;
            const maxDim = 1200; // Redimensionne tranquillement pour le web

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round((height *= maxDim / width));
                    width = maxDim;
                } else {
                    width = Math.round((width *= maxDim / height));
                    height = maxDim;
                }
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Qualitée moyenne/haute pour passer sous les 1 MiB de Firestore
            let base64 = canvas.toDataURL('image/jpeg', 0.75);

            // Firestore absolute max doc size is ~1MB (1,048,576 bytes)
            if (base64.length > 1000000) {
                if (errUI) {
                    errUI.classList.remove('hidden');
                } else {
                    showToast("L'image est trop lourde même après compression web.", "error");
                }
                btnLoading(btn, false);
                return;
            }

            try {
                let pseudo = currentUser.displayName || currentUser.email;
                try {
                    const uDoc = await db.collection('users').doc(currentUser.uid).get();
                    if (uDoc.exists && uDoc.data().displayName) {
                        pseudo = uDoc.data().displayName;
                    }
                } catch (ignored) { }

                await db.collection('espaces').doc(espaceId).collection('photos').add({
                    base64: base64,
                    authorId: currentUser.uid,
                    authorName: pseudo,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                showToast('Photo ajoutée !', 'success');
            } catch (err) {
                console.error(err);
                showToast('Erreur lors de l\'envoi de la photo.', 'error');
            } finally {
                document.getElementById('photoUploadInput').value = '';
                btnLoading(btn, false);
            }
        };
        img.onerror = () => {
            showToast("Format d'image non supporté ou corrompu.", "error");
            btnLoading(btn, false);
        };
        img.src = reader.result;
    };
    reader.onerror = () => {
        showToast("Erreur de lecture de l'image.", "error");
        btnLoading(btn, false);
    };
});

async function deletePhoto(coloId, photoId) {
    if (!confirm("Voulez-vous vraiment supprimer cette photo ?")) return;
    try {
        await db.collection('espaces').doc(coloId).collection('photos').doc(photoId).delete();
        showToast("Photo supprimée", "success");
    } catch (err) {
        console.error(err);
        showToast("Erreur lors de la suppression.", "error");
    }
}

// ================================================================
// ACTIONS DE MASSE (Bulk Actions — admin uniquement)
// ================================================================

let selectedParticipantIds = new Set(); // IDs sélectionnés
let currentBulkAction = null;           // 'group' | 'genre' | 'age' | 'note'

// --- Mettre à jour l'affichage de la barre de sélection ---
function updateBulkBar() {
    const bar = document.getElementById('bulkActionBar');
    const countEl = document.getElementById('bulkCount');
    if (!bar || !countEl) return;

    const n = selectedParticipantIds.size;
    countEl.textContent = n;

    if (n > 0 && currentRole === 'admin') {
        bar.classList.remove('hidden');
    } else {
        bar.classList.add('hidden');
    }

    // Mettre à jour le checkbox select-all dans l'en-tête #
    const selectAllCb = document.getElementById('checkboxSelectAll');
    if (selectAllCb) {
        const total = (window.currentFilteredParticipants || []).length;
        selectAllCb.checked = n > 0 && n === total;
        selectAllCb.indeterminate = n > 0 && n < total;
    }
}

// --- Basculer la sélection d'une ligne ---
function toggleParticipantSelection(id, checked, trEl) {
    if (checked) {
        selectedParticipantIds.add(id);
        if (trEl) {
            trEl.classList.add('es-row--selected');
            const numTd = trEl.querySelector('.es-td-num--admin');
            if (numTd) {
                numTd.classList.add('es-td-num--selected');
                const label = numTd.querySelector('.es-num-label');
                const icon = numTd.querySelector('.es-num-cb-icon');
                if (label) label.textContent = '';
                if (icon) { icon.className = 'bi bi-check-circle-fill es-num-cb-icon'; }
            }
        }
    } else {
        selectedParticipantIds.delete(id);
        if (trEl) {
            trEl.classList.remove('es-row--selected');
            const numTd = trEl.querySelector('.es-td-num--admin');
            if (numTd) {
                numTd.classList.remove('es-td-num--selected');
                // Retrouver l'index de la ligne pour restaurer le numéro
                const allRows = document.querySelectorAll('#participantsTbody tr');
                let rowIdx = Array.from(allRows).indexOf(trEl) + 1;
                const label = numTd.querySelector('.es-num-label');
                const icon = numTd.querySelector('.es-num-cb-icon');
                if (label) label.textContent = rowIdx;
                if (icon) { icon.className = 'bi bi-circle es-num-cb-icon'; }
            }
        }
    }
    updateBulkBar();
}

// --- Tout sélectionner / désélectionner (depuis le checkbox d'en-tête) ---
function toggleSelectAllParticipants(checked) {
    const list = window.currentFilteredParticipants || [];
    list.forEach(p => {
        if (checked) {
            selectedParticipantIds.add(p.id);
        } else {
            selectedParticipantIds.delete(p.id);
        }
    });

    // Re-render le tableau pour mettre à jour les cellules #
    renderParticipantsTable(currentRole);
    updateBulkBar();
}

// --- Ouvrir la modal d'action de masse ---
function openBulkModal(action) {
    currentBulkAction = action;

    const titles = {
        group:             'Changer le groupe',
        genre:             'Changer le genre',
        age:               'Changer l\'\u00e2ge',
        note:              'Ajouter une remarque',
        spec:              'Ajouter des sp\u00e9cificit\u00e9s',
        appreciation:      'Ajouter une appréciation',
        clearNote:         'Vider les remarques',
        clearSpec:         'Vider les sp\u00e9cificit\u00e9s',
        clearAppreciation: 'Vider les appr\u00e9ciations',
    };

    const n = selectedParticipantIds.size;
    document.getElementById('bulkModalTitle').textContent = titles[action] || 'Action de masse';
    document.getElementById('bulkModalCount').textContent = n;
    document.getElementById('bulkActionError')?.classList.add('hidden');

    // Cacher tous les panneaux
    document.querySelectorAll('.bulk-panel').forEach(p => p.classList.add('hidden'));

    // Afficher le panneau correspondant
    const panelMap = { group: 'bulkPanelGroup', genre: 'bulkPanelGenre', age: 'bulkPanelAge', note: 'bulkPanelNote', spec: 'bulkPanelSpec', appreciation: 'bulkPanelAppreciation', clearNote: 'bulkPanelClearNote', clearSpec: 'bulkPanelClearSpec', clearAppreciation: 'bulkPanelClearAppreciation' };
    const panelEl = document.getElementById(panelMap[action]);
    if (panelEl) panelEl.classList.remove('hidden');

    // Peupler le select groupes si nécessaire
    if (action === 'group') {
        const sel = document.getElementById('bulkGroupSelect');
        if (sel) {
            sel.innerHTML = '<option value="">-- Aucun groupe --</option>' +
                currentGroups.map(g => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
        }
    }

    // Vider les champs
    if (action === 'age')          document.getElementById('bulkAgeInput').value          = '';
    if (action === 'note')         document.getElementById('bulkNoteInput').value         = '';
    if (action === 'spec')         document.getElementById('bulkSpecInput').value         = '';
    if (action === 'appreciation') document.getElementById('bulkAppreciationInput').value = '';

    openModal('overlayBulkAction');
}

// --- Appliquer l'action de masse ---
document.getElementById('btnApplyBulkAction')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnApplyBulkAction');
    const errEl = document.getElementById('bulkActionError');
    const errMsg = document.getElementById('bulkActionErrorMsg');

    if (!currentBulkAction || selectedParticipantIds.size === 0) return;

    // Récupérer la valeur selon l'action
    let updateData = null;

    if (currentBulkAction === 'group') {
        const val = document.getElementById('bulkGroupSelect')?.value || null;
        updateData = { groupeId: val || null };
    } else if (currentBulkAction === 'genre') {
        const val = document.getElementById('bulkGenreSelect')?.value;
        if (!val) { showBulkError(errMsg, errEl, 'Veuillez choisir un genre.'); return; }
        updateData = { genre: val };
    } else if (currentBulkAction === 'age') {
        const val = parseInt(document.getElementById('bulkAgeInput')?.value);
        if (isNaN(val) || val < 4 || val > 25) { showBulkError(errMsg, errEl, 'Veuillez saisir un âge valide (4–25).'); return; }
        updateData = { age: val };
    } else if (currentBulkAction === 'note') {
        const val = document.getElementById('bulkNoteInput')?.value.trim();
        if (!val) { showBulkError(errMsg, errEl, 'Veuillez saisir un texte \u00e0 ajouter en remarque.'); return; }
        updateData = { _appendNote: val };
    } else if (currentBulkAction === 'appreciation') {
        const val = document.getElementById('bulkAppreciationInput')?.value.trim();
        if (!val) { showBulkError(errMsg, errEl, 'Veuillez saisir un texte \u00e0 ajouter en appr\u00e9ciation.'); return; }
        updateData = { _appendAppreciation: val };
    } else if (currentBulkAction === 'spec') {
        const raw = document.getElementById('bulkSpecInput')?.value.trim();
        if (!raw) { showBulkError(errMsg, errEl, 'Veuillez saisir au moins une spécificité.'); return; }
        const newSpecs = raw.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
        if (newSpecs.length === 0) { showBulkError(errMsg, errEl, 'Aucune spécificité valide détectée.'); return; }
        updateData = { _appendSpec: newSpecs };
    } else if (currentBulkAction === 'clearNote') {
        updateData = { note: '' };
    } else if (currentBulkAction === 'clearSpec') {
        updateData = { spec: [] };
    } else if (currentBulkAction === 'clearAppreciation') {
        updateData = { appreciation: '' };
    }

    errEl?.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const colRef = db.collection('espaces').doc(espaceId).collection('participants');
        const ids = [...selectedParticipantIds];

        if (updateData._appendNote !== undefined) {
            // Mode ajout de remarque : lecture individuelle pour concat
            const appendText = updateData._appendNote;
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

            for (const chunk of chunks) {
                const docsSnap = await Promise.all(chunk.map(id => colRef.doc(id).get()));
                const batch = db.batch();
                docsSnap.forEach(docSnap => {
                    if (!docSnap.exists) return;
                    const existingNote = docSnap.data().note || '';
                    batch.update(docSnap.ref, { note: existingNote ? existingNote + '\n' + appendText : appendText });
                });
                await batch.commit();
            }

        } else if (updateData._appendSpec !== undefined) {
            // Mode ajout de spécificités : lecture individuelle pour merge sans doublon
            const newSpecs = updateData._appendSpec;
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

            for (const chunk of chunks) {
                const docsSnap = await Promise.all(chunk.map(id => colRef.doc(id).get()));
                const batch = db.batch();
                docsSnap.forEach(docSnap => {
                    if (!docSnap.exists) return;
                    const existingSpec = Array.isArray(docSnap.data().spec) ? docSnap.data().spec : [];
                    // Fusionner sans doublon (case-insensitive)
                    const merged = [...existingSpec];
                    newSpecs.forEach(s => { if (!merged.includes(s)) merged.push(s); });
                    batch.update(docSnap.ref, { spec: merged });
                });
                await batch.commit();
            }

        } else if (updateData._appendAppreciation !== undefined) {
            // Mode ajout d'appréciation : même mécanique que la note
            const appendText = updateData._appendAppreciation;
            const chunks = [];
            for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

            for (const chunk of chunks) {
                const docsSnap = await Promise.all(chunk.map(id => colRef.doc(id).get()));
                const batch = db.batch();
                docsSnap.forEach(docSnap => {
                    if (!docSnap.exists) return;
                    const existingApp = docSnap.data().appreciation || '';
                    batch.update(docSnap.ref, { appreciation: existingApp ? existingApp + '\n' + appendText : appendText });
                });
                await batch.commit();
            }

        } else {
            // Mode update simple : batch direct
            const batchSize = 500;
            for (let i = 0; i < ids.length; i += batchSize) {
                const batch = db.batch();
                ids.slice(i, i + batchSize).forEach(id => {
                    batch.update(colRef.doc(id), updateData);
                });
                await batch.commit();
            }
        }

        const n = ids.length;
        showToast(`✓ ${n} participant${n > 1 ? 's' : ''} mis à jour.`, 'success');
        closeModal('overlayBulkAction');

        // Réinitialiser la sélection
        selectedParticipantIds.clear();
        updateBulkBar();

        // Recharger
        await loadParticipants(espaceId, currentRole);

    } catch (err) {
        console.error('bulkAction error:', err);
        showBulkError(errMsg, errEl, 'Erreur lors de la mise à jour. Réessayez.');
    } finally {
        btnLoading(btn, false);
    }
});

function showBulkError(msgEl, containerEl, msg) {
    if (msgEl) msgEl.textContent = msg;
    if (containerEl) containerEl.classList.remove('hidden');
}

// Listeners des boutons de la barre de sélection
document.getElementById('btnBulkGroup')?.addEventListener('click',             () => openBulkModal('group'));
document.getElementById('btnBulkGenre')?.addEventListener('click',             () => openBulkModal('genre'));
document.getElementById('btnBulkAge')?.addEventListener('click',               () => openBulkModal('age'));
document.getElementById('btnBulkNote')?.addEventListener('click',              () => openBulkModal('note'));
document.getElementById('btnBulkSpec')?.addEventListener('click',              () => openBulkModal('spec'));
document.getElementById('btnBulkAppreciation')?.addEventListener('click',      () => openBulkModal('appreciation'));
document.getElementById('btnBulkClearNote')?.addEventListener('click',         () => openBulkModal('clearNote'));
document.getElementById('btnBulkClearSpec')?.addEventListener('click',         () => openBulkModal('clearSpec'));
document.getElementById('btnBulkClearAppreciation')?.addEventListener('click', () => openBulkModal('clearAppreciation'));

document.getElementById('btnBulkClear')?.addEventListener('click', () => {
    toggleSelectAllParticipants(false);
    selectedParticipantIds.clear();
    updateBulkBar();
});

