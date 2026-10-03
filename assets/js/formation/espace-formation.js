/* ================================================================
   ESPACE-FORMATION.JS
   Logique de la page dédiée Formation BAFA & Quiz (formation.html)
   Collection Firestore racine: 'formation'
   Sous-collections: 'formation/{moduleId}/questions' & 'formation/{moduleId}/submissions'
   ================================================================ */

let currentUser = null;
let actualRole = null;
let actualUserData = null;
let stagiaireSubmissionsMap = {};
let currentQuizModule = null;
let currentFormationModulesList = [];
let currentEditingQuestions = [];

const pageLoader = document.getElementById('pageLoader');
const formationView = document.getElementById('formationView');

// ----------------------------------------------------------------
// RÉCUPÉRATION ET SYNCHRONISATION DES MODULES & QUESTIONS
// ----------------------------------------------------------------
async function getFormationModulesList() {
    let list = [];
    try {
        const snap = await db.collection('formation').orderBy('num', 'asc').get();
        if (!snap.empty) {
            list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('offline_formation_modules', JSON.stringify(list));
        } else {
            // Premier démarrage : initialiser la collection 'formation' avec les 16 modules officiels
            const defaultModules = window.FORMATION_MODULES || [];
            list = defaultModules.map(m => ({
                id: m.id,
                num: m.num,
                title: m.title,
                subtitle: m.subtitle || '',
                icon: m.icon || 'bi-journal-bookmark',
                description: m.description || '',
                enabled: false,
                quizConfig: {
                    quizTitle: m.title,
                    maxAttempts: 0,
                    timerMinutes: 0,
                    showResultsAtEnd: false
                },
                questionsCount: (m.questions || []).length
            }));
            localStorage.setItem('offline_formation_modules', JSON.stringify(list));

            if (actualRole === 'admin' && navigator.onLine) {
                try {
                    for (const m of defaultModules) {
                        const moduleRef = db.collection('formation').doc(m.id);
                        await moduleRef.set({
                            id: m.id,
                            num: m.num,
                            title: m.title,
                            subtitle: m.subtitle || '',
                            icon: m.icon || 'bi-journal-bookmark',
                            description: m.description || '',
                            enabled: false,
                            quizConfig: {
                                quizTitle: m.title,
                                maxAttempts: 0,
                                timerMinutes: 0,
                                showResultsAtEnd: false
                            },
                            questionsCount: (m.questions || []).length,
                            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                        // Enregistrer les questions dans la sous-collection 'questions'
                        if (Array.isArray(m.questions) && m.questions.length > 0) {
                            const batch = db.batch();
                            m.questions.forEach((q, qIdx) => {
                                const qRef = moduleRef.collection('questions').doc(q.id || `q_${qIdx + 1}`);
                                batch.set(qRef, {
                                    id: q.id || `q_${qIdx + 1}`,
                                    moduleId: m.id,
                                    type: q.type || 'qcm',
                                    text: q.text || '',
                                    options: q.options || [],
                                    correctIndex: (q.correctIndex !== undefined) ? q.correctIndex : 0,
                                    hint: q.hint || '',
                                    order: qIdx + 1,
                                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                                }, { merge: true });
                            });
                            await batch.commit();
                        }
                    }
                } catch (batchErr) {
                    console.warn("Auto-seed formation collection warning:", batchErr);
                }
            }
        }
    } catch (e) {
        console.warn("Offline fallback for formation collection:", e);
        try {
            const cached = localStorage.getItem('offline_formation_modules');
            if (cached) list = JSON.parse(cached);
        } catch (cacheErr) {}

        if (!list || list.length === 0) {
            list = (window.FORMATION_MODULES || []).map(m => ({
                ...m,
                enabled: false,
                questionsCount: (m.questions || []).length
            }));
        }
    }

    currentFormationModulesList = list.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
    return currentFormationModulesList;
}

// Récupération des questions d'un module depuis sa sous-collection 'questions'
async function fetchModuleQuestions(moduleId) {
    let questions = [];
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
        if (!snap.empty) {
            questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (err) {
        console.warn(`Could not load questions for module ${moduleId} from subcollection:`, err);
    }

    if (questions.length === 0) {
        const fallbackMod = (window.FORMATION_MODULES || []).find(m => m.id === moduleId);
        if (fallbackMod && fallbackMod.questions) {
            questions = fallbackMod.questions.map((q, idx) => ({
                id: q.id || `q_${idx + 1}`,
                moduleId: moduleId,
                type: q.type || 'qcm',
                text: q.text || '',
                options: q.options || [],
                correctIndex: q.correctIndex !== undefined ? q.correctIndex : 0,
                hint: q.hint || '',
                order: idx + 1
            }));
        }
    }

    const mod = currentFormationModulesList.find(m => m.id === moduleId);
    if (mod) {
        mod.questions = questions;
        mod.questionsCount = questions.length;
    }

    return questions;
}

async function saveFormationModule(moduleData, questionsList = []) {
    const payload = {
        id: moduleData.id,
        num: moduleData.num,
        title: moduleData.title,
        subtitle: moduleData.subtitle || '',
        icon: moduleData.icon || 'bi-journal-bookmark',
        description: moduleData.description || '',
        enabled: moduleData.enabled !== undefined ? moduleData.enabled : false,
        quizConfig: moduleData.quizConfig || {},
        questionsCount: questionsList.length,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const moduleRef = db.collection('formation').doc(moduleData.id);
    await moduleRef.set(payload, { merge: true });

    // Synchronisation de la sous-collection 'questions'
    try {
        const existingSnap = await moduleRef.collection('questions').get();
        const existingDocIds = existingSnap.docs.map(d => d.id);
        const newDocIds = questionsList.map(q => q.id);

        // Supprimer les questions retirées
        for (const doc of existingSnap.docs) {
            if (!newDocIds.includes(doc.id)) {
                await doc.ref.delete();
            }
        }

        // Sauvegarder ou mettre à jour les questions actuelles
        for (let idx = 0; idx < questionsList.length; idx++) {
            const q = questionsList[idx];
            const qRef = moduleRef.collection('questions').doc(q.id);
            const qDoc = {
                id: q.id,
                moduleId: moduleData.id,
                type: q.type || 'qcm',
                text: q.text || '',
                imageUrl: q.imageUrl || '',
                order: idx + 1,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            if (q.type === 'qcm') {
                qDoc.options = q.options || [];
                qDoc.correctIndex = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
            } else if (q.type === 'boolean') {
                qDoc.correctAnswer = (q.correctAnswer === true || q.correctAnswer === 'true');
            } else if (q.type === 'range') {
                qDoc.min = parseFloat(q.min) || 0;
                qDoc.max = parseFloat(q.max) || 10;
                qDoc.step = parseFloat(q.step) || 1;
                qDoc.unit = q.unit || '';
                qDoc.minLabel = q.minLabel || '';
                qDoc.maxLabel = q.maxLabel || '';
                if (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) {
                    qDoc.correctValue = parseFloat(q.correctValue);
                    qDoc.tolerance = parseFloat(q.tolerance) || 0;
                }
            } else if (q.type === 'puzzle') {
                qDoc.items = q.items || [];
            } else {
                qDoc.hint = q.hint || '';
            }

            await qRef.set(qDoc, { merge: true });
        }
    } catch (qErr) {
        console.error("Error updating questions subcollection:", qErr);
    }

    let list = await getFormationModulesList();
    const idx = list.findIndex(m => m.id === moduleData.id);
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...payload, questions: questionsList };
    } else {
        list.push({ ...payload, questions: questionsList });
    }
    list.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));

    localStorage.setItem('offline_formation_modules', JSON.stringify(list));
    currentFormationModulesList = list;
    return list;
}

async function deleteFormationModule(moduleId) {
    try {
        const qSnap = await db.collection('formation').doc(moduleId).collection('questions').get();
        for (const doc of qSnap.docs) {
            await doc.ref.delete();
        }
        const sSnap = await db.collection('formation').doc(moduleId).collection('submissions').get();
        for (const doc of sSnap.docs) {
            await doc.ref.delete();
        }
    } catch (e) {
        console.warn("Subcollection cleanup err:", e);
    }

    await db.collection('formation').doc(moduleId).delete();

    let list = await getFormationModulesList();
    list = list.filter(m => m.id !== moduleId);
    localStorage.setItem('offline_formation_modules', JSON.stringify(list));
    currentFormationModulesList = list;
    return list;
}

// ----------------------------------------------------------------
// CHARGEMENT DE L'AFFICHAGE DES MODULES
// ----------------------------------------------------------------
async function loadFormationModules() {
    const loader = document.getElementById('formationLoader');
    const grid = document.getElementById('formationModulesGrid');
    const adminControls = document.getElementById('formationAdminControls');

    if (!grid) return;

    if (loader) loader.classList.remove('hidden');
    if (grid) grid.classList.add('hidden');

    if (actualRole === 'admin') {
        adminControls?.classList.remove('hidden');
    } else {
        adminControls?.classList.add('hidden');
    }

    try {
        const modules = await getFormationModulesList();

        // 1. Soumissions du stagiaire connecté (historique de toutes ses tentatives)
        stagiaireSubmissionsMap = {};
        if (currentUser) {
            await Promise.all(modules.map(async (m) => {
                try {
                    const snap = await db.collection('formation').doc(m.id).collection('submissions')
                        .where('userId', '==', currentUser.uid)
                        .get();
                    if (!snap.empty) {
                        const allAttempts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                        allAttempts.sort((a, b) => {
                            const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0));
                            const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0));
                            return tb - ta;
                        });
                        stagiaireSubmissionsMap[m.id] = {
                            ...allAttempts[0],
                            allAttempts: allAttempts,
                            attemptsCount: allAttempts.length
                        };
                    }
                } catch (subErr) {
                    console.warn(`Submissions fetch error for ${m.id}:`, subErr);
                }
            }));
        }

        // 2. Compteurs administrateur par module (nombre de réponses & stagiaires uniques)
        let adminCountsMap = {};
        if (actualRole === 'admin') {
            await Promise.all(modules.map(async (m) => {
                try {
                    const allSubSnap = await db.collection('formation').doc(m.id).collection('submissions').get();
                    const userSet = new Set();
                    allSubSnap.forEach(d => {
                        const uid = d.data().userId;
                        if (uid) userSet.add(uid);
                    });
                    adminCountsMap[m.id] = {
                        totalAttempts: allSubSnap.size,
                        uniqueStagiaires: userSet.size
                    };
                } catch (cntErr) {
                    console.warn(`Admin count error for ${m.id}:`, cntErr);
                }
            }));
        }

        if (loader) loader.classList.add('hidden');

        grid.innerHTML = modules.map(m => {
            const isEnabled = m.enabled === true;
            const existingSub = stagiaireSubmissionsMap[m.id];
            const hasSubmitted = !!existingSub;
            const adminStats = adminCountsMap[m.id] || { totalAttempts: 0, uniqueStagiaires: 0 };
            const qConfig = m.quizConfig || {};
            const showResultsAtEnd = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
            const maxAttempts = parseInt(qConfig.maxAttempts, 10) || 0;
            const attemptsCount = existingSub?.attemptsCount || 0;
            const isAttemptsExceeded = (maxAttempts > 0 && attemptsCount >= maxAttempts);

            let cardClass = 'es-formation-card ';
            if (hasSubmitted) {
                cardClass += 'es-formation-card--completed ';
            } else if (isEnabled || actualRole === 'admin') {
                cardClass += 'es-formation-card--active ';
            } else {
                cardClass += 'es-formation-card--locked ';
            }

            let badgeHtml = '';
            if (hasSubmitted) {
                const scoreText = (showResultsAtEnd && existingSub.score) ? ` (${existingSub.score.correct}/${existingSub.score.total})` : '';
                badgeHtml = `<span class="es-badge es-badge--approved"><i class="bi bi-check-circle"></i> Répondu${scoreText}</span>`;
            } else if (isEnabled) {
                badgeHtml = `<span class="es-badge es-badge--anim"><i class="bi bi-play-fill"></i> Disponible</span>`;
            } else {
                badgeHtml = `<span class="es-badge es-badge--pending"><i class="bi bi-lock"></i> Verrouillé</span>`;
            }

            let actionBtn = '';
            if (actualRole === 'admin') {
                actionBtn = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-admin-edit-module" data-module-id="${m.id}" title="Éditer le module et son quiz">
                        <i class="bi bi-pencil"></i> Modifier
                    </button>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:0.75rem; font-weight:700; color:var(--clr-primary);" title="${adminStats.uniqueStagiaires} stagiaire(s) ayant répondu (${adminStats.totalAttempts} réponses au total)">
                            📝 ${adminStats.uniqueStagiaires} (${adminStats.totalAttempts})
                        </span>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-admin-view-res" data-module-id="${m.id}">
                            <i class="bi bi-eye"></i> Réponses
                        </button>
                    </div>
                </div>`;
            } else {
                if (isEnabled) {
                    if (isAttemptsExceeded) {
                        actionBtn = `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm es-btn--full btn-open-quiz" data-module-id="${m.id}">
                            <i class="bi bi-check2-circle"></i> ${showResultsAtEnd ? 'Voir mes résultats & corrigé' : 'Quiz complété'}
                        </button>`;
                    } else {
                        actionBtn = `
                        <button type="button" class="es-btn es-btn--primary es-btn--sm es-btn--full btn-open-quiz" data-module-id="${m.id}">
                            <i class="bi bi-pencil-square"></i> ${hasSubmitted ? (showResultsAtEnd ? 'Voir le corrigé / Repasser' : 'Repasser le quiz') : 'Faire le quiz'}
                        </button>`;
                    }
                } else {
                    actionBtn = `
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm es-btn--full" disabled style="opacity:0.5; cursor:not-allowed;">
                        <i class="bi bi-lock"></i> Verrouillé par le formateur
                    </button>`;
                }
            }

            const questionsCount = m.questionsCount || (m.questions ? m.questions.length : 0);

            return `
            <div class="${cardClass}">
                <div>
                    <div class="es-formation-header">
                        <div class="es-formation-icon-wrap">
                            <i class="bi ${m.icon || 'bi-journal-bookmark'}"></i>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${badgeHtml}
                            ${actualRole === 'admin' ? `
                                <label class="es-switch" style="transform:scale(0.8); transform-origin:center right;">
                                    <input type="checkbox" class="check-stagiaire-module-toggle" data-module-id="${m.id}" ${isEnabled ? 'checked' : ''}>
                                    <span class="es-slider"></span>
                                </label>
                            ` : ''}
                        </div>
                    </div>
                    <div class="es-formation-num">Module ${m.num < 10 ? '0' + m.num : m.num} • ${questionsCount} question${questionsCount > 1 ? 's' : ''}</div>
                    <h3 class="es-formation-title">${escapeHtml(m.title)}</h3>
                    <p class="es-formation-desc">${escapeHtml(m.description || m.subtitle || '')}</p>
                </div>
                <div class="es-formation-footer">
                    ${actionBtn}
                </div>
            </div>`;
        }).join('');

        if (grid) grid.classList.remove('hidden');

        // Listeners cartes
        grid.querySelectorAll('.btn-open-quiz').forEach(btn => {
            btn.addEventListener('click', async () => {
                const moduleId = btn.getAttribute('data-module-id');
                await openFormationQuiz(moduleId);
            });
        });

        grid.querySelectorAll('.btn-admin-edit-module').forEach(btn => {
            btn.addEventListener('click', async () => {
                const moduleId = btn.getAttribute('data-module-id');
                await openFormationModuleEdit(moduleId);
            });
        });

        grid.querySelectorAll('.btn-admin-view-res').forEach(btn => {
            btn.addEventListener('click', async () => {
                const moduleId = btn.getAttribute('data-module-id');
                await openFormationResultsModal(moduleId);
            });
        });

        grid.querySelectorAll('.check-stagiaire-module-toggle').forEach(toggle => {
            toggle.addEventListener('change', async (e) => {
                const moduleId = e.target.getAttribute('data-module-id');
                const isChecked = e.target.checked;
                try {
                    await db.collection('formation').doc(moduleId).update({
                        enabled: isChecked,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    const mod = currentFormationModulesList.find(m => m.id === moduleId);
                    if (mod) mod.enabled = isChecked;
                    showToast(isChecked ? "Module activé pour les stagiaires." : "Module verrouillé.", "success");
                    loadFormationModules();
                } catch (err) {
                    console.error("Toggle error:", err);
                    showToast("Erreur lors de la modification du statut.", "error");
                }
            });
        });

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("loadFormationModules error:", err);
        showToast("Erreur lors du chargement des modules.", "error");
    }
}

// ----------------------------------------------------------------
// NAVIGATION : QUIZ STAGIAIRE (PAGE DÉDIÉE)
// ----------------------------------------------------------------
function openFormationQuiz(moduleId) {
    if (!moduleId) return;
    window.location.href = `quiz.html?module=${encodeURIComponent(moduleId)}`;
}

// ----------------------------------------------------------------
// MODAL : CRÉER / MODIFIER UN MODULE & QUIZ (ADMIN)
// ----------------------------------------------------------------
async function openFormationModuleEdit(moduleId = null) {
    const modalTitle = document.getElementById('moduleEditModalTitle');
    const badge = document.getElementById('moduleEditBadge');
    const btnDelete = document.getElementById('btnDeleteModule');
    const errorAlert = document.getElementById('moduleEditErrorAlert');

    if (errorAlert) errorAlert.classList.add('hidden');

    let moduleData = null;
    if (moduleId) {
        moduleData = (currentFormationModulesList || []).find(m => m.id === moduleId);
    }

    if (moduleData) {
        // Récupérer les questions de la sous-collection
        const questions = await fetchModuleQuestions(moduleData.id);
        moduleData.questions = questions;

        document.getElementById('editModuleId').value = moduleData.id;
        document.getElementById('editModuleNum').value = moduleData.num || 1;
        document.getElementById('editModuleTitle').value = moduleData.title || '';
        document.getElementById('editModuleSubtitle').value = moduleData.subtitle || '';
        document.getElementById('editModuleIcon').value = moduleData.icon || 'bi-journal-bookmark';
        document.getElementById('editModuleDesc').value = moduleData.description || '';
        
        const qConfig = moduleData.quizConfig || {};
        document.getElementById('editQuizTitle').value = qConfig.quizTitle || moduleData.title || '';
        document.getElementById('editMaxAttempts').value = (qConfig.maxAttempts !== undefined) ? qConfig.maxAttempts : 0;
        document.getElementById('editQuizTimerMinutes').value = (qConfig.timerMinutes !== undefined && qConfig.timerMinutes !== null) ? qConfig.timerMinutes : 0;
        document.getElementById('editShowResultsAtEnd').checked = qConfig.showResultsAtEnd === true;

        currentEditingQuestions = JSON.parse(JSON.stringify(questions || []));

        modalTitle.textContent = `Modifier : ${moduleData.title}`;
        badge.textContent = `Module ${moduleData.num}`;
        btnDelete?.classList.remove('hidden');
    } else {
        const nextNum = (currentFormationModulesList.length > 0) 
            ? Math.max(...currentFormationModulesList.map(m => parseInt(m.num, 10) || 0)) + 1 
            : 1;

        document.getElementById('editModuleId').value = '';
        document.getElementById('editModuleNum').value = nextNum;
        document.getElementById('editModuleTitle').value = '';
        document.getElementById('editModuleSubtitle').value = '';
        document.getElementById('editModuleIcon').value = 'bi-journal-bookmark';
        document.getElementById('editModuleDesc').value = '';
        
        document.getElementById('editQuizTitle').value = '';
        document.getElementById('editMaxAttempts').value = 0;
        document.getElementById('editQuizTimerMinutes').value = 0;
        document.getElementById('editShowResultsAtEnd').checked = false;

        currentEditingQuestions = [
            {
                id: 'q_' + Date.now() + '_1',
                type: 'qcm',
                text: '',
                options: ['Option A', 'Option B'],
                correctIndex: 0,
                hint: ''
            }
        ];

        modalTitle.textContent = 'Nouveau module de formation & Quiz';
        badge.textContent = 'Nouveau';
        btnDelete?.classList.add('hidden');
    }

    const chosenIcon = document.getElementById('editModuleIcon').value || 'bi-journal-bookmark';
    renderIconPicker(chosenIcon);
    updateIconPreview(chosenIcon);
    renderQuestionsEditor();
    openModal('overlayModuleEdit');
}

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
    { icon: 'bi-sun', label: 'Journée & Plein air', tags: 'soleil meteo plein air exterieur plage' },
    { icon: 'bi-moon-stars', label: 'Nuit & Coucher', tags: 'nuit sommeil coucher chambre tente dortoir' },
    { icon: 'bi-cup-hot', label: 'Repas & Rythme', tags: 'repas alimentation cuisine cantine gouter' },
    { icon: 'bi-bandaid', label: 'Santé & Bobologie', tags: 'soins sante infirmier bobo blessure psc1' },
    { icon: 'bi-trophy', label: 'Sport & Tournoi', tags: 'sport tournoi jeu olympiades defi coupe' },
    { icon: 'bi-dice-5', label: 'Jeux de société', tags: 'jeu plateau regles ludique cartes' },
    { icon: 'bi-music-note-beamed', label: 'Chants & Musique', tags: 'chants musique guitare danse spectacle son' },
    { icon: 'bi-compass', label: 'Orientation & Rando', tags: 'orientation boussole course carte rando marche' },
    { icon: 'bi-fire', label: 'Feu de camp & Bivouac', tags: 'feu camp bivouac secours pompier' },
    { icon: 'bi-megaphone', label: 'Lancement de jeu', tags: 'lancement appel rassemblement animateur' },
    { icon: 'bi-lightbulb', label: 'Pédagogie & Idée', tags: 'idee pedagogie astuce reflexion concept' },
    { icon: 'bi-check2-circle', label: 'Évaluation & Bilan', tags: 'bilan validation check grille reussite' }
];

function renderIconPicker(selectedIcon = 'bi-journal-bookmark', filter = '') {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid) return;

    const term = (filter || '').toLowerCase().trim();
    const filtered = AVAILABLE_FORMATION_ICONS.filter(item => {
        if (!term) return true;
        return item.label.toLowerCase().includes(term) || item.icon.toLowerCase().includes(term) || item.tags.toLowerCase().includes(term);
    });

    if (filtered.length === 0) {
        grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:15px; color:var(--clr-text-muted); font-size:0.8rem;">
            Aucune icône trouvée pour "${escapeHtml(term)}".
        </div>`;
        return;
    }

    grid.innerHTML = filtered.map(item => {
        const isSelected = item.icon === selectedIcon;
        return `
        <button type="button" class="btn-select-icon-item" data-icon="${item.icon}" data-label="${escapeHtml(item.label)}" style="
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
            padding:8px 4px; border-radius:6px; font-size:0.75rem; text-align:center; cursor:pointer; transition:all 0.15s ease;
            background:${isSelected ? 'rgba(39,174,96,0.14)' : '#ffffff'};
            border:${isSelected ? '2px solid var(--clr-primary)' : '1px solid var(--clr-surface-3)'};
            color:${isSelected ? 'var(--clr-primary)' : 'var(--clr-text)'};
            font-weight:${isSelected ? '700' : '500'};
        ">
            <i class="bi ${item.icon}" style="font-size:1.35rem; color:${isSelected ? 'var(--clr-primary)' : 'inherit'};"></i>
            <span style="line-height:1.2; font-size:0.72rem; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                ${escapeHtml(item.label)}
            </span>
        </button>`;
    }).join('');

    grid.querySelectorAll('.btn-select-icon-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const iconClass = btn.getAttribute('data-icon');
            const iconLabel = btn.getAttribute('data-label');
            selectModuleIcon(iconClass, iconLabel);
        });
    });
}

