/* ================================================================
   ESPACE-FORMATION-EDIT.JS
   Hub de gestion complet d'un module de formation :
   - Barre de navigation avec liste déroulante de tous les modules & système d'épinglage (synchronisé en BDD)
   - Onglet 1 : Éditeur du module & questionnaire interactif (QCM, Rédaction, Puzzle, Cloze avec leurres)
   - Onglet 2 : Suivi complet des réponses des stagiaires, notation interactive & exports (CSV/PDF)
   ================================================================ */

let currentUser = null;
let currentRole = 'stagiaire';
let actualUserData = null;
let currentEditingModuleId = null;
let currentEditingQuestions = [];
let allFormationModules = [];
let moduleSubmissions = [];
let filteredModuleSubmissions = [];
let currentFilterStatus = 'all';
let currentSearchQuery = '';
let activeInspectingSubmission = null;
let isTopbarDropdownOpen = false;

const AVAILABLE_FORMATION_ICONS = [
    { icon: 'bi-journal-bookmark', label: 'Livre & Étude', tags: 'cours bafa livre projet etude' },
    { icon: 'bi-mortarboard', label: 'Diplôme / BAFA', tags: 'bafa diplome brevet ecole reussite' },
    { icon: 'bi-diagram-3', label: 'Schéma & Repères', tags: 'schema projet equipe organisation psaadrafra' },
    { icon: 'bi-building', label: 'ACM & Structures', tags: 'acm centre batiment mairie caf ddcs sdjes' },
    { icon: 'bi-people', label: 'Enfants & Public', tags: 'enfants public groupe animateurs colos' },
    { icon: 'bi-shield-check', label: 'Réglementation', tags: 'regles securite loi conformite protection' },
    { icon: 'bi-bank', label: 'Responsabilité', tags: 'loi justice penale civile tribunal sanction' },
    { icon: 'bi-clock-history', label: 'Vie quotidienne', tags: 'quotidien rythme repas coucher lever douche temps' },
    { icon: 'bi-heart-half', label: 'Handicap & Inclusion', tags: 'handicap inclusion difference bienveillance accueil' },
    { icon: 'bi-shield-exclamation', label: 'Harcèlement & VSS', tags: 'harcelement maltraitance vss protection prevention' },
    { icon: 'bi-chat-heart', label: 'Relationnel & Équipe', tags: 'relations equipe conflits communication dialogue' },
    { icon: 'bi-peace', label: 'Laïcité & Valeurs', tags: 'laicite valeurs republique liberte vivre ensemble' },
    { icon: 'bi-signpost-split', label: 'Autorité & Cadre', tags: 'regles sanction autorite cadre limite' },
    { icon: 'bi-file-earmark-text', label: 'Contrats & Droits', tags: 'contrat cee droit travail salaire fiche' },
    { icon: 'bi-stars', label: 'Grands-Jeux & Veillées', tags: 'jeu veillée imaginaire fete spectacle animation' },
    { icon: 'bi-newspaper', label: 'Blog & Infos', tags: 'blog communication journal nouvelles photos' },
    { icon: 'bi-bus-front', label: 'Transport & Sorties', tags: 'transport bus car velo trajet deplacement' },
    { icon: 'bi-chat-dots', label: 'Réunion & Débrief', tags: 'reunion bilan debrief equipe point' },
    { icon: 'bi-palette', label: 'Activités manuelles', tags: 'activites brico dessin art creation atelier' },
    { icon: 'bi-tree', label: 'Nature & Forêt', tags: 'nature foret arbre sortie environnement' },
    { icon: 'bi-cup-hot', label: 'Temps Calme & Pause', tags: 'pause repos cafe sieste calme' },
    { icon: 'bi-award', label: 'Évaluation & Bilan', tags: 'bilan note appreciation validation grille' },
    { icon: 'bi-lightbulb', label: 'Créativité & Idées', tags: 'idee innovation projet animation creation' },
    { icon: 'bi-music-note-beamed', label: 'Chants & Musique', tags: 'chant danse musique guitare spectacle' }
];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
    if (!timestamp) return 'Date inconnue';
    let date = null;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else if (typeof timestamp === 'string' || typeof timestamp === 'number') date = new Date(timestamp);
    if (!date || isNaN(date.getTime())) return 'Date inconnue';

    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `es-toast es-toast--${type}`;
    let icon = 'bi-info-circle';
    if (type === 'success') icon = 'bi-check-circle-fill';
    if (type === 'error') icon = 'bi-exclamation-triangle-fill';
    if (type === 'warning') icon = 'bi-exclamation-circle';

    toast.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function btnLoading(btn, loading = true) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || null;
}

// ----------------------------------------------------------------
// GESTION DU TOPBAR BRAND DROPDOWN & ÉPINGLES (PINNED MODULES BDD)
// ----------------------------------------------------------------
function initTopbarDropdown() {
    const trigger = document.getElementById('moduleNameTopbarTrigger');
    const dropdown = document.getElementById('modulesDropdown');
    const searchInput = document.getElementById('inputSearchModuleSwitch');

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        isTopbarDropdownOpen = !isTopbarDropdownOpen;
        if (isTopbarDropdownOpen) {
            dropdown.classList.remove('hidden');
            renderModulesDropdownList(searchInput ? searchInput.value : '');
            if (searchInput) {
                searchInput.value = '';
                setTimeout(() => searchInput.focus(), 100);
            }
        } else {
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#topbarModuleDropdownWrap')) {
            dropdown.classList.add('hidden');
            isTopbarDropdownOpen = false;
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderModulesDropdownList(e.target.value);
        });
    }
}

function renderModulesDropdownList(query = '') {
    const listEl = document.getElementById('modulesDropdownList');
    if (!listEl) return;

    let pinnedIds = JSON.parse(localStorage.getItem('pinnedModules') || '[]');

    const q = query.toLowerCase().trim();
    const filtered = allFormationModules.filter(m => {
        if (!q) return true;
        const title = (m.title || '').toLowerCase();
        const subtitle = (m.subtitle || '').toLowerCase();
        const num = String(m.num || '');
        return title.includes(q) || subtitle.includes(q) || num.includes(q);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;opacity:0.5;font-size:0.8rem;">Aucun module trouvé.</div>';
        return;
    }

    // Trier : épinglés en haut, puis par numéro
    const sorted = [...filtered].sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id);
        const bPinned = pinnedIds.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
    });

    listEl.innerHTML = sorted.map(m => {
        const isPinned = pinnedIds.includes(m.id);
        const isCurrent = (m.id === currentEditingModuleId);
        const iconClass = m.icon || 'bi-journal-bookmark';

        return `
            <div class="es-topbar__colos-item-wrap" style="position:relative; display:flex; align-items:center;">
                <a href="formation-edit.html?id=${encodeURIComponent(m.id)}" class="es-topbar__colos-item ${isCurrent ? 'active' : ''}" style="flex:1;">
                    <span class="es-topbar__colos-item-emoji"><i class="bi ${iconClass}"></i></span>
                    <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        M.${m.num < 10 ? '0' + m.num : m.num} - ${escapeHtml(m.title)}
                    </span>
                    ${isCurrent ? '<i class="bi bi-check-lg" style="color:var(--clr-primary);"></i>' : ''}
                </a>
                <div class="es-topbar__colos-pin ${isPinned ? 'active' : ''}" 
                     data-module-id="${m.id}"
                     title="${isPinned ? 'Désépingler' : 'Épingler ce module'}">
                    <i class="bi bi-pin-angle${isPinned ? '-fill' : ''}"></i>
                </div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.es-topbar__colos-pin').forEach(pinBtn => {
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const modId = pinBtn.getAttribute('data-module-id');
            togglePinModule(modId);
        });
    });
}

async function togglePinModule(moduleId) {
    let pinnedIds = JSON.parse(localStorage.getItem('pinnedModules') || '[]');

    if (pinnedIds.includes(moduleId)) {
        pinnedIds = pinnedIds.filter(id => id !== moduleId);
    } else {
        if (pinnedIds.length >= 5) {
            showToast("Tu ne peux épingler que 5 modules maximum.", "warning");
            return;
        }
        pinnedIds.push(moduleId);
    }

    localStorage.setItem('pinnedModules', JSON.stringify(pinnedIds));

    // Sauvegarder dans Firestore BDD
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).update({
            pinnedModules: pinnedIds
        }).catch(err => {
            console.error("Erreur lors de la sauvegarde des modules épinglés en BDD :", err);
        });
    }

    const searchInput = document.getElementById('inputSearchModuleSwitch');
    renderModulesDropdownList(searchInput ? searchInput.value : '');
}

// ----------------------------------------------------------------
// GESTION DU SÉLECTEUR D'ICÔNES & FOND DE CARTE
// ----------------------------------------------------------------
function updateIconPreview(iconClass) {
    const previewEl = document.getElementById('iconPreviewEl');
    const heroIconEl = document.getElementById('heroIconEl');
    const selectedIconPreview = document.getElementById('selectedIconPreview');
    const selectedIconLabel = document.getElementById('selectedIconLabel');
    if (previewEl) previewEl.className = `bi ${iconClass}`;
    if (heroIconEl) heroIconEl.className = `bi ${iconClass}`;
    if (selectedIconPreview) selectedIconPreview.className = `bi ${iconClass}`;

    const match = AVAILABLE_FORMATION_ICONS.find(item => item.icon === iconClass);
    if (selectedIconLabel) {
        selectedIconLabel.textContent = match ? match.label : 'Personnalisée';
    }
}

function renderIconPicker(selectedIcon = 'bi-journal-bookmark') {
    const grid = document.getElementById('iconPickerGrid');
    const filterInput = document.getElementById('iconFilterInput');
    if (!grid) return;

    function buildGrid(query = '') {
        const q = query.toLowerCase().trim();
        const filtered = AVAILABLE_FORMATION_ICONS.filter(item => {
            if (!q) return true;
            return item.label.toLowerCase().includes(q) || item.tags.toLowerCase().includes(q) || item.icon.toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--clr-text-muted); font-size: 0.8rem; padding: 10px;">Aucune icône trouvée pour "${escapeHtml(query)}"</div>`;
            return;
        }

        grid.innerHTML = filtered.map(item => {
            const isSelected = item.icon === selectedIcon;
            return `
                <button type="button" class="es-icon-picker-btn ${isSelected ? 'active' : ''}" data-icon="${item.icon}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px 4px; background: ${isSelected ? 'rgba(166, 216, 102, 0.2)' : 'var(--clr-surface)'}; border: 1.5px solid ${isSelected ? 'var(--clr-primary)' : 'var(--clr-surface-3)'}; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
                    <i class="bi ${item.icon}" style="font-size: 1.25rem; color: ${isSelected ? 'var(--clr-primary-dark)' : 'var(--clr-text)'};"></i>
                    <span style="font-size: 0.68rem; font-weight: 600; color: var(--clr-text); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%;">${escapeHtml(item.label)}</span>
                </button>
            `;
        }).join('');

        grid.querySelectorAll('.es-icon-picker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const icon = btn.getAttribute('data-icon');
                document.getElementById('editModuleIcon').value = icon;
                selectedIcon = icon;
                updateIconPreview(icon);
                buildGrid(filterInput ? filterInput.value : '');
            });
        });
    }

    buildGrid();

    if (filterInput) {
        filterInput.oninput = () => buildGrid(filterInput.value);
    }
}

