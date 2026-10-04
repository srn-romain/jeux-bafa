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
let showFormationStats = true;
let showFormationTags = true;
let isSimulatedStagiaireRole = false;

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
                visible: m.visible !== false,
                quizConfig: {
                    quizTitle: m.title,
                    maxAttempts: 0,
                    timerMinutes: 0,
                    timerSeconds: 0,
                    timerTotalSeconds: 0,
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
                            visible: m.visible !== false,
                            quizConfig: {
                                quizTitle: m.title,
                                maxAttempts: 0,
                                timerMinutes: 0,
                                timerSeconds: 0,
                                timerTotalSeconds: 0,
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
                visible: m.visible !== false,
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
        bgImage: moduleData.bgImage || '',
        description: moduleData.description || '',
        enabled: moduleData.enabled !== undefined ? moduleData.enabled : false,
        visible: moduleData.visible !== false,
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
            } else if (q.type === 'pinpoint') {
                qDoc.pinImage = q.pinImage || '';
                qDoc.targetX = (q.targetX !== undefined && q.targetX !== null) ? parseFloat(q.targetX) : 50;
                qDoc.targetY = (q.targetY !== undefined && q.targetY !== null) ? parseFloat(q.targetY) : 50;
                qDoc.radius = (q.radius !== undefined && q.radius !== null) ? parseFloat(q.radius) : 12;
                qDoc.targetLabel = q.targetLabel || '';
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

    // Blocage strict si stagiaire non relié à la promo active
    if (actualRole === 'stagiaire' && typeof isStagiairePromoMismatch === 'function' && isStagiairePromoMismatch(actualUserData, globalActivePromoId || window.globalFormationActivePromoId)) {
        if (typeof showFormationExpiredScreen === 'function') {
            showFormationExpiredScreen();
        }
        return;
    }

    if (loader) loader.classList.remove('hidden');
    if (grid) grid.classList.add('hidden');

    if (actualRole === 'admin') {
        adminControls?.classList.remove('hidden');
    } else {
        adminControls?.classList.add('hidden');
    }

    const effectiveRole = (actualRole === 'admin' && isSimulatedStagiaireRole) ? 'stagiaire' : actualRole;

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

        // Filtrage pour les stagiaires : masquer totalement les modules si visible === false
        const visibleModules = modules.filter(m => {
            const isVisible = m.visible !== false;
            if (effectiveRole === 'stagiaire' && !isVisible) {
                return false;
            }
            return true;
        });

        if (visibleModules.length === 0) {
            grid.innerHTML = `
                <div class="es-empty" style="grid-column: 1 / -1; padding: 40px 20px;">
                    <div class="es-empty__icon">📚</div>
                    <div class="es-empty__title">Aucun module disponible</div>
                    <p class="es-empty__text">Les modules de formation seront bientôt mis à disposition par votre formateur.</p>
                </div>
            `;
            if (grid) grid.classList.remove('hidden');
            return;
        }

        grid.innerHTML = visibleModules.map(m => {
            const isEnabled = m.enabled === true;
            const isVisible = m.visible !== false;
            const existingSub = stagiaireSubmissionsMap[m.id];
            const hasSubmitted = !!existingSub;
            const adminStats = adminCountsMap[m.id] || { totalAttempts: 0, uniqueStagiaires: 0 };
            const qConfig = m.quizConfig || {};
            const showResultsAtEnd = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
            const maxAttempts = parseInt(qConfig.maxAttempts, 10) || 0;
            const attemptsCount = existingSub?.attemptsCount || 0;
            const isAttemptsExceeded = (maxAttempts > 0 && attemptsCount >= maxAttempts);

            let cardClass = 'es-formation-card ';
            if (!isVisible && effectiveRole === 'admin') {
                cardClass += 'es-formation-card--invisible ';
            }
            if (hasSubmitted) {
                cardClass += 'es-formation-card--completed ';
            } else if (isEnabled || effectiveRole === 'admin') {
                cardClass += 'es-formation-card--active ';
            } else {
                cardClass += 'es-formation-card--locked ';
            }

            let bgStyle = '';
            if (m.bgImage) {
                cardClass += 'es-formation-card--has-bg ';
                bgStyle = `style="background-image: linear-gradient(to bottom, rgba(14, 24, 16, 0.50) 0%, rgba(14, 24, 16, 0.90) 100%), url('${escapeHtml(m.bgImage)}');"`;
            }

            let statsDisplay = '';
            if (adminStats.totalAttempts === 0) {
                statsDisplay = '0 réponse';
            } else if (adminStats.uniqueStagiaires === adminStats.totalAttempts) {
                statsDisplay = `${adminStats.totalAttempts} réponse${adminStats.totalAttempts > 1 ? 's' : ''}`;
            } else {
                statsDisplay = `${adminStats.totalAttempts} réponse${adminStats.totalAttempts > 1 ? 's' : ''} (${adminStats.uniqueStagiaires} stagiaire${adminStats.uniqueStagiaires > 1 ? 's' : ''})`;
            }

            const questionsCount = m.questionsCount || (m.questions ? m.questions.length : 0);

            // 1. Tag Masqué
            let hiddenTagHtml = '';
            if (!isVisible && effectiveRole === 'admin') {
                hiddenTagHtml = `<span class="es-formation-tag es-formation-tag--hidden-status es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="Module masqué pour les candidats"><i class="bi bi-eye-slash-fill"></i> Masqué</span>`;
            }

            // 2. Tag Nombre de Questions
            const questionsTagHtml = `<span class="es-formation-tag es-formation-tag--questions es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="Nombre de questions dans ce quiz"><i class="bi bi-patch-question"></i> ${questionsCount} question${questionsCount > 1 ? 's' : ''}</span>`;

            // 3. Tag Nombre de réponses et stagiaires (Admin)
            let statsTagHtml = '';
            if (effectiveRole === 'admin') {
                statsTagHtml = `<span class="es-formation-tag es-formation-tag--stats es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="${adminStats.uniqueStagiaires} stagiaire(s) distinct(s) — ${adminStats.totalAttempts} réponse(s) au total"><i class="bi bi-chat-left-text"></i> ${statsDisplay}</span>`;
            }

            // 4. Info Statut du Quiz (Disponible / Verrouillé / Répondu) placé dans l'en-tête
            let statusInfoHtml = '';
            if (hasSubmitted) {
                const scoreText = (showResultsAtEnd && existingSub.score) ? ` (${existingSub.score.correct}/${existingSub.score.total})` : '';
                statusInfoHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-check-circle"></i> Répondu${scoreText}</span>`;
            } else if (isEnabled) {
                statusInfoHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-play-fill"></i> Disponible</span>`;
            } else {
                statusInfoHtml = `<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-lock"></i> Verrouillé</span>`;
            }

            let actionBtn = '';
            if (effectiveRole === 'admin') {
                actionBtn = `
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:8px;">
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-admin-edit-module" data-module-id="${m.id}" title="Éditer le module et son quiz">
                        <i class="bi bi-pencil"></i> Modifier
                    </button>
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-admin-view-res" data-module-id="${m.id}">
                        <i class="bi bi-eye"></i> Réponses (${adminStats.totalAttempts})
                    </button>
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

            return `
            <div class="${cardClass}" ${bgStyle}>
                <div>
                    <div class="es-formation-header">
                        <div class="es-formation-icon-wrap">
                            <i class="bi ${m.icon || 'bi-journal-bookmark'}"></i>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${statusInfoHtml}
                            ${effectiveRole === 'admin' ? `
                                <button type="button" class="es-card-action-btn btn-admin-toggle-module-visibility" data-module-id="${m.id}" data-visible="${isVisible}" title="${isVisible ? 'Masquer pour les candidats' : 'Rendre visible pour les candidats'}" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#ffffff; border-radius:6px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
                                    <i class="bi bi-${isVisible ? 'eye' : 'eye-slash'}"></i>
                                </button>
                                <label class="es-switch" style="transform:scale(0.8); transform-origin:center right;" title="Activer / Verrouiller le module pour les candidats">
                                    <input type="checkbox" class="check-stagiaire-module-toggle" data-module-id="${m.id}" ${isEnabled ? 'checked' : ''}>
                                    <span class="es-slider"></span>
                                </label>
                            ` : ''}
                        </div>
                    </div>
                    <div class="es-formation-num">Module ${m.num < 10 ? '0' + m.num : m.num}</div>
                    <h3 class="es-formation-title" style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; margin-top:4px;">
                        <span>${escapeHtml(m.title)}</span>
                        ${hiddenTagHtml}
                        ${questionsTagHtml}
                        ${statsTagHtml}
                    </h3>
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

        grid.querySelectorAll('.btn-admin-toggle-module-visibility').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const moduleId = btn.getAttribute('data-module-id');
                const currentlyVisible = btn.getAttribute('data-visible') === 'true';
                const newVisible = !currentlyVisible;
                try {
                    await db.collection('formation').doc(moduleId).update({
                        visible: newVisible,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    const mod = currentFormationModulesList.find(m => m.id === moduleId);
                    if (mod) mod.visible = newVisible;
                    localStorage.setItem('offline_formation_modules', JSON.stringify(currentFormationModulesList));
                    showToast(newVisible ? "Module visible pour les stagiaires." : "Module masqué pour les stagiaires.", "info");
                    loadFormationModules();
                } catch (err) {
                    console.error("Toggle module visibility error:", err);
                    showToast("Erreur lors de la modification de la visibilité.", "error");
                }
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

        // Mettre à jour le bilan des stagiaires
        renderStagiaireBilan();

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
        document.getElementById('editModuleBgImage').value = moduleData.bgImage || '';
        updateModuleBgPreview(moduleData.bgImage || '');
        if (document.getElementById('editModuleVisible')) {
            document.getElementById('editModuleVisible').checked = (moduleData.visible !== false);
        }
        
        const qConfig = moduleData.quizConfig || {};
        document.getElementById('editQuizTitle').value = qConfig.quizTitle || moduleData.title || '';
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
        document.getElementById('editModuleBgImage').value = '';
        updateModuleBgPreview('');
        if (document.getElementById('editModuleVisible')) {
            document.getElementById('editModuleVisible').checked = true;
        }
        
        document.getElementById('editQuizTitle').value = '';
        document.getElementById('editMaxAttempts').value = 0;
        document.getElementById('editQuizTimerMinutes').value = 0;
        document.getElementById('editQuizTimerSeconds').value = 0;
        document.getElementById('editShowResultsAtEnd').checked = false;

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
    { icon: 'bi-check2-circle', label: 'Évaluation & Bilan', tags: 'bilan validation check grille reussite' },
    { icon: 'bi-water', label: 'Baignade & Piscine', tags: 'eau baignade piscine mer lac surveillant ssb noyade nager' },
    { icon: 'bi-backpack', label: 'Sac à dos & Randonnée', tags: 'sac rando bagages marche bivouac materiel trek' },
    { icon: 'bi-geo-alt', label: 'Lieu & Découverte', tags: 'lieu geographie visite excursion camp voyage repere' },
    { icon: 'bi-balloon', label: 'Fête & Anniversaire', tags: 'ballon fete boom kermesse anniversaire celebration joie' },
    { icon: 'bi-bicycle', label: 'Vélo & VTT', tags: 'velo vtt deux roues route casque balade piste cyclable' },
    { icon: 'bi-film', label: 'Cinéma & Vidéo', tags: 'cinema film video tournage projection pop corn ecran' },
    { icon: 'bi-controller', label: 'Jeux vidéo & Numérique', tags: 'jeux console manette gaming e-sport ecrans digital' },
    { icon: 'bi-magic', label: 'Magie & Imaginaire', tags: 'magie imaginaire conte sorcier illusion theatre univers' },
    { icon: 'bi-puzzle', label: 'Énigme & Escape Game', tags: 'enigme escape game puzzle recherche indice mystere' },
    { icon: 'bi-umbrella', label: 'Météo & Pluie', tags: 'pluie repli parapluie tempete meteo orage activites interieur' },
    { icon: 'bi-camera', label: 'Photo & Souvenirs', tags: 'photo appareil image reportage souvenirs album' },
    { icon: 'bi-award', label: 'Diplôme & Récompense', tags: 'recompense medaille trophee reussite badge' },
    { icon: 'bi-shield-shaded', label: 'Sécurité & Prévention', tags: 'securite vigilance regles alerte prevention secours psc1' }
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

async function compressImageToBase64(file, maxWidth = 1200, maxHeight = 900, quality = 0.82) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("Aucun fichier fourni."));
        if (!file.type.startsWith('image/')) return reject(new Error("Le fichier doit être une image."));

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = () => reject(new Error("Impossible de charger l'image."));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier."));
        reader.readAsDataURL(file);
    });
}

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
        } else if (q.type === 'pinpoint') {
            const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
            const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
            const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
            const sizeKB = q.pinImage ? Math.round((q.pinImage.length * 3 / 4) / 1024) : 0;
            const isHeavy = sizeKB > 550;

            if (q.pinImage) {
                typeBody = `
                <div class="es-pinpoint-builder-box">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="es-img-size-badge ${isHeavy ? 'es-img-size-badge--warning' : 'es-img-size-badge--ok'}">
                                <i class="bi bi-${isHeavy ? 'exclamation-triangle-fill' : 'check-circle-fill'}"></i>
                                Image ${sizeKB} Ko (Base64) ${isHeavy ? '⚠️ Assez lourde' : '✓ Optimisé Firestore'}
                            </span>
                            <span style="font-size:0.75rem; color:var(--clr-text-muted);">
                                Cible : <strong style="color:var(--clr-primary);">X: ${targetX.toFixed(1)}%, Y: ${targetY.toFixed(1)}%</strong>
                            </span>
                        </div>
                        <div style="display:flex; gap:6px;">
                            <label class="es-btn es-btn--ghost es-btn--sm" style="cursor:pointer; padding:3px 8px; font-size:0.75rem;">
                                <i class="bi bi-arrow-repeat"></i> Remplacer l'image
                                <input type="file" class="q-pinpoint-file-input hidden" data-q-idx="${qIdx}" accept="image/*">
                            </label>
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-pinpoint-img" data-q-idx="${qIdx}" style="color:var(--clr-danger); padding:3px 8px; font-size:0.75rem;">
                                <i class="bi bi-trash"></i> Supprimer
                            </button>
                        </div>
                    </div>

                    <div style="text-align:center;">
                        <div class="es-pinpoint-setter" data-q-idx="${qIdx}">
                            <img src="${escapeHtml(q.pinImage)}" alt="Image repère" class="es-pinpoint-img">
                            <div class="es-pinpoint-target-zone" id="pin_target_zone_${qIdx}" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; height:${radius * 2}%;"></div>
                            <div class="es-pinpoint-pin es-pinpoint-pin--admin" id="pin_marker_${qIdx}" style="left:${targetX}%; top:${targetY}%;">
                                <i class="bi bi-geo-alt-fill"></i>
                            </div>
                        </div>
                        <p style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:4px;">
                            👆 <strong>Cliquez sur l'image</strong> pour définir l'emplacement exact de la bonne réponse attendue.
                        </p>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:12px; padding-top:10px; border-top:1px dashed var(--clr-surface-3);">
                        <div>
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                <label style="font-size:0.78rem; font-weight:700; color:var(--clr-text);">Rayon de tolérance :</label>
                                <span style="font-size:0.8rem; font-weight:800; color:var(--clr-primary);" id="pin_radius_val_${qIdx}">±${radius}%</span>
                            </div>
                            <input type="range" class="es-input q-pinpoint-radius-slider" data-q-idx="${qIdx}" min="3" max="30" step="1" value="${radius}" style="padding:0;">
                            <div style="font-size:0.72rem; color:var(--clr-text-muted); margin-top:2px;">Marge acceptée autour du repère (zone verte).</div>
                        </div>
                        <div>
                            <label style="font-size:0.78rem; font-weight:700; color:var(--clr-text); margin-bottom:4px; display:block;">Description de la zone cible (optionnel) :</label>
                            <input type="text" class="es-input q-pinpoint-target-label" data-q-idx="${qIdx}" value="${escapeHtml(q.targetLabel || '')}" placeholder="Ex: Sortie de secours, Trousse secours..." style="font-size:0.82rem; padding:5px 8px;">
                        </div>
                    </div>
                </div>`;
            } else {
                typeBody = `
                <div class="es-pinpoint-builder-box">
                    <label class="es-pinpoint-dropzone" style="display:block;">
                        <input type="file" class="q-pinpoint-file-input hidden" data-q-idx="${qIdx}" accept="image/*">
                        <i class="bi bi-geo-alt-fill" style="font-size:2rem; color:var(--clr-primary); margin-bottom:6px; display:block;"></i>
                        <div style="font-weight:700; font-size:0.9rem; color:var(--clr-text);">Cliquez ou glissez une image / schéma ici</div>
                        <div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:4px;">
                            Compression automatique & encodage Base64 direct (aucun stockage Firebase requis).
                        </div>
                    </label>
                </div>`;
            }
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
                    <select class="es-input q-type-select" data-q-idx="${qIdx}" style="width:245px; font-size:0.8rem; padding:4px 8px;">
                        <option value="qcm" ${q.type === 'qcm' ? 'selected' : ''}>🔘 QCM (Choix multiple)</option>
                        <option value="pinpoint" ${q.type === 'pinpoint' ? 'selected' : ''}>📍 Placer un repère (Pin sur image)</option>
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
            
            ${q.type !== 'pinpoint' ? `
            <div style="margin-top:8px;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <i class="bi bi-image" style="color:var(--clr-primary); font-size:0.9rem;"></i>
                    <input type="url" class="es-input q-image-input" data-q-idx="${qIdx}" value="${escapeHtml(q.imageUrl || '')}" placeholder="URL d'une image ou schéma illustratif (ex: https://.../plan.png) - Optionnel" style="font-size:0.82rem; padding:5px 8px; flex:1;">
                </div>
                ${q.imageUrl ? `
                <div class="q-image-preview-box" style="margin-top:6px; background:#ffffff; padding:6px; border:1px solid var(--clr-surface-3); border-radius:6px; display:inline-block;">
                    <img src="${escapeHtml(q.imageUrl)}" alt="Aperçu" style="max-height:80px; max-width:180px; border-radius:4px; object-fit:contain; display:block;" onerror="this.parentElement.style.display='none'">
                </div>` : ''}
            </div>` : ''}

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
                } else if (newType === 'pinpoint') {
                    if (currentEditingQuestions[idx].targetX === undefined) currentEditingQuestions[idx].targetX = 50;
                    if (currentEditingQuestions[idx].targetY === undefined) currentEditingQuestions[idx].targetY = 50;
                    if (currentEditingQuestions[idx].radius === undefined) currentEditingQuestions[idx].radius = 12;
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

    // Pinpoint setter click
    container.querySelectorAll('.es-pinpoint-setter').forEach(setter => {
        setter.addEventListener('click', (e) => {
            const qIdx = parseInt(setter.getAttribute('data-q-idx'), 10);
            const rect = setter.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const xPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
            const yPercent = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

            if (currentEditingQuestions[qIdx]) {
                currentEditingQuestions[qIdx].targetX = parseFloat(xPercent.toFixed(1));
                currentEditingQuestions[qIdx].targetY = parseFloat(yPercent.toFixed(1));

                const marker = document.getElementById(`pin_marker_${qIdx}`);
                const zone = document.getElementById(`pin_target_zone_${qIdx}`);
                if (marker) {
                    marker.style.left = `${xPercent}%`;
                    marker.style.top = `${yPercent}%`;
                }
                if (zone) {
                    zone.style.left = `${xPercent}%`;
                    zone.style.top = `${yPercent}%`;
                }
            }
        });
    });

    // Pinpoint radius slider
    container.querySelectorAll('.q-pinpoint-radius-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const rad = parseFloat(e.target.value) || 12;
            if (currentEditingQuestions[qIdx]) {
                currentEditingQuestions[qIdx].radius = rad;
                const radiusValEl = document.getElementById(`pin_radius_val_${qIdx}`);
                if (radiusValEl) radiusValEl.textContent = `±${rad}%`;
                const zone = document.getElementById(`pin_target_zone_${qIdx}`);
                if (zone) {
                    zone.style.width = `${rad * 2}%`;
                    zone.style.height = `${rad * 2}%`;
                }
            }
        });
    });

    // Pinpoint target label
    container.querySelectorAll('.q-pinpoint-target-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[qIdx]) {
                currentEditingQuestions[qIdx].targetLabel = e.target.value.trim();
            }
        });
    });

    // Pinpoint file inputs (compression client-side Base64)
    container.querySelectorAll('.q-pinpoint-file-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const qIdx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > 10 * 1024 * 1024) {
                showToast("L'image est trop lourde (> 10 Mo). Choisissez une image plus légère.", "warning");
                return;
            }

            try {
                showToast("Compression et encodage Base64...", "info");
                const base64 = await compressImageToBase64(file);
                const sizeKB = Math.round((base64.length * 3 / 4) / 1024);
                if (sizeKB > 550) {
                    showToast(`Image encodée (${sizeKB} Ko). Attention, la taille reste un peu élevée.`, "warning");
                } else {
                    showToast(`Image optimisée et encodée (${sizeKB} Ko).`, "success");
                }

                if (currentEditingQuestions[qIdx]) {
                    currentEditingQuestions[qIdx].pinImage = base64;
                    if (currentEditingQuestions[qIdx].targetX === undefined) currentEditingQuestions[qIdx].targetX = 50;
                    if (currentEditingQuestions[qIdx].targetY === undefined) currentEditingQuestions[qIdx].targetY = 50;
                    if (currentEditingQuestions[qIdx].radius === undefined) currentEditingQuestions[qIdx].radius = 12;
                    renderQuestionsEditor();
                }
            } catch (err) {
                console.error("Pinpoint compression error:", err);
                showToast("Erreur lors de la compression de l'image.", "error");
            }
        });
    });

    // Pinpoint remove image
    container.querySelectorAll('.btn-remove-pinpoint-img').forEach(btn => {
        btn.addEventListener('click', () => {
            const qIdx = parseInt(btn.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[qIdx]) {
                delete currentEditingQuestions[qIdx].pinImage;
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
        } else if (q.type === 'pinpoint') {
            item.pinImage = q.pinImage;
            item.targetX = q.targetX !== undefined ? q.targetX : 50;
            item.targetY = q.targetY !== undefined ? q.targetY : 50;
            item.radius = q.radius !== undefined ? q.radius : 12;
            if (q.targetLabel) item.targetLabel = q.targetLabel;
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
            } else if (item.type === 'pinpoint' || item.type === 'pin' || item.type === 'image_pin' || item.type === 'repere') {
                type = 'pinpoint';
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
            } else if (type === 'pinpoint') {
                resQ.pinImage = item.pinImage || item.image || item.imageUrl || '';
                resQ.targetX = item.targetX !== undefined ? parseFloat(item.targetX) : 50;
                resQ.targetY = item.targetY !== undefined ? parseFloat(item.targetY) : 50;
                resQ.radius = item.radius !== undefined ? parseFloat(item.radius) : 12;
                if (item.targetLabel) resQ.targetLabel = String(item.targetLabel).trim();
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
    const bgImage = document.getElementById('editModuleBgImage').value.trim();
    const description = document.getElementById('editModuleDesc').value.trim();
    
    const quizTitle = document.getElementById('editQuizTitle').value.trim() || title;
    const maxAttempts = parseInt(document.getElementById('editMaxAttempts').value, 10) || 0;
    const timerMinutes = parseInt(document.getElementById('editQuizTimerMinutes').value, 10) || 0;
    const timerSeconds = parseInt(document.getElementById('editQuizTimerSeconds').value, 10) || 0;
    const timerTotalSeconds = (timerMinutes * 60) + timerSeconds;
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
        } else if (q.type === 'pinpoint') {
            if (!q.pinImage || !q.pinImage.trim()) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${i + 1} (Repère sur image) nécessite une image illustrative.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
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
        const isModVisible = document.getElementById('editModuleVisible') ? document.getElementById('editModuleVisible').checked : true;
        const modulePayload = {
            id: id,
            num: num,
            title: title,
            subtitle: subtitle,
            icon: icon,
            bgImage: bgImage,
            description: description,
            enabled: existingMod ? (existingMod.enabled === true) : false,
            visible: isModVisible,
            quizConfig: {
                quizTitle: quizTitle,
                maxAttempts: maxAttempts,
                timerMinutes: timerMinutes,
                timerSeconds: timerSeconds,
                timerTotalSeconds: timerTotalSeconds,
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

function updateModuleBgPreview(url) {
    const wrap = document.getElementById('moduleBgPreviewWrap');
    if (!wrap) return;
    if (url) {
        wrap.style.backgroundImage = `url('${url}')`;
        wrap.classList.remove('hidden');
    } else {
        wrap.style.backgroundImage = 'none';
        wrap.classList.add('hidden');
    }
}

// ----------------------------------------------------------------
// BANQUE D'IMAGES PAR CATÉGORIE (Rotation au clic)
// ----------------------------------------------------------------
const BG_IMAGE_PRESETS = {
    foret: [
        "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1511497584788-87676104235f?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1425913397330-cf8af2ff40a1?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=80"
    ],
    feu: [
        "https://images.unsplash.com/photo-1508873696983-2df5293cb395?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1470246973918-29a93221c455?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1496545672447-f699b503d270?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1475483768296-6163e08872a1?w=800&auto=format&fit=crop&q=80"
    ],
    creativite: [
        "https://images.unsplash.com/photo-1472162072942-cd5147eb3902?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1501612780327-45045538702b?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1456086272160-b28b0645b729?w=800&auto=format&fit=crop&q=80"
    ],
    equipe: [
        "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1485546246426-74dc88dec4d9?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1526976668912-1a811878dd37?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?w=800&auto=format&fit=crop&q=80"
    ],
    montagne: [
        "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800&auto=format&fit=crop&q=80"
    ],
    plage: [
        "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800&auto=format&fit=crop&q=80"
    ],
    nuit: [
        "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=800&auto=format&fit=crop&q=80"
    ]
};

const bgPresetCategoryIndices = {};

document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-bg-preset');
    if (!btn) return;
    e.preventDefault();

    const cat = btn.getAttribute('data-category') || 'foret';
    let list = BG_IMAGE_PRESETS[cat];
    if (!list || list.length === 0) {
        const fallbackUrl = btn.getAttribute('data-url');
        if (fallbackUrl) list = [fallbackUrl];
    }
    if (!list || list.length === 0) {
        list = BG_IMAGE_PRESETS.foret || [];
    }
    if (!list || list.length === 0) return;

    const currentIdx = bgPresetCategoryIndices[cat] !== undefined ? bgPresetCategoryIndices[cat] : -1;
    const nextIdx = (currentIdx + 1) % list.length;
    bgPresetCategoryIndices[cat] = nextIdx;

    const nextUrl = list[nextIdx];
    const input = document.getElementById('editModuleBgImage');
    if (input) {
        input.value = nextUrl;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    updateModuleBgPreview(nextUrl);

    btn.style.transition = 'transform 0.15s ease';
    btn.style.transform = 'scale(0.92)';
    setTimeout(() => { btn.style.transform = ''; }, 150);
});

document.getElementById('editModuleBgImage')?.addEventListener('input', (e) => {
    updateModuleBgPreview(e.target.value.trim());
});

document.getElementById('btnRemoveModuleBg')?.addEventListener('click', () => {
    const input = document.getElementById('editModuleBgImage');
    if (input) input.value = '';
    updateModuleBgPreview('');
});

document.getElementById('inputModuleBgFile')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
        showToast("L'image ne doit pas dépasser 5 Mo.", "warning");
        return;
    }
    const reader = new FileReader();
    reader.onload = (re) => {
        const base64 = re.target.result;
        const input = document.getElementById('editModuleBgImage');
        if (input) input.value = base64;
        updateModuleBgPreview(base64);
    };
    reader.readAsDataURL(file);
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

// ----------------------------------------------------------------
// GESTION DES TOGGLES FORMATION (TAGS, RÔLE SIMULÉ)
// ----------------------------------------------------------------
function initFormationGlobalSettingsListener() {
    try {
        const cached = localStorage.getItem('offline_formation_settings');
        if (cached) {
            const data = JSON.parse(cached);
            if (data.showFormationTags !== undefined) showFormationTags = data.showFormationTags;
        }
    } catch (e) {}

    const toggleTags = document.getElementById('checkShowFormationTags');
    if (toggleTags) toggleTags.checked = showFormationTags;

    const toggleRole = document.getElementById('checkFormationRoleToggle');
    if (toggleRole) toggleRole.checked = isSimulatedStagiaireRole;

    try {
        if (window.formationSettingsUnsub) {
            window.formationSettingsUnsub();
        }
        window.formationSettingsUnsub = db.collection('globalSettings').doc('formation').onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                if (data.showFormationTags !== undefined) showFormationTags = data.showFormationTags;
                if (data.activePromoId !== undefined) {
                    globalActivePromoId = data.activePromoId;
                }
                if (data.activePromoNom !== undefined) {
                    globalActivePromoNom = data.activePromoNom;
                }
                if (data.activePromoEmoji !== undefined) {
                    globalActivePromoEmoji = data.activePromoEmoji;
                }
                globalActivePromoData = {
                    id: data.activePromoId || '',
                    nom: data.activePromoNom || '',
                    emoji: data.activePromoEmoji || '🎓',
                    organisme: data.activePromoOrganisme || '',
                    lieu: data.activePromoLieu || '',
                    ville: data.activePromoVille || '',
                    dateDebut: data.activePromoDateDebut || '',
                    dateFin: data.activePromoDateFin || '',
                    nbParticipants: data.activePromoNbParticipants || '',
                    directeur: data.activePromoDirecteur || '',
                    stageType: data.activePromoStageType || ''
                };
                localStorage.setItem('offline_formation_settings', JSON.stringify(data));
                updatePromoHeaderUI();
            }

            const tTags = document.getElementById('checkShowFormationTags');
            if (tTags) tTags.checked = showFormationTags;

            document.querySelectorAll('.es-formation-card__badge-tag').forEach(el => {
                el.classList.toggle('es-tags--hidden', !showFormationTags);
            });
        });
    } catch (listenerErr) {
        console.warn("Formation settings listener err:", listenerErr);
    }
}

document.getElementById('checkShowFormationTags')?.addEventListener('change', async (e) => {
    const val = e.target.checked;
    showFormationTags = val;
    document.querySelectorAll('.es-formation-card__badge-tag').forEach(el => {
        el.classList.toggle('es-tags--hidden', !val);
    });
    try {
        await db.collection('globalSettings').doc('formation').set({
            showFormationTags: val,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        showToast("Visibilité des tags mise à jour.", "success");
    } catch (err) {
        console.error("Save formation tags settings err:", err);
        showToast("Erreur lors de la modification.", "error");
    }
});

document.getElementById('checkFormationRoleToggle')?.addEventListener('change', (e) => {
    isSimulatedStagiaireRole = e.target.checked;
    showToast(isSimulatedStagiaireRole ? "Simulation : Vue Stagiaire activée." : "Vue Formateur / Admin restaurée.", "info");
    updatePromoHeaderUI();
    loadFormationModules();
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
                } else if (q.type === 'pinpoint') {
                    const userCoords = (ans && typeof ans === 'object') ? ans : (ans ? (typeof ans === 'string' ? (()=>{ try { return JSON.parse(ans); } catch(e){ return null; } })() : null) : null);
                    const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                    const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                    const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;

                    let isCorrect = false;
                    if (userCoords && userCoords.x !== undefined && userCoords.y !== undefined) {
                        const dx = userCoords.x - targetX;
                        const dy = userCoords.y - targetY;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        isCorrect = dist <= radius;
                    }

                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:6px; font-size:0.88rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                            <div>
                                <strong>Repère placé par le stagiaire :</strong> 
                                ${userCoords ? `X: ${userCoords.x.toFixed(1)}%, Y: ${userCoords.y.toFixed(1)}%` : '<span style="color:var(--clr-danger)">Pas de repère placé</span>'}
                            </div>
                            <span style="font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                                ${isCorrect ? '✅ Cible atteinte (+1 pt)' : '❌ Hors cible attendue'}
                            </span>
                        </div>
                        ${q.pinImage ? `
                        <div style="text-align:center; background:#181c19; padding:8px; border-radius:6px; margin-top:6px;">
                            <div class="es-pinpoint-result-zone" style="max-width:480px; margin:0 auto;">
                                <img src="${escapeHtml(q.pinImage)}" alt="Résultat repère" class="es-pinpoint-result-img">
                                <div class="es-pinpoint-target-zone es-pinpoint-target-zone--result" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; height:${radius * 2}%;" title="Zone attendue (±${radius}%)"></div>
                                <div class="es-pinpoint-pin es-pinpoint-pin--admin" style="left:${targetX}%; top:${targetY}%;" title="Cible attendue"><i class="bi bi-bullseye" style="font-size:22px; color:#2ecc71;"></i></div>
                                ${userCoords ? `
                                <div class="es-pinpoint-pin ${isCorrect ? 'es-pinpoint-pin--correct' : 'es-pinpoint-pin--incorrect'}" style="left:${userCoords.x}%; top:${userCoords.y}%;" title="Point stagiaire"><i class="bi bi-geo-alt-fill"></i></div>
                                ` : ''}
                            </div>
                            <div style="font-size:0.75rem; color:#ffffff; margin-top:6px; opacity:0.85;">
                                🎯 Cible attendue (vert) : X=${targetX.toFixed(1)}%, Y=${targetY.toFixed(1)}% (±${radius}%) ${q.targetLabel ? `— <em>${escapeHtml(q.targetLabel)}</em>` : ''}
                            </div>
                        </div>
                        ` : ''}
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

                    ansDisplay = `
                    <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.88rem;">
                        <div><strong>Valeur choisie :</strong> <span style="font-weight:700; color:var(--clr-primary);">${val !== null ? `${val} ${escapeHtml(unit)}` : '<span style="color:var(--clr-danger)">Pas de réponse</span>'}</span>
                            ${targetBadge}
                        </div>
                    </div>`;
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
                if (q.type === 'pinpoint') typeLabel = '📍 Repère sur image';
                else if (q.type === 'range') typeLabel = 'Curseur horizontal';
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

// ================================================================
// GESTION DU BILAN STAGIAIRE / CANDIDAT
// ================================================================
let currentFormationTab = 'modules'; // 'modules' | 'bilan'
let currentBilanFilter = 'all'; // 'all' | 'completed' | 'pending'

function initBilanTabs() {
    const tabModules = document.getElementById('tabFormationModules');
    const tabBilan = document.getElementById('tabFormationBilan');
    const btnRefresh = document.getElementById('btnRefreshBilan');
    const filterBtns = document.querySelectorAll('#bilanFilterButtons .es-bilan-filter-btn');

    tabModules?.addEventListener('click', () => switchFormationTab('modules'));
    tabBilan?.addEventListener('click', () => switchFormationTab('bilan'));

    btnRefresh?.addEventListener('click', async () => {
        showToast("Actualisation du bilan...", "info", 1500);
        await loadFormationModules();
        renderStagiaireBilan();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentBilanFilter = btn.getAttribute('data-filter') || 'all';
            renderStagiaireBilan();
        });
    });

    // Support de hash URL e.g. #bilan ou paramètre ?tab=bilan
    if (window.location.hash === '#bilan' || new URLSearchParams(window.location.search).get('tab') === 'bilan') {
        switchFormationTab('bilan');
    }
}

function switchFormationTab(tabName) {
    currentFormationTab = tabName;
    const tabModules = document.getElementById('tabFormationModules');
    const tabBilan = document.getElementById('tabFormationBilan');
    const viewModules = document.getElementById('viewFormationModules');
    const viewBilan = document.getElementById('viewFormationBilan');

    if (tabName === 'bilan') {
        tabModules?.classList.remove('active');
        tabModules?.setAttribute('aria-selected', 'false');
        tabBilan?.classList.add('active');
        tabBilan?.setAttribute('aria-selected', 'true');
        viewModules?.classList.add('hidden');
        viewBilan?.classList.remove('hidden');
        renderStagiaireBilan();
    } else {
        tabBilan?.classList.remove('active');
        tabBilan?.setAttribute('aria-selected', 'false');
        tabModules?.classList.add('active');
        tabModules?.setAttribute('aria-selected', 'true');
        viewBilan?.classList.add('hidden');
        viewModules?.classList.remove('hidden');
    }
}

// Variables globales pour le Bilan Admin
let adminAllCandidatesList = [];
let adminAllSubmissionsByModule = {}; // { moduleId: [subs] }
let adminAllSubmissionsByUser = {}; // { userId: { [moduleId]: sub, allSubs: [] } }
let adminCandidateFilter = 'all'; // 'all' | 'active' | 'inactive'
let adminBilanSubtab = 'candidates'; // 'candidates' | 'analytics'
let adminAnalyticsModuleId = null;

function renderStagiaireBilan() {
    const effectiveRole = (actualRole === 'admin' && isSimulatedStagiaireRole) ? 'stagiaire' : actualRole;
    const stagiaireContainer = document.getElementById('bilanStagiaireContainer');
    const adminContainer = document.getElementById('bilanAdminContainer');

    if (effectiveRole === 'admin') {
        if (stagiaireContainer) stagiaireContainer.classList.add('hidden');
        if (adminContainer) adminContainer.classList.remove('hidden');
        renderAdminBilan();
        return;
    }

    if (stagiaireContainer) stagiaireContainer.classList.remove('hidden');
    if (adminContainer) adminContainer.classList.add('hidden');

    const listContainer = document.getElementById('bilanModulesList');
    if (!listContainer) return;

    const modules = (currentFormationModulesList || []).filter(m => m.visible !== false);
    const totalModules = modules.length;

    let completedCount = 0;
    let totalAttemptsCount = 0;
    let latestSubmission = null;
    let scoredSubmissions = [];

    modules.forEach(m => {
        const sub = stagiaireSubmissionsMap[m.id];
        if (sub) {
            completedCount++;
            totalAttemptsCount += (sub.attemptsCount || 1);

            // Vérifier si le score est autorisé à être vu par l'admin
            const qConfig = m.quizConfig || {};
            const showResultsAtEnd = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
            if (showResultsAtEnd && sub.score && sub.score.percent !== undefined) {
                scoredSubmissions.push({
                    moduleId: m.id,
                    score: sub.score
                });
            }

            if (!latestSubmission) {
                latestSubmission = sub;
            } else {
                const curT = sub.submittedAt?.toMillis ? sub.submittedAt.toMillis() : (sub.submittedAt?.seconds ? sub.submittedAt.seconds * 1000 : (sub.submittedAt ? new Date(sub.submittedAt).getTime() : 0));
                const prevT = latestSubmission.submittedAt?.toMillis ? latestSubmission.submittedAt.toMillis() : (latestSubmission.submittedAt?.seconds ? latestSubmission.submittedAt.seconds * 1000 : (latestSubmission.submittedAt ? new Date(latestSubmission.submittedAt).getTime() : 0));
                if (curT > prevT) latestSubmission = sub;
            }
        }
    });

    const pendingCount = Math.max(0, totalModules - completedCount);

    // 1. KPI Progression
    const kpiProgVal = document.getElementById('bilanKpiProgressVal');
    const kpiProgSub = document.getElementById('bilanKpiProgressSub');
    if (kpiProgVal) kpiProgVal.textContent = `${completedCount} / ${totalModules}`;
    if (kpiProgSub) {
        const progPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;
        kpiProgSub.textContent = `${progPct}% des modules validés`;
    }

    // 2. KPI Score Global
    const kpiScoreVal = document.getElementById('bilanKpiScoreVal');
    const kpiScoreSub = document.getElementById('bilanKpiScoreSub');
    if (kpiScoreVal && kpiScoreSub) {
        if (scoredSubmissions.length > 0) {
            const avgPct = Math.round(scoredSubmissions.reduce((sum, item) => sum + item.score.percent, 0) / scoredSubmissions.length);
            kpiScoreVal.textContent = `${avgPct}%`;
            kpiScoreSub.textContent = `Moyenne sur ${scoredSubmissions.length} quiz noté${scoredSubmissions.length > 1 ? 's' : ''}`;
        } else if (completedCount > 0) {
            // Tous les modules complétés ont les résultats masqués par le formateur
            kpiScoreVal.innerHTML = `<span style="font-size:1.3rem; color:var(--clr-primary); font-weight:800;"><i class="bi bi-shield-check"></i> Transmis</span>`;
            kpiScoreSub.textContent = `En attente formateur (résultats non diffusés en direct)`;
        } else {
            kpiScoreVal.textContent = `--%`;
            kpiScoreSub.textContent = `Aucun quiz validé pour le moment`;
        }
    }

    // 3. KPI Tentatives
    const kpiAttemptsVal = document.getElementById('bilanKpiAttemptsVal');
    const kpiAttemptsSub = document.getElementById('bilanKpiAttemptsSub');
    if (kpiAttemptsVal) kpiAttemptsVal.textContent = `${totalAttemptsCount}`;
    if (kpiAttemptsSub) {
        kpiAttemptsSub.textContent = latestSubmission ? `Dernière épreuve : ${formatFullDate(latestSubmission.submittedAt)}` : `Dernière épreuve : Aucune`;
    }

    // Badges & Filtres
    const fAll = document.getElementById('bilanFilterCountAll');
    const fComp = document.getElementById('bilanFilterCountCompleted');
    const fPend = document.getElementById('bilanFilterCountPending');
    const badgeTab = document.getElementById('badgeBilanCompleted');
    if (fAll) fAll.textContent = totalModules;
    if (fComp) fComp.textContent = completedCount;
    if (fPend) fPend.textContent = pendingCount;
    if (badgeTab) {
        badgeTab.textContent = completedCount;
        badgeTab.classList.toggle('hidden', completedCount === 0);
    }

    // Filtrer les modules à afficher
    const filteredModules = modules.filter(m => {
        const hasSub = !!stagiaireSubmissionsMap[m.id];
        if (currentBilanFilter === 'completed') return hasSub;
        if (currentBilanFilter === 'pending') return !hasSub;
        return true;
    });

    if (filteredModules.length === 0) {
        listContainer.innerHTML = `
            <div class="es-empty" style="padding: 36px 20px;">
                <div class="es-empty__icon">📑</div>
                <div class="es-empty__title">Aucun module dans cette catégorie</div>
                <p class="es-empty__text">${currentBilanFilter === 'completed' ? "Vous n'avez pas encore validé de quiz pour le moment." : "Tous les modules de cette catégorie ont été complétés !"}</p>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filteredModules.map(m => {
        const sub = stagiaireSubmissionsMap[m.id];
        const isCompleted = !!sub;
        const qConfig = m.quizConfig || {};
        const showResultsAtEnd = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
        const cardClass = isCompleted ? 'es-bilan-card es-bilan-card--completed' : 'es-bilan-card es-bilan-card--pending';

        let statusBadgeHtml = '';
        let actionBtnHtml = '';

        if (isCompleted) {
            if (showResultsAtEnd) {
                const percent = sub.score?.percent ?? 100;
                statusBadgeHtml = `
                    <span class="es-bilan-badge-score">
                        <i class="bi bi-award-fill"></i> Score : ${percent}% (${sub.score?.correct || 0}/${sub.score?.total || 0} QCM)
                    </span>
                `;
                actionBtnHtml = `
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-toggle-bilan-accordion" data-module-id="${m.id}">
                        <i class="bi bi-card-checklist"></i> <span class="accordion-text">Consulter mes réponses &amp; corrigé</span> <i class="bi bi-chevron-down accordion-arrow" style="font-size:11px; margin-left:4px; transition:transform 0.2s ease;"></i>
                    </button>
                `;
            } else {
                statusBadgeHtml = `
                    <span class="es-bilan-badge-transmitted">
                        <i class="bi bi-shield-check"></i> Réponses transmises au formateur
                    </span>
                `;
                actionBtnHtml = `
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-toggle-bilan-accordion" data-module-id="${m.id}">
                        <i class="bi bi-eye"></i> <span class="accordion-text">Consulter ma copie transmise</span> <i class="bi bi-chevron-down accordion-arrow" style="font-size:11px; margin-left:4px; transition:transform 0.2s ease;"></i>
                    </button>
                `;
            }

            if (m.enabled) {
                actionBtnHtml += `
                    <a href="quiz.html?module=${encodeURIComponent(m.id)}" class="es-btn es-btn--ghost es-btn--sm" title="Repasser ce quiz">
                        <i class="bi bi-arrow-repeat"></i> Repasser
                    </a>
                `;
            }
        } else {
            statusBadgeHtml = `
                <span class="es-badge es-badge--pending" style="font-size:0.78rem;">
                    <i class="bi bi-hourglass"></i> Non commencé
                </span>
            `;
            if (m.enabled) {
                actionBtnHtml = `
                    <a href="quiz.html?module=${encodeURIComponent(m.id)}" class="es-btn es-btn--primary es-btn--sm">
                        <i class="bi bi-play-fill"></i> Faire le quiz
                    </a>
                `;
            } else {
                actionBtnHtml = `
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm" disabled style="opacity:0.5; cursor:not-allowed;">
                        <i class="bi bi-lock"></i> Verrouillé
                    </button>
                `;
            }
        }

        const dateMeta = isCompleted ? `
            <div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:4px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span><i class="bi bi-calendar3"></i> ${formatFullDate(sub.submittedAt)}</span>
                <span>•</span>
                <span>Tentative #${sub.attemptNumber || 1}</span>
                ${sub.timeExpired ? '<span class="es-badge es-badge--danger" style="font-size:0.7rem; padding:1px 6px;">⏰ Temps écoulé</span>' : ''}
            </div>
        ` : '';

        return `
        <div class="${cardClass}" id="bilanCard_${m.id}">
            <div class="es-bilan-card__header">
                <div class="es-bilan-card__info">
                    <div class="es-bilan-card__icon">
                        <i class="bi ${m.icon || 'bi-journal-bookmark'}"></i>
                    </div>
                    <div class="es-bilan-card__meta">
                        <div class="es-bilan-card__num">Module ${m.num < 10 ? '0' + m.num : m.num}</div>
                        <h3 class="es-bilan-card__title">${escapeHtml(m.title)}</h3>
                        ${m.subtitle ? `<div class="es-bilan-card__subtitle">${escapeHtml(m.subtitle)}</div>` : ''}
                        ${dateMeta}
                    </div>
                </div>
                <div class="es-bilan-card__actions">
                    ${statusBadgeHtml}
                    ${actionBtnHtml}
                </div>
            </div>
            <!-- Accordéon détaillé de questions & réponses -->
            <div class="es-bilan-card__accordion hidden" id="bilanAccordion_${m.id}">
                <div class="es-loader" style="padding: 24px 0;">
                    <div class="es-spinner"></div>
                    <span>Chargement des questions &amp; réponses…</span>
                </div>
            </div>
        </div>`;
    }).join('');

    // Listeners pour les accordéons
    listContainer.querySelectorAll('.btn-toggle-bilan-accordion').forEach(btn => {
        btn.addEventListener('click', async () => {
            const moduleId = btn.getAttribute('data-module-id');
            await toggleBilanModuleAccordion(moduleId, btn);
        });
    });
}

// ================================================================
// BILAN FORMATEUR / ADMIN : CANDIDATS & ANALYTIQUES
// ================================================================
let adminBilanInitialized = false;

async function renderAdminBilan() {
    if (!adminBilanInitialized) {
        initAdminBilanControls();
        adminBilanInitialized = true;
    }

    await loadAdminBilanData();
    renderAdminCandidatesTable();
    setupAdminAnalyticsDropdown();
}

function initAdminBilanControls() {
    const btnCandidates = document.getElementById('btnAdminSubtabCandidates');
    const btnAnalytics = document.getElementById('btnAdminSubtabAnalytics');
    const viewCandidates = document.getElementById('adminBilanCandidatesView');
    const viewAnalytics = document.getElementById('adminBilanAnalyticsView');
    const searchInput = document.getElementById('adminCandidateSearch');
    const filterBtns = document.querySelectorAll('[data-admin-candidate-filter]');
    const btnRefresh = document.getElementById('btnAdminRefreshCandidates');
    const moduleSelect = document.getElementById('adminAnalyticsModuleSelect');

    btnCandidates?.addEventListener('click', () => {
        adminBilanSubtab = 'candidates';
        btnCandidates.classList.add('active');
        btnAnalytics?.classList.remove('active');
        viewCandidates?.classList.remove('hidden');
        viewAnalytics?.classList.add('hidden');
    });

    btnAnalytics?.addEventListener('click', () => {
        adminBilanSubtab = 'analytics';
        btnAnalytics.classList.add('active');
        btnCandidates?.classList.remove('active');
        viewAnalytics?.classList.remove('hidden');
        viewCandidates?.classList.add('hidden');
        if (adminAnalyticsModuleId) {
            renderAdminModuleAnalytics(adminAnalyticsModuleId);
        }
    });

    searchInput?.addEventListener('input', () => {
        renderAdminCandidatesTable();
    });

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            adminCandidateFilter = btn.getAttribute('data-admin-candidate-filter') || 'all';
            renderAdminCandidatesTable();
        });
    });

    btnRefresh?.addEventListener('click', async () => {
        showToast("Actualisation des données candidats...", "info", 1500);
        await loadAdminBilanData();
        renderAdminCandidatesTable();
        if (adminAnalyticsModuleId) {
            renderAdminModuleAnalytics(adminAnalyticsModuleId);
        }
    });

    moduleSelect?.addEventListener('change', (e) => {
        adminAnalyticsModuleId = e.target.value;
        renderAdminModuleAnalytics(adminAnalyticsModuleId);
    });

    // Modale inspection candidat
    document.getElementById('btnCloseAdminCandidateModal')?.addEventListener('click', () => closeModal('overlayAdminCandidateBilan'));
    document.getElementById('btnCloseAdminCandidateModal2')?.addEventListener('click', () => closeModal('overlayAdminCandidateBilan'));
}

async function loadAdminBilanData() {
    try {
        // 1. Récupérer tous les candidats / utilisateurs
        const usersSnap = await db.collection('users').get();
        if (!usersSnap.empty) {
            adminAllCandidatesList = usersSnap.docs
                .map(d => ({ uid: d.id, ...d.data() }))
                .filter(u => u.role === 'stagiaire' || !u.role);
            
            // Tri par nom ou date de création
            adminAllCandidatesList.sort((a, b) => {
                const nameA = (a.displayName || `${a.firstName || ''} ${a.lastName || ''}`).toLowerCase();
                const nameB = (b.displayName || `${b.firstName || ''} ${b.lastName || ''}`).toLowerCase();
                return nameA.localeCompare(nameB);
            });
        } else {
            adminAllCandidatesList = [];
        }

        // 2. Récupérer toutes les soumissions de tous les modules
        adminAllSubmissionsByModule = {};
        adminAllSubmissionsByUser = {};
        const modules = currentFormationModulesList || [];

        await Promise.all(modules.map(async (m) => {
            try {
                const subSnap = await db.collection('formation').doc(m.id).collection('submissions').get();
                const subs = subSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                adminAllSubmissionsByModule[m.id] = subs;

                subs.forEach(sub => {
                    const uid = sub.userId;
                    if (!uid) return;
                    if (!adminAllSubmissionsByUser[uid]) {
                        adminAllSubmissionsByUser[uid] = {
                            modulesMap: {},
                            allSubs: []
                        };
                    }
                    adminAllSubmissionsByUser[uid].allSubs.push(sub);

                    const existing = adminAllSubmissionsByUser[uid].modulesMap[m.id];
                    if (!existing) {
                        adminAllSubmissionsByUser[uid].modulesMap[m.id] = sub;
                    } else {
                        const curT = sub.submittedAt?.toMillis ? sub.submittedAt.toMillis() : (sub.submittedAt?.seconds ? sub.submittedAt.seconds * 1000 : 0);
                        const prevT = existing.submittedAt?.toMillis ? existing.submittedAt.toMillis() : (existing.submittedAt?.seconds ? existing.submittedAt.seconds * 1000 : 0);
                        if (curT > prevT) {
                            adminAllSubmissionsByUser[uid].modulesMap[m.id] = sub;
                        }
                    }
                });
            } catch (err) {
                console.warn(`Admin bilan submissions error for module ${m.id}:`, err);
            }
        }));

        // 3. Calcul des KPIs Globaux Promotion
        const totalCandidates = adminAllCandidatesList.length;
        const totalModules = modules.length;
        let activeCandidatesCount = 0;
        let totalSubmissionsCount = 0;
        let totalCompletionRatesSum = 0;
        let allScoresPromo = [];

        adminAllCandidatesList.forEach(cand => {
            const userData = adminAllSubmissionsByUser[cand.uid];
            const candModulesMap = userData?.modulesMap || {};
            const completedCount = Object.keys(candModulesMap).length;
            const subsList = userData?.allSubs || [];

            if (completedCount > 0) {
                activeCandidatesCount++;
                totalSubmissionsCount += subsList.length;
            }

            const completionRate = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;
            totalCompletionRatesSum += completionRate;

            Object.values(candModulesMap).forEach(sub => {
                if (sub.score && typeof sub.score.percent === 'number') {
                    allScoresPromo.push(sub.score.percent);
                }
            });
        });

        const avgCompletion = totalCandidates > 0 ? Math.round(totalCompletionRatesSum / totalCandidates) : 0;
        const avgScorePromo = allScoresPromo.length > 0 ? Math.round(allScoresPromo.reduce((a, b) => a + b, 0) / allScoresPromo.length) : null;

        // Mise à jour de l'affichage des KPIs
        const kpiTotalCand = document.getElementById('adminKpiTotalCandidates');
        const kpiActiveCand = document.getElementById('adminKpiActiveCandidates');
        const kpiAvgScore = document.getElementById('adminKpiAvgScore');
        const kpiAvgScoreSub = document.getElementById('adminKpiAvgScoreSub');
        const kpiTotalSubs = document.getElementById('adminKpiTotalSubmissions');
        const kpiAvgCompletion = document.getElementById('adminKpiAvgCompletion');

        if (kpiTotalCand) kpiTotalCand.textContent = totalCandidates;
        if (kpiActiveCand) kpiActiveCand.textContent = `${activeCandidatesCount} candidat${activeCandidatesCount > 1 ? 's' : ''} actif${activeCandidatesCount > 1 ? 's' : ''}`;
        if (kpiAvgScore) kpiAvgScore.textContent = avgScorePromo !== null ? `${avgScorePromo}%` : '--%';
        if (kpiAvgScoreSub) kpiAvgScoreSub.textContent = allScoresPromo.length > 0 ? `Sur ${allScoresPromo.length} copies notées` : 'Aucune note disponible';
        if (kpiTotalSubs) kpiTotalSubs.textContent = totalSubmissionsCount;
        if (kpiAvgCompletion) kpiAvgCompletion.textContent = `${avgCompletion}% de complétion moyenne`;

        // Mise à jour des compteurs filtres
        const cAll = document.getElementById('adminCandidateCountAll');
        const cAct = document.getElementById('adminCandidateCountActive');
        const cInact = document.getElementById('adminCandidateCountInactive');
        if (cAll) cAll.textContent = totalCandidates;
        if (cAct) cAct.textContent = activeCandidatesCount;
        if (cInact) cInact.textContent = Math.max(0, totalCandidates - activeCandidatesCount);

    } catch (err) {
        console.error("loadAdminBilanData error:", err);
    }
}

function renderAdminCandidatesTable() {
    const tbody = document.getElementById('adminCandidatesTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('adminCandidateSearch')?.value || '').toLowerCase().trim();
    const totalModules = (currentFormationModulesList || []).length;

    const filteredCandidates = adminAllCandidatesList.filter(cand => {
        const candData = adminAllSubmissionsByUser[cand.uid];
        const completedCount = Object.keys(candData?.modulesMap || {}).length;
        const isActive = completedCount > 0;

        if (adminCandidateFilter === 'active' && !isActive) return false;
        if (adminCandidateFilter === 'inactive' && isActive) return false;

        if (searchTerm) {
            const name = (cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`).toLowerCase();
            const email = (cand.email || '').toLowerCase();
            if (!name.includes(searchTerm) && !email.includes(searchTerm)) {
                return false;
            }
        }
        return true;
    });

    if (filteredCandidates.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align:center; padding:36px 16px; color:var(--clr-text-muted);">
                    <div style="font-size:1.8rem; margin-bottom:8px;">🔍</div>
                    <div style="font-weight:700;">Aucun candidat ne correspond aux critères</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = filteredCandidates.map(cand => {
        const candData = adminAllSubmissionsByUser[cand.uid];
        const candModulesMap = candData?.modulesMap || {};
        const allSubs = candData?.allSubs || [];
        const completedCount = Object.keys(candModulesMap).length;
        const completionPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

        // Calcul score moyen candidat
        const candScores = [];
        Object.values(candModulesMap).forEach(sub => {
            if (sub.score && typeof sub.score.percent === 'number') {
                candScores.push(sub.score.percent);
            }
        });
        const avgScore = candScores.length > 0 ? Math.round(candScores.reduce((a, b) => a + b, 0) / candScores.length) : null;

        let scoreBadge = '<span style="color:var(--clr-text-muted); font-size:0.85rem;">—</span>';
        if (avgScore !== null) {
            let scoreBg = 'rgba(46, 204, 113, 0.14)';
            let scoreColor = '#27ae60';
            if (avgScore < 50) {
                scoreBg = 'rgba(231, 76, 60, 0.14)';
                scoreColor = '#e74c3c';
            } else if (avgScore < 75) {
                scoreBg = 'rgba(243, 156, 18, 0.14)';
                scoreColor = '#d35400';
            }
            scoreBadge = `<span style="display:inline-block; padding:3px 10px; border-radius:12px; font-weight:800; font-size:0.84rem; background:${scoreBg}; color:${scoreColor};">${avgScore}%</span>`;
        } else if (completedCount > 0) {
            scoreBadge = `<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-shield-check"></i> Transmis</span>`;
        }

        // Dernière activité
        let lastDateText = '<span style="color:var(--clr-text-muted);">Jamais</span>';
        if (allSubs.length > 0) {
            allSubs.sort((a, b) => {
                const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                return tb - ta;
            });
            lastDateText = `<span style="font-size:0.82rem; font-weight:600;"><i class="bi bi-clock-history"></i> ${formatFullDate(allSubs[0].submittedAt)}</span>`;
        }

        const displayName = cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || cand.email || 'Candidat';
        const initial = displayName.charAt(0).toUpperCase() || 'C';
        const avatarContent = cand.photoURL ? `<img src="${escapeHtml(cand.photoURL)}" alt="Avatar">` : initial;

        return `
        <tr>
            <td>
                <div class="es-candidate-user-cell">
                    <div class="es-candidate-avatar">${avatarContent}</div>
                    <div>
                        <div style="font-weight:700; color:var(--clr-text);">${escapeHtml(displayName)}</div>
                        <div style="font-size:0.78rem; color:var(--clr-text-muted);">${escapeHtml(cand.email || '')}</div>
                    </div>
                </div>
            </td>
            <td>
                <div style="font-weight:700; font-size:0.88rem; color:var(--clr-text);">${completedCount} / ${totalModules} <span style="font-size:0.75rem; color:var(--clr-text-muted);">(${completionPct}%)</span></div>
                <div class="es-progress-bar-wrap">
                    <div class="es-progress-bar-inner" style="width:${completionPct}%; background:${completionPct >= 100 ? '#27ae60' : 'var(--clr-primary)'};"></div>
                </div>
            </td>
            <td>${scoreBadge}</td>
            <td>
                <span class="es-badge es-badge--approved" style="font-size:0.78rem;">${allSubs.length} tentative${allSubs.length > 1 ? 's' : ''}</span>
            </td>
            <td>${lastDateText}</td>
            <td style="text-align:right;">
                <button type="button" class="es-btn es-btn--primary es-btn--sm btn-open-candidate-sheet" data-user-id="${cand.uid}" style="padding:6px 12px; font-size:0.8rem; font-weight:700;">
                    <i class="bi bi-person-lines-fill"></i> Voir le bilan
                </button>
            </td>
        </tr>`;
    }).join('');

    // Listeners pour ouvrir la fiche bilan candidat
    tbody.querySelectorAll('.btn-open-candidate-sheet').forEach(btn => {
        btn.addEventListener('click', () => {
            const uid = btn.getAttribute('data-user-id');
            openAdminCandidateBilanModal(uid);
        });
    });
}

function setupAdminAnalyticsDropdown() {
    const select = document.getElementById('adminAnalyticsModuleSelect');
    if (!select) return;

    const modules = currentFormationModulesList || [];
    select.innerHTML = modules.map(m => `
        <option value="${m.id}" ${adminAnalyticsModuleId === m.id ? 'selected' : ''}>
            Module ${m.num < 10 ? '0' + m.num : m.num} : ${escapeHtml(m.title)}
        </option>
    `).join('');

    if (!adminAnalyticsModuleId && modules.length > 0) {
        adminAnalyticsModuleId = modules[0].id;
        select.value = adminAnalyticsModuleId;
    }

    if (adminAnalyticsModuleId) {
        renderAdminModuleAnalytics(adminAnalyticsModuleId);
    }
}

async function renderAdminModuleAnalytics(moduleId) {
    const container = document.getElementById('adminAnalyticsQuestionsContainer');
    if (!container || !moduleId) return;

    const mod = (currentFormationModulesList || []).find(m => m.id === moduleId);
    if (!mod) return;

    container.innerHTML = `
        <div class="es-loader" style="padding:32px 0;">
            <div class="es-spinner"></div>
            <span>Calcul des statistiques par question…</span>
        </div>
    `;

    try {
        const questions = await fetchModuleQuestions(moduleId);
        const subs = adminAllSubmissionsByModule[moduleId] || [];
        const totalCandidates = adminAllCandidatesList.length;

        // Calculer les candidats uniques ayant soumis
        const uniqueUserIds = new Set(subs.map(s => s.userId).filter(Boolean));
        const participationPct = totalCandidates > 0 ? Math.round((uniqueUserIds.size / totalCandidates) * 100) : 0;

        // Calculer le score moyen du module
        const scoredSubs = subs.filter(s => s.score && typeof s.score.percent === 'number');
        const avgScore = scoredSubs.length > 0 ? Math.round(scoredSubs.reduce((a, b) => a + b.score.percent, 0) / scoredSubs.length) : null;

        // Mise à jour des compteurs en-tête module
        const partEl = document.getElementById('analyticsModuleParticipation');
        const avgEl = document.getElementById('analyticsModuleAvgScore');
        const attEl = document.getElementById('analyticsModuleTotalAttempts');
        if (partEl) partEl.textContent = `${uniqueUserIds.size} / ${totalCandidates} (${participationPct}%)`;
        if (avgEl) avgEl.textContent = avgScore !== null ? `${avgScore}%` : '--%';
        if (attEl) attEl.textContent = `${subs.length} copie${subs.length > 1 ? 's' : ''}`;

        if (questions.length === 0) {
            container.innerHTML = `
                <div class="es-empty" style="padding:28px 20px;">
                    <div class="es-empty__icon">❓</div>
                    <div class="es-empty__title">Aucune question configurée</div>
                    <p class="es-empty__text">Ce module ne contient pas encore de questions dans son quiz.</p>
                </div>
            `;
            return;
        }

        if (subs.length === 0) {
            container.innerHTML = `
                <div class="es-empty" style="padding:28px 20px;">
                    <div class="es-empty__icon">📝</div>
                    <div class="es-empty__title">Aucune copie reçue pour ce module</div>
                    <p class="es-empty__text">Les statistiques par question s'afficheront dès qu'un candidat aura validé ce quiz.</p>
                </div>
            `;
            return;
        }

        // Analyser chaque question
        container.innerHTML = questions.map((q, qIdx) => {
            let correctCount = 0;
            let answeredCount = 0;
            const choiceDistribution = {}; // optionIdx -> count
            let booleanTrueCount = 0;
            let booleanFalseCount = 0;
            const writtenAnswers = [];
            const pinCoordinates = [];
            const rangeValues = [];

            subs.forEach(sub => {
                const ans = sub.answers ? sub.answers[q.id] : null;
                const candName = sub.userName || sub.userEmail || 'Stagiaire';
                if (ans === null || ans === undefined || ans === '') return;
                answeredCount++;

                if (q.type === 'qcm') {
                    const ansNum = parseInt(ans, 10);
                    choiceDistribution[ansNum] = (choiceDistribution[ansNum] || 0) + 1;
                    const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                    if (ansNum === correctIdx) correctCount++;
                } else if (q.type === 'boolean') {
                    const userBool = (ans === true || ans === 'true');
                    if (userBool) booleanTrueCount++;
                    else booleanFalseCount++;
                    const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                    if (userBool === expectedBool) correctCount++;
                } else if (q.type === 'pinpoint') {
                    const userCoords = typeof ans === 'object' ? ans : (typeof ans === 'string' ? (()=>{ try { return JSON.parse(ans); } catch(e){ return null; } })() : null);
                    if (userCoords && userCoords.x !== undefined && userCoords.y !== undefined) {
                        const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                        const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                        const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                        const dist = Math.sqrt(Math.pow(userCoords.x - targetX, 2) + Math.pow(userCoords.y - targetY, 2));
                        const isCorrect = dist <= radius;
                        if (isCorrect) correctCount++;
                        pinCoordinates.push({ ...userCoords, candName: candName, isCorrect: isCorrect });
                    }
                } else if (q.type === 'range') {
                    const val = parseFloat(ans);
                    rangeValues.push(val);
                    if (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) {
                        const targetVal = parseFloat(q.correctValue);
                        const tol = parseFloat(q.tolerance) || 0;
                        if (Math.abs(val - targetVal) <= tol) correctCount++;
                    }
                } else if (q.type === 'puzzle') {
                    const currentOrder = Array.isArray(ans) ? ans : [];
                    const expected = q.items || [];
                    const isExact = (currentOrder.length === expected.length && currentOrder.every((it, idx) => it === expected[idx]));
                    if (isExact) correctCount++;
                } else {
                    // Rédaction
                    writtenAnswers.push({ name: candName, text: ans });
                    if (ans.trim().length >= 10) correctCount++;
                }
            });

            const successPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
            let badgeColor = '#27ae60';
            let badgeBg = 'rgba(46, 204, 113, 0.12)';
            if (q.type === 'text') {
                badgeColor = '#3498db';
                badgeBg = 'rgba(52, 152, 219, 0.12)';
            } else if (successPct < 45) {
                badgeColor = '#e74c3c';
                badgeBg = 'rgba(231, 76, 60, 0.12)';
            } else if (successPct < 70) {
                badgeColor = '#f39c12';
                badgeBg = 'rgba(243, 156, 18, 0.12)';
            }

            let typeLabel = 'QCM';
            if (q.type === 'pinpoint') typeLabel = '📍 Repère sur image';
            else if (q.type === 'range') typeLabel = 'Curseur horizontal';
            else if (q.type === 'boolean') typeLabel = 'Vrai / Faux';
            else if (q.type === 'puzzle') typeLabel = 'Puzzle / Ordonnancement';
            else if (q.type === 'text') typeLabel = 'Rédaction';

            // Détail spécifique par type
            let breakdownHtml = '';
            if (q.type === 'qcm') {
                const options = q.options || [];
                const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                breakdownHtml = `
                <div class="es-distribution-legend">
                    ${options.map((opt, optIdx) => {
                        const count = choiceDistribution[optIdx] || 0;
                        const pct = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
                        const isCorrectOpt = optIdx === correctIdx;
                        return `
                        <div class="es-distribution-item" style="border-left:4px solid ${isCorrectOpt ? '#27ae60' : 'var(--clr-surface-3)'};">
                            <div>
                                ${isCorrectOpt ? '<strong style="color:#27ae60;">✅ Option ' + (optIdx + 1) + ' (Correcte) :</strong>' : '<span>Option ' + (optIdx + 1) + ' :</span>'}
                                ${escapeHtml(opt)}
                            </div>
                            <div style="font-weight:700; white-space:nowrap; margin-left:12px;">
                                ${count} vote${count > 1 ? 's' : ''} (${pct}%)
                            </div>
                        </div>`;
                    }).join('')}
                </div>`;
            } else if (q.type === 'boolean') {
                const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                const truePct = answeredCount > 0 ? Math.round((booleanTrueCount / answeredCount) * 100) : 0;
                const falsePct = answeredCount > 0 ? Math.round((booleanFalseCount / answeredCount) * 100) : 0;
                breakdownHtml = `
                <div class="es-distribution-legend">
                    <div class="es-distribution-item" style="border-left:4px solid ${expectedBool ? '#27ae60' : 'var(--clr-surface-3)'};">
                        <div>${expectedBool ? '<strong style="color:#27ae60;">👍 VRAI (Attendu)</strong>' : '👍 VRAI'}</div>
                        <div style="font-weight:700;">${booleanTrueCount} (${truePct}%)</div>
                    </div>
                    <div class="es-distribution-item" style="border-left:4px solid ${!expectedBool ? '#27ae60' : 'var(--clr-surface-3)'};">
                        <div>${!expectedBool ? '<strong style="color:#27ae60;">👎 FAUX (Attendu)</strong>' : '👎 FAUX'}</div>
                        <div style="font-weight:700;">${booleanFalseCount} (${falsePct}%)</div>
                    </div>
                </div>`;
            } else if (q.type === 'pinpoint') {
                const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                breakdownHtml = `
                <div style="margin-top:10px;">
                    <div style="font-size:0.84rem; color:var(--clr-text-muted); margin-bottom:8px;">
                        🎯 <strong>${correctCount} / ${answeredCount}</strong> stagiaires ont placé leur repère dans la zone attendue (±${radius}%).
                    </div>
                    ${q.pinImage ? `
                    <div style="text-align:center; background:#181c19; padding:10px; border-radius:8px;">
                        <div class="es-pinpoint-result-zone" style="max-width:520px; margin:0 auto;">
                            <img src="${escapeHtml(q.pinImage)}" alt="Vue d'ensemble repères" class="es-pinpoint-result-img">
                            <div class="es-pinpoint-target-zone es-pinpoint-target-zone--result" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; height:${radius * 2}%;"></div>
                            <div class="es-pinpoint-pin es-pinpoint-pin--admin" style="left:${targetX}%; top:${targetY}%;" title="Cible"><i class="bi bi-bullseye" style="font-size:22px; color:#2ecc71;"></i></div>
                            ${pinCoordinates.map(p => `
                                <div class="es-pinpoint-pin ${p.isCorrect ? 'es-pinpoint-pin--correct' : 'es-pinpoint-pin--incorrect'}" style="left:${p.x}%; top:${p.y}%; font-size:11px;" title="${escapeHtml(p.candName)}">
                                    <i class="bi bi-geo-alt-fill"></i>
                                </div>
                            `).join('')}
                        </div>
                    </div>` : ''}
                </div>`;
            } else if (q.type === 'range') {
                const avgVal = rangeValues.length > 0 ? (rangeValues.reduce((a, b) => a + b, 0) / rangeValues.length).toFixed(1) : '—';
                breakdownHtml = `
                <div style="font-size:0.84rem; margin-top:8px; padding:10px; background:var(--clr-surface-2); border-radius:6px;">
                    <div>Position moyenne choisie : <strong style="color:var(--clr-primary);">${avgVal} ${escapeHtml(q.unit || '')}</strong> (Cible attendue : <strong>${q.correctValue || '—'} ${escapeHtml(q.unit || '')}</strong>)</div>
                    <div style="color:var(--clr-text-muted); margin-top:4px;">${correctCount} / ${answeredCount} réponses dans la tolérance (±${q.tolerance || 0})</div>
                </div>`;
            } else if (q.type === 'text') {
                breakdownHtml = `
                <div style="margin-top:10px;">
                    <details style="background:var(--clr-surface-2); border-radius:6px; padding:10px 14px; cursor:pointer;">
                        <summary style="font-weight:700; font-size:0.84rem; color:var(--clr-primary);">
                            <i class="bi bi-chat-quote"></i> Voir les ${writtenAnswers.length} réponses rédigées des stagiaires
                        </summary>
                        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
                            ${writtenAnswers.map(w => `
                                <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px; font-size:0.84rem;">
                                    <strong style="color:var(--clr-primary);">${escapeHtml(w.name)} :</strong>
                                    <div style="margin-top:4px; white-space:pre-wrap; color:var(--clr-text);">${escapeHtml(w.text)}</div>
                                </div>
                            `).join('')}
                        </div>
                    </details>
                </div>`;
            }

            const imageThumb = q.imageUrl ? `
            <div style="margin:8px 0;">
                <img src="${escapeHtml(q.imageUrl)}" alt="Illustration" style="max-height:80px; max-width:100%; border-radius:6px; border:1px solid var(--clr-surface-3);" onerror="this.parentElement.style.display='none'">
            </div>` : '';

            return `
            <div class="es-analytics-q-card">
                <div class="es-analytics-q-card__header">
                    <div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">
                            Question ${qIdx + 1} • ${typeLabel}
                        </div>
                        <h4 style="font-size:0.95rem; font-weight:800; color:var(--clr-text); margin:4px 0 0;">
                            ${escapeHtml(q.text)}
                        </h4>
                    </div>
                    <div class="es-analytics-gauge">
                        <div class="es-analytics-gauge__pct" style="color:${badgeColor};">${q.type === 'text' ? `${answeredCount}` : `${successPct}%`}</div>
                        <div class="es-analytics-gauge__sub">${q.type === 'text' ? 'rédaction(s)' : `${correctCount} / ${answeredCount} exacts`}</div>
                    </div>
                </div>

                ${imageThumb}

                <!-- Jauge de réussite -->
                ${q.type !== 'text' ? `
                <div class="es-distribution-bar-track">
                    <div class="es-distribution-segment" style="width:${successPct}%; background:${badgeColor};"></div>
                </div>` : ''}

                ${breakdownHtml}
            </div>`;
        }).join('');

    } catch (err) {
        console.error("renderAdminModuleAnalytics error:", err);
        container.innerHTML = `<div class="es-alert es-alert--error"><i class="bi bi-exclamation-triangle"></i> Erreur lors du calcul des analyses.</div>`;
    }
}

async function openAdminCandidateBilanModal(userId) {
    const cand = adminAllCandidatesList.find(u => u.uid === userId);
    if (!cand) return;

    const modalName = document.getElementById('adminCandidateModalName');
    const modalEmail = document.getElementById('adminCandidateModalEmail');
    const modalAvatar = document.getElementById('adminCandidateModalAvatar');
    const modalProg = document.getElementById('adminCandidateModalProgression');
    const modalScore = document.getElementById('adminCandidateModalAvgScore');
    const modalAttempts = document.getElementById('adminCandidateModalAttempts');
    const list = document.getElementById('adminCandidateModalModulesList');
    const loader = document.getElementById('adminCandidateModalLoader');

    const displayName = cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || cand.email || 'Candidat';
    if (modalName) modalName.textContent = displayName;
    if (modalEmail) modalEmail.textContent = cand.email || '';
    if (modalAvatar) {
        modalAvatar.innerHTML = cand.photoURL ? `<img src="${escapeHtml(cand.photoURL)}" alt="Avatar">` : (displayName.charAt(0).toUpperCase() || 'C');
    }

    const candData = adminAllSubmissionsByUser[userId];
    const candModulesMap = candData?.modulesMap || {};
    const allSubs = candData?.allSubs || [];
    const totalModules = (currentFormationModulesList || []).length;
    const completedCount = Object.keys(candModulesMap).length;
    const completionPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

    const candScores = [];
    Object.values(candModulesMap).forEach(s => {
        if (s.score && typeof s.score.percent === 'number') candScores.push(s.score.percent);
    });
    const avgScore = candScores.length > 0 ? Math.round(candScores.reduce((a, b) => a + b, 0) / candScores.length) : null;

    if (modalProg) modalProg.textContent = `${completedCount} / ${totalModules} (${completionPct}%)`;
    if (modalScore) modalScore.textContent = avgScore !== null ? `${avgScore}%` : (completedCount > 0 ? 'Transmis' : '--%');
    if (modalAttempts) modalAttempts.textContent = `${allSubs.length} épreuve(s)`;

    if (loader) loader.classList.remove('hidden');
    if (list) { list.classList.add('hidden'); list.innerHTML = ''; }

    openModal('overlayAdminCandidateBilan');

    try {
        const modules = currentFormationModulesList || [];
        const moduleCardsHtml = await Promise.all(modules.map(async (m) => {
            const sub = candModulesMap[m.id];
            const hasSubmitted = !!sub;

            let questionsHtml = '';
            if (hasSubmitted) {
                const questions = await fetchModuleQuestions(m.id);
                const answers = sub.answers || {};

                questionsHtml = questions.map((q, qIdx) => {
                    const userAns = answers[q.id];
                    let ansDisplay = '';

                    if (q.type === 'qcm') {
                        const ansNum = (userAns !== null && userAns !== undefined) ? parseInt(userAns, 10) : null;
                        const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                        const isCorrect = (ansNum === correctIdx);
                        const optText = (ansNum !== null && q.options && q.options[ansNum]) ? q.options[ansNum] : 'Pas de réponse';
                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                            <strong>Choix candidat :</strong> ${escapeHtml(optText)}
                            <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Exact' : '❌ Faux'}</span>
                            ${!isCorrect && q.options && q.options[correctIdx] ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Bonne réponse : <strong>${escapeHtml(q.options[correctIdx])}</strong>)</div>` : ''}
                        </div>`;
                    } else if (q.type === 'boolean') {
                        const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                        const userBool = (userAns === true || userAns === 'true');
                        const isCorrect = (userAns !== null && userAns !== undefined && userBool === expectedBool);
                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                            <strong>Choix candidat :</strong> ${userBool ? '👍 VRAI' : '👎 FAUX'}
                            <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Exact' : '❌ Faux'}</span>
                            ${!isCorrect ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Attendu : <strong>${expectedBool ? '👍 VRAI' : '👎 FAUX'}</strong>)</div>` : ''}
                        </div>`;
                    } else if (q.type === 'pinpoint') {
                        const userCoords = userAns && typeof userAns === 'object' ? userAns : (userAns ? (typeof userAns === 'string' ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return null; } })() : null) : null);
                        const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                        const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                        const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                        let isCorrect = false;
                        if (userCoords && userCoords.x !== undefined && userCoords.y !== undefined) {
                            const dist = Math.sqrt(Math.pow(userCoords.x - targetX, 2) + Math.pow(userCoords.y - targetY, 2));
                            isCorrect = dist <= radius;
                        }
                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                            <div><strong>Repère candidat :</strong> ${userCoords ? `X: ${userCoords.x.toFixed(1)}%, Y: ${userCoords.y.toFixed(1)}%` : '<span style="color:var(--clr-danger)">Pas de repère</span>'} <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Dans la cible' : '❌ Hors cible'}</span></div>
                            ${q.pinImage ? `
                            <div style="text-align:center; background:#181c19; padding:8px; border-radius:6px; margin-top:6px;">
                                <div class="es-pinpoint-result-zone" style="max-width:440px; margin:0 auto;">
                                    <img src="${escapeHtml(q.pinImage)}" alt="Repère" class="es-pinpoint-result-img">
                                    <div class="es-pinpoint-target-zone es-pinpoint-target-zone--result" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; height:${radius * 2}%;"></div>
                                    <div class="es-pinpoint-pin es-pinpoint-pin--admin" style="left:${targetX}%; top:${targetY}%;"><i class="bi bi-bullseye" style="font-size:22px; color:#2ecc71;"></i></div>
                                    ${userCoords ? `<div class="es-pinpoint-pin ${isCorrect ? 'es-pinpoint-pin--correct' : 'es-pinpoint-pin--incorrect'}" style="left:${userCoords.x}%; top:${userCoords.y}%;"><i class="bi bi-geo-alt-fill"></i></div>` : ''}
                                </div>
                            </div>` : ''}
                        </div>`;
                    } else if (q.type === 'range') {
                        const val = (userAns !== null && userAns !== undefined) ? parseFloat(userAns) : null;
                        ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Curseur :</strong> <span style="font-weight:700;">${val !== null ? `${val} ${escapeHtml(q.unit || '')}` : 'Non renseigné'}</span> (Cible : ${q.correctValue || '—'})</div>`;
                    } else if (q.type === 'puzzle') {
                        const order = Array.isArray(userAns) ? userAns : [];
                        ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Ordre proposé :</strong> <ol style="margin:4px 0 0 16px; padding:0;">${order.map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ol></div>`;
                    } else {
                        ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem; white-space:pre-wrap;">${escapeHtml(userAns || 'Pas de texte rédigé.')}</div>`;
                    }

                    return `
                    <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--clr-surface-3);">
                        <div style="font-size:0.72rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Q${qIdx + 1} • ${q.type}</div>
                        <div style="font-size:0.88rem; font-weight:600; color:var(--clr-text);">${escapeHtml(q.text)}</div>
                        ${ansDisplay}
                    </div>`;
                }).join('');
            }

            const scoreBadge = hasSubmitted ? (sub.score ? `<span class="es-bilan-badge-score">Score : ${sub.score.percent}% (${sub.score.correct}/${sub.score.total})</span>` : `<span class="es-bilan-badge-transmitted">Transmis</span>`) : `<span class="es-badge es-badge--pending">Non commencé</span>`;

            return `
            <div style="background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-md); overflow:hidden;">
                <div style="padding:14px 18px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="es-bilan-card__icon" style="width:36px; height:36px; font-size:16px;">
                            <i class="bi ${m.icon || 'bi-journal-bookmark'}"></i>
                        </div>
                        <div>
                            <div style="font-size:0.72rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Module ${m.num < 10 ? '0' + m.num : m.num}</div>
                            <div style="font-weight:700; font-size:0.95rem; color:var(--clr-text);">${escapeHtml(m.title)}</div>
                            ${hasSubmitted ? `<div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:2px;">🕒 ${formatFullDate(sub.submittedAt)} • Tentative #${sub.attemptNumber || 1}</div>` : ''}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${scoreBadge}
                        ${hasSubmitted ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-toggle-cand-modal-acc" data-mod="${m.id}" style="font-size:0.78rem;">
                            <i class="bi bi-eye"></i> Voir les réponses
                        </button>` : ''}
                    </div>
                </div>
                ${hasSubmitted ? `
                <div class="hidden" id="candModalAcc_${m.id}" style="padding:12px 18px 16px; background:var(--clr-surface-2); border-top:1px dashed var(--clr-surface-3);">
                    ${questionsHtml}
                </div>` : ''}
            </div>`;
        }));

        if (loader) loader.classList.add('hidden');
        if (list) {
            list.innerHTML = moduleCardsHtml.join('');
            list.classList.remove('hidden');

            list.querySelectorAll('.btn-toggle-cand-modal-acc').forEach(btn => {
                btn.addEventListener('click', () => {
                    const modId = btn.getAttribute('data-mod');
                    const acc = document.getElementById(`candModalAcc_${modId}`);
                    acc?.classList.toggle('hidden');
                });
            });
        }

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("openAdminCandidateBilanModal error:", err);
    }
}

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
        if (typeof showBannedScreen === 'function') {
            showBannedScreen();
        } else if (typeof showGlobalAccessDenied === 'function') {
            showGlobalAccessDenied();
        }
        return;
    }

    // Récupérer la promotion active actuelle
    let currentPromoId = '';
    try {
        const formSetDoc = await db.collection('globalSettings').doc('formation').get();
        if (formSetDoc.exists && formSetDoc.data().activePromoId) {
            currentPromoId = formSetDoc.data().activePromoId;
            globalActivePromoId = currentPromoId;
            window.globalFormationActivePromoId = currentPromoId;
        }
    } catch (errP) {
        console.warn("Erreur chargement activePromoId:", errP);
    }

    // Si compte stagiaire sans promoId sur son profil, vérifier s'il a un espace approuvé dans accessRequests
    if (userData.role === 'stagiaire' && !userData.promoId && navigator.onLine) {
        try {
            const reqSnap = await db.collection('accessRequests')
                .where('userId', '==', user.uid)
                .where('status', '==', 'approved').get();
            if (!reqSnap.empty) {
                const origPromoId = reqSnap.docs[0].data().espaceId;
                if (origPromoId) {
                    userData.promoId = origPromoId;
                    await db.collection('users').doc(user.uid).update({ promoId: origPromoId });
                }
            }
        } catch (e) {}
    }

    // Vérifier si le compte stagiaire correspond exactement à la promo en cours
    if (userData.role === 'stagiaire' && isStagiairePromoMismatch(userData, currentPromoId)) {
        if (typeof showFormationExpiredScreen === 'function') {
            showFormationExpiredScreen();
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

    // Initialiser les onglets de navigation (Modules vs Mon Bilan)
    initBilanTabs();

    // Initialiser les réglages globaux (tags, stats, etc.)
    initFormationGlobalSettingsListener();

    // Initialiser le système de Promo de Formation
    initPromoModalEvents();
    loadFormationPromos();

    // Charger les modules de formation
    loadFormationModules();
});