function selectModuleIcon(iconClass, iconLabel) {
    const input = document.getElementById('editModuleIcon');
    if (input) input.value = iconClass;

    const preview = document.getElementById('selectedIconPreview');
    if (preview) preview.className = `bi ${iconClass}`;

    const labelEl = document.getElementById('selectedIconLabel');
    if (labelEl) labelEl.textContent = iconLabel || 'Icône sélectionnée';

    updateIconPreview(iconClass);

    const filter = document.getElementById('iconFilterInput')?.value || '';
    renderIconPicker(iconClass, filter);
}

function updateIconPreview(iconClass) {
    const iconEl = document.getElementById('iconPreviewEl');
    if (iconEl) {
        iconEl.className = `bi ${iconClass || 'bi-journal-bookmark'}`;
    }

    const found = AVAILABLE_FORMATION_ICONS.find(item => item.icon === iconClass);
    const labelEl = document.getElementById('selectedIconLabel');
    if (labelEl && found) {
        labelEl.textContent = found.label;
    }
    const selPrev = document.getElementById('selectedIconPreview');
    if (selPrev) {
        selPrev.className = `bi ${iconClass || 'bi-journal-bookmark'}`;
    }
}

document.getElementById('iconFilterInput')?.addEventListener('input', (e) => {
    const currentIcon = document.getElementById('editModuleIcon')?.value || 'bi-journal-bookmark';
    renderIconPicker(currentIcon, e.target.value);
});