function updateModuleBgPreview(url) {
    const container = document.getElementById('moduleBgPreviewContainer');
    const img = document.getElementById('moduleBgPreviewImg');
    if (!container || !img) return;

    if (url && url.trim() !== '') {
        img.src = url.trim();
        container.classList.remove('hidden');
    } else {
        img.src = '';
        container.classList.add('hidden');
    }
}

// ----------------------------------------------------------------
// RÉCUPÉRATION & CHARGEMENT DU MODULE
// ----------------------------------------------------------------
async function fetchModuleQuestions(moduleId) {
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
        if (!snap.empty) {
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (e) {
        console.warn("fetchModuleQuestions subcollection error:", e);
    }
    return [];
}

async function loadModuleHubData() {
    const loader = document.getElementById('pageLoader');
    const navbar = document.getElementById('formationNavbar');
    const mainView = document.getElementById('moduleHubMain');
    const moduleId = getQueryParam('id') || getQueryParam('module');

    try {
        // Charger tous les modules pour le switch dropdown
        const allSnap = await db.collection('formation').orderBy('num', 'asc').get();
        if (!allSnap.empty) {
            allFormationModules = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            allFormationModules = [];
        }

        let moduleData = null;
        if (moduleId) {
            moduleData = allFormationModules.find(m => m.id === moduleId);
            if (!moduleData) {
                const docSnap = await db.collection('formation').doc(moduleId).get();
                if (docSnap.exists) {
                    moduleData = { id: docSnap.id, ...docSnap.data() };
                }
            }

            if (moduleData) {
                const questions = await fetchModuleQuestions(moduleId);
                moduleData.questions = questions.length > 0 ? questions : (moduleData.questions || []);
            }
        }

        if (moduleData) {
            currentEditingModuleId = moduleData.id;
            document.getElementById('editModuleId').value = moduleData.id;
            document.getElementById('editModuleNum').value = moduleData.num || 1;
            document.getElementById('editModuleTitle').value = moduleData.title || '';
            document.getElementById('editModuleSubtitle').value = moduleData.subtitle || '';
            document.getElementById('editModuleIcon').value = moduleData.icon || 'bi-journal-bookmark';
            document.getElementById('editModuleBgImage').value = moduleData.bgImage || '';
            updateModuleBgPreview(moduleData.bgImage || '');
            
            const isVis = (moduleData.visible !== false);
            if (document.getElementById('editModuleVisible')) {
                document.getElementById('editModuleVisible').checked = isVis;
            }

            const qConfig = moduleData.quizConfig || {};
            document.getElementById('editMaxAttempts').value = (qConfig.maxAttempts !== undefined) ? qConfig.maxAttempts : 0;

            let initialMins = 0;
            let initialSecs = 0;
            if (qConfig.timerTotalSeconds !== undefined && qConfig.timerTotalSeconds !== null) {
                const tot = parseInt(qConfig.timerTotalSeconds, 10) || 0;
                initialMins = Math.floor(tot / 60);
                initialSecs = tot % 60;
            } else {
                initialMins = parseInt(qConfig.timerMinutes, 10) || 0;
                initialSecs = parseInt(qConfig.timerSeconds, 10) || 0;
            }
            document.getElementById('editQuizTimerMinutes').value = initialMins;
            document.getElementById('editQuizTimerSeconds').value = initialSecs;
            document.getElementById('editShowResultsAtEnd').checked = qConfig.showResultsAtEnd === true;

            const hasPwd = Boolean(qConfig.requirePassword === true || (qConfig.password && String(qConfig.password).trim() !== ''));
            const pwdVal = qConfig.password || '';
            const chkRequirePassword = document.getElementById('editQuizRequirePassword');
            const inputPassword = document.getElementById('editQuizPassword');
            const wrapPassword = document.getElementById('quizPasswordInputWrap');
            if (chkRequirePassword) chkRequirePassword.checked = hasPwd;
            if (inputPassword) inputPassword.value = pwdVal;
            if (wrapPassword) {
                if (hasPwd) wrapPassword.classList.remove('hidden');
                else wrapPassword.classList.add('hidden');
            }

            currentEditingQuestions = JSON.parse(JSON.stringify(moduleData.questions || []));

            // Topbar Brand
            const topbarIcon = document.getElementById('moduleIconTopbar');
            const topbarTitle = document.getElementById('moduleNameTopbar');
            if (topbarIcon) topbarIcon.innerHTML = `<i class="bi ${moduleData.icon || 'bi-journal-bookmark'}"></i>`;
            if (topbarTitle) topbarTitle.textContent = `Module ${moduleData.num < 10 ? '0' + moduleData.num : moduleData.num} — ${moduleData.title}`;

            // Hero UI
            document.getElementById('heroModuleTitle').textContent = moduleData.title;
            document.getElementById('heroModuleSubtitle').textContent = moduleData.subtitle || '';
            document.getElementById('heroModuleBadge').textContent = `Module ${moduleData.num < 10 ? '0' + moduleData.num : moduleData.num}`;
            
            const visBadge = document.getElementById('heroVisibilityBadge');
            if (visBadge) {
                visBadge.textContent = isVis ? 'Visible' : 'Masqué';
                visBadge.className = `es-badge ${isVis ? 'es-badge--approved' : 'es-badge--pending'}`;
            }

            if (currentRole === 'admin') {
                document.getElementById('btnDeleteModule')?.classList.remove('hidden');
            }

            // Charger les soumissions de ce module
            await loadModuleSubmissions(moduleData.id);

        } else {
            // Nouveau module
            currentEditingModuleId = null;
            let nextNum = 1;
            if (allFormationModules.length > 0) {
                const nums = allFormationModules.map(d => parseInt(d.num, 10) || 0);
                nextNum = Math.max(...nums, 0) + 1;
            }

            document.getElementById('editModuleId').value = '';
            document.getElementById('editModuleNum').value = nextNum;
            document.getElementById('editModuleTitle').value = '';
            document.getElementById('editModuleSubtitle').value = '';
            document.getElementById('editModuleIcon').value = 'bi-journal-bookmark';
            document.getElementById('editModuleBgImage').value = '';
            updateModuleBgPreview('');
            
            if (document.getElementById('editModuleVisible')) {
                document.getElementById('editModuleVisible').checked = true;
            }

            document.getElementById('editMaxAttempts').value = 1;
            document.getElementById('editQuizTimerMinutes').value = 0;
            document.getElementById('editQuizTimerSeconds').value = 0;
            document.getElementById('editShowResultsAtEnd').checked = false;

            const chkRequirePassword = document.getElementById('editQuizRequirePassword');
            const inputPassword = document.getElementById('editQuizPassword');
            const wrapPassword = document.getElementById('quizPasswordInputWrap');
            if (chkRequirePassword) chkRequirePassword.checked = false;
            if (inputPassword) inputPassword.value = '';
            if (wrapPassword) wrapPassword.classList.add('hidden');

            currentEditingQuestions = [
                {
                    id: 'q_' + Date.now() + '_1',
                    type: 'qcm',
                    text: '',
                    options: ['Option 1', 'Option 2'],
                    correctIndex: 0,
                    hint: ''
                }
            ];

            document.getElementById('moduleNameTopbar').textContent = 'Nouveau Module de Formation';
            document.getElementById('heroModuleTitle').textContent = 'Nouveau Module & Quiz';
            document.getElementById('heroModuleSubtitle').textContent = 'Configuration et création des questions';
            document.getElementById('heroModuleBadge').textContent = 'Nouveau';
            document.getElementById('btnDeleteModule')?.classList.add('hidden');

            moduleSubmissions = [];
            updateModuleStats();
            applyModuleFiltersAndRender();
        }

        const chosenIcon = document.getElementById('editModuleIcon').value || 'bi-journal-bookmark';
        renderIconPicker(chosenIcon);
        updateIconPreview(chosenIcon);
        renderQuestionsEditor();
        initTopbarDropdown();

        // Si l'URL demande directement l'onglet résultats (?tab=results)
        if (getQueryParam('tab') === 'results') {
            switchTab('results');
        }

        if (loader) loader.classList.add('hidden');
        if (navbar) navbar.style.display = 'block';
        if (mainView) mainView.style.display = 'block';

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("loadModuleHubData error:", err);
        showToast("Erreur lors du chargement du module.", "error");
    }
}

// ----------------------------------------------------------------
// NAVIGATION PAR ONGLETS (TABS)
// ----------------------------------------------------------------
function switchTab(tabName) {
    const tabEditor = document.getElementById('tabContentEditor');
    const tabResults = document.getElementById('tabContentResults');
    const btnEditor = document.getElementById('tabBtnEditor');
    const btnResults = document.getElementById('tabBtnResults');

    if (tabName === 'results') {
        tabEditor?.classList.add('hidden');
        tabResults?.classList.remove('hidden');
        btnEditor?.classList.remove('active');
        btnResults?.classList.add('active');
    } else {
        tabEditor?.classList.remove('hidden');
        tabResults?.classList.add('hidden');
        btnEditor?.classList.add('active');
        btnResults?.classList.remove('active');
    }
}

document.getElementById('tabBtnEditor')?.addEventListener('click', () => switchTab('editor'));
document.getElementById('tabBtnResults')?.addEventListener('click', () => switchTab('results'));

// ----------------------------------------------------------------
// GESTION DES SOUMISSIONS DU MODULE (ONGLET 2)
// ----------------------------------------------------------------
async function loadModuleSubmissions(moduleId) {
    moduleSubmissions = [];
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('submissions').get();
        if (!snap.empty) {
            moduleSubmissions = snap.docs.map(d => ({ id: d.id, moduleId: moduleId, ...d.data() }));
            moduleSubmissions.sort((a, b) => {
                const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                return tb - ta;
            });
        }
    } catch (e) {
        console.warn("loadModuleSubmissions error:", e);
    }

    const badgeTabCount = document.getElementById('tabCountSubmissions');
    if (badgeTabCount) badgeTabCount.textContent = moduleSubmissions.length;

    updateModuleStats();
    applyModuleFiltersAndRender();
}

