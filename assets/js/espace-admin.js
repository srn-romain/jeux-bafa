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
let currentAdminNotesContent = "";

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

    if (userData.banned === true) {
        return; // Centralized handler will show ban screen
    }

    // Mettre à jour lastLogin
    db.collection('users').doc(user.uid).update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });

    if (role !== 'admin') {
        showGlobalAccessDenied('accessDenied');
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
            // Cacher tout tooltip actif lors d'un changement d'onglet
            if (typeof hideTooltip === 'function') hideTooltip();

            document.querySelectorAll('#adminTabs .es-nav-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Faire défiler l'onglet pour le centrer (utile sur mobile)
            btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });

            const tab = btn.getAttribute('data-tab');
            ['colos', 'demandes', 'utilisateurs', 'recherche', 'config'].forEach(t => {
                document.getElementById(`tab-${t}`)?.classList.toggle('hidden', t !== tab);
            });
            // Charger les données de l'onglet sélectionné à la demande
            if (tab === 'demandes') loadDemandes();
            if (tab === 'utilisateurs') loadUsers();
            if (tab === 'config') loadConfig();
            if (tab === 'recherche') initGlobalSearch();
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
// Helper pour vérifier si le contenu de la note est fonctionnellement vide
function isAdminNotesContentEmpty(html) {
    if (!html) return true;
    const stripped = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, '').replace(/\u200B/g, '').trim();
    return stripped === "";
}

// Helper pour récupérer précisément la couleur de surlignage sélectionnée pour les notes admin
function getSelectedAdminNotesHighlightColor() {
    let bgCol = "";
    try {
        bgCol = document.queryCommandValue('backColor') || document.queryCommandValue('hiliteColor') || "";
    } catch (e) {}

    const isOurColor = (str) => {
        if (!str) return false;
        const clean = str.replace(/\s+/g, '').toLowerCase();
        return clean.includes('254,240,138') || clean.includes('fef08a') ||
               clean.includes('254,202,202') || clean.includes('fecaca') ||
               clean.includes('187,247,208') || clean.includes('bbf7d0');
    };

    if (isOurColor(bgCol)) {
        return bgCol.replace(/\s+/g, '').toLowerCase();
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
        const editor = document.getElementById('adminNotesEditor');
        const nodesToCheck = [sel.anchorNode, sel.focusNode];
        
        for (let node of nodesToCheck) {
            while (node && node !== editor) {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    const styleBg = node.style.backgroundColor || window.getComputedStyle(node).backgroundColor;
                    if (isOurColor(styleBg)) {
                        return styleBg.replace(/\s+/g, '').toLowerCase();
                    }
                }
                node = node.parentNode;
            }
        }
        
        try {
            const range = sel.getRangeAt(0);
            const container = range.commonAncestorContainer;
            if (container && container.nodeType === Node.ELEMENT_NODE) {
                const styleBg = container.style.backgroundColor || window.getComputedStyle(container).backgroundColor;
                if (isOurColor(styleBg)) {
                    return styleBg.replace(/\s+/g, '').toLowerCase();
                }
                const spans = container.querySelectorAll('span');
                for (const span of spans) {
                    if (range.intersectsNode(span)) {
                        const bg = span.style.backgroundColor || window.getComputedStyle(span).backgroundColor;
                        if (isOurColor(bg)) {
                            return bg.replace(/\s+/g, '').toLowerCase();
                        }
                    }
                }
            }
        } catch (ignored) {}
    }
    return "";
}

// Helper pour appliquer ou effacer de manière compatible le surlignage des notes admin
function applyAdminNotesHighlight(color) {
    document.execCommand('styleWithCSS', false, true);
    if (!color || color === 'transparent') {
        document.execCommand('hiliteColor', false, 'rgba(0,0,0,0)');
        document.execCommand('backColor', false, 'rgba(0,0,0,0)');
        document.execCommand('hiliteColor', false, 'transparent');
        document.execCommand('backColor', false, 'transparent');

        const sel = window.getSelection();
        if (sel && sel.isCollapsed && sel.rangeCount > 0) {
            let node = sel.anchorNode;
            const editor = document.getElementById('adminNotesEditor');
            let highlightSpan = null;

            const isOurColor = (str) => {
                if (!str) return false;
                const clean = str.replace(/\s+/g, '').toLowerCase();
                return clean.includes('254,240,138') || clean.includes('fef08a') ||
                       clean.includes('254,202,202') || clean.includes('fecaca') ||
                       clean.includes('187,247,208') || clean.includes('bbf7d0');
            };

            while (node && node !== editor) {
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SPAN') {
                    const bg = node.style.backgroundColor || window.getComputedStyle(node).backgroundColor;
                    if (isOurColor(bg)) {
                        highlightSpan = node;
                        break;
                    }
                }
                node = node.parentNode;
            }

            if (highlightSpan) {
                const range = sel.getRangeAt(0);
                const zwsp = document.createTextNode('\u200B');

                if (range.startContainer.nodeType === Node.TEXT_NODE) {
                    const textNode = range.startContainer;
                    const offset = range.startOffset;

                    if (offset === textNode.length) {
                        highlightSpan.parentNode.insertBefore(zwsp, highlightSpan.nextSibling);
                    } else if (offset === 0) {
                        highlightSpan.parentNode.insertBefore(zwsp, highlightSpan);
                    } else {
                        const secondHalfText = textNode.splitText(offset);
                        const secondHalfSpan = highlightSpan.cloneNode(false);
                        highlightSpan.parentNode.insertBefore(secondHalfSpan, highlightSpan.nextSibling);
                        secondHalfSpan.appendChild(secondHalfText);
                        highlightSpan.parentNode.insertBefore(zwsp, secondHalfSpan);
                    }
                } else {
                    highlightSpan.parentNode.insertBefore(zwsp, highlightSpan.nextSibling);
                }

                const newRange = document.createRange();
                newRange.setStart(zwsp, 1);
                newRange.setEnd(zwsp, 1);
                sel.removeAllRanges();
                sel.addRange(newRange);
            }
        }
    } else {
        document.execCommand('backColor', false, color);
    }
}

async function loadConfig() {
    if (!currentAdminUser) return;
    try {
        let loadedGeminiKey = '';
        const doc = await db.collection('users').doc(currentAdminUser.uid).get();
        if (doc.exists && doc.data().geminiKey) {
            loadedGeminiKey = doc.data().geminiKey;
        }

        const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
        if (globalDoc.exists) {
            if (globalDoc.data().geminiKey && !loadedGeminiKey) {
                loadedGeminiKey = globalDoc.data().geminiKey;
            }
            const checkSignup = document.getElementById('checkAllowSignup');
            if (checkSignup) {
                checkSignup.checked = globalDoc.data().allowSignup !== false; // true par défaut
            }
            const recapInput = document.getElementById('adminRecapBafaUrl');
            if (recapInput) {
                recapInput.value = globalDoc.data().recapBafaUrl || '';
            }
            const titleInput = document.getElementById('adminDashboardTitle');
            if (titleInput) {
                titleInput.value = globalDoc.data().dashboardTitle || '';
            }
            const publicMsgInput = document.getElementById('adminPublicBroadcastMsg');
            if (publicMsgInput) {
                publicMsgInput.value = globalDoc.data().publicBroadcastMessage || '';
            }
            const publicMsgType = globalDoc.data().publicBroadcastType || 'utile';
            const radioToCheck = document.querySelector(`input[name="adminPublicBroadcastType"][value="${publicMsgType}"]`);
            if (radioToCheck) {
                radioToCheck.checked = true;
            }

            const directorMsgInput = document.getElementById('adminDirectorMsg');
            if (directorMsgInput) {
                directorMsgInput.value = globalDoc.data().directorMessage || '';
            }

            // LOAD ADMIN NOTES
            const notesHtml = globalDoc.data().notesAdmin || '';
            currentAdminNotesContent = notesHtml;
            const readCont = document.getElementById('adminNotesReadContainer');
            if (readCont) {
                if (isAdminNotesContentEmpty(notesHtml)) {
                    readCont.innerHTML = `<div style="text-align: center; opacity: 0.45; font-style: italic; width: 100%; padding: 20px 0;"><i class="bi bi-journal-text"></i> Aucune note administrateur pour le moment.</div>`;
                } else {
                    readCont.innerHTML = notesHtml;
                }
            }
        }

        const input = document.getElementById('adminGeminiKey');
        if (input) input.value = loadedGeminiKey || '';

        // Load Espaces for Batch Export
        await loadConfigExportEspaces();

        // Init notes events
        initAdminNotesEvents();

        // Load Liked Games Podium
        loadLikedGames();
        initLikedGamesEvents();
    } catch (err) {
        console.error("loadConfig error:", err);
    }
}