function renderQuestionsEditor() {
    const container = document.getElementById('moduleQuestionsEditorList');
    const countLabel = document.getElementById('questionsCountLabel');
    if (!container) return;

    countLabel.textContent = currentEditingQuestions.length;

    if (currentEditingQuestions.length === 0) {
        container.innerHTML = `
        <div style="text-align:center; padding:20px; background:var(--clr-surface-2); border:1.5px dashed var(--clr-surface-3); border-radius:var(--radius-md); color:var(--clr-text-muted);">
            Aucune question pour ce module. Cliquez sur "Ajouter une question".
        </div>`;
        return;
    }

    container.innerHTML = currentEditingQuestions.map((q, qIdx) => {
        let typeBody = '';
        if (q.type === 'qcm') {
            const optionsHtml = (q.options || []).map((opt, optIdx) => `
                <div class="es-option-builder-row">
                    <input type="radio" name="correct_q_${q.id}" value="${optIdx}" ${q.correctIndex === optIdx ? 'checked' : ''} title="Cocher pour définir comme bonne réponse">
                    <input type="text" class="es-input opt-text-input" data-q-idx="${qIdx}" data-opt-idx="${optIdx}" value="${escapeHtml(opt)}" placeholder="Texte de l'option ${optIdx + 1}" required style="font-size:0.88rem; padding:6px 10px;">
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-option" data-q-idx="${qIdx}" data-opt-idx="${optIdx}" title="Supprimer cette option" style="color:var(--clr-danger); padding:4px 8px;">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `).join('');

            typeBody = `
            <div style="margin-top:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label style="font-size:0.8rem; font-weight:700; color:var(--clr-text);">Choix de réponses (cochez le bouton radio de la bonne réponse) :</label>
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-option" data-q-idx="${qIdx}" style="font-size:0.75rem; padding:2px 8px;">
                        <i class="bi bi-plus"></i> Option
                    </button>
                </div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    ${optionsHtml}
                </div>
            </div>`;
        } else if (q.type === 'boolean') {
            const isTrue = (q.correctAnswer === true || q.correctAnswer === 'true');
            typeBody = `
            <div style="margin-top:10px; background:var(--clr-surface-2); padding:10px 12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                <label style="font-size:0.8rem; font-weight:700; color:var(--clr-text); display:block; margin-bottom:6px;">
                    Bonne réponse attendue pour ce Vrai/Faux :
                </label>
                <div style="display:flex; gap:16px; align-items:center;">
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.88rem; font-weight:600; color:var(--clr-success);">
                        <input type="radio" class="q-boolean-radio" name="bool_correct_q_${q.id}" data-q-idx="${qIdx}" value="true" ${isTrue ? 'checked' : ''}>
                        <span>👍 VRAI</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.88rem; font-weight:600; color:var(--clr-danger);">
                        <input type="radio" class="q-boolean-radio" name="bool_correct_q_${q.id}" data-q-idx="${qIdx}" value="false" ${!isTrue ? 'checked' : ''}>
                        <span>👎 FAUX</span>
                    </label>
                </div>
            </div>`;
        } else if (q.type === 'range') {
            const minVal = (q.min !== undefined && q.min !== null) ? q.min : 0;
            const maxVal = (q.max !== undefined && q.max !== null) ? q.max : 10;
            const stepVal = (q.step !== undefined && q.step !== null) ? q.step : 1;
            const unit = q.unit || '';
            const minLabel = q.minLabel || '';
            const maxLabel = q.maxLabel || '';
            const targetVal = (q.correctValue !== undefined && q.correctValue !== null) ? q.correctValue : '';
            const tolVal = (q.tolerance !== undefined && q.tolerance !== null) ? q.tolerance : 0;

            typeBody = `
            <div style="margin-top:10px; background:var(--clr-surface-2); padding:12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                <div style="font-size:0.82rem; font-weight:700; color:var(--clr-primary); margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                    <i class="bi bi-sliders"></i> Configuration du curseur horizontal
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Valeur Min</label>
                        <input type="number" class="es-input q-range-min" data-q-idx="${qIdx}" value="${minVal}" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Valeur Max</label>
                        <input type="number" class="es-input q-range-max" data-q-idx="${qIdx}" value="${maxVal}" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Pas (Step)</label>
                        <input type="number" class="es-input q-range-step" data-q-idx="${qIdx}" value="${stepVal}" step="any" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Unité (ex: ans, %, h)</label>
                        <input type="text" class="es-input q-range-unit" data-q-idx="${qIdx}" value="${escapeHtml(unit)}" placeholder="ex: enfants" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px;">
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Libellé côté gauche (Min)</label>
                        <input type="text" class="es-input q-range-min-label" data-q-idx="${qIdx}" value="${escapeHtml(minLabel)}" placeholder="ex: Pas du tout" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Libellé côté droit (Max)</label>
                        <input type="text" class="es-input q-range-max-label" data-q-idx="${qIdx}" value="${escapeHtml(maxLabel)}" placeholder="ex: Absolument" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:10px; margin-top:8px; padding-top:8px; border-top:1px dashed var(--clr-surface-3);">
                    <div>
                        <label style="font-size:0.75rem; font-weight:700; color:var(--clr-success);">Cible attendue (Auto-notation, optionnel)</label>
                        <input type="number" class="es-input q-range-target-val" data-q-idx="${qIdx}" value="${targetVal}" placeholder="Laisser vide si pas de note" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                    <div>
                        <label style="font-size:0.75rem; font-weight:600; color:var(--clr-text-muted);">Tolérance autorisée (±)</label>
                        <input type="number" class="es-input q-range-tolerance" data-q-idx="${qIdx}" value="${tolVal}" placeholder="0" style="font-size:0.85rem; padding:5px 8px;">
                    </div>
                </div>
            </div>`;
        } else if (q.type === 'puzzle') {
            const items = q.items || ['Étape 1', 'Étape 2', 'Étape 3'];
            typeBody = `
            <div style="margin-top:10px; background:var(--clr-surface-2); padding:12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:6px;">
                    <div>
                        <div style="font-size:0.82rem; font-weight:700; color:var(--clr-primary); display:flex; align-items:center; gap:6px;">
                            <i class="bi bi-puzzle"></i> Éléments du puzzle / ordonnancement
                        </div>
                        <div style="font-size:0.75rem; color:var(--clr-text-muted);">
                            Saisissez les étapes dans l'<strong>ORDRE EXACT attendu</strong> (de 1 à ${items.length}). Elles seront mélangées pour le stagiaire.
                        </div>
                    </div>
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-puzzle-item" data-q-idx="${qIdx}" style="font-size:0.75rem; padding:3px 8px;">
                        <i class="bi bi-plus"></i> Ajouter une étape
                    </button>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                    ${items.map((itemText, itemIdx) => `
                        <div class="es-puzzle-builder-row">
                            <span class="es-puzzle-num" style="width:24px; height:24px; font-size:0.75rem;">${itemIdx + 1}</span>
                            <input type="text" class="es-input puzzle-item-input" data-q-idx="${qIdx}" data-item-idx="${itemIdx}" value="${escapeHtml(itemText)}" placeholder="Texte de l'étape ${itemIdx + 1}" required style="font-size:0.85rem; padding:5px 8px; flex:1;">
                            <button type="button" class="es-puzzle-btn-move btn-puzzle-builder-up" data-q-idx="${qIdx}" data-item-idx="${itemIdx}" ${itemIdx === 0 ? 'disabled' : ''} title="Monter">
                                <i class="bi bi-chevron-up"></i>
                            </button>
                            <button type="button" class="es-puzzle-btn-move btn-puzzle-builder-down" data-q-idx="${qIdx}" data-item-idx="${itemIdx}" ${itemIdx === items.length - 1 ? 'disabled' : ''} title="Descendre">
                                <i class="bi bi-chevron-down"></i>
                            </button>
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-puzzle-item" data-q-idx="${qIdx}" data-item-idx="${itemIdx}" style="color:var(--clr-danger); padding:2px 6px;" title="Supprimer cet élément">
                                <i class="bi bi-x-lg"></i>
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        } else {
            typeBody = `
            <div style="margin-top:10px;">
                <label class="es-field__label" style="font-size:0.8rem;">Piste de réflexion / Critères attendus (optionnel) :</label>
                <input type="text" class="es-input q-hint-input" data-q-idx="${qIdx}" value="${escapeHtml(q.hint || '')}" placeholder="Indice ou critères..." style="font-size:0.85rem; padding:6px 10px;">
            </div>`;
        }

        return `
        <div class="es-question-builder-item">
            <div class="es-question-builder-header">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span style="font-weight:700; font-size:0.82rem; color:var(--clr-primary); text-transform:uppercase;">Question ${qIdx + 1}</span>
                    <select class="es-input q-type-select" data-q-idx="${qIdx}" style="width:230px; font-size:0.8rem; padding:4px 8px;">
                        <option value="qcm" ${q.type === 'qcm' ? 'selected' : ''}>🔘 QCM (Choix multiple)</option>
                        <option value="puzzle" ${q.type === 'puzzle' ? 'selected' : ''}>🧩 Puzzle / Ordonnancement</option>
                        <option value="range" ${q.type === 'range' ? 'selected' : ''}>📏 Curseur horizontal (Slider)</option>
                        <option value="boolean" ${q.type === 'boolean' ? 'selected' : ''}>⚖️ Vrai / Faux</option>
                        <option value="text" ${q.type === 'text' ? 'selected' : ''}>📝 Question ouverte (Rédaction)</option>
                    </select>
                </div>
                <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-delete-question" data-q-idx="${qIdx}" style="color:var(--clr-danger); padding:4px 8px;" title="Supprimer la question">
                    <i class="bi bi-trash3"></i>
                </button>
            </div>
            <div>
                <textarea class="es-input q-text-input" data-q-idx="${qIdx}" rows="2" placeholder="Énoncé de la question..." required style="font-size:0.9rem;">${escapeHtml(q.text || '')}</textarea>
            </div>
            
            <div style="margin-top:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <i class="bi bi-image" style="color:var(--clr-primary); font-size:0.9rem;"></i>
                    <input type="url" class="es-input q-image-input" data-q-idx="${qIdx}" value="${escapeHtml(q.imageUrl || '')}" placeholder="URL d'une image ou schéma illustratif (ex: https://.../plan.png) - Optionnel" style="font-size:0.82rem; padding:5px 8px; flex:1;">
                </div>
                ${q.imageUrl ? `
                <div class="q-image-preview-box" style="margin-top:6px; background:#ffffff; padding:6px; border:1px solid var(--clr-surface-3); border-radius:6px; display:inline-block;">
                    <img src="${escapeHtml(q.imageUrl)}" alt="Aperçu" style="max-height:80px; max-width:180px; border-radius:4px; object-fit:contain; display:block;" onerror="this.parentElement.style.display='none'">
                </div>` : ''}
            </div>

            ${typeBody}
        </div>`;
    }).join('');

    container.querySelectorAll('.q-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].text = e.target.value;
        });
    });

    container.querySelectorAll('.q-image-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].imageUrl = e.target.value.trim();
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.q-type-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const newType = e.target.value;
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].type = newType;
                if (newType === 'qcm' && (!currentEditingQuestions[idx].options || currentEditingQuestions[idx].options.length === 0)) {
                    currentEditingQuestions[idx].options = ['Option 1', 'Option 2'];
                    currentEditingQuestions[idx].correctIndex = 0;
                } else if (newType === 'puzzle' && (!currentEditingQuestions[idx].items || currentEditingQuestions[idx].items.length === 0)) {
                    currentEditingQuestions[idx].items = ['Étape 1', 'Étape 2', 'Étape 3'];
                } else if (newType === 'range') {
                    if (currentEditingQuestions[idx].min === undefined) currentEditingQuestions[idx].min = 0;
                    if (currentEditingQuestions[idx].max === undefined) currentEditingQuestions[idx].max = 10;
                    if (currentEditingQuestions[idx].step === undefined) currentEditingQuestions[idx].step = 1;
                } else if (newType === 'boolean') {
                    if (currentEditingQuestions[idx].correctAnswer === undefined) currentEditingQuestions[idx].correctAnswer = true;
                }
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.opt-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const optIdx = parseInt(e.target.getAttribute('data-opt-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].options) {
                currentEditingQuestions[qIdx].options[optIdx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('input[name^="correct_q_"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const qId = e.target.name.replace('correct_q_', '');
            const qIdx = currentEditingQuestions.findIndex(q => q.id === qId);
            if (qIdx >= 0) {
                currentEditingQuestions[qIdx].correctIndex = parseInt(e.target.value, 10);
            }
        });
    });

    container.querySelectorAll('.q-boolean-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[qIdx]) {
                currentEditingQuestions[qIdx].correctAnswer = (e.target.value === 'true');
            }
        });
    });

    // Listeners puzzle builder
    container.querySelectorAll('.puzzle-item-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const itemIdx = parseInt(e.target.getAttribute('data-item-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].items) {
                currentEditingQuestions[qIdx].items[itemIdx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-puzzle-builder-up').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            const itemIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].items && itemIdx > 0) {
                const items = currentEditingQuestions[qIdx].items;
                const temp = items[itemIdx];
                items[itemIdx] = items[itemIdx - 1];
                items[itemIdx - 1] = temp;
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-puzzle-builder-down').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            const itemIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].items && itemIdx < currentEditingQuestions[qIdx].items.length - 1) {
                const items = currentEditingQuestions[qIdx].items;
                const temp = items[itemIdx];
                items[itemIdx] = items[itemIdx + 1];
                items[itemIdx + 1] = temp;
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-add-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[qIdx]) {
                if (!currentEditingQuestions[qIdx].items) currentEditingQuestions[qIdx].items = [];
                currentEditingQuestions[qIdx].items.push(`Étape ${currentEditingQuestions[qIdx].items.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            const itemIdx = parseInt(btn.getAttribute('data-item-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].items && currentEditingQuestions[qIdx].items.length > 2) {
                currentEditingQuestions[qIdx].items.splice(itemIdx, 1);
                renderQuestionsEditor();
            } else {
                showToast("Un puzzle doit comporter au moins 2 éléments à ordonner.", "warning");
            }
        });
    });

    container.querySelectorAll('.q-range-min').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].min = parseFloat(e.target.value) || 0;
        });
    });

    container.querySelectorAll('.q-range-max').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].max = parseFloat(e.target.value) || 0;
        });
    });

    container.querySelectorAll('.q-range-step').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].step = parseFloat(e.target.value) || 1;
        });
    });

    container.querySelectorAll('.q-range-unit').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].unit = e.target.value.trim();
        });
    });

    container.querySelectorAll('.q-range-min-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].minLabel = e.target.value.trim();
        });
    });

    container.querySelectorAll('.q-range-max-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].maxLabel = e.target.value.trim();
        });
    });

    container.querySelectorAll('.q-range-target-val').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) {
                const val = e.target.value.trim();
                currentEditingQuestions[idx].correctValue = (val === '') ? undefined : parseFloat(val);
            }
        });
    });

    container.querySelectorAll('.q-range-tolerance').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].tolerance = parseFloat(e.target.value) || 0;
        });
    });

    container.querySelectorAll('.q-hint-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) currentEditingQuestions[idx].hint = e.target.value;
        });
    });

    container.querySelectorAll('.btn-add-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[qIdx]) {
                if (!currentEditingQuestions[qIdx].options) currentEditingQuestions[qIdx].options = [];
                currentEditingQuestions[qIdx].options.push(`Option ${currentEditingQuestions[qIdx].options.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            const optIdx = parseInt(btn.getAttribute('data-opt-idx'), 10);
            if (currentEditingQuestions[qIdx] && currentEditingQuestions[qIdx].options.length > 2) {
                currentEditingQuestions[qIdx].options.splice(optIdx, 1);
                if (currentEditingQuestions[qIdx].correctIndex >= currentEditingQuestions[qIdx].options.length) {
                    currentEditingQuestions[qIdx].correctIndex = 0;
                }
                renderQuestionsEditor();
            } else {
                showToast("Un QCM doit comporter au moins 2 options.", "warning");
            }
        });
    });

    container.querySelectorAll('.btn-delete-question').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            currentEditingQuestions.splice(qIdx, 1);
            renderQuestionsEditor();
        });
    });
}