function updateModuleStats() {
    const total = moduleSubmissions.length;
    const uniqueUids = new Set(moduleSubmissions.map(s => s.userId).filter(Boolean));
    const uniqueCount = uniqueUids.size;

    let passed = 0;
    let sumScore = 0;
    let countToGrade = 0;

    moduleSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        sumScore += pct;
        if (pct >= 50) passed++;
        if (s.evaluations && Object.values(s.evaluations).some(ev => ev.status === 'auto_draft')) {
            countToGrade++;
        }
    });

    const avg = total > 0 ? Math.round(sumScore / total) : 0;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    document.getElementById('statModuleTotalAttempts').textContent = total;
    document.getElementById('statModuleUniqueStagiaires').textContent = uniqueCount;
    document.getElementById('statModuleSuccessRate').textContent = `${rate}%`;
    document.getElementById('statModuleAverageScore').textContent = `${avg}%`;

    document.getElementById('countModuleFilterAll').textContent = total;
    document.getElementById('countModuleFilterPassed').textContent = passed;
    document.getElementById('countModuleFilterFailed').textContent = total - passed;
    document.getElementById('countModuleFilterToGrade').textContent = countToGrade;
}

function applyModuleFiltersAndRender() {
    const tableBody = document.getElementById('moduleSubmissionsTableBody');
    const emptyPlaceholder = document.getElementById('emptyModuleSubmissionsPlaceholder');
    if (!tableBody) return;

    filteredModuleSubmissions = moduleSubmissions.filter(sub => {
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            const name = (sub.userName || '').toLowerCase();
            const email = (sub.userEmail || '').toLowerCase();
            if (!name.includes(q) && !email.includes(q)) return false;
        }

        const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
        if (currentFilterStatus === 'passed' && pct < 50) return false;
        if (currentFilterStatus === 'failed' && pct >= 50) return false;
        if (currentFilterStatus === 'to_grade') {
            const hasDraft = sub.evaluations && Object.values(sub.evaluations).some(ev => ev.status === 'auto_draft');
            if (!hasDraft) return false;
        }

        return true;
    });

    if (filteredModuleSubmissions.length === 0) {
        tableBody.innerHTML = '';
        if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
        return;
    }

    if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

    tableBody.innerHTML = filteredModuleSubmissions.map((sub, idx) => {
        const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
        const isPassed = pct >= 50;
        const scoreRatio = sub.score ? `${sub.score.correct}/${sub.score.total}` : '';
        const hasDraft = sub.evaluations && Object.values(sub.evaluations).some(ev => ev.status === 'auto_draft');

        let statusBadgeHtml = '';
        if (hasDraft) {
            statusBadgeHtml = `<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-pencil"></i> Rédaction à noter</span>`;
        } else if (isPassed) {
            statusBadgeHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-check-circle-fill"></i> Validé (${pct}%)</span>`;
        } else {
            statusBadgeHtml = `<span class="es-badge es-badge--rejected" style="font-size:0.75rem;"><i class="bi bi-x-circle-fill"></i> À retravailler (${pct}%)</span>`;
        }

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:32px; height:32px; border-radius:50%; background:var(--clr-surface-3); display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--clr-text); font-size:0.8rem; flex-shrink:0;">
                            ${escapeHtml((sub.userName || 'S')[0].toUpperCase())}
                        </div>
                        <div>
                            <div style="font-weight:700; color:var(--clr-text); font-size:0.92rem;">${escapeHtml(sub.userName || 'Stagiaire')}</div>
                            <div style="font-size:0.78rem; color:var(--clr-text-muted);">${escapeHtml(sub.userEmail || '')}</div>
                        </div>
                    </div>
                </td>
                <td style="text-align:center;">
                    <span style="font-size:0.82rem; font-weight:600; color:var(--clr-text);">Tentative #${sub.attemptNumber || 1}</span>
                    ${sub.timeExpired ? '<span style="font-size:0.72rem; color:var(--clr-danger); display:block;">⏰ Expiré</span>' : ''}
                </td>
                <td style="text-align:center;">
                    <span style="font-size:0.82rem; color:var(--clr-text-muted);">${formatDate(sub.submittedAt)}</span>
                </td>
                <td style="text-align:center;">
                    <span style="font-weight:800; font-size:0.95rem; color:${isPassed ? 'var(--clr-success)' : 'var(--clr-danger)'};">${pct}%</span>
                    <span style="font-size:0.78rem; color:var(--clr-text-muted); margin-left:4px;">(${scoreRatio})</span>
                </td>
                <td style="text-align:center;">${statusBadgeHtml}</td>
                <td style="text-align:center;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                        <button type="button" class="es-btn es-btn--primary es-btn--sm btn-inspect-sub" data-sub-idx="${idx}" style="font-weight:600; padding:6px 12px; font-size:0.82rem;" title="Inspecter et noter la copie">
                            <i class="bi bi-eye-fill"></i> Inspecter
                        </button>
                        <button type="button" class="es-btn es-btn--danger es-btn--sm btn-delete-sub" data-sub-id="${sub.id}" data-sub-name="${escapeHtml(sub.userName || 'le stagiaire')}" style="padding:6px 10px; font-size:0.82rem;" title="Supprimer définitivement cette copie">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('.btn-inspect-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-sub-idx'), 10);
            const sub = filteredModuleSubmissions[idx];
            if (sub) openSubmissionInspectionModal(sub);
        });
    });

    tableBody.querySelectorAll('.btn-delete-sub').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const subId = btn.getAttribute('data-sub-id');
            const subName = btn.getAttribute('data-sub-name') || 'ce stagiaire';
            if (subId) deleteSubmission(subId, subName);
        });
    });
}