let adminNotesEventsAttached = false;
function initAdminNotesEvents() {
    if (adminNotesEventsAttached) return;
    adminNotesEventsAttached = true;

    const editor = document.getElementById('adminNotesEditor');
    const btnEdit = document.getElementById('btnEditAdminNotes');
    const readCont = document.getElementById('adminNotesReadContainer');
    const editCont = document.getElementById('adminNotesEditContainer');
    const btnSave = document.getElementById('btnSaveAdminNotes');
    const btnCancel = document.getElementById('btnCancelAdminNotes');

    if (!editor || !btnEdit || !readCont || !editCont || !btnSave || !btnCancel) return;

    const updateToolbarStates = () => {
        if (!editor) return;

        // Gras
        const isBold = document.queryCommandState('bold');
        document.getElementById('tbAdminNotesBtnBold')?.classList.toggle('active', isBold);

        // Italique
        const isItalic = document.queryCommandState('italic');
        document.getElementById('tbAdminNotesBtnItalic')?.classList.toggle('active', isItalic);

        // Souligné
        const isUnderline = document.queryCommandState('underline');
        document.getElementById('tbAdminNotesBtnUnderline')?.classList.toggle('active', isUnderline);

        // Surlignages
        const highlightColor = getSelectedAdminNotesHighlightColor();
        const isYellow = highlightColor.includes('254,240,138') || highlightColor.includes('fef08a');
        const isRed = highlightColor.includes('254,202,202') || highlightColor.includes('fecaca');
        const isGreen = highlightColor.includes('187,247,208') || highlightColor.includes('bbf7d0');

        document.getElementById('tbAdminNotesHlYellow')?.classList.toggle('active', isYellow);
        document.getElementById('tbAdminNotesHlRed')?.classList.toggle('active', isRed);
        document.getElementById('tbAdminNotesHlGreen')?.classList.toggle('active', isGreen);
    };

    editor.addEventListener('keyup', updateToolbarStates);
    editor.addEventListener('mouseup', updateToolbarStates);
    editor.addEventListener('focus', updateToolbarStates);
    document.addEventListener('selectionchange', () => {
        if (document.activeElement === editor) {
            updateToolbarStates();
        }
    });

    document.getElementById('tbAdminNotesBtnBold')?.addEventListener('click', () => {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('bold', false, null);
        updateToolbarStates();
        editor.focus();
    });
    document.getElementById('tbAdminNotesBtnItalic')?.addEventListener('click', () => {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('italic', false, null);
        updateToolbarStates();
        editor.focus();
    });
    document.getElementById('tbAdminNotesBtnUnderline')?.addEventListener('click', () => {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand('underline', false, null);
        updateToolbarStates();
        editor.focus();
    });
    document.getElementById('tbAdminNotesHlYellow')?.addEventListener('click', () => {
        const isActive = document.getElementById('tbAdminNotesHlYellow')?.classList.contains('active');
        applyAdminNotesHighlight(isActive ? 'transparent' : '#fef08a');
        updateToolbarStates();
        editor.focus();
    });
    document.getElementById('tbAdminNotesHlRed')?.addEventListener('click', () => {
        const isActive = document.getElementById('tbAdminNotesHlRed')?.classList.contains('active');
        applyAdminNotesHighlight(isActive ? 'transparent' : '#fecaca');
        updateToolbarStates();
        editor.focus();
    });
    document.getElementById('tbAdminNotesHlGreen')?.addEventListener('click', () => {
        const isActive = document.getElementById('tbAdminNotesHlGreen')?.classList.contains('active');
        applyAdminNotesHighlight(isActive ? 'transparent' : '#bbf7d0');
        updateToolbarStates();
        editor.focus();
    });

    btnEdit.addEventListener('click', () => {
        editor.innerHTML = isAdminNotesContentEmpty(currentAdminNotesContent) ? "" : currentAdminNotesContent;
        readCont.classList.add('hidden');
        editCont.classList.remove('hidden');
        btnEdit.classList.add('hidden');
        editor.focus();
    });

    btnCancel.addEventListener('click', () => {
        editCont.classList.add('hidden');
        readCont.classList.remove('hidden');
        btnEdit.classList.remove('hidden');
    });

    btnSave.addEventListener('click', async () => {
        btnLoading(btnSave, true);
        const htmlContent = editor.innerHTML.trim();
        try {
            await db.collection('globalSettings').doc('dashboard').update({
                notesAdmin: htmlContent,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast("Notes administratives enregistrées.", "success");
            currentAdminNotesContent = htmlContent;
            
            if (isAdminNotesContentEmpty(htmlContent)) {
                readCont.innerHTML = `<div style="text-align: center; opacity: 0.45; font-style: italic; width: 100%; padding: 20px 0;"><i class="bi bi-journal-text"></i> Aucune note administrateur pour le moment.</div>`;
            } else {
                readCont.innerHTML = htmlContent;
            }

            editCont.classList.add('hidden');
            readCont.classList.remove('hidden');
            btnEdit.classList.remove('hidden');
        } catch (err) {
            console.error("Save admin notes error:", err);
            showToast("Erreur lors de la sauvegarde.", "error");
        } finally {
            btnLoading(btnSave, false);
        }
    });
}

// ----------------------------------------------------------------
// BATCH PARTICIPANTS EXPORT
// ----------------------------------------------------------------
let exportEventsAttached = false;

function updateDeselectButtonVisibility() {
    const btnDeselectAll = document.getElementById('btnDeselectAllExportEspaces');
    if (!btnDeselectAll) return;
    const hasSelection = document.querySelectorAll('.export-colo-checkbox:checked').length > 0;
    btnDeselectAll.classList.toggle('hidden', !hasSelection);
}

function initExportEvents() {
    if (exportEventsAttached) return;
    exportEventsAttached = true;

    const btnSelectAll = document.getElementById('btnSelectAllExportEspaces');
    const btnDeselectAll = document.getElementById('btnDeselectAllExportEspaces');
    const btnExecute = document.getElementById('btnExecuteBatchExport');
    const container = document.getElementById('exportEspacesContainer');

    btnSelectAll?.addEventListener('click', () => {
        document.querySelectorAll('.export-colo-checkbox').forEach(cb => cb.checked = true);
        updateDeselectButtonVisibility();
    });

    btnDeselectAll?.addEventListener('click', () => {
        document.querySelectorAll('.export-colo-checkbox').forEach(cb => cb.checked = false);
        updateDeselectButtonVisibility();
    });

    container?.addEventListener('change', (e) => {
        if (e.target.classList.contains('export-colo-checkbox')) {
            updateDeselectButtonVisibility();
        }
    });

    btnExecute?.addEventListener('click', async () => {
        const selectedCbs = document.querySelectorAll('.export-colo-checkbox:checked');
        if (selectedCbs.length === 0) {
            showToast('Veuillez sélectionner au moins un espace à exporter.', 'error');
            return;
        }

        const selectedColos = [];
        selectedCbs.forEach(cb => {
            selectedColos.push({
                id: cb.value,
                nom: cb.dataset.nom
            });
        });

        btnLoading(btnExecute, true);
        try {
            await exportBatchParticipants(selectedColos);
        } catch (err) {
            console.error('Batch export execute error:', err);
        } finally {
            btnLoading(btnExecute, false);
        }
    });
}

async function loadConfigExportEspaces() {
    const container = document.getElementById('exportEspacesContainer');
    if (!container) return;

    try {
        const snap = await db.collection('espaces').orderBy('dateDebut', 'desc').get();
        if (snap.empty) {
            container.innerHTML = `<div style="text-align: center; opacity: 0.45; font-style: italic; width: 100%; grid-column: 1 / -1; padding: 20px 0;"><i class="bi bi-info-circle"></i> Aucun espace créé.</div>`;
            return;
        }

        let html = '';
        snap.docs.forEach(doc => {
            const colo = doc.data();
            const id = doc.id;
            const year = colo.dateDebut ? new Date(colo.dateDebut).getFullYear() : '';
            const labelText = `${colo.emoji || '🏕️'} ${colo.nom || 'Sans nom'}${year ? ` (${year})` : ''}`;
            const cleanNom = escapeHtml(colo.nom || '');
            
            html += `
                <label class="es-checkbox-label" style="display: flex; align-items: center; gap: 8px; padding: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; cursor: pointer; user-select: none; transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.06)'" onmouseout="this.style.background='rgba(255,255,255,0.03)'">
                    <input type="checkbox" class="export-colo-checkbox" value="${id}" data-nom="${cleanNom}" style="accent-color: var(--clr-primary); width: 16px; height: 16px;">
                    <span style="font-size: 0.85rem; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(labelText)}">
                        ${escapeHtml(labelText)}
                    </span>
                </label>
            `;
        });
        container.innerHTML = html;
        initExportEvents();
        updateDeselectButtonVisibility();
    } catch (err) {
        console.error("loadConfigExportEspaces error:", err);
        container.innerHTML = `<div style="text-align: center; color: var(--clr-danger); width: 100%; grid-column: 1 / -1; padding: 20px 0;"><i class="bi bi-exclamation-circle"></i> Erreur lors du chargement des espaces.</div>`;
    }
}

async function exportBatchParticipants(selectedColos) {
    try {
        let successCount = 0;
        for (const colo of selectedColos) {
            const snap = await db.collection('espaces').doc(colo.id).collection('participants')
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
                coloId: colo.id,
                coloNom: colo.nom,
                exportDate: new Date().toISOString(),
                participants: pts
            };

            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `participants_${colo.nom.replace(/\s+/g, '_').toLowerCase()}_${new Date().toLocaleDateString('fr-FR').replace(/\//g, '-')}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            successCount++;
            // Small delay to ensure the browser schedules multiple downloads correctly
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        showToast(`${successCount} fichier(s) exporté(s) !`, 'success');
        document.querySelectorAll('.export-colo-checkbox').forEach(cb => cb.checked = false);
        updateDeselectButtonVisibility();
    } catch (err) {
        console.error('Batch export error:', err);
        showToast("Erreur lors de l'exportation des fichiers.", 'error');
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

document.getElementById('btnSaveAdminRecapUrl')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAdminRecapUrl');
    const input = document.getElementById('adminRecapBafaUrl');
    if (!input) return;
    
    const val = input.value.trim();
    btnLoading(btn, true);
    
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            recapBafaUrl: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Lien Récap BAFA global mis à jour.", "success");
    } catch (err) {
        console.error("Erreur sauvegarde recapBafaUrl:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnSaveAdminTitle')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAdminTitle');
    const input = document.getElementById('adminDashboardTitle');
    if (!input) return;
    
    const val = input.value.trim();
    btnLoading(btn, true);
    
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            dashboardTitle: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Titre du tableau de bord mis à jour.", "success");
    } catch (err) {
        console.error("Erreur sauvegarde dashboardTitle:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnSavePublicBroadcastMsg')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSavePublicBroadcastMsg');
    const input = document.getElementById('adminPublicBroadcastMsg');
    if (!input) return;
    
    const val = input.value.trim();
    const typeRadio = document.querySelector('input[name="adminPublicBroadcastType"]:checked');
    const typeVal = typeRadio ? typeRadio.value : 'utile';
    btnLoading(btn, true);
    
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            publicBroadcastMessage: val,
            publicBroadcastType: typeVal,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Message grand public mis à jour.", "success");
    } catch (err) {
        console.error("Erreur sauvegarde publicBroadcastMessage:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnSaveAdminDirectorMsg')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAdminDirectorMsg');
    const input = document.getElementById('adminDirectorMsg');
    if (!input) return;
    
    const val = input.value.trim();
    btnLoading(btn, true);
    
    try {
        await db.collection('globalSettings').doc('dashboard').set({
            directorMessage: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Message direction mis à jour.", "success");
    } catch (err) {
        console.error("Erreur sauvegarde directorMessage:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    } finally {
        btnLoading(btn, false);
    }
});

document.getElementById('btnSaveAdminKey')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveAdminKey');
    const input = document.getElementById('adminGeminiKey');
    const key = input?.value.trim() || '';

    btnLoading(btn, true);
    try {
        await db.collection('users').doc(currentAdminUser.uid).set({
            geminiKey: key,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        await db.collection('globalSettings').doc('dashboard').set({
            geminiKey: key,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

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
// ONGLET RECHERCHE GLOBALE PARTICIPANTS
// Stratégie Firestore économique :
//   - 1 lecture de la collection espaces (déjà faite par loadColos en général)
//   - 1 lecture par espace de la sous-collection participants (au premier lancement)
//   - Cache mémoire : re-use si données déjà chargées (pas de re-fetch à chaque recherche)
//   - Recherche 100 % en mémoire après le premier chargement
//   - Invalidation manuelle du cache via le bouton "Rafraîchir"
// ================================================================

let _globalParticipantsCache = null;   // null = pas chargé | [] = vide | [...] = données
let _globalCacheTimestamp = null;
let _globalSearchEventsAttached = false;

/**
 * Charge TOUS les participants de TOUS les espaces en parallèle.
 * Retourne un tableau plat : [{ participantId, coloId, coloNom, coloEmoji, ...participantData }]
 * Attention : N lectures Firestore où N = nombre d'espaces. Donc on ne le fait qu'une fois.
 */
async function fetchAllParticipantsFromFirestore() {
    const loaderText = document.getElementById('globalSearchLoaderText');
    if (loaderText) loaderText.textContent = 'Chargement de la liste des espaces…';

    // 1. Charger la liste des espaces (1 requête sur la collection espaces)
    const espacesSnap = await db.collection('espaces').orderBy('nom').get();

    if (espacesSnap.empty) return [];

    const totalEspaces = espacesSnap.docs.length;
    let loaded = 0;

    // 2. Charger en parallèle les sous-collections participants
    //    (N lectures simultanées, chacune retourne N documents participants)
    const promises = espacesSnap.docs.map(async (espaceDoc) => {
        const espaceData = espaceDoc.data();
        const pSnap = await db.collection('espaces').doc(espaceDoc.id).collection('participants')
            .orderBy('nom', 'asc').get();
        loaded++;
        if (loaderText) {
            loaderText.textContent = `Chargement des participants… (${loaded}/${totalEspaces} espaces)`;
        }
        return pSnap.docs.map(pDoc => ({
            participantId: pDoc.id,
            coloId: espaceDoc.id,
            coloNom: espaceData.nom || 'Sans nom',
            coloEmoji: espaceData.emoji || '🏕️',
            coloDateDebut: espaceData.dateDebut || '',
            ...pDoc.data()
        }));
    });

    const results = await Promise.all(promises);
    // Aplatir le tableau 2D → tableau 1D
    return results.flat();
}

/**
 * Effectue la recherche en mémoire sur le cache.
 */
function runGlobalSearchInMemory(query) {
    if (!_globalParticipantsCache) return [];
    if (!query || query.trim().length < 2) return [];

    const q = query.trim().toLowerCase();
    const filterPrenom = document.getElementById('searchFilterPrenom')?.checked ?? true;
    const filterNom    = document.getElementById('searchFilterNom')?.checked ?? true;
    const filterNote   = document.getElementById('searchFilterNote')?.checked ?? true;
    const filterSpec   = document.getElementById('searchFilterSpec')?.checked ?? false;

    return _globalParticipantsCache.filter(p => {
        if (filterPrenom && (p.prenom || '').toLowerCase().includes(q)) return true;
        if (filterNom    && (p.nom || '').toLowerCase().includes(q)) return true;
        if (filterNote   && (p.note || '').toLowerCase().includes(q)) return true;
        if (filterNote   && (p.appreciation || '').toLowerCase().includes(q)) return true;
        if (filterSpec   && Array.isArray(p.spec) && p.spec.some(s => s.toLowerCase().includes(q))) return true;
        return false;
    });
}

/**
 * Surligne les occurrences de `query` dans `text` avec un <mark>.
 */
function highlightMatch(text, query) {
    if (!text || !query) return escapeHtml(text || '');
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    return escapeHtml(text).replace(re, '<mark style="background:#fef08a;color:#333;border-radius:2px;padding:0 2px;">$1</mark>');
}

/**
 * Affiche les résultats de recherche dans le DOM.
 */
function renderGlobalSearchResults(results, query) {
    const container = document.getElementById('globalSearchResults');
    const countEl   = document.getElementById('globalSearchCount');
    const countText = document.getElementById('globalSearchCountText');
    const cacheInfo = document.getElementById('globalSearchCacheInfo');
    const emptyEl   = document.getElementById('globalSearchEmpty');
    const promptEl  = document.getElementById('globalSearchPrompt');

    if (promptEl) promptEl.classList.add('hidden');
    if (countEl) countEl.classList.remove('hidden');

    const total = _globalParticipantsCache ? _globalParticipantsCache.length : 0;
    const stamp = _globalCacheTimestamp
        ? new Date(_globalCacheTimestamp).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })
        : '';
    if (cacheInfo) cacheInfo.textContent = stamp ? `Cache chargé à ${stamp} · ${total} participants au total` : '';

    if (results.length === 0) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
        if (countText) countText.textContent = 'Aucun résultat';
        return;
    }

    if (emptyEl) emptyEl.classList.add('hidden');
    if (countText) countText.textContent = `${results.length} participant${results.length > 1 ? 's' : ''} trouvé${results.length > 1 ? 's' : ''}`;

    // Grouper par espace
    const grouped = {};
    results.forEach(p => {
        const key = p.coloId;
        if (!grouped[key]) grouped[key] = { coloNom: p.coloNom, coloEmoji: p.coloEmoji, coloDateDebut: p.coloDateDebut, coloId: p.coloId, items: [] };
        grouped[key].items.push(p);
    });

    let html = '';
    Object.values(grouped).forEach(group => {
        const year = group.coloDateDebut ? new Date(group.coloDateDebut).getFullYear() : '';
        html += `
        <div style="margin-bottom:20px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding-bottom:8px; border-bottom:1px solid var(--clr-surface-3);">
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:1.2rem;">${group.coloEmoji}</span>
                    <span style="font-weight:700; font-size:0.95rem; color:var(--clr-text);">${escapeHtml(group.coloNom)}${year ? ` <span style="font-weight:400; font-size:0.78rem; opacity:0.6;">(${year})</span>` : ''}</span>
                    <span style="font-size:0.75rem; background:rgba(var(--clr-primary-rgb,99,102,241),0.15); color:var(--clr-primary); border:1px solid rgba(var(--clr-primary-rgb,99,102,241),0.3); padding:1px 8px; border-radius:20px; font-weight:600;">${group.items.length}</span>
                </div>
                <a href="espace.html?id=${group.coloId}" target="_blank" class="es-btn es-btn--ghost es-btn--sm" title="Ouvrir l'espace">
                    <i class="bi bi-arrow-up-right"></i>
                </a>
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${group.items.map(p => {
                    const specStr = Array.isArray(p.spec) && p.spec.length ? p.spec.join(', ') : '';
                    const noteStr = p.note || '';
                    const appreciationStr = p.appreciation || '';
                    return `
                    <div style="display:flex; align-items:flex-start; gap:12px; padding:12px; background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:8px; transition:background 0.15s;"
                         onmouseover="this.style.background='var(--clr-surface-3)'" onmouseout="this.style.background='var(--clr-surface-2)'">
                        <div style="width:36px; height:36px; border-radius:50%; background:var(--clr-primary); display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.85rem; color:#fff; flex-shrink:0; text-transform:uppercase; box-shadow:0 2px 6px rgba(0,0,0,0.2);">
                            ${escapeHtml((p.prenom || '?').charAt(0))}
                        </div>
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:0.9rem; color:var(--clr-text); line-height:1.2;">
                                ${highlightMatch(p.prenom || '', query)} ${highlightMatch(p.nom || '', query)}
                                ${p.age ? `<span style="font-weight:400; font-size:0.78rem; color:var(--clr-text-muted); margin-left:6px;">${p.age} ans</span>` : ''}
                                ${p.genre ? `<span style="font-weight:400; font-size:0.78rem; color:var(--clr-text-muted);">${p.genre === 'garcon' ? '♂' : p.genre === 'fille' ? '♀' : ''}</span>` : ''}
                            </div>
                            ${noteStr ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px; line-height:1.4; overflow:hidden; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;"><i class="bi bi-chat-left-text" style="opacity:0.6;"></i> ${highlightMatch(noteStr, query)}</div>` : ''}
                            ${appreciationStr ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:2px;"><i class="bi bi-star" style="opacity:0.6;"></i> ${highlightMatch(appreciationStr, query)}</div>` : ''}
                            ${specStr ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:2px;"><i class="bi bi-tag" style="opacity:0.6;"></i> ${highlightMatch(specStr, query)}</div>` : ''}
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </div>`;
    });

    container.innerHTML = html;
}

/**
 * Formate un nombre d'octets en unité lisible (Ko, Mo, Go).
 */
function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes <= 0) return '0 Ko';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Calcule et affiche l'espace de stockage utilisé par l'application et les données hors-ligne.
 */
async function updateStorageUsageDisplay() {
    const badgeEl = document.getElementById('storageUsageBadge');
    const offlineCountEl = document.getElementById('storageOfflineCount');
    if (!badgeEl && !offlineCountEl) return;

    let totalBytes = 0;
    let lsBytes = 0;

    // 1. Calcul de la taille du localStorage
    try {
        let totalStr = '';
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalStr += key + (localStorage[key] || '');
            }
        }
        lsBytes = new Blob([totalStr]).size;
    } catch (e) {
        console.warn("Erreur calcul localStorage:", e);
    }

    // 2. Storage estimate API (PWA CacheStorage + IndexedDB + etc.)
    if (navigator.storage && navigator.storage.estimate) {
        try {
            const estimate = await navigator.storage.estimate();
            totalBytes = estimate.usage || 0;
        } catch (e) {
            console.warn("Erreur navigator.storage.estimate:", e);
        }
    }

    if (totalBytes === 0 || totalBytes < lsBytes) {
        totalBytes = lsBytes;
    }

    // 3. Compter les espaces distincts enregistrés pour le mode hors ligne
    let distinctColos = new Set();
    try {
        for (let key in localStorage) {
            if (key.startsWith('offline_participants_')) {
                distinctColos.add(key.replace('offline_participants_', ''));
            } else if (key.startsWith('offline_colo_')) {
                distinctColos.add(key.replace('offline_colo_', ''));
            }
        }
    } catch (e) {}
    const nbEspacesOffline = distinctColos.size;

    if (badgeEl) {
        badgeEl.textContent = `~${formatBytes(totalBytes)} utilisés`;
    }
    if (offlineCountEl) {
        if (nbEspacesOffline > 0) {
            offlineCountEl.innerHTML = `<i class="bi bi-cloud-check-fill" style="color:var(--clr-primary);"></i> <strong>${nbEspacesOffline} espace${nbEspacesOffline > 1 ? 's' : ''}</strong> prêt${nbEspacesOffline > 1 ? 's' : ''} pour la consultation hors-ligne.`;
        } else {
            offlineCountEl.innerHTML = `<i class="bi bi-cloud-slash" style="color:var(--clr-text-muted);"></i> Aucun espace enregistré pour le mode hors-ligne actuellement.`;
        }
    }
}

/**
 * Point d'entrée de l'onglet Recherche.
 * Attache les événements une seule fois.
 */
function initGlobalSearch() {
    updateStorageUsageDisplay();

    if (_globalSearchEventsAttached) return;
    _globalSearchEventsAttached = true;

    const btnSearch  = document.getElementById('btnGlobalSearch');
    const inputEl    = document.getElementById('globalSearchInput');
    const btnRefresh = document.getElementById('btnRefreshParticipantsCache');

    const doSearch = async () => {
        const query = document.getElementById('globalSearchInput')?.value?.trim() || '';
        if (query.length < 2) {
            showToast('Saisissez au moins 2 caractères.', 'default');
            return;
        }

        const loader   = document.getElementById('globalSearchLoader');
        const resultsEl = document.getElementById('globalSearchResults');
        const promptEl = document.getElementById('globalSearchPrompt');
        const emptyEl  = document.getElementById('globalSearchEmpty');

        if (promptEl) promptEl.classList.add('hidden');
        if (emptyEl) emptyEl.classList.add('hidden');
        if (resultsEl) resultsEl.innerHTML = '';

        // Si pas encore chargé, charger depuis Firestore (une seule fois)
        if (_globalParticipantsCache === null) {
            if (loader) loader.classList.remove('hidden');
            if (btnSearch) { btnSearch.querySelector('.es-btn__text').classList.add('hidden'); btnSearch.querySelector('.es-btn__spinner').classList.remove('hidden'); btnSearch.disabled = true; }
            try {
                _globalParticipantsCache = await fetchAllParticipantsFromFirestore();
                _globalCacheTimestamp = Date.now();
            } catch(err) {
                console.error('fetchAllParticipants error:', err);
                showToast("Erreur lors du chargement des participants.", 'error');
                _globalParticipantsCache = null; // retry next time
                if (loader) loader.classList.add('hidden');
                if (btnSearch) { btnSearch.querySelector('.es-btn__text').classList.remove('hidden'); btnSearch.querySelector('.es-btn__spinner').classList.add('hidden'); btnSearch.disabled = false; }
                return;
            } finally {
                if (loader) loader.classList.add('hidden');
                if (btnSearch) { btnSearch.querySelector('.es-btn__text').classList.remove('hidden'); btnSearch.querySelector('.es-btn__spinner').classList.add('hidden'); btnSearch.disabled = false; }
            }
        }

        // Recherche en mémoire (0 lecture Firestore)
        const results = runGlobalSearchInMemory(query);
        renderGlobalSearchResults(results, query);
    };

    btnSearch?.addEventListener('click', doSearch);
    inputEl?.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    btnRefresh?.addEventListener('click', async () => {
        _globalParticipantsCache = null;
        _globalCacheTimestamp = null;
        const countEl = document.getElementById('globalSearchCount');
        const resultsEl = document.getElementById('globalSearchResults');
        const promptEl = document.getElementById('globalSearchPrompt');
        const emptyEl = document.getElementById('globalSearchEmpty');
        if (countEl) countEl.classList.add('hidden');
        if (resultsEl) resultsEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.add('hidden');
        if (promptEl) promptEl.classList.remove('hidden');
        document.getElementById('globalSearchInput') && (document.getElementById('globalSearchInput').value = '');
        showToast('Cache de recherche mémoire réinitialisé. La prochaine recherche rechargera depuis Firestore.', 'default');
    });

    // Gestion de la modal et suppression du cache hors-ligne
    const btnClearOffline = document.getElementById('btnClearOfflineCache');
    const modalClearOffline = document.getElementById('overlayConfirmClearOfflineCache');
    const btnCloseClearOffline = document.getElementById('btnCloseConfirmClearOfflineCache');
    const btnCancelClearOffline = document.getElementById('btnCancelClearOfflineCache');
    const btnConfirmClearOffline = document.getElementById('btnConfirmClearOfflineCache');

    btnClearOffline?.addEventListener('click', () => {
        modalClearOffline?.classList.remove('hidden');
    });

    const closeClearModal = () => {
        modalClearOffline?.classList.add('hidden');
    };

    btnCloseClearOffline?.addEventListener('click', closeClearModal);
    btnCancelClearOffline?.addEventListener('click', closeClearModal);
    modalClearOffline?.addEventListener('click', (e) => {
        if (e.target === modalClearOffline) closeClearModal();
    });

    btnConfirmClearOffline?.addEventListener('click', async () => {
        if (btnConfirmClearOffline) {
            btnConfirmClearOffline.querySelector('.es-btn__text')?.classList.add('hidden');
            btnConfirmClearOffline.querySelector('.es-btn__spinner')?.classList.remove('hidden');
            btnConfirmClearOffline.disabled = true;
        }

        try {
            // 1. Nettoyer les clés de données offline du localStorage
            const keysToRemove = [];
            for (let key in localStorage) {
                if (key.startsWith('offline_')) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));

            // 2. Nettoyer les caches Service Worker (PWA)
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    await Promise.all(cacheNames.map(name => caches.delete(name)));
                } catch (cacheErr) {
                    console.warn("Erreur suppression caches:", cacheErr);
                }
            }

            // 3. Réinitialiser le cache mémoire de recherche
            _globalParticipantsCache = null;
            _globalCacheTimestamp = null;

            // 4. Actualiser l'affichage
            await updateStorageUsageDisplay();
            showToast('Cache hors-ligne effacé. Les espaces ne seront plus accessibles hors connexion.', 'success');
            closeClearModal();
        } catch (err) {
            console.error("Erreur vidage cache hors-ligne:", err);
            showToast("Erreur lors de la suppression du cache.", 'error');
        } finally {
            if (btnConfirmClearOffline) {
                btnConfirmClearOffline.querySelector('.es-btn__text')?.classList.remove('hidden');
                btnConfirmClearOffline.querySelector('.es-btn__spinner')?.classList.add('hidden');
                btnConfirmClearOffline.disabled = false;
            }
        }
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
        <div class="es-colo-admin-card__header" style="position: relative;">
            <div style="padding-right: 44px; width: 100%;">
                <div class="es-colo-admin-card__title">
                    ${colo.emoji || '🏕️'} ${colo.nom || 'Sans nom'}
                    ${isUpcoming ? `
                        <span style="background:rgba(52,152,219,0.25);color:#ffffff;border:1px solid rgba(52,152,219,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;margin-left:8px;font-weight:800;vertical-align:middle;text-shadow:none;white-space:nowrap;">
                            À venir
                        </span>
                    ` : ''}
                    ${!visible ? `
                        <span style="background:rgba(255,165,0,0.25);color:#ffffff;border:1px solid rgba(255,165,0,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;margin-left:8px;font-weight:800;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-eye-slash-fill"></i> Caché
                        </span>
                    ` : ''}
                    ${colo.archived ? `
                        <span style="background:rgba(243,156,18,0.25);color:#ffffff;border:1px solid rgba(243,156,18,0.4);padding:2px 8px;border-radius:6px;font-size:0.65rem;text-transform:uppercase;margin-left:8px;font-weight:800;text-shadow:none;white-space:nowrap;">
                            <i class="bi bi-archive-fill"></i> Archivé
                        </span>
                    ` : ''}
                </div>
                <div style="font-size:0.78rem;color:rgba(255,255,255,0.7);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;text-shadow:0 1px 2px rgba(0,0,0,0.5);">
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
            <a href="espace.html?id=${colo.id}" class="es-card-action-btn" style="position: absolute; top: 20px; right: 20px; text-decoration: none; z-index: 10;" title="Accéder à l'espace">
                <i class="bi bi-arrow-right" style="font-size: 1.1rem; color: #ffffff !important;"></i>
            </a>
        </div>
        <div class="es-colo-admin-card__body">
            <div class="es-colo-admin-card__info">
                <div class="es-colo-admin-card__organisme">
                    ${colo.organisme ? colo.organisme : '<span style="opacity:0.5;font-style:italic;">Organisme non défini.</span>'}
                </div>
                <div class="es-colo-admin-card__meta">
                    ${colo.createdAt ? `<span><i class="bi bi-plus-circle"></i> Créé le ${formatFullDate(colo.createdAt)}</span>` : ''}
                    ${colo.updatedAt ? `<span><i class="bi bi-pencil-square"></i> Modifié le ${formatFullDate(colo.updatedAt)}</span>` : ''}
                </div>
            </div>
            <div class="es-colo-admin-card__actions">
                <button class="es-card-action-btn"
                        title="Invisibilité pour les animateurs"
                        onclick="toggleColoVisibility('${colo.id}', ${visible})">
                    <i class="bi bi-${visible ? 'eye' : 'eye-slash'}"></i>
                </button>
                <button class="es-card-action-btn ${colo.archived ? 'es-card-action-btn--warning' : ''}"
                        title="${colo.archived ? 'Désarchiver l\'espace' : 'Archiver l\'espace'}"
                        onclick="toggleColoArchived('${colo.id}', ${colo.archived === true})">
                    <i class="bi bi-${colo.archived ? 'folder-symlink' : 'archive'}"></i>
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

async function toggleColoArchived(coloId, currentlyArchived) {
    const newArchived = !currentlyArchived;
    const label = newArchived ? 'archivé' : 'désarchivé';
    try {
        await db.collection('espaces').doc(coloId).update({ archived: newArchived });
        showToast(`L'espace est maintenant ${label}.`, newArchived ? 'default' : 'success');
        loadColos();
    } catch (err) {
        console.error('toggleColoArchived:', err);
        showToast('Erreur lors du changement d\'archivage.', 'error');
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
        
        // Charger le nombre de demandes d'accès approuvées
        const reqSnap = await db.collection('accessRequests').where('status', '==', 'approved').get();
        const approvedCountMap = {};
        reqSnap.forEach(doc => {
            const data = doc.data();
            const uid = data.userId;
            if (uid) {
                approvedCountMap[uid] = (approvedCountMap[uid] || 0) + 1;
            }
        });

        loader.classList.add('hidden');

        const users = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        if (users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted" style="padding:24px;">Aucun utilisateur.</td></tr>`;
            content.classList.remove('hidden');
            return;
        }

        tbody.innerHTML = users.map(u => `
            <tr>
                <td style="font-size:0.87rem;">${u.email || ''}</td>
                <td style="text-align: center;">${u.displayName || '<span style="color:var(--clr-text-light)">–</span>'}</td>
                <td style="text-align: center; font-size:0.82rem;color:var(--clr-text-muted);">${formatFullDate(u.lastLogin)}</td>
                <td style="text-align: center;">
                    ${u.banned === true ? `
                        <span style="color:var(--clr-text-light)">–</span>
                    ` : (u.role === 'admin' ? `
                        <span class="es-badge es-badge--admin" style="opacity:0.85; background:var(--clr-surface-3); color:var(--clr-accent-dark); border:1px solid rgba(243,156,18,0.2);">Tous</span>
                    ` : `
                        <span class="es-badge" style="background:var(--clr-surface-3); color:var(--clr-text); font-weight:700;">
                            ${approvedCountMap[u.id] || 0}
                        </span>
                    `)}
                </td>
                <td style="text-align: center;">
                    ${u.banned === true ? `
                        <span class="es-badge es-badge--banned">
                            🚫 Banni
                        </span>
                    ` : `
                        <span class="es-badge ${u.role === 'admin' ? 'es-badge--admin' : 'es-badge--anim'}">
                            ${u.role === 'admin' ? '👑 Admin' : '🎨 Anim'}
                        </span>
                    `}
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
document.getElementById('checkUserBanned')?.addEventListener('change', async (e) => {
    if (!rightsUserId) return;
    const isBanned = e.target.checked;
    try {
        await db.collection('users').doc(rightsUserId).update({
            banned: isBanned
        });
        showToast(isBanned ? "Utilisateur banni." : "Utilisateur réhabilité.", "success");
        loadUsers();
    } catch (err) {
        console.error("Erreur mise à jour bannissement:", err);
        showToast("Erreur lors de la mise à jour.", "error");
        e.target.checked = !isBanned; // Revenir à l'état précédent
    }
});

async function openUserRightsPanel(uid, email, displayName) {
    rightsUserId = uid;
    rightsUserName = displayName || email;

    document.getElementById('userRightsTitle').textContent = `Droits — ${rightsUserName}`;
    document.getElementById('userRightsEmail').textContent = email;

    // Reset
    const banCheckbox = document.getElementById('checkUserBanned');
    if (banCheckbox) banCheckbox.checked = false;
    document.getElementById('userRightsLoader').classList.remove('hidden');
    document.getElementById('userRightsList').classList.add('hidden');
    document.getElementById('userRightsEmpty').classList.add('hidden');
    document.getElementById('userRightsList').innerHTML = '';

    openModal('overlayUserRights');

    // Charger le statut banni
    db.collection('users').doc(uid).get().then(doc => {
        if (doc.exists && banCheckbox) {
            banCheckbox.checked = doc.data().banned === true;
        }
    }).catch(err => console.error("Erreur chargement statut banni:", err));

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

// =================================================================
// PODIUM DES JEUX LES PLUS LIKÉS
// =================================================================
let allParsedGames = [];
let likedGamesEventsAttached = false;

// Variable globale et fonctions pour le tooltip des votes (comme sur le site principal)
let activeBtn = null;

function setupAdminTooltipEl() {
    let tooltipEl = document.getElementById('vote-admin-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'vote-admin-tooltip';
        tooltipEl.className = 'vote-admin-tooltip';
        document.body.appendChild(tooltipEl);
    }
}

function showTooltipForBtn(btn, voteId, direction, oldVoteId) {
    if (activeBtn === btn) return;
    activeBtn = btn;
    
    const rect = btn.getBoundingClientRect();
    const tooltip = document.getElementById('vote-admin-tooltip');
    if (!tooltip) return;
    
    tooltip.innerHTML = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4><span class="vote-meta-loading">Chargement...</span>`;
    tooltip.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
    tooltip.style.top = `${window.scrollY + rect.top - 8}px`;
    tooltip.style.transform = 'translate(-50%, -100%) translateY(-5px)';
    tooltip.classList.add('active');

    const colName = direction === 'up' ? 'positive_votes' : 'negative_votes';
    
    db.collection(colName).doc(voteId).get().then(async doc => {
        if (activeBtn !== btn) return;
        
        let targetDoc = doc;
        if ((!targetDoc.exists || !targetDoc.data() || Object.keys(targetDoc.data()).length === 0) && oldVoteId && oldVoteId !== voteId) {
            try {
                const oldDoc = await db.collection(colName).doc(oldVoteId).get();
                if (oldDoc.exists) targetDoc = oldDoc;
            } catch (e) {}
        }
        
        let voters = {};
        if (targetDoc.exists) {
            const data = targetDoc.data() || {};
            
            // 1. Essayer de récupérer le map imbriqué "voters"
            if (data.voters && typeof data.voters === 'object') {
                voters = { ...data.voters };
            }
            
            // 2. Récupérer également les clés plates "voters.v_xxxxx" créées par .set(..., {merge: true})
            Object.keys(data).forEach(key => {
                if (key.startsWith('voters.')) {
                    const visitorId = key.substring(7); // "voters.".length
                    voters[visitorId] = data[key];
                }
            });
        }
        
        const sortedVoters = Object.values(voters).sort((a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0));
        
        if (targetDoc.exists && sortedVoters.length > 0) {
            let html = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4>`;
            html += `<ul>`;
            sortedVoters.forEach(v => {
                const isInactive = v.active === false;
                const inactiveClass = isInactive ? ' class="vote-item-inactive"' : '';
                const statusLabel = isInactive ? ' <span class="vote-meta-status-retire">(Retiré)</span>' : '';
                const userLine = v.userName ? `<span class="vote-meta-user"><strong>${v.userName}</strong> (${v.userRole || 'Utilisateur'})${statusLabel}</span>` : '';
                html += `
                    <li${inactiveClass}>
                        ${userLine}
                        <span class="vote-meta-time">${v.date || 'Date inconnue'}</span>
                        <span class="vote-meta-details">${v.device || 'Appareil'} (${v.os || 'OS'}) - ${v.browser || 'Navigateur'}</span>
                    </li>
                `;
            });
            html += `</ul>`;
            tooltip.innerHTML = html;
        } else {
            tooltip.innerHTML = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4><span class="vote-meta-loading">Aucune donnée enregistrée.</span>`;
        }
        
        const newRect = btn.getBoundingClientRect();
        tooltip.style.left = `${window.scrollX + newRect.left + newRect.width / 2}px`;
        tooltip.style.top = `${window.scrollY + newRect.top - 8}px`;
    }).catch(err => {
        if (activeBtn !== btn) return;
        tooltip.innerHTML = `<h4>Erreur</h4><span class="vote-meta-loading">Impossible de charger les données.</span>`;
    });
}

function hideTooltip() {
    activeBtn = null;
    const tooltip = document.getElementById('vote-admin-tooltip');
    if (tooltip) {
        tooltip.classList.remove('active');
    }
}


async function loadLikedGames() {
    const loader = document.getElementById('likedGamesLoader');
    const content = document.getElementById('likedGamesContent');
    const tbody = document.getElementById('likedGamesTbody');
    const btnShowMore = document.getElementById('btnShowMoreLikedGames');
    
    if (!loader || !content || !tbody || !btnShowMore) return;
    
    loader.classList.remove('hidden');
    content.classList.add('hidden');
    tbody.innerHTML = '';
    
    try {
        const targetPages = [
            'activites.html', 
            'animateur.html', 
            'calme.html', 
            'conversation.html', 
            'direction.html', 
            'formation.html', 
            'gage.html', 
            'manuels.html', 
            'musique.html', 
            'nourriture.html', 
            'presentation.html', 
            'quotidien.html', 
            'reglementation.html', 
            'regles.html', 
            'semaine.html', 
            'veillees.html'
        ];
        
        const pageLabels = {
            'presentation.html': 'Jeux Présentation',
            'semaine.html': 'Jeux Fil Rouge',
            'conversation.html': 'Conversations & Débats',
            'animateur.html': 'Jeux Animateurs',
            'quotidien.html': 'Vie Quotidienne',
            'activites.html': 'Activités',
            'veillees.html': 'Veillées',
            'manuels.html': 'Activités Manuelles',
            'calme.html': 'Retour au Calme',
            'gage.html': 'Idées de Gages',
            'regles.html': 'Règles de Vie',
            'musique.html': 'Musiques de Colo',
            'nourriture.html': 'Nourriture en Camp',
            'direction.html': 'Mémo Direction',
            'reglementation.html': 'Mémo Réglementation',
            'formation.html': 'Mémo Formation'
        };

        const parsedGamesMap = {};

        // 1. Charger et parser les pages statiques
        await Promise.all(targetPages.map(async (pageKey) => {
            try {
                const response = await fetch(`../${pageKey}`);
                if (!response.ok) return;
                const htmlText = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(htmlText, 'text/html');
                
                const listItems = doc.querySelectorAll('.categories ul:not(.fads-grid) li, .categories ol:not(.fads-grid) li');
                listItems.forEach((li) => {
                    if (li.closest('.regles-vie') || li.closest('.modalspe') || li.closest('.no-vote')) return;

                    const text = (li.innerText || li.textContent || '').trim();
                    if (!text) return;

                    const cleanText = text
                        .normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .replace(/[^a-zA-Z0-9]/g, '_')
                        .replace(/_+/g, '_')
                        .toLowerCase()
                        .substring(0, 80);
                    
                    const voteId = `${pageKey}_${cleanText}`;

                    const oldCleanText = text
                        .replace(/[\s\r\n\t/]+/g, '_')
                        .toLowerCase()
                        .substring(0, 80);
                    const oldVoteId = `${pageKey}_${oldCleanText}`;
                    
                    const bElement = li.querySelector('b');
                    let displayName = '';
                    if (bElement) {
                        displayName = (bElement.innerText || bElement.textContent || '').trim();
                    } else {
                        const textContent = text;
                        if (textContent.includes(':')) {
                            displayName = textContent.split(':')[0].trim();
                        } else {
                            displayName = textContent;
                        }
                    }
                    
                    // Nettoyage de la ponctuation de fin (comme ':' ou '-')
                    displayName = displayName.replace(/[:\-]+$/, '').trim();
                    if (displayName.length > 75) {
                        displayName = displayName.substring(0, 72) + '...';
                    }
                    
                    parsedGamesMap[voteId] = {
                        name: displayName,
                        pageKey: pageKey,
                        oldVoteId: oldVoteId
                    };
                });
            } catch (err) {
                console.error(`Erreur de chargement/parsing de ${pageKey}:`, err);
            }
        }));

        // 2. Récupérer les votes depuis Firestore (positifs ET négatifs)
        const [posSnap, negSnap] = await Promise.all([
            db.collection('positive_votes').get(),
            db.collection('negative_votes').get()
        ]);

        const posVotesMap = {};
        const posDocMap = {};
        const negVotesMap = {};
        const negDocMap = {};
        const fixBatch = db.batch();
        let hasFix = false;

        posSnap.forEach((doc) => {
            const raw = doc.data().count;
            const count = (typeof raw === 'number' && !isNaN(raw)) ? raw : 0;
            if (count < 0) {
                fixBatch.update(doc.ref, { count: 0 });
                hasFix = true;
            }
            posVotesMap[doc.id] = Math.max(0, count);
            posDocMap[doc.id] = doc;
        });

        negSnap.forEach((doc) => {
            const raw = doc.data().count;
            const count = (typeof raw === 'number' && !isNaN(raw)) ? raw : 0;
            if (count < 0) {
                fixBatch.update(doc.ref, { count: 0 });
                hasFix = true;
            }
            negVotesMap[doc.id] = Math.max(0, count);
            negDocMap[doc.id] = doc;
        });

        // Migration/consolidation douce des anciens IDs vers les nouveaux IDs normalisés
        for (const voteId in parsedGamesMap) {
            const oldVoteId = parsedGamesMap[voteId].oldVoteId;
            if (oldVoteId && oldVoteId !== voteId) {
                // Positifs
                if (posDocMap[oldVoteId] && !posDocMap[voteId]) {
                    const oldData = posDocMap[oldVoteId].data();
                    const newDocRef = db.collection('positive_votes').doc(voteId);
                    const oldDocRef = posDocMap[oldVoteId].ref;
                    fixBatch.set(newDocRef, oldData, { merge: true });
                    fixBatch.delete(oldDocRef);
                    posVotesMap[voteId] = Math.max(0, oldData.count || 0);
                    hasFix = true;
                }
                // Négatifs
                if (negDocMap[oldVoteId] && !negDocMap[voteId]) {
                    const oldData = negDocMap[oldVoteId].data();
                    const newDocRef = db.collection('negative_votes').doc(voteId);
                    const oldDocRef = negDocMap[oldVoteId].ref;
                    fixBatch.set(newDocRef, oldData, { merge: true });
                    fixBatch.delete(oldDocRef);
                    negVotesMap[voteId] = Math.max(0, oldData.count || 0);
                    hasFix = true;
                }
            }
        }

        if (hasFix) {
            await fixBatch.commit();
            console.log('[Admin] Base de données votes synchronisée et normalisée.');
        }

        // 3. Fusionner les données
        allParsedGames = [];
        for (const voteId in parsedGamesMap) {
            const parsed = parsedGamesMap[voteId];
            const oldVoteId = parsed.oldVoteId;
            const likes = posVotesMap[voteId] ?? (oldVoteId ? (posVotesMap[oldVoteId] ?? 0) : 0);
            const dislikes = negVotesMap[voteId] ?? (oldVoteId ? (negVotesMap[oldVoteId] ?? 0) : 0);
            allParsedGames.push({
                voteId: voteId,
                oldVoteId: oldVoteId,
                name: parsed.name,
                pageKey: parsed.pageKey,
                pageLabel: pageLabels[parsed.pageKey] || parsed.pageKey,
                likes: likes,
                dislikes: dislikes
            });
        }

        // Trier par mentions j'aime décroissant pour le top 10 initial
        allParsedGames.sort((a, b) => {
            if (b.likes !== a.likes) {
                return b.likes - a.likes;
            }
            return a.name.localeCompare(b.name);
        });

        renderLikedGamesTable(false);

    } catch (err) {
        console.error("loadLikedGames error:", err);
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">Erreur lors du chargement du podium.</td></tr>`;
    } finally {
        loader.classList.add('hidden');
        content.classList.remove('hidden');
    }
}

function renderLikedGamesTable(showMore = false) {
    // Cacher le tooltip actif pour éviter les bulles orphelines
    hideTooltip();

    const tbody = document.getElementById('likedGamesTbody');
    const btnShowMore = document.getElementById('btnShowMoreLikedGames');
    const btnCollapse = document.getElementById('btnCollapseLikedGames');
    const switchSort = document.getElementById('switchSortOrder');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const isReversed = switchSort ? switchSort.checked : false;
    
    // Trier et segmenter les jeux en fonction de la direction de tri sélectionnée
    let top10, theRest;
    if (!isReversed) {
        // Mode Normal : Top 10 le plus aimé par likes positifs (décroissant)
        allParsedGames.sort((a, b) => {
            if (b.likes !== a.likes) return b.likes - a.likes;
            return a.name.localeCompare(b.name);
        });
        top10 = allParsedGames.slice(0, 10);
        theRest = allParsedGames.slice(10);
        theRest.sort((a, b) => {
            if (a.likes !== b.likes) return a.likes - b.likes;
            return a.name.localeCompare(b.name);
        });
    } else {
        // Mode Inversé : Top 10 le plus détesté par votes négatifs (décroissant)
        allParsedGames.sort((a, b) => {
            if (b.dislikes !== a.dislikes) return b.dislikes - a.dislikes;
            return a.name.localeCompare(b.name);
        });
        top10 = allParsedGames.slice(0, 10);
        theRest = allParsedGames.slice(10);
        theRest.sort((a, b) => {
            if (a.dislikes !== b.dislikes) return b.dislikes - a.dislikes;
            return a.name.localeCompare(b.name);
        });
    }
    
    let displayedGames = [...top10];
    
    if (showMore) {
        displayedGames = top10.concat(theRest);
        btnShowMore?.classList.add('hidden');
        if (allParsedGames.length > 10) {
            btnCollapse?.classList.remove('hidden');
        } else {
            btnCollapse?.classList.add('hidden');
        }
    } else {
        if (allParsedGames.length > 10) {
            btnShowMore?.classList.remove('hidden');
        } else {
            btnShowMore?.classList.add('hidden');
        }
        btnCollapse?.classList.add('hidden');
    }
    
    // Mettre à jour les icônes de tri du header
    const sortDirectIcon = document.getElementById('sortDirectIcon');
    const sortReverseIcon = document.getElementById('sortReverseIcon');
    if (sortDirectIcon && sortReverseIcon) {
        if (isReversed) {
            sortDirectIcon.className = 'bi bi-hand-thumbs-up';
            sortDirectIcon.style.color = 'var(--clr-text-muted)';
            sortReverseIcon.className = 'bi bi-hand-thumbs-down-fill';
            sortReverseIcon.style.color = '#e74c3c';
        } else {
            sortDirectIcon.className = 'bi bi-hand-thumbs-up-fill';
            sortDirectIcon.style.color = '#2ecc71';
            sortReverseIcon.className = 'bi bi-hand-thumbs-down';
            sortReverseIcon.style.color = 'var(--clr-text-muted)';
        }
    }
    
    if (displayedGames.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Aucun jeu trouvé.</td></tr>`;
        return;
    }
    
    displayedGames.forEach((game, index) => {
        let rankHtml = '';
        if (index === 0) {
            rankHtml = '<span style="font-size: 1.25rem;">🥇</span>';
        } else if (index === 1) {
            rankHtml = '<span style="font-size: 1.25rem;">🥈</span>';
        } else if (index === 2) {
            rankHtml = '<span style="font-size: 1.25rem;">🥉</span>';
        } else {
            rankHtml = `<span style="font-size: 0.85rem; font-weight: 600; color: var(--clr-text-muted);">#${index + 1}</span>`;
        }
        
        // En mode inversé, on affiche les dislikes réels depuis negative_votes
        const displayCount = isReversed ? game.dislikes : game.likes;
        const badgeBg = isReversed ? 'rgba(231, 76, 60, 0.15)' : 'rgba(46, 204, 113, 0.15)';
        const badgeColor = isReversed ? '#e74c3c' : '#2ecc71';
        const badgeIcon = isReversed ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-up-fill';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="text-align: center; vertical-align: middle;">${rankHtml}</td>
            <td style="font-weight: 600; color: var(--clr-text); vertical-align: middle;">${game.name}</td>
            <td style="vertical-align: middle;">
                <a href="../${game.pageKey}" target="_blank" style="color: var(--clr-primary); text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
                    <i class="bi bi-box-arrow-up-right" style="font-size: 0.8rem;"></i> ${game.pageLabel}
                </a>
            </td>
            <td style="text-align: center; vertical-align: middle;">
                <span class="es-badge" style="background: ${badgeBg}; color: ${badgeColor}; font-weight: 700; padding: 4px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                    <i class="bi ${badgeIcon}" style="font-size: 0.85rem;"></i> ${displayCount}
                </span>
            </td>
        `;
        tbody.appendChild(row);

        const badge = row.querySelector('.es-badge');
        if (badge) {
            badge.addEventListener('mouseenter', () => {
                setupAdminTooltipEl();
                showTooltipForBtn(badge, game.voteId, isReversed ? 'down' : 'up', game.oldVoteId);
            });
            badge.addEventListener('mouseleave', () => {
                hideTooltip();
            });
        }
    });
}


function initLikedGamesEvents() {
    if (likedGamesEventsAttached) return;
    likedGamesEventsAttached = true;
    
    const btnShowMore = document.getElementById('btnShowMoreLikedGames');
    if (btnShowMore) {
        btnShowMore.addEventListener('click', () => {
            renderLikedGamesTable(true);
        });
    }

    const btnCollapse = document.getElementById('btnCollapseLikedGames');
    if (btnCollapse) {
        btnCollapse.addEventListener('click', () => {
            renderLikedGamesTable(false);
            document.getElementById('sectionLikedGames')?.scrollIntoView({ behavior: 'smooth' });
        });
    }

    const switchSort = document.getElementById('switchSortOrder');
    if (switchSort) {
        switchSort.addEventListener('change', () => {
            const btnCollapse = document.getElementById('btnCollapseLikedGames');
            const isExpanded = btnCollapse ? !btnCollapse.classList.contains('hidden') : false;
            renderLikedGamesTable(isExpanded);
        });
    }
}