// ----------------------------------------------------------------
// SYSTÈME DE PROMOTION DE FORMATION (Synchronisation Espace Colos & Firestore)
// ----------------------------------------------------------------
let currentSelectedPromoId = localStorage.getItem('formation_selected_promo_id') || '';
let globalActivePromoId = '';
let globalActivePromoNom = '';
let globalActivePromoEmoji = '🎓';
let globalActivePromoData = null;
let userApprovedPromo = null;
let formationPromosList = [];

function formatStageType(type) {
    if (type === 'base') return 'Formation Générale BAFA (Base)';
    if (type === 'appro') return 'Session d\'Approfondissement BAFA';
    if (type === 'qualif') return 'Session de Qualification BAFA';
    return 'Session de formation BAFA';
}

function computePromoStatus(dateDebut, dateFin) {
    if (!dateDebut) return { label: 'Session active', cls: '' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(dateDebut);
    start.setHours(0, 0, 0, 0);

    if (dateFin) {
        const end = new Date(dateFin);
        end.setHours(23, 59, 59, 999);
        if (today > end) {
            return { label: 'Session clôturée', cls: 'es-promo-banner__status--ended' };
        }
    }

    const diffTime = start.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
        return { label: `Débute dans ${diffDays} j`, cls: 'es-promo-banner__status--upcoming' };
    } else {
        return { label: 'Session en cours', cls: '' };
    }
}