// ----------------------------------------------------------------
// SUPPRESSION D'UNE COPIE / RÉPONSE DE STAGIAIRE
// ----------------------------------------------------------------
async function deleteSubmission(submissionId, candidateName = 'ce stagiaire') {
    if (!currentEditingModuleId || !submissionId) return;
    if (!confirm(`⚠️ Supprimer définitivement la copie de ${candidateName} ? Cette action est irréversible.`)) {
        return;
    }

    try {
        await db.collection('formation').doc(currentEditingModuleId).collection('submissions').doc(submissionId).delete();
        showToast("Copie supprimée avec succès.", "success");
        await loadModuleSubmissions(currentEditingModuleId);
        const modal = document.getElementById('overlayReviewSubmission');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    } catch (err) {
        console.error("Delete submission error:", err);
        showToast("Erreur lors de la suppression de la copie.", "error");
    }
}

// ----------------------------------------------------------------
// MODAL D'INSPECTION & NOTATION
// ----------------------------------------------------------------
async function openSubmissionInspectionModal(sub) {
    activeInspectingSubmission = JSON.parse(JSON.stringify(sub));
    const modal = document.getElementById('overlayReviewSubmission');
    const nameEl = document.getElementById('reviewCandidateName');
    const metaEl = document.getElementById('reviewCandidateMeta');
    const scoreHeader = document.getElementById('reviewScoreHeader');
    const questionsContainer = document.getElementById('reviewQuestionsContainer');

    if (!modal) return;

    if (nameEl) nameEl.textContent = sub.userName || sub.userEmail || 'Stagiaire';
    if (metaEl) {
        metaEl.textContent = `Tentative #${sub.attemptNumber || 1} • Transmise le ${formatDate(sub.submittedAt)}`;
    }

    const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
    const isPassed = pct >= 50;

    if (scoreHeader) {
        scoreHeader.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <div style="width:52px; height:52px; border-radius:50%; background:${isPassed ? 'rgba(39, 174, 96, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; color:${isPassed ? 'var(--clr-success)' : 'var(--clr-danger)'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.15rem; flex-shrink:0;">
                    ${pct}%
                </div>
                <div>
                    <div style="font-weight:700; font-size:1rem; color:var(--clr-text);">
                        Score QCM : ${sub.score ? `${sub.score.correct} / ${sub.score.total} corrects` : ''}
                    </div>
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:2px;">
                        ${isPassed ? '✅ Épreuve validée' : '❌ Objectif non atteint (< 50%)'}
                    </div>
                </div>
            </div>
            <div style="font-size:0.82rem; color:var(--clr-text-muted);">
                Email : <strong style="color:var(--clr-text);">${escapeHtml(sub.userEmail || '')}</strong>
            </div>
        `;
    }

    modal.classList.remove('hidden');

    const questions = currentEditingQuestions.length > 0 ? currentEditingQuestions : await fetchModuleQuestions(sub.moduleId);
    renderInspectionQuestions(questions, activeInspectingSubmission);
}

function renderInspectionQuestions(questions, sub) {
    const container = document.getElementById('reviewQuestionsContainer');
    if (!container) return;

    if (!questions || questions.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--clr-text-muted);">Aucune question enregistrée.</div>`;
        return;
    }

    const answers = sub.answers || {};
    const evaluations = sub.evaluations || {};

    container.innerHTML = questions.map((q, idx) => {
        const ans = answers[q.id];
        const type = q.type || 'qcm';
        let contentHtml = '';

        if (type === 'qcm') {
            const chosenIdx = ans !== undefined ? parseInt(ans, 10) : -1;
            const correctIdx = q.correctIndex !== undefined ? q.correctIndex : 0;
            const isCorrect = (chosenIdx === correctIdx);

            const optionsHtml = (q.options || []).map((opt, oIdx) => {
                const isSelected = (chosenIdx === oIdx);
                const isExpected = (correctIdx === oIdx);
                let optStyle = 'background:var(--clr-surface); border:1px solid var(--clr-surface-3); color:var(--clr-text);';
                let icon = '<i class="bi bi-circle"></i>';

                if (isSelected && isExpected) {
                    optStyle = 'background:rgba(39, 174, 96, 0.12); border:1.5px solid var(--clr-success); color:var(--clr-success); font-weight:700;';
                    icon = '<i class="bi bi-check-circle-fill"></i>';
                } else if (isSelected && !isExpected) {
                    optStyle = 'background:rgba(231, 76, 60, 0.12); border:1.5px solid var(--clr-danger); color:var(--clr-danger); font-weight:700;';
                    icon = '<i class="bi bi-x-circle-fill"></i>';
                } else if (isExpected) {
                    optStyle = 'background:rgba(39, 174, 96, 0.08); border:1.5px dashed var(--clr-success); color:var(--clr-success);';
                    icon = '<i class="bi bi-check-circle"></i>';
                }

                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.85rem; ${optStyle}">
                        ${icon}
                        <span>${escapeHtml(opt)}</span>
                        ${isSelected ? '<span style="font-size:0.72rem; margin-left:auto; opacity:0.85;">(Réponse choisie)</span>' : ''}
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${optionsHtml}
                </div>
            `;
        } else if (type === 'cloze') {
            const rawCloze = q.clozeText || '';
            const rawMatches = rawCloze.match(/\[([^\]]+)\]/g) || [];
            const expectedBlanks = rawMatches.map(m => m.slice(1, -1).trim()).filter(Boolean);
            const userPlaced = Array.isArray(ans) ? ans : [];

            let filledIndex = 0;
            const parsedCloze = escapeHtml(rawCloze).replace(/\[([^\]]+)\]/g, (match, p1) => {
                const curIndex = filledIndex++;
                const expected = expectedBlanks[curIndex] || p1;
                const placed = userPlaced[curIndex] || '';
                const isBlankCorrect = (placed.trim().toLowerCase() === expected.trim().toLowerCase());

                return `<span style="display:inline-flex; align-items:center; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.82rem; margin:0 3px; ${isBlankCorrect ? 'background:rgba(39,174,96,0.18); border:1.5px solid var(--clr-success); color:var(--clr-success);' : 'background:rgba(231,76,60,0.18); border:1.5px solid var(--clr-danger); color:var(--clr-danger);'}">
                    ${escapeHtml(placed || '—')} ${!isBlankCorrect ? `<small style="font-size:0.7rem; opacity:0.85; margin-left:4px;">(attendu : ${escapeHtml(expected)})</small>` : '✓'}
                </span>`;
            });

            contentHtml = `
                <div style="margin-top:10px; padding:12px 14px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.88rem; line-height:1.7;">
                    ${parsedCloze}
                </div>
            `;
        } else if (type === 'puzzle') {
            const expectedItems = q.items || [];
            const userSeq = Array.isArray(ans) ? ans : [];

            const seqHtml = userSeq.map((it, pIdx) => {
                const isCorrectPos = (it === expectedItems[pIdx]);
                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:var(--radius-sm); font-size:0.84rem; background:var(--clr-surface); border:1px solid ${isCorrectPos ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                        <span style="font-weight:700; color:var(--clr-text-muted);">${pIdx + 1}.</span>
                        <span style="font-weight:600; color:var(--clr-text); flex:1;">${escapeHtml(it)}</span>
                        ${isCorrectPos ? '<i class="bi bi-check-circle-fill" style="color:var(--clr-success);"></i>' : `<span style="font-size:0.72rem; color:var(--clr-danger);">(attendu : ${escapeHtml(expectedItems[pIdx] || '')})</span>`}
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${seqHtml || '<div style="font-size:0.82rem; color:var(--clr-text-muted);">Aucun ordre renseigné.</div>'}
                </div>
            `;
        } else if (type === 'text') {
            const userText = typeof ans === 'string' ? ans : '';
            const evalObj = evaluations[q.id] || {};
            const isAwarded = (evalObj.isCorrect === true);

            contentHtml = `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
                    <div style="padding:12px 14px; background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.88rem; color:var(--clr-text); line-height:1.6; white-space:pre-wrap;">
                        ${escapeHtml(userText || 'Aucune réponse rédigée.')}
                    </div>

                    ${q.hint ? `
                        <div style="font-size:0.78rem; color:var(--clr-text-muted); background:var(--clr-surface-2); padding:8px 12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                            💡 <strong>Piste pédagogique :</strong> ${escapeHtml(q.hint)}
                        </div>
                    ` : ''}

                    <div style="background:var(--clr-surface-2); border:1.5px solid rgba(52, 152, 219, 0.3); border-radius:var(--radius-sm); padding:12px 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                            <span style="font-size:0.82rem; font-weight:700; color:var(--clr-text);">
                                👨‍🏫 Évaluation Formateur :
                            </span>
                            <div style="display:flex; gap:8px;">
                                <button type="button" class="es-btn es-btn--sm btn-toggle-eval-award ${isAwarded ? 'es-btn--primary' : 'es-btn--ghost'}" data-qid="${q.id}" data-award="true" style="font-size:0.78rem; padding:4px 10px;">
                                    <i class="bi bi-check2"></i> Valider (1 pt)
                                </button>
                                <button type="button" class="es-btn es-btn--sm btn-toggle-eval-award ${!isAwarded ? 'es-btn--danger' : 'es-btn--ghost'}" data-qid="${q.id}" data-award="false" style="font-size:0.78rem; padding:4px 10px;">
                                    <i class="bi bi-x"></i> Refuser (0 pt)
                                </button>
                            </div>
                        </div>
                        <input type="text" class="es-input input-eval-comment" data-qid="${q.id}" value="${escapeHtml(evalObj.comment || '')}" placeholder="Commentaire du formateur..." style="font-size:0.82rem; padding:6px 10px;">
                    </div>
                </div>
            `;
        }

        return `
            <div style="background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                    <span style="font-weight:700; font-size:0.85rem; color:var(--clr-primary-xdark);">Question ${idx + 1}</span>
                    <span class="es-badge es-badge--stagiaire" style="font-size:0.68rem;">${type.toUpperCase()}</span>
                </div>
                <div style="font-weight:700; font-size:0.92rem; color:var(--clr-text);">${escapeHtml(q.text || '')}</div>
                ${contentHtml}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-toggle-eval-award').forEach(btn => {
        btn.addEventListener('click', () => {
            const qid = btn.getAttribute('data-qid');
            const award = btn.getAttribute('data-award') === 'true';
            if (!activeInspectingSubmission.evaluations) activeInspectingSubmission.evaluations = {};
            if (!activeInspectingSubmission.evaluations[qid]) activeInspectingSubmission.evaluations[qid] = {};
            activeInspectingSubmission.evaluations[qid].isCorrect = award;
            activeInspectingSubmission.evaluations[qid].status = 'graded';
            activeInspectingSubmission.evaluations[qid].gradedByName = actualUserData?.displayName || 'Formateur';
            activeInspectingSubmission.evaluations[qid].gradedAt = new Date().toISOString();

            renderInspectionQuestions(questions, activeInspectingSubmission);
        });
    });

    container.querySelectorAll('.input-eval-comment').forEach(input => {
        input.addEventListener('input', (e) => {
            const qid = input.getAttribute('data-qid');
            if (!activeInspectingSubmission.evaluations) activeInspectingSubmission.evaluations = {};
            if (!activeInspectingSubmission.evaluations[qid]) activeInspectingSubmission.evaluations[qid] = {};
            activeInspectingSubmission.evaluations[qid].comment = e.target.value;
        });
    });
}

document.getElementById('btnSaveGradingChanges')?.addEventListener('click', async function() {
    if (!activeInspectingSubmission) return;
    btnLoading(this, true);

    try {
        await db.collection('formation').doc(activeInspectingSubmission.moduleId)
            .collection('submissions').doc(activeInspectingSubmission.id)
            .update({
                evaluations: activeInspectingSubmission.evaluations || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        const matchIdx = moduleSubmissions.findIndex(s => s.id === activeInspectingSubmission.id);
        if (matchIdx !== -1) {
            moduleSubmissions[matchIdx].evaluations = activeInspectingSubmission.evaluations;
        }

        btnLoading(this, false);
        showToast("✅ Notes formateur enregistrées !", "success");
        updateModuleStats();
        applyModuleFiltersAndRender();
        document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
    } catch (err) {
        btnLoading(this, false);
        console.error("Save grading error:", err);
        showToast("Erreur lors de l'enregistrement des notes.", "error");
    }
});

document.getElementById('btnCloseReviewModal')?.addEventListener('click', () => {
    document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
});
document.getElementById('btnCloseReviewBottom')?.addEventListener('click', () => {
    document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
});
document.getElementById('btnDeleteInspectedSubmission')?.addEventListener('click', () => {
    if (!activeInspectingSubmission || !activeInspectingSubmission.id) return;
    deleteSubmission(activeInspectingSubmission.id, activeInspectingSubmission.userName || 'ce stagiaire');
});

// Filtres et recherche onglet 2
document.getElementById('searchModuleSubmissionsInput')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    applyModuleFiltersAndRender();
});

document.querySelectorAll('.module-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.module-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterStatus = btn.getAttribute('data-filter');
        applyModuleFiltersAndRender();
    });
});

// Export CSV & PDF pour ce module
document.getElementById('btnExportModuleCsv')?.addEventListener('click', () => {
    if (moduleSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }
    const modTitle = document.getElementById('editModuleTitle').value || 'module';
    let csvContent = "\uFEFF";
    csvContent += "Stagiaire;Email;Tentative;Score Correct;Score Total;Score Pourcentage;Date\r\n";

    moduleSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        const correct = s.score?.correct !== undefined ? s.score.correct : 0;
        const total = s.score?.total !== undefined ? s.score.total : 0;
        csvContent += `"${(s.userName || '').replace(/"/g, '""')}";"${(s.userEmail || '').replace(/"/g, '""')}";${s.attemptNumber || 1};${correct};${total};${pct}%;"${formatDate(s.submittedAt)}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `resultats_${modTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Export CSV téléchargé avec succès !", "success");
});

document.getElementById('btnExportModulePdf')?.addEventListener('click', () => {
    if (moduleSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const modTitle = document.getElementById('editModuleTitle').value || 'Module';
        const modNum = document.getElementById('editModuleNum').value || '1';

        doc.setFontSize(16);
        doc.text(`Procès-Verbal : Module ${modNum} - ${modTitle}`, 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} • ${moduleSubmissions.length} copies enregistrées`, 14, 25);

        const tableData = moduleSubmissions.map(s => [
            s.userName || s.userEmail || 'Stagiaire',
            `#${s.attemptNumber || 1}`,
            `${s.score?.percent !== undefined ? s.score.percent : 0}% (${s.score?.correct || 0}/${s.score?.total || 0})`,
            (s.score?.percent >= 50) ? 'Validé' : 'À revoir',
            formatDate(s.submittedAt)
        ]);

        doc.autoTable({
            head: [['Stagiaire', 'Tentative', 'Score', 'Résultat', 'Date']],
            body: tableData,
            startY: 32,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [78, 122, 29], textColor: [255, 255, 255] }
        });

        doc.save(`bilan_module_${modNum}_${Date.now()}.pdf`);
        showToast("Rapport PDF généré !", "success");
    } catch (err) {
        console.error("PDF export error:", err);
        showToast("Erreur lors de la génération du PDF.", "error");
    }
});

