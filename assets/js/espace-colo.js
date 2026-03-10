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
let currentGroups = []; // { id, name }

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
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
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
    // Charger les groupes
    loadGroups(colo.id, role);
    // Charger les alertes
    loadAlerts(colo.id, role);
    // Charger la météo dynamique
    loadWeather(colo.id, role);

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

    if (filteredParticipants.length === 0) {
        const msg = participants.length > 0 ? "Aucun participant ne correspond à vos filtres." : "Aucun participant enregistré.";
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted" style="padding:24px;">${msg}</td></tr>`;
        return;
    }

    const canEdit = role === 'admin' || (role === 'anim' && !currentLocked);
    const hasGroups = currentGroups.length > 0;

    // Afficher/Cacher la colonne groupe
    document.querySelectorAll('.col-groupe').forEach(el => el.classList.toggle('hidden', !hasGroups));

    tbody.innerHTML = filteredParticipants.map(p => {
        const g = hasGroups ? currentGroups.find(x => x.id === p.groupeId) : null;
        const note = p.note || '';
        const isLong = note.length > 25;
        const noteDisplay = isLong ? note.substring(0, 22) + '...' : note;

        return `
        <tr>
            <td><strong>${p.prenom || ''}</strong></td>
            <td>${p.nom || ''}</td>
            <td><span class="es-pill es-pill--age">${p.age} ans</span></td>
            <td>
                <span class="es-pill ${p.genre === 'masculin' ? 'es-pill--m' : 'es-pill--f'}">
                    ${p.genre === 'masculin' ? '♂ Garçon' : '♀ Fille'}
                </span>
            </td>
            <td class="col-groupe ${!hasGroups ? 'hidden' : ''}">
                ${g ? `<span class="es-badge es-badge--anim" style="background:var(--clr-surface-3); border:1px solid var(--clr-surface-4); color:var(--clr-text);">${escapeHtml(g.name)}</span>` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td>
                ${(p.spec || []).length > 0 ? `<div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">${p.spec.map(s => `<span class="es-tag" style="${getStringColorStyle(s)}">${escapeHtml(s)}</span>`).join('')}</div>` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td>
                ${note ? `
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); display:flex; align-items:center; gap:6px;">
                        <span>${escapeHtml(noteDisplay)}</span>
                        ${isLong ? `<button class="es-btn es-btn--ghost es-btn--sm" style="padding:0; height:18px; width:18px; border:none; color:var(--clr-primary); background:none; display:inline-flex; align-items:center; justify-content:center;" onclick="openNoteModal(${escapeHtml(JSON.stringify(note))})"><i class="bi bi-eye"></i></button>` : ''}
                    </div>
                ` : '<span class="text-muted" style="font-size:0.8rem;">–</span>'}
            </td>
            <td class="es-table__actions" data-html2canvas-ignore="true">
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
}

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

document.getElementById('searchParticipant')?.addEventListener('input', () => renderParticipantsTable(currentRole));
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

        const dataList = window.currentFilteredParticipants || participants || [];
        const tableData = dataList.map(p => {
            const g = hasGroups ? currentGroups.find(x => x.id === p.groupeId) : null;
            return [
                p.prenom || '',
                p.nom || '',
                `${p.age} ans`,
                p.genre === 'masculin' ? 'Garçon' : 'Fille',
                ...(hasGroups ? [g ? g.name : ''] : []),
                p.spec || [],
                p.note || ''
            ];
        });

        const head = [
            ['Prénom', 'Nom', 'Âge', 'Genre', ...(hasGroups ? ['Groupe'] : []), 'Spécificités', 'Remarques']
        ];

        let tagColIndex = hasGroups ? 5 : 4;

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

        const part1 = "Document généré ";
        const linkText = "par l'app";
        const part2 = " de votre directeur préféré aka Romain ! Bisous";

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

    // Réinitialiser les disabled
    ['pPrenom', 'pNom', 'pAge', 'pGenre', 'pGroup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });

    const groupSelect = document.getElementById('pGroup');
    if (groupSelect) groupSelect.value = '';

    document.getElementById('participantError')?.classList.add('hidden');
    openModal('overlayParticipant');
});