document.getElementById('btnAddQuestion')?.addEventListener('click', () => {
    currentEditingQuestions.push({
        id: 'q_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        type: 'qcm',
        text: '',
        imageUrl: '',
        options: ['Option 1', 'Option 2'],
        correctIndex: 0,
        hint: ''
    });
    renderQuestionsEditor();
});

// Gestionnaire du panneau d'import / export JSON
const btnToggleJsonBox = document.getElementById('btnToggleJsonBox');
const jsonImportPanel = document.getElementById('jsonImportPanel');
const jsonQuestionsInput = document.getElementById('jsonQuestionsInput');
const jsonImportAlert = document.getElementById('jsonImportAlert');

btnToggleJsonBox?.addEventListener('click', () => {
    if (jsonImportPanel) {
        const isHidden = jsonImportPanel.classList.contains('hidden');
        if (isHidden) {
            jsonImportPanel.classList.remove('hidden');
            if (jsonImportAlert) jsonImportAlert.classList.add('hidden');
        } else {
            jsonImportPanel.classList.add('hidden');
        }
    }
});

document.getElementById('btnInsertJsonExample')?.addEventListener('click', () => {
    if (!jsonQuestionsInput) return;
    const exampleQuestions = [
        {
            type: "qcm",
            text: "Quelle est la principale responsabilité de l'animateur en début de séjour ?",
            imageUrl: "https://images.unsplash.com/photo-1472162072942-cd5147eb3902?w=600&auto=format&fit=crop&q=80",
            options: [
                "Assurer la sécurité affective, morale et physique des enfants",
                "Fixer les sanctions immédiatement",
                "Terminer le planning complet de toutes les semaines",
                "Contrôler le budget de l'hébergement"
            ],
            correctIndex: 0
        },
        {
            type: "puzzle",
            text: "Remettez dans l'ordre chronologique les étapes fondamentales de la chaîne des secours (Protocole PAS) :",
            items: [
                "1. Protéger la zone et les personnes pour éviter un suraccident",
                "2. Alerter les services d'urgence adaptés (15, 18 ou 112)",
                "3. Secourir en effectuant les gestes de premiers secours adaptés"
            ]
        },
        {
            type: "range",
            text: "En accueil de loisirs extrascolaire pour les enfants de plus de 6 ans, quel est le taux d'encadrement légal minimal (1 animateur pour X enfants) ?",
            min: 1,
            max: 20,
            step: 1,
            unit: "enfants",
            minLabel: "1 anim / 1 enf.",
            maxLabel: "1 anim / 20 enf.",
            correctValue: 12,
            tolerance: 0
        },
        {
            type: "boolean",
            text: "Un stagiaire BAFA en situation pratique est pleinement compté dans l'effectif des animateurs qualifiés/stagiaires requis par la réglementation.",
            correctAnswer: true
        },
        {
            type: "text",
            text: "Décrivez comment vous organisez le réveil échelonné pour respecter le rythme des enfants.",
            hint: "Parlez de l'accueil, des activités calmes proposées et de l'accès au petit-déjeuner."
        }
    ];
    jsonQuestionsInput.value = JSON.stringify(exampleQuestions, null, 2);
    if (jsonImportAlert) jsonImportAlert.classList.add('hidden');
});