async function loadFormationPromos() {
    formationPromosList = [];
    let allEspacesList = [];
    try {
        const snap = await db.collection('espaces').get();
        if (!snap.empty) {
            allEspacesList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            formationPromosList = allEspacesList.filter(e => e.isFormation === true);
        }
    } catch (err) {
        console.warn("Erreur chargement promos depuis Firestore:", err);
        // Fallback local storage
        try {
            const cached = localStorage.getItem('offline_espaces_list');
            if (cached) {
                const list = JSON.parse(cached);
                allEspacesList = list;
                formationPromosList = list.filter(e => e.isFormation === true);
            }
        } catch (e) {}
    }

    // Récupérer la promo globale définie par le formateur dans Firestore
    try {
        const setDoc = await db.collection('globalSettings').doc('formation').get();
        if (setDoc.exists) {
            const sData = setDoc.data();
            if (sData.activePromoId !== undefined) globalActivePromoId = sData.activePromoId || '';
            if (sData.activePromoNom !== undefined) globalActivePromoNom = sData.activePromoNom || '';
            if (sData.activePromoEmoji !== undefined) globalActivePromoEmoji = sData.activePromoEmoji || '🎓';
            globalActivePromoData = {
                id: sData.activePromoId || '',
                nom: sData.activePromoNom || '',
                emoji: sData.activePromoEmoji || '🎓',
                organisme: sData.activePromoOrganisme || '',
                lieu: sData.activePromoLieu || '',
                ville: sData.activePromoVille || '',
                dateDebut: sData.activePromoDateDebut || '',
                dateFin: sData.activePromoDateFin || '',
                nbParticipants: sData.activePromoNbParticipants || '',
                directeur: sData.activePromoDirecteur || '',
                stageType: sData.activePromoStageType || ''
            };
        }
    } catch (e) {}

    // Si on a un ID global mais pas encore de données complètes, les retrouver dans la liste des espaces
    if (globalActivePromoId) {
        const found = allEspacesList.find(p => p.id === globalActivePromoId);
        if (found) {
            globalActivePromoNom = found.nom || '';
            globalActivePromoEmoji = found.emoji || '🎓';
            globalActivePromoData = found;
        }
    }

    // Si rôle stagiaire, vérifier s'il est inscrit et approuvé dans une session précise
    if (actualRole === 'stagiaire' && currentUser) {
        try {
            const reqSnap = await db.collection('accessRequests')
                .where('userId', '==', currentUser.uid)
                .where('status', '==', 'approved').get();
            if (!reqSnap.empty) {
                for (const reqDoc of reqSnap.docs) {
                    const eId = reqDoc.data().espaceId;
                    // Chercher d'abord dans les formations puis dans tous les espaces
                    const matched = allEspacesList.find(p => p.id === eId);
                    if (matched) {
                        userApprovedPromo = matched;
                        break;
                    }
                }
            }
        } catch (e) {}

        // Si le stagiaire a un promoId rattaché à son profil
        if (!userApprovedPromo && actualUserData && actualUserData.promoId) {
            const matched = allEspacesList.find(p => p.id === actualUserData.promoId);
            if (matched) {
                userApprovedPromo = matched;
            }
        }
    }

    updatePromoHeaderUI();
}