function editParticipant(id) {
    const p = participants.find(x => x.id === id);
    if (!p) return;
    editingParticipantId = id;
    document.getElementById('participantModalTitle').textContent = 'Modifier le participant';

    // Si verrouillé et anim, on ne peut changer que la remarque
    const isLockedAnim = (currentRole === 'anim' && currentLocked);
    ['pPrenom', 'pNom', 'pAge', 'pGenre', 'pGroup', 'pSpec'].forEach(fId => {
        const el = document.getElementById(fId);
        if (el) el.disabled = isLockedAnim;
    });

    document.getElementById('pPrenom').value = p.prenom || '';
    document.getElementById('pNom').value = p.nom || '';
    document.getElementById('pAge').value = p.age || '';
    document.getElementById('pGenre').value = p.genre || 'feminin';
    document.getElementById('pSpec').value = Array.isArray(p.spec) ? p.spec.join(', ') : (p.spec || '');
    document.getElementById('pNote').value = p.note || '';

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
        const colRef = db.collection('espaces').doc(espaceId).collection('participants');

        if (editingParticipantId) {
            // Sécurité : si verrouillé par le directeur, les animateurs ne peuvent changer QUE la remarque
            if (currentRole === 'anim' && currentLocked) {
                data = { note };
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

        // Afficher le bouton de gestion pour les admins
        if (role === 'admin') {
            document.getElementById('btnManageGroups')?.classList.remove('hidden');
        }

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

function renderGroupsNameList() {
    const listEl = document.getElementById('groupsNameList');
    if (!listEl) return;

    if (currentGroups.length === 0) {
        listEl.innerHTML = '<div class="text-center text-muted" style="padding:15px;">Aucun groupe créé.</div>';
        return;
    }

    listEl.innerHTML = currentGroups.map(g => `
        <div class="es-anim-item" style="padding: 8px 12px;">
            <div class="es-anim-item__info">
                <div class="es-anim-item__name" style="font-size:0.9rem;">${escapeHtml(g.name)}</div>
            </div>
            <button class="es-btn es-btn--danger es-btn--sm" onclick="deleteGroupName('${g.id}', ${escapeHtml(JSON.stringify(g.name))})">
                <i class="bi bi-trash3"></i>
            </button>
        </div>
    `).join('');
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
    if (!confirm(`Supprimer le groupe "${name}" ? Cela ne supprimera pas les jeunes, mais ils n'auront plus de groupe attribué.`)) return;

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
            const canDelete = role === 'admin' || (!alert.locked && !isWeatherAlert);
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
            scheduledList.innerHTML = futureAlerts.map(alert => {
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
                        ${(role === 'admin' || alert.createdBy !== 'Météo Auto') ? `
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
        } else {
            scheduledContainer.classList.add('hidden');
            scheduledList.innerHTML = '';
        }
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
async function loadWeather(coloId, role) {
    db.collection('espaces').doc(coloId).onSnapshot(async snap => {
        if (!snap.exists) return;
        const data = snap.data();
        if (role === 'admin') {
            document.getElementById('weatherAdminContainer')?.classList.remove('hidden');
            if (data.meteoLocation) {
                const meteoLocationInput = document.getElementById('meteoLocation');
                if (meteoLocationInput && !meteoLocationInput.value) {
                    meteoLocationInput.value = data.meteoLocation;
                }
            }
        }

        if (data.meteoLat && data.meteoLon) {
            document.getElementById('weatherEmptyState')?.classList.add('hidden');
            document.getElementById('weatherForecastContainer')?.classList.remove('hidden');

            const locNameEl = document.getElementById('weatherLocationName');
            const locationName = data.meteoLocationName || data.meteoLocation;
            if (locNameEl) locNameEl.textContent = `📍 ${locationName}`;

            await fetchAndDisplayWeather(data.meteoLat, data.meteoLon, role, locationName);
        } else {
            document.getElementById('weatherEmptyState')?.classList.remove('hidden');
            document.getElementById('weatherForecastContainer')?.classList.add('hidden');
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
            const wTableau = getWeatherWMO(code);
            const d = new Date(dateStr);
            const dayName = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

            // Extraction Matin (10h) et Après-midi (15h)
            const morningIdx = i * 24 + 10;
            const afternoonIdx = i * 24 + 15;

            const wMorning = getWeatherWMO(hourly.weathercode[morningIdx]);
            const wAfternoon = getWeatherWMO(hourly.weathercode[afternoonIdx]);
            const tempMorning = Math.round(hourly.temperature_2m[morningIdx]);
            const tempAfternoon = Math.round(hourly.temperature_2m[afternoonIdx]);

            html += `
                <div style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:12px; padding:15px 8px; text-align:center; display:flex; flex-direction:column; gap:10px; min-width:115px; flex:1;">
                    <span style="font-size:0.75rem; font-weight:700; text-transform:uppercase; color:var(--clr-text-light);">${dayName}</span>
                    
                    <div style="display:flex; gap:6px; justify-content:center;">
                        <!-- Matin -->
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:0.6rem; text-transform:uppercase; opacity:0.5; font-weight:700;">Matin</span>
                            <i class="bi ${wMorning.icon}" style="font-size:1.4rem; color:${wMorning.color};" title="${wMorning.name}"></i>
                            <span style="font-size:0.85rem; font-weight:700;">${tempMorning}°</span>
                        </div>
                        
                        <!-- Après-midi -->
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:6px 4px; background:rgba(255,255,255,0.03); border-radius:8px; border:1px solid rgba(255,255,255,0.05);">
                            <span style="font-size:0.6rem; text-transform:uppercase; opacity:0.5; font-weight:700;">Aprem</span>
                            <i class="bi ${wAfternoon.icon}" style="font-size:1.4rem; color:${wAfternoon.color};" title="${wAfternoon.name}"></i>
                            <span style="font-size:0.85rem; font-weight:700;">${tempAfternoon}°</span>
                        </div>
                    </div>
                    
                    <div style="display:flex; justify-content:center; gap:8px; font-size:0.7rem; opacity:0.6; font-weight:500;">
                        <span>Min ${minT}°</span>
                        <span>Max ${maxT}°</span>
                    </div>
                </div>
            `;

            // SI ADMIN : on gère la création des alertes automatiques
            if (role === 'admin' && wTableau.bad) {
                const w = wTableau; // Pour compatibilité avec le code suivant
                const targetDate = new Date(dateStr);
                targetDate.setDate(targetDate.getDate() - 1);
                targetDate.setHours(12, 0, 0, 0); // La veille à midi

                if (targetDate > new Date()) {
                    // Vérifier si une alerte existe déjà pour cette journée météo
                    const existingSnap = await db.collection('espaces').doc(espaceId).collection('alerts')
                        .where('weatherDate', '==', dateStr)
                        .get();

                    if (existingSnap.empty) {
                        try {
                            await db.collection('espaces').doc(espaceId).collection('alerts').add({
                                message: `⚠️ Alerte Météo à ${locationName || 'votre camp'} : ${w.name} prévu(s) pour demain (${d.toLocaleDateString('fr-FR')}). Pensez à un plan B ou des activités d'intérieur !`,
                                type: 'warning',
                                severity: 'high',
                                locked: true,
                                scheduledAt: firebase.firestore.Timestamp.fromDate(targetDate),
                                weatherDate: dateStr,
                                createdBy: 'Météo Auto',
                                createdAt: firebase.firestore.FieldValue.serverTimestamp()
                            });
                        } catch (err) {
                            console.error("Erreur de création de l'alerte météo :", err);
                        }
                    }
                }
            }
        }
        container.innerHTML = html;

    } catch (e) {
        console.error("Météo error:", e);
    }
}
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