document.getElementById('btnExportJsonQuestions')?.addEventListener('click', () => {
    if (!jsonQuestionsInput) return;
    const cleanExport = (currentEditingQuestions || []).map(q => {
        const item = {
            type: q.type || 'qcm',
            text: q.text || ''
        };
        if (q.imageUrl) item.imageUrl = q.imageUrl;

        if (q.type === 'qcm') {
            item.options = q.options || ['Option 1', 'Option 2'];
            item.correctIndex = q.correctIndex !== undefined ? q.correctIndex : 0;
        } else if (q.type === 'puzzle') {
            item.items = q.items || ['Étape 1', 'Étape 2', 'Étape 3'];
        } else if (q.type === 'boolean') {
            item.correctAnswer = (q.correctAnswer === true || q.correctAnswer === 'true');
        } else if (q.type === 'range') {
            item.min = q.min !== undefined ? q.min : 0;
            item.max = q.max !== undefined ? q.max : 10;
            item.step = q.step !== undefined ? q.step : 1;
            if (q.unit) item.unit = q.unit;
            if (q.minLabel) item.minLabel = q.minLabel;
            if (q.maxLabel) item.maxLabel = q.maxLabel;
            if (q.correctValue !== undefined && q.correctValue !== '') item.correctValue = q.correctValue;
            if (q.tolerance !== undefined) item.tolerance = q.tolerance;
        } else {
            if (q.hint) item.hint = q.hint;
        }
        return item;
    });

    const jsonStr = JSON.stringify(cleanExport, null, 2);
    jsonQuestionsInput.value = jsonStr;
    if (jsonImportPanel) jsonImportPanel.classList.remove('hidden');

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(jsonStr).then(() => {
            showToast("JSON copié dans le presse-papiers !", "success");
        }).catch(() => {
            showToast("JSON généré dans le champ texte.", "info");
        });
    } else {
        showToast("JSON généré dans le champ texte.", "info");
    }
});