function updatePromoHeaderUI() {
    const nameEl = document.getElementById('promoCurrentName');
    const emojiEl = document.getElementById('promoEmojiIcon');
    const btnChange = document.getElementById('btnChangePromo');
    if (!nameEl) return;

    // Seul l'administrateur formateur réel (sans simulation stagiaire) a le bouton pour modifier
    const canEditPromo = (actualRole === 'admin' && !isSimulatedStagiaireRole);
    if (btnChange) {
        btnChange.classList.toggle('hidden', !canEditPromo);
    }

    // Déterminer quelle promotion afficher :
    // 1. Session approuvée spécifique du stagiaire
    // 2. Promotion globale synchronisée (objet complet)
    // 3. Promotion globale par ID
    // 4. Choix manuel local (admin)
    // 5. Si une seule promotion existe sur la plateforme
    let activePromoObj = null;

    if (userApprovedPromo) {
        activePromoObj = userApprovedPromo;
    } else if (globalActivePromoData && (globalActivePromoData.nom || globalActivePromoData.id)) {
        activePromoObj = globalActivePromoData;
    } else if (globalActivePromoId) {
        activePromoObj = formationPromosList.find(p => p.id === globalActivePromoId) || null;
    } else if (currentSelectedPromoId) {
        activePromoObj = formationPromosList.find(p => p.id === currentSelectedPromoId) || null;
    } else if (formationPromosList.length === 1) {
        activePromoObj = formationPromosList[0];
    }

    if (activePromoObj && activePromoObj.nom) {
        nameEl.textContent = activePromoObj.nom;
        if (emojiEl) emojiEl.textContent = activePromoObj.emoji || '🎓';
    } else {
        nameEl.textContent = (actualRole === 'stagiaire') ? "Formation BAFA" : "Toutes les promotions";
        if (emojiEl) emojiEl.textContent = "🎓";
    }

    // Mettre à jour les métadonnées de la promotion dans l'en-tête (Design System BAFA)
    updatePromoHeaderMeta(activePromoObj);
}