// ----------------------------------------------------------------
// GESTION DU BUILDER DE QUESTIONS (ONGLET 1)
// ----------------------------------------------------------------
function syncQuestionsFromDOM() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    const cards = container.querySelectorAll('.es-qcard');
    cards.forEach(card => {
        const idx = parseInt(card.getAttribute('data-qidx'), 10);
        if (isNaN(idx) || !currentEditingQuestions[idx]) return;

        const q = currentEditingQuestions[idx];

        // Énoncé
        const textInput = card.querySelector('.q-text-input');
        if (textInput) q.text = textInput.value;

        // Image
        const imgInput = card.querySelector('.q-image-input');
        if (imgInput) q.imageUrl = imgInput.value.trim();

        // Indice
        const hintInput = card.querySelector('.q-hint-input');
        if (hintInput) q.hint = hintInput.value;

        // Type
        const typeSelect = card.querySelector('.q-type-select');
        if (typeSelect) q.type = typeSelect.value;

        // Champs spécifiques selon le type
        if (q.type === 'qcm') {
            const optInputs = card.querySelectorAll('.qcm-opt-input');
            const opts = [];
            optInputs.forEach(optInput => {
                opts.push(optInput.value);
            });
            if (opts.length > 0) q.options = opts;

            const checkedRadio = card.querySelector('input[type="radio"]:checked');
            if (checkedRadio) {
                q.correctIndex = parseInt(checkedRadio.value, 10);
            }
        } else if (q.type === 'cloze') {
            const clozeInput = card.querySelector('.q-cloze-text-input');
            if (clozeInput) q.clozeText = clozeInput.value;

            const distractorsInput = card.querySelector('.q-distractors-input');
            if (distractorsInput) q.distractors = distractorsInput.value;
        } else if (q.type === 'puzzle') {
            const puzzleInputs = card.querySelectorAll('.puzzle-item-input');
            const items = [];
            puzzleInputs.forEach(pInput => {
                items.push(pInput.value);
            });
            if (items.length > 0) q.items = items;
        }
    });
}