document.getElementById('btnApplyJsonImport')?.addEventListener('click', () => {
    if (!jsonQuestionsInput) return;
    const raw = jsonQuestionsInput.value.trim();

    if (!raw) {
        if (jsonImportAlert) {
            jsonImportAlert.textContent = "Veuillez coller du code JSON avant de valider.";
            jsonImportAlert.classList.remove('hidden');
        }
        return;
    }

    try {
        let parsed = JSON.parse(raw);
        let list = [];

        if (Array.isArray(parsed)) {
            list = parsed;
        } else if (parsed && typeof parsed === 'object') {
            if (Array.isArray(parsed.questions)) {
                list = parsed.questions;
            } else if (Array.isArray(parsed.items)) {
                list = parsed.items;
            } else if (parsed.text) {
                list = [parsed];
            }
        }

        if (!list || list.length === 0) {
            throw new Error("Aucune question valide trouvée dans le JSON.");
        }

        const formattedQuestions = list.map((item, idx) => {
            let type = 'qcm';
            if (item.type === 'text' || item.type === 'open' || item.type === 'redaction') {
                type = 'text';
            } else if (item.type === 'range' || item.type === 'slider' || item.type === 'curseur') {
                type = 'range';
            } else if (item.type === 'puzzle' || item.type === 'order' || item.type === 'ordonnancement' || item.type === 'sequence') {
                type = 'puzzle';
            } else if (item.type === 'boolean' || item.type === 'bool' || item.type === 'vrai-faux') {
                type = 'boolean';
            }

            const text = (item.text || item.question || item.title || '').trim();
            const imageUrl = (item.imageUrl || item.image || '').trim();
            const hint = (item.hint || item.indice || item.piste || '').trim();

            const resQ = {
                id: item.id || ('q_' + Date.now() + '_' + (idx + 1)),
                type: type,
                text: text,
                imageUrl: imageUrl
            };

            if (type === 'qcm') {
                let options = ['Option 1', 'Option 2'];
                if (Array.isArray(item.options) && item.options.length > 0) {
                    options = item.options.map(opt => String(opt).trim()).filter(Boolean);
                    if (options.length < 2) options.push('Option ' + (options.length + 1));
                } else if (Array.isArray(item.choices) && item.choices.length > 0) {
                    options = item.choices.map(opt => String(opt).trim()).filter(Boolean);
                }
                let correctIndex = 0;
                if (typeof item.correctIndex === 'number') correctIndex = item.correctIndex;
                else if (typeof item.answer === 'number') correctIndex = item.answer;
                else if (typeof item.correctAnswer === 'number') correctIndex = item.correctAnswer;
                if (correctIndex < 0 || correctIndex >= options.length) correctIndex = 0;

                resQ.options = options;
                resQ.correctIndex = correctIndex;
            } else if (type === 'puzzle') {
                let itemsList = ['Étape 1', 'Étape 2', 'Étape 3'];
                if (Array.isArray(item.items) && item.items.length > 0) {
                    itemsList = item.items.map(it => String(it).trim()).filter(Boolean);
                } else if (Array.isArray(item.options) && item.options.length > 0) {
                    itemsList = item.options.map(it => String(it).trim()).filter(Boolean);
                } else if (Array.isArray(item.steps) && item.steps.length > 0) {
                    itemsList = item.steps.map(it => String(it).trim()).filter(Boolean);
                }
                if (itemsList.length < 2) itemsList.push('Étape ' + (itemsList.length + 1));
                resQ.items = itemsList;
            } else if (type === 'boolean') {
                resQ.correctAnswer = (item.correctAnswer === true || item.correctAnswer === 'true' || item.answer === true);
            } else if (type === 'range') {
                resQ.min = item.min !== undefined ? parseFloat(item.min) : 0;
                resQ.max = item.max !== undefined ? parseFloat(item.max) : 10;
                resQ.step = item.step !== undefined ? parseFloat(item.step) : 1;
                resQ.unit = item.unit || '';
                resQ.minLabel = item.minLabel || '';
                resQ.maxLabel = item.maxLabel || '';
                if (item.correctValue !== undefined && item.correctValue !== '') {
                    resQ.correctValue = parseFloat(item.correctValue);
                    resQ.tolerance = item.tolerance !== undefined ? parseFloat(item.tolerance) : 0;
                }
            } else {
                resQ.hint = hint;
            }

            return resQ;
        });

        currentEditingQuestions = formattedQuestions;
        renderQuestionsEditor();

        if (jsonImportAlert) jsonImportAlert.classList.add('hidden');
        jsonImportPanel?.classList.add('hidden');
        showToast(`✨ ${formattedQuestions.length} question(s) importée(s) avec succès !`, "success");

    } catch (err) {
        console.error("JSON parse error:", err);
        if (jsonImportAlert) {
            jsonImportAlert.textContent = "Erreur de format JSON : " + (err.message || "Vérifiez la syntaxe (guillemets, virgules).");
            jsonImportAlert.classList.remove('hidden');
        }
    }
});

document.getElementById('btnAdminNewModule')?.addEventListener('click', () => {
    openFormationModuleEdit(null);
});