function updatePromoHeaderMeta(promo) {
    const metaContainer = document.getElementById('formationPromoMetaList');
    if (!metaContainer) return;

    if (!promo || !promo.nom) {
        metaContainer.classList.add('hidden');
        return;
    }

    let hasAnyMeta = false;

    // 1. Dates
    const metaDates = document.getElementById('metaPromoDates');
    const valDates = document.getElementById('metaPromoDatesVal');
    if (metaDates && valDates) {
        if (promo.dateDebut && promo.dateFin) {
            valDates.textContent = `${formatDate(promo.dateDebut)} → ${formatDate(promo.dateFin)}`;
            metaDates.classList.remove('hidden');
            hasAnyMeta = true;
        } else if (promo.dateDebut) {
            valDates.textContent = `Dès le ${formatDate(promo.dateDebut)}`;
            metaDates.classList.remove('hidden');
            hasAnyMeta = true;
        } else {
            metaDates.classList.add('hidden');
        }
    }

    // 2. Lieu / Centre
    const metaLieu = document.getElementById('metaPromoLieu');
    const valLieu = document.getElementById('metaPromoLieuVal');
    const lieuStr = [promo.lieu, promo.ville].filter(Boolean).join(', ');
    if (metaLieu && valLieu) {
        if (lieuStr) {
            valLieu.textContent = lieuStr;
            metaLieu.classList.remove('hidden');
            hasAnyMeta = true;
        } else {
            metaLieu.classList.add('hidden');
        }
    }

    // 3. Effectif
    const metaEffectif = document.getElementById('metaPromoParticipants');
    const valEffectif = document.getElementById('metaPromoParticipantsVal');
    if (metaEffectif && valEffectif) {
        const nb = parseInt(promo.nbParticipants, 10);
        if (!isNaN(nb) && nb > 0) {
            valEffectif.textContent = `${nb} stagiaire${nb > 1 ? 's' : ''}`;
            metaEffectif.classList.remove('hidden');
            hasAnyMeta = true;
        } else {
            metaEffectif.classList.add('hidden');
        }
    }

    // 4. Organisme
    const metaOrganisme = document.getElementById('metaPromoOrganisme');
    const valOrganisme = document.getElementById('metaPromoOrganismeVal');
    if (metaOrganisme && valOrganisme) {
        if (promo.organisme) {
            valOrganisme.textContent = promo.organisme;
            metaOrganisme.classList.remove('hidden');
            hasAnyMeta = true;
        } else {
            metaOrganisme.classList.add('hidden');
        }
    }

    // 5. Formateur
    const metaFormateur = document.getElementById('metaPromoFormateur');
    const valFormateur = document.getElementById('metaPromoFormateurVal');
    const formateurNom = promo.directeur || promo.createurNom || '';
    if (metaFormateur && valFormateur) {
        if (formateurNom) {
            valFormateur.textContent = `Formateur : ${formateurNom}`;
            metaFormateur.classList.remove('hidden');
            hasAnyMeta = true;
        } else {
            metaFormateur.classList.add('hidden');
        }
    }

    metaContainer.classList.toggle('hidden', !hasAnyMeta);
}