function moveQuestion(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= currentEditingQuestions.length || fromIdx === toIdx) return;
    syncQuestionsFromDOM();
    const [movedItem] = currentEditingQuestions.splice(fromIdx, 1);
    currentEditingQuestions.splice(toIdx, 0, movedItem);
    renderQuestionsEditor();

    setTimeout(() => {
        const targetCard = document.querySelector(`.es-qcard[data-qidx="${toIdx}"]`);
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.style.boxShadow = '0 0 0 3px var(--clr-primary)';
            setTimeout(() => {
                targetCard.style.boxShadow = '';
            }, 1200);
        }
    }, 40);
}

function renderQuestionsEditor() {
    const container = document.getElementById('questionsContainer');
    const badgeCount = document.getElementById('badgeQuestionsTotalCount');
    if (!container) return;

    if (badgeCount) {
        badgeCount.textContent = `${currentEditingQuestions.length} question${currentEditingQuestions.length > 1 ? 's' : ''}`;
    }

    if (currentEditingQuestions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:32px 16px; background:var(--clr-surface-2); border-radius:var(--radius-md); border:1.5px dashed var(--clr-surface-3);">
                <i class="bi bi-patch-question" style="font-size:2.2rem; color:var(--clr-text-light);"></i>
                <div style="font-weight:700; margin-top:8px; color:var(--clr-text);">Aucune question pour le moment</div>
                <div style="font-size:0.83rem; color:var(--clr-text-muted); margin-top:4px;">Cliquez sur « Ajouter une nouvelle question » ci-dessous.</div>
            </div>
        `;
        return;
    }

    container.innerHTML = currentEditingQuestions.map((q, idx) => {
        const type = q.type || 'qcm';
        let specificFields = '';

        if (type === 'qcm') {
            const options = q.options || ['Option 1', 'Option 2'];
            const correctIdx = q.correctIndex !== undefined ? q.correctIndex : 0;
            const optionsHtml = options.map((opt, oIdx) => `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <input type="radio" name="q_correct_${idx}" value="${oIdx}" ${correctIdx === oIdx ? 'checked' : ''} style="accent-color:var(--clr-primary); width:18px; height:18px; cursor:pointer;" title="Définir comme la bonne réponse">
                    <input class="es-input qcm-opt-input" type="text" data-qidx="${idx}" data-oidx="${oIdx}" value="${escapeHtml(opt)}" placeholder="Option ${oIdx + 1}" required style="font-size:0.88rem; padding:8px 12px;">
                    ${options.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-option" data-qidx="${idx}" data-oidx="${oIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer cette option">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">Options de réponse (Cochez la bonne réponse) :</label>
                    <div class="qcm-options-wrap">${optionsHtml}</div>
                    ${options.length < 6 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-option" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus"></i> Ajouter une option
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (type === 'text') {
            specificFields = `
                <div style="margin-top:12px;">
                    <div class="es-field">
                        <label class="es-field__label">💡 Piste / Mots-clés attendus (pour guider la réponse et l'évaluation) :</label>
                        <textarea class="es-input q-hint-input" data-qidx="${idx}" rows="2" placeholder="Ex: Doit mentionner la sécurité, le projet pédagogique et la déclaration SDJES...">${escapeHtml(q.hint || '')}</textarea>
                    </div>
                </div>
            `;
        } else if (type === 'cloze') {
            const clozeText = q.clozeText || '';
            const distractors = Array.isArray(q.distractors) ? q.distractors.join(', ') : (q.distractors || '');
            const rawMatches = clozeText.match(/\[([^\]]+)\]/g) || [];
            const blanksDetected = rawMatches.map(m => m.slice(1, -1).trim()).filter(Boolean);
            const distractorList = distractors.split(',').map(s => s.trim()).filter(Boolean);
            const totalBankCount = blanksDetected.length + distractorList.length;

            let previewHtml = '';
            if (clozeText.trim()) {
                const formattedPreview = escapeHtml(clozeText).replace(/\[([^\]]+)\]/g, (match, p1) => {
                    return `<span class="es-cloze-dropzone" style="display:inline-flex; align-items:center; justify-content:center; min-width:80px; height:26px; padding:0 8px; border:1.5px dashed var(--clr-primary); border-radius:6px; background:rgba(166,216,102,0.12); font-weight:700; color:var(--clr-primary-dark); font-size:0.82rem;">[ ${escapeHtml(p1)} ]</span>`;
                });

                const allTags = [...blanksDetected, ...distractorList];
                const bankTagsHtml = allTags.map(tag => `
                    <span class="es-cloze-tag" style="display:inline-flex; align-items:center; gap:4px; background:var(--clr-surface); border:1.5px solid var(--clr-primary); color:var(--clr-text); font-weight:700; font-size:0.8rem; padding:4px 10px; border-radius:8px;">
                        🏷️ ${escapeHtml(tag)}
                    </span>
                `).join('');

                previewHtml = `
                    <div style="margin-top:10px; padding:12px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm);">
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase; margin-bottom:6px;">Aperçu du texte avec les trous :</div>
                        <div style="font-size:0.88rem; line-height:1.7; color:var(--clr-text); margin-bottom:10px;">${formattedPreview}</div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-text-muted); margin-bottom:6px;">Banque d'étiquettes distribuée (${totalBankCount}) :</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">${bankTagsHtml || '<span style="font-size:0.78rem; color:var(--clr-text-muted);">Aucune étiquette</span>'}</div>
                    </div>
                `;
            }

            specificFields = `
                <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">
                    <div class="es-field">
                        <label class="es-field__label">📝 Texte à trous (Entourez les mots à deviner avec des [crochets]) :</label>
                        <textarea class="es-input q-cloze-text-input" data-qidx="${idx}" rows="4" placeholder="Ex: Le projet [pédagogique] est rédigé par le [directeur]." required style="font-size:0.9rem; line-height:1.5;">${escapeHtml(clozeText)}</textarea>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:0.78rem; color:var(--clr-text-muted);">
                            <span>Tapez [mot] pour créer un trou interactif.</span>
                            <span style="font-weight:700; color:var(--clr-primary-dark);">${blanksDetected.length} trou(s) détecté(s)</span>
                        </div>
                    </div>

                    <div class="es-field">
                        <label class="es-field__label">🏷️ Étiquettes leurres supplémentaires (Optionnel) :</label>
                        <input class="es-input q-distractors-input" type="text" data-qidx="${idx}" value="${escapeHtml(distractors)}" placeholder="Ex: animateur, sanitaire (séparés par virgules)" style="font-size:0.85rem;">
                    </div>

                    ${previewHtml}
                </div>
            `;
        } else if (type === 'puzzle') {
            const items = q.items || ['Étape 1', 'Étape 2', 'Étape 3'];
            const itemsHtml = items.map((it, pIdx) => `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="width:24px; height:24px; border-radius:50%; background:var(--clr-surface-3); font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; color:var(--clr-text); flex-shrink:0;">${pIdx + 1}</span>
                    <input class="es-input puzzle-item-input" type="text" data-qidx="${idx}" data-pidx="${pIdx}" value="${escapeHtml(it)}" placeholder="Étape ${pIdx + 1}" required style="font-size:0.88rem; padding:8px 12px;">
                    ${items.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-puzzle-item" data-qidx="${idx}" data-pidx="${pIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">Éléments dans le BON ORDRE chronologique :</label>
                    <div class="puzzle-items-wrap">${itemsHtml}</div>
                    ${items.length < 8 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-puzzle-item" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus"></i> Ajouter un élément
                        </button>
                    ` : ''}
                </div>
            `;
        }

        const isFirst = (idx === 0);
        const isLast = (idx === currentEditingQuestions.length - 1);

        return `
            <div class="es-qcard" data-qidx="${idx}">
                <div class="es-qcard__header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="es-qcard__num">${idx + 1}</span>
                        <select class="es-select q-type-select" data-qidx="${idx}" style="font-weight:700; font-size:0.85rem; padding:6px 12px; width:auto;">
                            <option value="qcm" ${type === 'qcm' ? 'selected' : ''}>🔘 QCM (Choix unique)</option>
                            <option value="text" ${type === 'text' ? 'selected' : ''}>✍️ Rédaction libre</option>
                            <option value="puzzle" ${type === 'puzzle' ? 'selected' : ''}>🧩 Puzzle chronologique</option>
                            <option value="cloze" ${type === 'cloze' ? 'selected' : ''}>📝 Texte à trous (Glisser-déposer)</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-up" data-qidx="${idx}" ${isFirst ? 'disabled' : ''} style="padding:6px 10px; ${isFirst ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isFirst ? 'Première position' : 'Monter d\'un rang (flèche haut)'}">
                            <i class="bi bi-arrow-up" style="font-weight:800; font-size:1rem;"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-down" data-qidx="${idx}" ${isLast ? 'disabled' : ''} style="padding:6px 10px; ${isLast ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isLast ? 'Dernière position' : 'Descendre d\'un rang (flèche bas)'}">
                            <i class="bi bi-arrow-down" style="font-weight:800; font-size:1rem;"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-duplicate-q" data-qidx="${idx}" title="Dupliquer la question" style="padding:6px 10px;">
                            <i class="bi bi-copy"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-delete-q" data-qidx="${idx}" title="Supprimer la question" style="padding:6px 10px; color:var(--clr-danger);">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>

                <div class="es-field" style="margin-bottom:10px;">
                    <label class="es-field__label">Énoncé de la question :</label>
                    <input class="es-input q-text-input" type="text" data-qidx="${idx}" value="${escapeHtml(q.text || '')}" placeholder="Ex: Que signifie le sigle PSAADRAFRA ?" required style="font-weight:600; font-size:0.92rem;">
                </div>

                <div class="es-field" style="margin-bottom:10px;">
                    <label class="es-field__label">🖼️ Image illustrative (URL optionnelle) :</label>
                    <input class="es-input q-image-input" type="text" data-qidx="${idx}" value="${escapeHtml(q.imageUrl || '')}" placeholder="https://..." style="font-size:0.85rem;">
                </div>

                ${specificFields}
            </div>
        `;
    }).join('');

    bindQuestionsEvents();
}

function bindQuestionsEvents() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    container.querySelectorAll('.q-type-select').forEach(select => {
        select.addEventListener('change', (e) => {
            syncQuestionsFromDOM();
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const newType = e.target.value;
            currentEditingQuestions[idx].type = newType;
            if (newType === 'qcm' && !currentEditingQuestions[idx].options) {
                currentEditingQuestions[idx].options = ['Option 1', 'Option 2'];
                currentEditingQuestions[idx].correctIndex = 0;
            } else if (newType === 'puzzle' && !currentEditingQuestions[idx].items) {
                currentEditingQuestions[idx].items = ['Étape 1', 'Étape 2', 'Étape 3'];
            } else if (newType === 'cloze' && !currentEditingQuestions[idx].clozeText) {
                currentEditingQuestions[idx].clozeText = currentEditingQuestions[idx].text || 'Texte avec un [mot-clé] à compléter.';
                currentEditingQuestions[idx].distractors = '';
            }
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('.q-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-image-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].imageUrl = e.target.value.trim();
            }
        });
    });

    container.querySelectorAll('.q-hint-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].hint = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-cloze-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].clozeText = e.target.value;
            }
        });
        input.addEventListener('blur', () => {
            syncQuestionsFromDOM();
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('.q-distractors-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].distractors = e.target.value;
            }
        });
        input.addEventListener('blur', () => {
            syncQuestionsFromDOM();
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const name = e.target.name;
            const qidx = parseInt(name.replace('q_correct_', ''), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].correctIndex = parseInt(e.target.value, 10);
            }
        });
    });

    container.querySelectorAll('.qcm-opt-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const oidx = parseInt(e.target.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].options) {
                currentEditingQuestions[qidx].options[oidx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].options.push(`Option ${currentEditingQuestions[qidx].options.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const oidx = parseInt(btn.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].options) {
                currentEditingQuestions[qidx].options.splice(oidx, 1);
                if (currentEditingQuestions[qidx].correctIndex >= currentEditingQuestions[qidx].options.length) {
                    currentEditingQuestions[qidx].correctIndex = 0;
                }
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.puzzle-item-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const pidx = parseInt(e.target.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].items) {
                currentEditingQuestions[qidx].items[pidx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].items.push(`Étape ${currentEditingQuestions[qidx].items.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const pidx = parseInt(btn.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].items) {
                currentEditingQuestions[qidx].items.splice(pidx, 1);
                renderQuestionsEditor();
            }
        });
    });

    // Flèches Haut et Bas pour réorganiser l'ordre des questions
    container.querySelectorAll('.btn-move-q-up:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (qidx > 0) {
                moveQuestion(qidx, qidx - 1);
            }
        });
    });

    container.querySelectorAll('.btn-move-q-down:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (qidx < currentEditingQuestions.length - 1) {
                moveQuestion(qidx, qidx + 1);
            }
        });
    });

    container.querySelectorAll('.btn-duplicate-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const copy = JSON.parse(JSON.stringify(currentEditingQuestions[qidx]));
            copy.id = 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            copy.text = (copy.text || '') + ' (Copie)';
            currentEditingQuestions.splice(qidx + 1, 0, copy);
            renderQuestionsEditor();
            showToast("Question dupliquée.", "info");
        });
    });

    container.querySelectorAll('.btn-delete-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (confirm("Supprimer cette question ?")) {
                currentEditingQuestions.splice(qidx, 1);
                renderQuestionsEditor();
            }
        });
    });
}

// ----------------------------------------------------------------
// GESTION IMPORT / EXPORT JSON
// ----------------------------------------------------------------
document.getElementById('btnExportQuestionsJson')?.addEventListener('click', () => {
    if (currentEditingQuestions.length === 0) {
        showToast("Aucune question à exporter.", "warning");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentEditingQuestions, null, 2));
    const modTitle = document.getElementById('editModuleTitle').value || 'module';
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `questions_${modTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Export JSON téléchargé !", "success");
});

document.getElementById('btnImportQuestionsJson')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            if (Array.isArray(parsed) && parsed.length > 0) {
                currentEditingQuestions = parsed.map((q, idx) => ({
                    id: q.id || `q_${Date.now()}_${idx}`,
                    type: q.type || 'qcm',
                    text: q.text || '',
                    options: q.options || (q.type === 'qcm' ? ['Option 1', 'Option 2'] : undefined),
                    correctIndex: q.correctIndex !== undefined ? q.correctIndex : 0,
                    clozeText: q.clozeText || '',
                    distractors: q.distractors || '',
                    items: q.items || (q.type === 'puzzle' ? ['Étape 1', 'Étape 2'] : undefined),
                    hint: q.hint || '',
                    imageUrl: q.imageUrl || ''
                }));
                renderQuestionsEditor();
                showToast(`🎉 ${currentEditingQuestions.length} questions importées !`, "success");
            } else {
                showToast("Fichier JSON invalide.", "error");
            }
        } catch (err) {
            console.error("JSON parse error:", err);
            showToast("Erreur lors de la lecture du JSON.", "error");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// ----------------------------------------------------------------
// ENREGISTREMENT DU MODULE DANS FIRESTORE
// ----------------------------------------------------------------
async function saveModuleData(btnEl) {
    syncQuestionsFromDOM();
    const errorAlert = document.getElementById('moduleEditErrorAlert');
    const errorMsg = document.getElementById('moduleEditErrorMsg');
    const successAlert = document.getElementById('moduleEditSuccessAlert');
    if (errorAlert) errorAlert.classList.add('hidden');
    if (successAlert) successAlert.classList.add('hidden');

    const rawId = document.getElementById('editModuleId').value.trim();
    const num = parseInt(document.getElementById('editModuleNum').value, 10);
    const title = document.getElementById('editModuleTitle').value.trim();
    const subtitle = document.getElementById('editModuleSubtitle').value.trim();
    const icon = document.getElementById('editModuleIcon').value.trim() || 'bi-journal-bookmark';
    const bgImage = document.getElementById('editModuleBgImage').value.trim();
    const isVisible = document.getElementById('editModuleVisible') ? document.getElementById('editModuleVisible').checked : true;

    const maxAttempts = parseInt(document.getElementById('editMaxAttempts').value, 10) || 0;
    const timerMinutes = parseInt(document.getElementById('editQuizTimerMinutes').value, 10) || 0;
    const timerSeconds = parseInt(document.getElementById('editQuizTimerSeconds').value, 10) || 0;
    const timerTotalSeconds = (timerMinutes * 60) + timerSeconds;
    const showResultsAtEnd = document.getElementById('editShowResultsAtEnd').checked;

    const isRequirePassword = document.getElementById('editQuizRequirePassword').checked;
    const quizPassword = document.getElementById('editQuizPassword').value.trim();

    if (isNaN(num) || num < 1) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Numéro de module invalide (> 0).";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    if (!title) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Veuillez renseigner le titre du module.";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    if (isRequirePassword && !quizPassword) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Veuillez définir un mot de passe ou décocher l'option.";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    // Validation questions
    for (let i = 0; i < currentEditingQuestions.length; i++) {
        const q = currentEditingQuestions[i];
        if (!q.text || !q.text.trim()) {
            if (errorAlert && errorMsg) {
                errorMsg.textContent = `L'énoncé de la question ${i + 1} est vide.`;
                errorAlert.classList.remove('hidden');
            }
            return;
        }

        if (q.type === 'qcm') {
            if (!q.options || q.options.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (QCM) doit comporter au moins 2 options.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.options.length; j++) {
                if (!q.options[j] || !q.options[j].trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'option ${j + 1} de la question ${i + 1} est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'cloze') {
            if (!q.clozeText || !q.clozeText.trim()) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (Texte à trous) nécessite un texte avec [mot].`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            const clozeMatches = q.clozeText.match(/\[([^\]]+)\]/g);
            if (!clozeMatches || clozeMatches.length === 0) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (Texte à trous) ne comporte aucun trou valide [mot].`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
        } else if (q.type === 'puzzle') {
            if (!q.items || q.items.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (Puzzle) doit comporter au moins 2 éléments à ordonner.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.items.length; j++) {
                if (!q.items[j] || !q.items[j].trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'élément ${j + 1} de la question ${i + 1} (Puzzle) est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        }
    }

    btnLoading(btnEl, true);

    try {
        const id = rawId || `mod_${Date.now()}`;
        const modulePayload = {
            id: id,
            num: num,
            title: title,
            subtitle: subtitle,
            icon: icon,
            bgImage: bgImage,
            description: subtitle,
            visible: isVisible,
            questionsCount: currentEditingQuestions.length,
            quizConfig: {
                quizTitle: title,
                maxAttempts: maxAttempts,
                timerMinutes: timerMinutes,
                timerSeconds: timerSeconds,
                timerTotalSeconds: timerTotalSeconds,
                showResultsAtEnd: showResultsAtEnd,
                requirePassword: isRequirePassword,
                password: isRequirePassword ? quizPassword : ''
            },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!rawId) {
            modulePayload.enabled = false;
            modulePayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        await db.collection('formation').doc(id).set(modulePayload, { merge: true });

        const oldSnap = await db.collection('formation').doc(id).collection('questions').get();
        const batch = db.batch();

        oldSnap.docs.forEach(d => batch.delete(d.ref));

        currentEditingQuestions.forEach((q, idx) => {
            const qId = q.id || `q_${Date.now()}_${idx + 1}`;
            const qRef = db.collection('formation').doc(id).collection('questions').doc(qId);
            
            let distractorArray = [];
            if (typeof q.distractors === 'string') {
                distractorArray = q.distractors.split(',').map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(q.distractors)) {
                distractorArray = q.distractors;
            }

            const qData = {
                id: qId,
                order: idx + 1,
                type: q.type || 'qcm',
                text: q.text || '',
                imageUrl: q.imageUrl || '',
                hint: q.hint || ''
            };

            if (q.type === 'qcm') {
                qData.options = q.options || ['Option 1', 'Option 2'];
                qData.correctIndex = q.correctIndex !== undefined ? q.correctIndex : 0;
            } else if (q.type === 'cloze') {
                qData.clozeText = q.clozeText || '';
                qData.distractors = distractorArray;
            } else if (q.type === 'puzzle') {
                qData.items = q.items || [];
            }

            batch.set(qRef, qData);
        });

        await batch.commit();

        try {
            sessionStorage.removeItem('cached_formation_modules');
            sessionStorage.removeItem('cached_formation_modules_ts');
            localStorage.removeItem('offline_formation_modules');
        } catch (cErr) {}

        btnLoading(btnEl, false);
        showToast("🎉 Module et questions enregistrés !", "success", 4000);

        if (successAlert) {
            successAlert.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (!rawId) {
            currentEditingModuleId = id;
            document.getElementById('editModuleId').value = id;
            window.history.replaceState({}, '', `formation-edit.html?id=${encodeURIComponent(id)}`);
            if (currentRole === 'admin') {
                document.getElementById('btnDeleteModule')?.classList.remove('hidden');
            }
        }

        // Mettre à jour les hero badges
        document.getElementById('heroModuleTitle').textContent = title;
        document.getElementById('heroModuleSubtitle').textContent = subtitle;
        document.getElementById('heroModuleBadge').textContent = `Module ${num < 10 ? '0' + num : num}`;
        const visBadge = document.getElementById('heroVisibilityBadge');
        if (visBadge) {
            visBadge.textContent = isVisible ? 'Visible' : 'Masqué';
            visBadge.className = `es-badge ${isVisible ? 'es-badge--approved' : 'es-badge--pending'}`;
        }

    } catch (err) {
        btnLoading(btnEl, false);
        console.error("Save module error:", err);
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Erreur lors de l'enregistrement : " + err.message;
            errorAlert.classList.remove('hidden');
        }
        showToast("Erreur lors de l'enregistrement.", "error");
    }
}

// ----------------------------------------------------------------
// SUPPRESSION DU MODULE (ADMIN)
// ----------------------------------------------------------------
document.getElementById('btnDeleteModule')?.addEventListener('click', async () => {
    if (!currentEditingModuleId) return;
    if (!confirm("⚠️ Supprimer définitivement ce module et toutes ses questions ? Action irréversible.")) {
        return;
    }

    try {
        const qSnap = await db.collection('formation').doc(currentEditingModuleId).collection('questions').get();
        const batch = db.batch();
        qSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(db.collection('formation').doc(currentEditingModuleId));
        await batch.commit();

        try {
            sessionStorage.removeItem('cached_formation_modules');
            sessionStorage.removeItem('cached_formation_modules_ts');
            localStorage.removeItem('offline_formation_modules');
        } catch (c) {}

        showToast("Module supprimé.", "info");
        setTimeout(() => {
            window.location.href = 'formation.html';
        }, 800);
    } catch (err) {
        console.error("Delete error:", err);
        showToast("Erreur lors de la suppression.", "error");
    }
});

// ----------------------------------------------------------------
// LISTENERS GLOBAUX
// ----------------------------------------------------------------
document.getElementById('btnAddQuestion')?.addEventListener('click', () => {
    currentEditingQuestions.push({
        id: 'q_' + Date.now() + '_' + (currentEditingQuestions.length + 1),
        type: 'qcm',
        text: '',
        options: ['Option 1', 'Option 2'],
        correctIndex: 0,
        hint: ''
    });
    renderQuestionsEditor();
    const container = document.getElementById('questionsContainer');
    if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

document.getElementById('btnSaveModuleHeader')?.addEventListener('click', function() {
    saveModuleData(this);
});

document.getElementById('btnSaveModuleBottom')?.addEventListener('click', function() {
    saveModuleData(this);
});

document.getElementById('editQuizRequirePassword')?.addEventListener('change', (e) => {
    const wrap = document.getElementById('quizPasswordInputWrap');
    if (wrap) {
        if (e.target.checked) wrap.classList.remove('hidden');
        else wrap.classList.add('hidden');
    }
});

document.getElementById('editModuleBgImage')?.addEventListener('input', (e) => {
    updateModuleBgPreview(e.target.value);
});

document.getElementById('btnRemoveBgImage')?.addEventListener('click', () => {
    document.getElementById('editModuleBgImage').value = '';
    updateModuleBgPreview('');
});

document.getElementById('editModuleBgUpload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Veuillez sélectionner une image valide.", "warning");
        return;
    }

    showToast("Upload de l'image de fond…", "info");
    try {
        const storageRef = firebase.storage().ref(`formation/covers/${Date.now()}_${file.name}`);
        const snapshot = await storageRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        document.getElementById('editModuleBgImage').value = downloadUrl;
        updateModuleBgPreview(downloadUrl);
        showToast("Image uploadée avec succès !", "success");
    } catch (err) {
        console.error("Upload bg image error:", err);
        showToast("Erreur lors de l'upload.", "error");
    }
});

// Auth listener
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.replace('index.html');
        return;
    }

    currentUser = user;
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            actualUserData = userDoc.data();
            currentRole = actualUserData.role || 'stagiaire';

            // Synchroniser les modules épinglés depuis Firestore BDD
            if (actualUserData.pinnedModules) {
                localStorage.setItem('pinnedModules', JSON.stringify(actualUserData.pinnedModules));
            } else {
                const localPinned = localStorage.getItem('pinnedModules');
                if (localPinned) {
                    db.collection('users').doc(user.uid).update({
                        pinnedModules: JSON.parse(localPinned)
                    }).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.warn("User profile fetch error:", err);
    }

    if (currentRole !== 'admin' && currentRole !== 'formateur') {
        alert("Accès réservé aux formateurs et administrateurs.");
        window.location.replace('formation.html');
        return;
    }

    // Topbar User info
    const nameEl = document.getElementById('userDisplayName');
    if (nameEl) nameEl.textContent = actualUserData?.displayName || `${actualUserData?.firstName || ''} ${actualUserData?.lastName || ''}`.trim() || user.email;

    const badgeEl = document.getElementById('userBadge');
    if (badgeEl) {
        if (currentRole === 'admin') {
            badgeEl.className = 'es-badge es-badge--admin';
            badgeEl.textContent = '⚡ Admin';
        } else if (currentRole === 'formateur') {
            badgeEl.className = 'es-badge es-badge--formateur';
            badgeEl.textContent = '👨‍🏫 Formateur';
        }
    }

    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && (actualUserData?.photoURL || user.photoURL)) {
        avatarEl.innerHTML = `<img src="${actualUserData?.photoURL || user.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }

    // Menu utilisateur
    document.getElementById('btnUserMenu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.es-user-dropdown-wrap')) {
            document.getElementById('userDropdown')?.classList.add('hidden');
        }
    });

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        await auth.signOut();
        window.location.replace('index.html');
    });

    loadModuleHubData();
});