document.getElementById('btnSaveModule')?.addEventListener('click', async () => {
    const errorAlert = document.getElementById('moduleEditErrorAlert');
    const errorMsg = document.getElementById('moduleEditErrorMsg');
    const btn = document.getElementById('btnSaveModule');

    const id = document.getElementById('editModuleId').value.trim() || ('module_' + Date.now());
    const num = parseInt(document.getElementById('editModuleNum').value, 10) || 1;
    const title = document.getElementById('editModuleTitle').value.trim();
    const subtitle = document.getElementById('editModuleSubtitle').value.trim();
    const icon = document.getElementById('editModuleIcon').value.trim() || 'bi-journal-bookmark';
    const description = document.getElementById('editModuleDesc').value.trim();
    
    const quizTitle = document.getElementById('editQuizTitle').value.trim() || title;
    const maxAttempts = parseInt(document.getElementById('editMaxAttempts').value, 10) || 0;
    const timerMinutes = parseInt(document.getElementById('editQuizTimerMinutes').value, 10) || 0;
    const showResultsAtEnd = document.getElementById('editShowResultsAtEnd').checked;

    if (!title) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Veuillez renseigner le titre du module.";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    for (let i = 0; i < currentEditingQuestions.length; i++) {
        const q = currentEditingQuestions[i];
        if (!q.text || !q.text.trim()) {
            if (errorAlert && errorMsg) {
                errorMsg.textContent = `La question ${i + 1} n'a pas d'énoncé.`;
                errorAlert.classList.remove('hidden');
            }
            return;
        }
        if (q.type === 'qcm') {
            if (!q.options || q.options.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (QCM) doit avoir au moins 2 options.`;
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
        } else if (q.type === 'puzzle') {
            if (!q.items || q.items.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (Puzzle) doit avoir au moins 2 éléments à ordonner.`;
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

    if (errorAlert) errorAlert.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const existingMod = currentFormationModulesList.find(m => m.id === id);
        const modulePayload = {
            id: id,
            num: num,
            title: title,
            subtitle: subtitle,
            icon: icon,
            description: description,
            enabled: existingMod ? (existingMod.enabled === true) : false,
            quizConfig: {
                quizTitle: quizTitle,
                maxAttempts: maxAttempts,
                timerMinutes: timerMinutes,
                showResultsAtEnd: showResultsAtEnd
            }
        };

        await saveFormationModule(modulePayload, currentEditingQuestions);
        btnLoading(btn, false);
        closeModal('overlayModuleEdit');
        showToast(`Module "${title}" enregistré avec succès !`, "success");
        loadFormationModules();
    } catch (err) {
        btnLoading(btn, false);
        console.error("Save module error:", err);
        showToast("Erreur lors de l'enregistrement.", "error");
    }
});

document.getElementById('btnDeleteModule')?.addEventListener('click', async () => {
    const id = document.getElementById('editModuleId').value;
    if (!id) return;

    if (!confirm("Voulez-vous supprimer définitivement ce module, ses questions et ses réponses ?")) {
        return;
    }

    const btn = document.getElementById('btnDeleteModule');
    btnLoading(btn, true);

    try {
        await deleteFormationModule(id);
        btnLoading(btn, false);
        closeModal('overlayModuleEdit');
        showToast("Module supprimé.", "success");
        loadFormationModules();
    } catch (err) {
        btnLoading(btn, false);
        console.error("Delete module error:", err);
        showToast("Erreur lors de la suppression.", "error");
    }
});

document.getElementById('btnCloseModuleEdit')?.addEventListener('click', () => closeModal('overlayModuleEdit'));
document.getElementById('btnCancelModuleEdit')?.addEventListener('click', () => closeModal('overlayModuleEdit'));

// Formateur actions globales
document.getElementById('btnStagiaireUnlockAll')?.addEventListener('click', async () => {
    const modules = await getFormationModulesList();
    try {
        const batch = db.batch();
        modules.forEach(m => {
            const ref = db.collection('formation').doc(m.id);
            batch.update(ref, {
                enabled: true,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            m.enabled = true;
        });
        await batch.commit();
        showToast("Tous les modules sont déverrouillés.", "success");
        loadFormationModules();
    } catch (err) {
        console.error("Unlock all error:", err);
        showToast("Erreur lors du déverrouillage.", "error");
    }
});

document.getElementById('btnStagiaireLockAll')?.addEventListener('click', async () => {
    const modules = await getFormationModulesList();
    try {
        const batch = db.batch();
        modules.forEach(m => {
            const ref = db.collection('formation').doc(m.id);
            batch.update(ref, {
                enabled: false,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            m.enabled = false;
        });
        await batch.commit();
        showToast("Tous les modules sont verrouillés.", "success");
        loadFormationModules();
    } catch (err) {
        console.error("Lock all error:", err);
        showToast("Erreur lors du verrouillage.", "error");
    }
});

// ----------------------------------------------------------------
// MODAL : RÉSULTATS DES STAGIAIRES (ADMIN)
// ----------------------------------------------------------------
async function openFormationResultsModal(moduleId) {
    const modal = document.getElementById('overlayFormationResults');
    if (!modal) return;

    let moduleData = (currentFormationModulesList || []).find(m => m.id === moduleId);
    if (!moduleData) return;

    // Charger les questions de la sous-collection
    const questions = await fetchModuleQuestions(moduleId);
    moduleData.questions = questions;

    document.getElementById('resultsModalNum').textContent = `Module ${moduleData.num < 10 ? '0' + moduleData.num : moduleData.num}`;
    document.getElementById('resultsModalTitle').textContent = `Réponses — ${moduleData.title}`;
    const iconEl = document.getElementById('resultsModalIcon');
    if (iconEl) iconEl.innerHTML = `<i class="bi ${moduleData.icon || 'bi-journal-bookmark'}"></i>`;

    const loader = document.getElementById('resultsLoader');
    const empty = document.getElementById('resultsEmptyState');
    const list = document.getElementById('resultsSubmissionsList');

    if (loader) loader.classList.remove('hidden');
    if (empty) empty.classList.add('hidden');
    if (list) { list.classList.add('hidden'); list.innerHTML = ''; }

    openModal('overlayFormationResults');

    try {
        const snap = await db.collection('formation').doc(moduleId).collection('submissions').get();

        if (loader) loader.classList.add('hidden');

        if (snap.empty) {
            if (empty) empty.classList.remove('hidden');
            return;
        }

        const subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        subs.sort((a, b) => {
            const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : (a.submittedAt ? new Date(a.submittedAt).getTime() : 0));
            const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : (b.submittedAt ? new Date(b.submittedAt).getTime() : 0));
            return tb - ta;
        });

        list.innerHTML = subs.map((sub) => {
            const answersHtml = questions.map((q, qIdx) => {
                const ans = sub.answers ? sub.answers[q.id] : null;
                let ansDisplay = '';
                const imageThumbHtml = q.imageUrl ? `
                <div style="margin-top:6px; margin-bottom:6px;">
                    <img src="${escapeHtml(q.imageUrl)}" alt="Illustration" style="max-height:90px; max-width:100%; border-radius:4px; border:1px solid var(--clr-surface-3);" onerror="this.parentElement.style.display='none'">
                </div>` : '';

                if (q.type === 'qcm') {
                    const ansNum = (ans !== null && ans !== undefined) ? parseInt(ans, 10) : null;
                    const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                    const optText = (ansNum !== null && q.options && q.options[ansNum]) ? q.options[ansNum] : '<span style="color:var(--clr-danger)">Pas de réponse</span>';
                    const isCorrect = (ansNum === correctIdx);
                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.88rem;">
                        <strong>Réponse choisie :</strong> ${escapeHtml(optText)}
                        <span style="margin-left:8px; font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrect ? '✅ Exact' : '❌ Incorrect'}
                        </span>
                        ${!isCorrect && q.options && q.options[q.correctIndex] ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Bonne réponse attendue : <strong>${escapeHtml(q.options[q.correctIndex])}</strong>)</div>` : ''}
                    </div>`;
                } else if (q.type === 'boolean') {
                    const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                    const hasAnswer = (ans !== null && ans !== undefined);
                    const userBool = (ans === true || ans === 'true');
                    const isCorrect = hasAnswer && (userBool === expectedBool);
                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.88rem;">
                        <strong>Réponse choisie :</strong> ${hasAnswer ? (userBool ? '👍 VRAI' : '👎 FAUX') : '<span style="color:var(--clr-danger)">Pas de réponse</span>'}
                        <span style="margin-left:8px; font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrect ? '✅ Exact' : '❌ Incorrect'}
                        </span>
                        ${!isCorrect ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Réponse attendue : <strong>${expectedBool ? '👍 VRAI' : '👎 FAUX'}</strong>)</div>` : ''}
                    </div>`;
                } else if (q.type === 'range') {
                    const val = (ans !== null && ans !== undefined) ? parseFloat(ans) : null;
                    const unit = q.unit || '';
                    const hasTarget = (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null);
                    let targetBadge = '';

                    if (val !== null && hasTarget) {
                        const targetVal = parseFloat(q.correctValue);
                        const tolerance = parseFloat(q.tolerance) || 0;
                        const isCorrectRange = Math.abs(val - targetVal) <= tolerance;
                        targetBadge = `
                        <span style="margin-left:8px; font-weight:700; color:${isCorrectRange ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrectRange ? '✅ Dans la cible' : '❌ Hors cible'}
                        </span>
                        <div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">
                            (Cible attendue : <strong>${targetVal} ${escapeHtml(unit)}</strong> ${tolerance > 0 ? `± ${tolerance}` : ''})
                        </div>`;
                    }

                } else if (q.type === 'puzzle') {
                    const candidateOrder = Array.isArray(ans) ? ans : [];
                    const expectedOrder = q.items || [];
                    const isExact = (candidateOrder.length === expectedOrder.length && candidateOrder.length > 0 && candidateOrder.every((it, idx) => it === expectedOrder[idx]));
                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.88rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                            <strong>Ordre proposé par le stagiaire :</strong>
                            <span style="font-weight:700; color:${isExact ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                                ${isExact ? '✅ Ordre parfait (100%)' : '❌ Ordre incorrect'}
                            </span>
                        </div>
                        <ol style="margin:4px 0 0 18px; padding:0; line-height:1.4; color:var(--clr-text);">
                            ${candidateOrder.length > 0 ? candidateOrder.map(it => `<li>${escapeHtml(it)}</li>`).join('') : '<li style="color:var(--clr-danger)">Pas d\'ordre transmis</li>'}
                        </ol>
                        ${!isExact && expectedOrder.length > 0 ? `
                        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--clr-surface-3); font-size:0.8rem; color:var(--clr-text-muted);">
                            <strong style="color:var(--clr-primary);">Ordre attendu :</strong>
                            <ol style="margin:4px 0 0 18px; padding:0; color:var(--clr-text);">
                                ${expectedOrder.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
                            </ol>
                        </div>` : ''}
                    </div>`;
                } else {
                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:6px; font-size:0.88rem; line-height:1.5; white-space:pre-wrap; color:var(--clr-text);">
                        ${escapeHtml(ans || 'Pas de texte rédigé.')}
                    </div>
                    ${q.hint ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;"><i class="bi bi-lightbulb"></i> Piste attendue : ${escapeHtml(q.hint)}</div>` : ''}`;
                }

                let typeLabel = 'QCM';
                if (q.type === 'range') typeLabel = 'Curseur horizontal';
                else if (q.type === 'boolean') typeLabel = 'Vrai / Faux';
                else if (q.type === 'puzzle') typeLabel = 'Puzzle / Ordonnancement';
                else if (q.type === 'text') typeLabel = 'Rédaction';

                return `
                <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--clr-surface-3);">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Question ${qIdx + 1} • ${typeLabel}</div>
                    <div style="font-size:0.88rem; font-weight:600; color:var(--clr-text); margin-top:2px;">${escapeHtml(q.text)}</div>
                    ${imageThumbHtml}
                    ${ansDisplay}
                </div>`;
            }).join('');

            const scoreBadge = sub.score ? `<span class="es-badge es-badge--approved">Score : ${sub.score.correct}/${sub.score.total} (${sub.score.percent}%)</span>` : '';
            const attemptBadge = sub.attemptNumber ? `<span class="es-badge es-badge--anim"><i class="bi bi-arrow-repeat"></i> Tentative #${sub.attemptNumber}</span>` : '';

            return `
            <div style="background:var(--clr-surface-2); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <div style="font-weight:700; font-size:0.95rem; color:var(--clr-text);">${escapeHtml(sub.userName || sub.userEmail || 'Stagiaire')}</div>
                        <div style="font-size:0.78rem; color:var(--clr-text-muted);">${escapeHtml(sub.userEmail || '')}</div>
                    </div>
                    <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                        ${attemptBadge}
                        ${scoreBadge}
                        <div style="font-size:0.75rem; font-weight:600; color:var(--clr-text-light); background:var(--clr-surface); padding:4px 8px; border-radius:4px; border:1px solid var(--clr-surface-3);">
                            🕒 ${formatFullDate(sub.submittedAt)}
                        </div>
                    </div>
                </div>
                ${answersHtml}
            </div>`;
        }).join('');

        if (list) list.classList.remove('hidden');

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("openFormationResultsModal error:", err);
        showToast("Erreur lors de la récupération des réponses.", "error");
    }
}

document.getElementById('btnCloseResultsModal')?.addEventListener('click', () => closeModal('overlayFormationResults'));
document.getElementById('btnCloseResultsModal2')?.addEventListener('click', () => closeModal('overlayFormationResults'));

// ----------------------------------------------------------------
// MENU UTILISATEUR & PARAMÈTRES
// ----------------------------------------------------------------
const btnUserMenu = document.getElementById('btnUserMenu');
const userDropdown = document.getElementById('userDropdown');

btnUserMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown?.classList.toggle('hidden');
});

document.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
});