let promoModalEventsInitialized = false;

function initPromoModalEvents() {
    if (promoModalEventsInitialized) return;
    promoModalEventsInitialized = true;

    const btnChangePromo = document.getElementById('btnChangePromo');
    const overlay = document.getElementById('overlayChangePromo');
    const select = document.getElementById('selectFormationPromo');
    const btnClose = document.getElementById('btnClosePromoModal');
    const btnCancel = document.getElementById('btnCancelPromoModal');
    const btnSave = document.getElementById('btnSavePromoSelection');

    btnChangePromo?.addEventListener('click', () => {
        if (actualRole !== 'admin') return;
        if (select) {
            select.innerHTML = '<option value="">🌐 Toutes les promotions (Vue globale)</option>';
            formationPromosList.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = `${p.emoji || '🎓'} ${p.nom} ${p.organisme ? `(${p.organisme})` : ''}`;
                select.appendChild(opt);
            });
            select.value = globalActivePromoId || currentSelectedPromoId || '';
        }
        openModal('overlayChangePromo');
    });

    btnClose?.addEventListener('click', () => closeModal('overlayChangePromo'));
    btnCancel?.addEventListener('click', () => closeModal('overlayChangePromo'));

    btnSave?.addEventListener('click', async () => {
        const val = select ? select.value : '';
        currentSelectedPromoId = val;
        globalActivePromoId = val;

        const promo = formationPromosList.find(p => p.id === val);
        globalActivePromoNom = promo ? (promo.nom || '') : '';
        globalActivePromoEmoji = promo ? (promo.emoji || '🎓') : '🎓';
        globalActivePromoData = promo ? {
            id: promo.id,
            nom: promo.nom || '',
            emoji: promo.emoji || '🎓',
            organisme: promo.organisme || '',
            lieu: promo.lieu || '',
            ville: promo.ville || '',
            dateDebut: promo.dateDebut || '',
            dateFin: promo.dateFin || '',
            nbParticipants: promo.nbParticipants || '',
            directeur: promo.directeur || promo.createurNom || '',
            stageType: promo.stageType || ''
        } : null;

        if (val) {
            localStorage.setItem('formation_selected_promo_id', val);
            showToast(`Promotion active : ${globalActivePromoNom || 'Session sélectionnée'}`, "success");
        } else {
            localStorage.removeItem('formation_selected_promo_id');
            showToast("Affichage global (Toutes les promotions)", "info");
        }

        // Sauvegarder dans Firestore pour synchroniser tous les comptes stagiaires en temps réel
        if (actualRole === 'admin' && navigator.onLine) {
            try {
                await db.collection('globalSettings').doc('formation').set({
                    activePromoId: val || '',
                    activePromoNom: globalActivePromoNom,
                    activePromoEmoji: globalActivePromoEmoji,
                    activePromoOrganisme: promo?.organisme || '',
                    activePromoLieu: promo?.lieu || '',
                    activePromoVille: promo?.ville || '',
                    activePromoDateDebut: promo?.dateDebut || '',
                    activePromoDateFin: promo?.dateFin || '',
                    activePromoNbParticipants: promo?.nbParticipants || '',
                    activePromoDirecteur: promo?.directeur || promo?.createurNom || '',
                    activePromoStageType: promo?.stageType || '',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (err) {
                console.error("Erreur enregistrement activePromoId Firestore:", err);
            }
        }

        updatePromoHeaderUI();
        closeModal('overlayChangePromo');

        if (typeof renderStagiairesResultsTable === 'function') {
            renderStagiairesResultsTable();
        }
    });

    overlay?.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal('overlayChangePromo');
    });
}