document.getElementById('btnLogout')?.addEventListener('click', async () => {
    try {
        await auth.signOut();
        window.location.href = 'index.html';
    } catch (err) {
        console.error("Logout error:", err);
    }
});

document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
    userDropdown?.classList.add('hidden');
    if (!currentUser) return;

    document.getElementById('settingsUserEmail').textContent = currentUser.email || '—';
    document.getElementById('settingsUserRole').textContent = actualRole || 'stagiaire';
    document.getElementById('settingsFirstName').value = actualUserData?.firstName || '';
    document.getElementById('settingsLastName').value = actualUserData?.lastName || '';
    document.getElementById('settingsBirthdate').value = actualUserData?.birthdate || '';

    const avatarImg = document.getElementById('settingsAvatarImg');
    const avatarPlaceholder = document.getElementById('settingsAvatarPlaceholder');
    if (actualUserData?.photoURL || currentUser.photoURL) {
        avatarImg.src = actualUserData?.photoURL || currentUser.photoURL;
        avatarImg.classList.remove('hidden');
        avatarPlaceholder.classList.add('hidden');
    } else {
        avatarImg.classList.add('hidden');
        avatarPlaceholder.classList.remove('hidden');
    }

    openModal('overlaySettings');
});

document.getElementById('btnCloseSettings')?.addEventListener('click', () => closeModal('overlaySettings'));
document.getElementById('btnCancelSettings')?.addEventListener('click', () => closeModal('overlaySettings'));

document.getElementById('btnSaveSettings')?.addEventListener('click', async () => {
    const btn = document.getElementById('btnSaveSettings');
    const firstName = document.getElementById('settingsFirstName').value.trim();
    const lastName = document.getElementById('settingsLastName').value.trim();
    const birthdate = document.getElementById('settingsBirthdate').value;

    btnLoading(btn, true);
    try {
        const updateData = {
            firstName: firstName,
            lastName: lastName,
            displayName: `${firstName} ${lastName}`.trim() || currentUser.email,
            birthdate: birthdate,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('users').doc(currentUser.uid).update(updateData);
        actualUserData = { ...actualUserData, ...updateData };
        updateTopbarUser(currentUser, actualRole, actualUserData);
        btnLoading(btn, false);
        closeModal('overlaySettings');
        showToast("Profil mis à jour.", "success");
    } catch (err) {
        btnLoading(btn, false);
        console.error("Save settings error:", err);
        showToast("Erreur lors de la mise à jour.", "error");
    }
});

// ----------------------------------------------------------------
// INITIALISATION DE LA PAGE FORMATION (AUTH)
// ----------------------------------------------------------------
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.replace('index.html');
        return;
    }

    let userData = null;
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (!userDoc.exists) {
            await auth.signOut();
            window.location.replace('index.html');
            return;
        }
        userData = userDoc.data();
        if (typeof setCachedUserData === 'function') {
            setCachedUserData(user.uid, userData);
        }
    } catch (err) {
        console.warn("Offline user fallback:", err);
        if (typeof getCachedUserData === 'function') {
            userData = getCachedUserData(user.uid);
        }
        if (!userData) {
            userData = {
                displayName: user.displayName || user.email,
                email: user.email,
                role: localStorage.getItem('offline_user_role_' + user.uid) || 'stagiaire'
            };
        }
    }

    if (userData.banned === true || userData.isBanned === true) {
        if (typeof showGlobalAccessDenied === 'function') {
            showGlobalAccessDenied();
        }
        return;
    }

    currentUser = user;
    actualRole = userData.role || 'stagiaire';
    actualUserData = userData;

    // Si utilisateur uniquement animateur (et pas admin), redirection vers l'espace colos
    if (actualRole === 'anim') {
        window.location.replace('index.html');
        return;
    }

    if (pageLoader) pageLoader.classList.add('hidden');
    if (formationView) formationView.classList.remove('hidden');

    // Mettre à jour la Topbar
    updateTopbarUser(currentUser, actualRole, actualUserData);

    // Initialiser le dropdown switcher d'espace pour l'admin
    const btnBrandDropdown = document.getElementById('btnBrandDropdown');
    const brandDropdownMenu = document.getElementById('brandDropdownMenu');
    const brandChevron = document.getElementById('brandChevron');
    const menuItemColos = document.getElementById('menuItemColos');

    if (actualRole === 'admin') {
        btnBrandDropdown?.classList.add('es-topbar__brand--interactive');
        brandChevron?.classList.remove('hidden');

        btnBrandDropdown?.addEventListener('click', (e) => {
            e.stopPropagation();
            const isHidden = brandDropdownMenu?.classList.contains('hidden');
            if (isHidden) {
                brandDropdownMenu?.classList.remove('hidden');
                btnBrandDropdown?.classList.add('open');
            } else {
                brandDropdownMenu?.classList.add('hidden');
                btnBrandDropdown?.classList.remove('open');
            }
        });

        menuItemColos?.addEventListener('click', () => {
            window.location.href = 'index.html';
        });

        document.addEventListener('click', (e) => {
            const wrap = document.getElementById('brandDropdownWrap');
            if (wrap && !wrap.contains(e.target)) {
                brandDropdownMenu?.classList.add('hidden');
                btnBrandDropdown?.classList.remove('open');
            }
        });
    } else {
        btnBrandDropdown?.classList.remove('es-topbar__brand--interactive');
        brandChevron?.classList.add('hidden');
    }

    // Charger les modules de formation
    loadFormationModules();
});
