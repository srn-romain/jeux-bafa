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
// CACHE INTELLIGENT (Économie des quotas Firestore & Anti-spam F5)
// ----------------------------------------------------------------
let _modulesCache = null;
let _modulesCacheTime = 0;
const MODULES_CACHE_TTL = 30 * 1000; // 30 secondes en mémoire/session
let _moduleQuestionsCache = {};

function invalidateFormationCache() {
    _modulesCache = null;
    _modulesCacheTime = 0;
    _moduleQuestionsCache = {};
    try {
        sessionStorage.removeItem('cached_formation_modules');
        sessionStorage.removeItem('cached_formation_modules_ts');
        if (currentUser) {
            sessionStorage.removeItem('cached_stagiaire_subs_' + currentUser.uid);
            sessionStorage.removeItem('cached_stagiaire_subs_ts_' + currentUser.uid);
        }
    } catch (e) {}
}
window.invalidateFormationCache = invalidateFormationCache;

// ----------------------------------------------------------------
// BANDEAU COMPTE À REBOURS SYNCHRONISATION FIRESTORE (30s)
// ----------------------------------------------------------------
let _syncCountdownTimer = null;

function showFirestoreSyncCountdown(seconds = 30) {
    if (_syncCountdownTimer) {
        clearInterval(_syncCountdownTimer);
        _syncCountdownTimer = null;
    }

    let banner = document.getElementById('firestoreSyncCountdownBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'firestoreSyncCountdownBanner';
        banner.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 99999;
            background: rgba(20, 32, 24, 0.96);
            backdrop-filter: blur(14px);
            -webkit-backdrop-filter: blur(14px);
            border: 1.5px solid rgba(46, 204, 113, 0.4);
            border-radius: 12px;
            padding: 14px 18px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4), 0 0 16px rgba(46, 204, 113, 0.18);
            color: #ffffff;
            font-size: 0.86rem;
            line-height: 1.45;
            max-width: 430px;
            display: flex;
            align-items: flex-start;
            gap: 12px;
            transition: opacity 0.4s ease, transform 0.4s ease;
        `;
        document.body.appendChild(banner);
    }

    let remaining = seconds;

    const renderBanner = () => {
        if (!banner) return;
        if (remaining > 0) {
            const progressPercent = Math.min(100, Math.max(0, ((seconds - remaining) / seconds) * 100));
            banner.innerHTML = `
                <div style="background: rgba(46, 204, 113, 0.15); color: #2ecc71; width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                    🛡️
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <span style="font-size: 0.88rem;">Protection des lectures Firestore</span>
                        <span style="background: rgba(243, 156, 18, 0.2); color: #f39c12; border: 1px solid rgba(243, 156, 18, 0.4); border-radius: 20px; padding: 1px 8px; font-size: 0.76rem; font-weight: 800; min-width: 32px; text-align: center;">${remaining}s</span>
                    </div>
                    <div style="font-size: 0.79rem; color: rgba(255, 255, 255, 0.85); margin-top: 4px;">
                        Votre modification est enregistrée. Elle sera visible pour l'ensemble des stagiaires au maximum dans <strong style="color: #f39c12;">${remaining}s</strong>.
                    </div>
                    <div style="width: 100%; background: rgba(255, 255, 255, 0.1); height: 3px; border-radius: 2px; margin-top: 8px; overflow: hidden;">
                        <div style="background: #2ecc71; height: 100%; width: ${progressPercent}%; transition: width 1s linear;"></div>
                    </div>
                </div>
            `;
        } else {
            banner.innerHTML = `
                <div style="background: rgba(46, 204, 113, 0.25); color: #2ecc71; width: 36px; height: 36px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; flex-shrink: 0;">
                    ✅
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; color: #2ecc71; font-size: 0.88rem;">
                        Synchronisation active !
                    </div>
                    <div style="font-size: 0.79rem; color: rgba(255, 255, 255, 0.9); margin-top: 3px;">
                        Vos modifications sont désormais visibles pour tous les stagiaires.
                    </div>
                </div>
            `;
            setTimeout(() => {
                if (banner) {
                    banner.style.opacity = '0';
                    banner.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        banner?.remove();
                    }, 400);
                }
            }, 2500);
        }
    };

    renderBanner();

    _syncCountdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(_syncCountdownTimer);
            _syncCountdownTimer = null;
        }
        renderBanner();
    }, 1000);
}
window.showFirestoreSyncCountdown = showFirestoreSyncCountdown;

// ----------------------------------------------------------------
// RÉCUPÉRATION ET SYNCHRONISATION DES MODULES & QUESTIONS
// ----------------------------------------------------------------
async function getFormationModulesList(forceRefresh = false) {
    const now = Date.now();
    
    // 1. Vérification du cache mémoire rapide
    if (!forceRefresh && _modulesCache && (now - _modulesCacheTime < MODULES_CACHE_TTL)) {
        currentFormationModulesList = _modulesCache;
        return currentFormationModulesList;
    }

    // 2. Vérification du sessionStorage (persiste au rechargement de page F5)
    if (!forceRefresh) {
        try {
            const sCached = sessionStorage.getItem('cached_formation_modules');
            const sTs = parseInt(sessionStorage.getItem('cached_formation_modules_ts') || '0', 10);
            if (sCached && (now - sTs < MODULES_CACHE_TTL)) {
                const parsed = JSON.parse(sCached);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    _modulesCache = parsed;
                    _modulesCacheTime = sTs;
                    currentFormationModulesList = parsed;
                    return currentFormationModulesList;
                }
            }
        } catch (sErr) {}
    }

    let list = [];
    try {
        const snap = await db.collection('formation').orderBy('num', 'asc').get();
        if (!snap.empty) {
            list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            localStorage.setItem('offline_formation_modules', JSON.stringify(list));
            try {
                sessionStorage.setItem('cached_formation_modules', JSON.stringify(list));
                sessionStorage.setItem('cached_formation_modules_ts', String(now));
            } catch (e) {}
        }
    } catch (e) {
        console.warn("Offline fallback for formation collection:", e);
        try {
            const cached = localStorage.getItem('offline_formation_modules');
            if (cached) list = JSON.parse(cached);
        } catch (cacheErr) {}
    }

    currentFormationModulesList = list.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
    _modulesCache = currentFormationModulesList;
    _modulesCacheTime = now;
    return currentFormationModulesList;
}

// Récupération des questions d'un module depuis sa sous-collection 'questions' (avec cache mémoire)
async function fetchModuleQuestions(moduleId, forceRefresh = false) {
    if (!forceRefresh && _moduleQuestionsCache[moduleId] && _moduleQuestionsCache[moduleId].length > 0) {
        const mod = currentFormationModulesList.find(m => m.id === moduleId);
        if (mod) {
            mod.questions = _moduleQuestionsCache[moduleId];
            mod.questionsCount = _moduleQuestionsCache[moduleId].length;
        }
        return _moduleQuestionsCache[moduleId];
    }

    let questions = [];
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
        if (!snap.empty) {
            questions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
    } catch (err) {
        console.warn(`Could not load questions for module ${moduleId} from subcollection:`, err);
    }

    _moduleQuestionsCache[moduleId] = questions;
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
                const cIdxs = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];
                qDoc.correctIndexes = cIdxs;
                qDoc.correctIndex = cIdxs[0];
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
            } else if (q.type === 'cloze') {
                qDoc.clozeText = q.clozeText || '';
                qDoc.distractors = Array.isArray(q.distractors) ? q.distractors : [];
            } else {
                qDoc.hint = q.hint || '';
            }

            await qRef.set(qDoc, { merge: true });
        }
    } catch (qErr) {
        console.error("Error updating questions subcollection:", qErr);
    }

    invalidateFormationCache();
    let list = await getFormationModulesList(true);
    const idx = list.findIndex(m => m.id === moduleData.id);
    if (idx >= 0) {
        list[idx] = { ...list[idx], ...payload, questions: questionsList };
    } else {
        list.push({ ...payload, questions: questionsList });
    }
    list.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));

    localStorage.setItem('offline_formation_modules', JSON.stringify(list));
    currentFormationModulesList = list;
    showFirestoreSyncCountdown(30);
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
    invalidateFormationCache();
    let list = await getFormationModulesList(true);
    list = list.filter(m => m.id !== moduleId);
    localStorage.setItem('offline_formation_modules', JSON.stringify(list));
    currentFormationModulesList = list;
    showFirestoreSyncCountdown(30);
    return list;
}

// ----------------------------------------------------------------
// CHARGEMENT DE L'AFFICHAGE DES MODULES
// ----------------------------------------------------------------
async function loadFormationModules(forceRefresh = false) {
    const loader = document.getElementById('formationLoader');
    const grid = document.getElementById('formationModulesGrid');
    const adminControls = document.getElementById('formationAdminControls');

    if (!grid) return;

    // Blocage strict si stagiaire ou formateur non relié à la promo active
    if ((actualRole === 'stagiaire' || actualRole === 'formateur') && typeof isUserPromoMismatch === 'function') {
        const mismatch = await isUserPromoMismatch(actualUserData, globalActivePromoId || window.globalFormationActivePromoId, currentUser?.uid);
        if (mismatch) {
            if (typeof showFormationExpiredScreen === 'function') {
                showFormationExpiredScreen();
            }
            return;
        }
    } else if (actualRole === 'stagiaire' && typeof isStagiairePromoMismatch === 'function' && isStagiairePromoMismatch(actualUserData, globalActivePromoId || window.globalFormationActivePromoId)) {
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
        const modules = await getFormationModulesList(forceRefresh);

        // 1. Soumissions du stagiaire connecté (historique de toutes ses tentatives avec cache 30s)
        stagiaireSubmissionsMap = {};
        if (currentUser) {
            const now = Date.now();
            let subsLoadedFromCache = false;
            if (!forceRefresh && effectiveRole === 'stagiaire') {
                try {
                    const cachedSubs = sessionStorage.getItem('cached_stagiaire_subs_' + currentUser.uid);
                    const cachedSubsTs = parseInt(sessionStorage.getItem('cached_stagiaire_subs_ts_' + currentUser.uid) || '0', 10);
                    if (cachedSubs && (now - cachedSubsTs < 30 * 1000)) {
                        stagiaireSubmissionsMap = JSON.parse(cachedSubs);
                        subsLoadedFromCache = true;
                    }
                } catch (e) {}
            }

            if (!subsLoadedFromCache) {
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
                try {
                    sessionStorage.setItem('cached_stagiaire_subs_' + currentUser.uid, JSON.stringify(stagiaireSubmissionsMap));
                    sessionStorage.setItem('cached_stagiaire_subs_ts_' + currentUser.uid, String(now));
                } catch (e) {}
            }
        }

        // 2. Compteurs administrateur / formateur par module (nombre de réponses & stagiaires uniques)
        let adminCountsMap = {};
        if (actualRole === 'admin' || actualRole === 'formateur') {
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
            if (!isVisible && (effectiveRole === 'admin' || effectiveRole === 'formateur')) {
                cardClass += 'es-formation-card--invisible ';
            }
            if (hasSubmitted) {
                cardClass += 'es-formation-card--completed ';
            } else if (isEnabled || effectiveRole === 'admin' || effectiveRole === 'formateur') {
                cardClass += 'es-formation-card--active ';
            } else {
                cardClass += 'es-formation-card--locked ';
            }

            let bgStyle = '';
            if (m.bgImage) {
                cardClass += 'es-formation-card--has-bg ';
                bgStyle = `style="background-image: linear-gradient(to bottom, rgba(14, 24, 16, 0.50) 0%, rgba(14, 24, 16, 0.90) 100%), url('${escapeHtml(m.bgImage)}');"`;
            }

            const statsDisplay = `${adminStats.totalAttempts} réponse${adminStats.totalAttempts > 1 ? 's' : ''}`;
            const questionsCount = m.questionsCount || (m.questions ? m.questions.length : 0);

            // 1. Tag Masqué
            let hiddenTagHtml = '';
            if (!isVisible && (effectiveRole === 'admin' || effectiveRole === 'formateur')) {
                hiddenTagHtml = `<span class="es-formation-tag es-formation-tag--hidden-status es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="Module masqué pour les candidats"><i class="bi bi-eye-slash-fill"></i> Masqué</span>`;
            }

            // 2. Tag Nombre de Questions (en bas à gauche)
            const questionsTagHtml = `<span class="es-formation-tag es-formation-tag--questions es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="Nombre de questions dans ce quiz"><i class="bi bi-patch-question"></i> ${questionsCount} question${questionsCount > 1 ? 's' : ''}</span>`;

            // 3. Tag Nombre de réponses uniquement (en bas à droite pour Admin / Formateur)
            let statsTagHtml = '';
            if (effectiveRole === 'admin' || effectiveRole === 'formateur') {
                statsTagHtml = `<span class="es-formation-tag es-formation-tag--stats es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="${adminStats.totalAttempts} réponse(s) au total"><i class="bi bi-chat-left-text"></i> ${statsDisplay}</span>`;
            }

            // 4. Tag Mot de passe requis (si activé)
            const isPasswordProtected = Boolean(qConfig.requirePassword === true || (qConfig.password && String(qConfig.password).trim() !== ''));
            const passwordTagHtml = isPasswordProtected ? `<span class="es-formation-tag es-formation-tag--password es-formation-card__badge-tag ${!showFormationTags ? 'es-tags--hidden' : ''}" title="Accès protégé par mot de passe" style="background:rgba(230, 126, 34, 0.15); color:#e67e22; border-color:rgba(230, 126, 34, 0.3);"><i class="bi bi-key-fill"></i> Code requis</span>` : '';

            // 5. Info Statut du Quiz (Disponible / Verrouillé / Répondu) placé dans l'en-tête
            let statusInfoHtml = '';
            if (hasSubmitted) {
                const scoreText = (showResultsAtEnd && existingSub.score) ? ` (${existingSub.score.correct}/${existingSub.score.total})` : '';
                statusInfoHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-check-circle"></i> Répondu${scoreText}</span>`;
            } else if (isEnabled) {
                statusInfoHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-play-fill"></i> Disponible</span>`;
            } else {
                statusInfoHtml = `<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-lock"></i> Verrouillé</span>`;
            }

            const isManageable = (effectiveRole === 'admin' || effectiveRole === 'formateur');
            let actionBtn = '';
            if (!isManageable) {
                if (isEnabled) {
                    if (isAttemptsExceeded) {
                        actionBtn = `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm es-btn--full btn-open-quiz" data-module-id="${m.id}">
                            <i class="bi bi-check2-circle"></i> ${showResultsAtEnd ? 'Résultats & corrigé' : 'Quiz complété'}
                        </button>`;
                    } else {
                        actionBtn = `
                        <button type="button" class="es-btn es-btn--primary es-btn--sm es-btn--full btn-open-quiz" data-module-id="${m.id}">
                            <i class="bi bi-pencil-square"></i> ${hasSubmitted ? (showResultsAtEnd ? 'Corrigé / Repasser' : 'Repasser le quiz') : 'Faire le quiz'}
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
            <div class="${cardClass}" ${bgStyle} data-module-id="${m.id}" data-is-manageable="${isManageable ? 'true' : 'false'}" ${isManageable ? 'title="Cliquer pour gérer ce module"' : ''}>
                <div>
                    <div class="es-formation-header">
                        <div class="es-formation-icon-wrap">
                            <i class="bi ${m.icon || 'bi-journal-bookmark'}"></i>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${statusInfoHtml}
                            ${(effectiveRole === 'admin' || effectiveRole === 'formateur') ? `
                                <button type="button" class="es-card-action-btn btn-admin-toggle-module-visibility" data-module-id="${m.id}" data-visible="${isVisible}" title="${isVisible ? 'Masquer pour les candidats' : 'Rendre visible pour les candidats'}" style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); color:#ffffff; border-radius:6px; width:28px; height:28px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
                                <i class="bi bi-${isVisible ? 'eye' : 'eye-slash'}"></i>
                            </button>
                            ` : ''}
                            ${effectiveRole === 'admin' ? `
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
                        ${passwordTagHtml}
                    </h3>
                    <p class="es-formation-desc">${escapeHtml(m.subtitle || m.description || '')}</p>
                </div>
                <div class="es-formation-card__bottom-meta" style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-top:auto; padding-top:14px; gap:8px;">
                    <div>${questionsTagHtml}</div>
                    <div>${statsTagHtml}</div>
                </div>
                ${actionBtn ? `
                <div class="es-formation-footer" style="margin-top:10px;">
                    ${actionBtn}
                </div>` : ''}
            </div>`;
        }).join('');

        if (grid) grid.classList.remove('hidden');

        // Listeners cartes
        grid.querySelectorAll('.es-formation-card[data-is-manageable="true"]').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.es-switch') || e.target.closest('.btn-admin-toggle-module-visibility') || e.target.closest('button') || e.target.closest('input')) {
                    return;
                }
                const moduleId = card.getAttribute('data-module-id');
                if (moduleId) {
                    openFormationModuleEdit(moduleId);
                }
            });
        });

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

        grid.querySelectorAll('.btn-formateur-add-question').forEach(btn => {
            btn.addEventListener('click', () => {
                const moduleId = btn.getAttribute('data-module-id');
                openAddQuestionFormateur(moduleId);
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
                    showFirestoreSyncCountdown(30);
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
                    showFirestoreSyncCountdown(30);
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
// REDIRECTION : CRÉER / MODIFIER UN MODULE & QUIZ (ADMIN)
// ----------------------------------------------------------------
function openFormationModuleEdit(moduleId = null) {
    if (moduleId) {
        window.location.href = `formation-edit.html?id=${encodeURIComponent(moduleId)}`;
    } else {
        window.location.href = 'formation-edit.html';
    }
}

const AVAILABLE_FORMATION_ICONS = [
    { icon: 'bi-journal-bookmark', label: 'Livre & Étude', tags: 'cours bafa livre projet etude' },
    { icon: 'bi-mortarboard', label: 'Diplôme / BAFA', tags: 'bafa diplome brevet ecole reussite' },
    { icon: 'bi-diagram-3', label: 'Schéma & Repères', tags: 'schema projet equipe organisation psaadrafra' },
    { icon: 'bi-building', label: 'ACM & Structures', tags: 'acm centre batiment mairie caf ddcs sdjes' },
    { icon: 'bi-people', label: 'Enfants & Public', tags: 'enfants public groupe animateurs colos' },
    { icon: 'bi-shield-check', label: 'Réglementation', tags: 'regles securite loi conformite protection' },
    { icon: 'bi-bank', label: 'Responsabilité & Droit', tags: 'loi justice penale civile tribunal sanction' },
    { icon: 'bi-clock-history', label: 'Vie quotidienne', tags: 'quotidien rythme repas coucher lever douche temps' },
    { icon: 'bi-heart-half', label: 'Bienveillance & Écoute', tags: 'bienveillance ecoute affectif attention soin accueil' },
    { icon: 'bi-person-wheelchair', label: 'Handicap & Accessibilité', tags: 'handicap inclusion psh accessibilite fauteuil difference bonhomme' },
    { icon: 'bi-universal-access', label: 'Inclusion Universelle', tags: 'inclusion accessibilite universel accueil difference psh bonhomme' },
    { icon: 'bi-shield-exclamation', label: 'Harcèlement & VSS', tags: 'harcelement maltraitance vss protection prevention' },
    { icon: 'bi-chat-heart', label: 'Relationnel & Équipe', tags: 'relations equipe conflits communication dialogue' },
    { icon: 'bi-peace', label: 'Laïcité & Valeurs', tags: 'laicite valeurs republique liberte vivre ensemble' },
    { icon: 'bi-signpost-split', label: 'Autorité & Cadre', tags: 'regles sanction autorite cadre limite' },
    { icon: 'bi-file-earmark-text', label: 'Contrats & Droits', tags: 'contrat cee droit travail salaire fiche' },
    { icon: 'bi-stars', label: 'Grands-Jeux & Veillées', tags: 'jeu veillée imaginaire fete spectacle animation' },
    { icon: 'bi-newspaper', label: 'Blog & Communication', tags: 'blog communication journal nouvelles photos' },
    { icon: 'bi-bus-front', label: 'Transport & Sorties', tags: 'transport bus car velo trajet deplacement' },
    { icon: 'bi-chat-dots', label: 'Réunion & Débrief', tags: 'reunion bilan debrief equipe point' },
    { icon: 'bi-palette', label: 'Activités manuelles', tags: 'activites brico dessin art creation atelier' },
    { icon: 'bi-brush', label: 'Peinture & Fresque', tags: 'peinture deco brico couleur fresque atelier dessin' },
    { icon: 'bi-scissors', label: 'Bricolage & Ateliers', tags: 'brico ciseaux decoupage atelier manuel fabrication' },
    { icon: 'bi-tree', label: 'Nature & Forêt', tags: 'nature foret arbre sortie environnement' },
    { icon: 'bi-sun', label: 'Journée & Plein air', tags: 'soleil meteo plein air exterieur plage' },
    { icon: 'bi-moon-stars', label: 'Nuit & Coucher', tags: 'nuit sommeil coucher chambre tente dortoir' },
    { icon: 'bi-cup-hot', label: 'Repas & Rythme', tags: 'repas alimentation cuisine cantine gouter pause repos cafe' },
    { icon: 'bi-bandaid', label: 'Santé & Bobologie', tags: 'soins sante infirmier bobo blessure psc1' },
    { icon: 'bi-person-lines-fill', label: 'Fiches Sanitaires & Suivi', tags: 'fiche sanitaire dossier suivi administratif fiche inscription bonhomme' },
    { icon: 'bi-trophy', label: 'Sport & Tournoi', tags: 'sport tournoi jeu olympiades defi coupe' },
    { icon: 'bi-dice-5', label: 'Jeux de société', tags: 'jeu plateau regles ludique cartes' },
    { icon: 'bi-flag', label: 'Prise de Drapeau & Jeux', tags: 'grand jeu drapeau capture equipes tournoi strategie' },
    { icon: 'bi-music-note-beamed', label: 'Chants & Musique', tags: 'chants musique guitare danse spectacle son' },
    { icon: 'bi-compass', label: 'Orientation & Rando', tags: 'orientation boussole course carte rando marche' },
    { icon: 'bi-fire', label: 'Feu de camp & Bivouac', tags: 'feu camp bivouac secours pompier' },
    { icon: 'bi-megaphone', label: 'Lancement de jeu', tags: 'lancement appel rassemblement animateur' },
    { icon: 'bi-bullseye', label: 'Objectifs & Pédagogie', tags: 'objectifs cible pedagogie evaluation projet' },
    { icon: 'bi-lightbulb', label: 'Créativité & Idée', tags: 'idee pedagogie astuce reflexion concept innovation projet' },
    { icon: 'bi-check2-circle', label: 'Évaluation & Validation', tags: 'bilan validation check grille reussite note appreciation' },
    { icon: 'bi-water', label: 'Baignade & Piscine', tags: 'eau baignade piscine mer lac surveillant ssb noyade nager' },
    { icon: 'bi-life-preserver', label: 'Surveillance & Eau', tags: 'eau bouee sauveteur surveillant ssb baignade secours' },
    { icon: 'bi-backpack', label: 'Sac à dos & Bivouac', tags: 'sac rando bagages marche bivouac materiel trek' },
    { icon: 'bi-geo-alt', label: 'Lieu & Découverte', tags: 'lieu geographie visite excursion camp voyage repere' },
    { icon: 'bi-balloon', label: 'Fête & Célébration', tags: 'ballon fete boom kermesse anniversaire celebration joie' },
    { icon: 'bi-bicycle', label: 'Vélo & Mobilité', tags: 'velo vtt deux roues route casque balade piste cyclable' },
    { icon: 'bi-film', label: 'Cinéma & Vidéo', tags: 'cinema film video tournage projection pop corn ecran' },
    { icon: 'bi-controller', label: 'Jeux vidéo & Numérique', tags: 'jeux console manette gaming e-sport ecrans digital' },
    { icon: 'bi-magic', label: 'Magie & Imaginaire', tags: 'magie imaginaire conte sorcier illusion theatre univers' },
    { icon: 'bi-puzzle', label: 'Énigme & Escape Game', tags: 'enigme escape game puzzle recherche indice mystere' },
    { icon: 'bi-umbrella', label: 'Météo & Repli', tags: 'pluie repli parapluie tempete meteo orage activites interieur' },
    { icon: 'bi-camera', label: 'Photo & Souvenirs', tags: 'photo appareil image reportage souvenirs album' },
    { icon: 'bi-award', label: 'Diplôme & Récompense', tags: 'recompense medaille trophee reussite badge' },
    { icon: 'bi-shield-shaded', label: 'Sécurité & Prévention', tags: 'securite vigilance regles alerte prevention secours psc1' },
    { icon: 'bi-stopwatch', label: 'Chrono & Rythme', tags: 'chrono temps epreuve timer rapidite echeance' },
    { icon: 'bi-cash-coin', label: 'Budget & Trésorerie', tags: 'budget argent comptabilite achat courses tresorerie econome' },
    { icon: 'bi-cart4', label: 'Courses & Intendance', tags: 'courses intendance repas approvisionnement logistique cantine' },
    { icon: 'bi-person-raised-hand', label: 'Participation & Parole', tags: 'parole expression question vote regle enfant animateur bonhomme' },
    { icon: 'bi-person-arms-up', label: 'Éveil & Motricité', tags: 'eveil corps expression motricite danse enfant bonhomme' },
    { icon: 'bi-chat-square-quote', label: 'Parole d\'Enfant & Bilan', tags: 'expression avis debrief discussion forum parole' },
    { icon: 'bi-signpost', label: 'Projet Pédagogique', tags: 'projet pedagogique direction animateur intention orientations' }
];

function normalizeIconClass(rawIcon) {
    if (!rawIcon || typeof rawIcon !== 'string') return 'bi-journal-bookmark';
    let clean = rawIcon.trim();
    clean = clean.replace(/^(bi\s+)+/, '').trim();
    if (!clean.startsWith('bi-') && !clean.startsWith('fa-')) {
        clean = 'bi-' + clean;
    }
    return clean;
}

function renderIconPicker(selectedIcon = 'bi-journal-bookmark', filter = '') {
    const grid = document.getElementById('iconPickerGrid');
    if (!grid) return;

    const currentSelected = normalizeIconClass(selectedIcon);
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
        const itemClean = normalizeIconClass(item.icon);
        const isSelected = itemClean === currentSelected;
        return `
        <button type="button" class="btn-select-icon-item" data-icon="${itemClean}" data-label="${escapeHtml(item.label)}" style="
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
            padding:8px 4px; border-radius:6px; font-size:0.75rem; text-align:center; cursor:pointer; transition:all 0.15s ease;
            background:${isSelected ? 'rgba(39,174,96,0.14)' : '#ffffff'};
            border:${isSelected ? '2px solid var(--clr-primary)' : '1px solid var(--clr-surface-3)'};
            color:${isSelected ? 'var(--clr-primary)' : 'var(--clr-text)'};
            font-weight:${isSelected ? '700' : '500'};
        ">
            <i class="bi ${itemClean}" style="font-size:1.35rem; color:${isSelected ? 'var(--clr-primary)' : 'inherit'};"></i>
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
    const cleanIcon = normalizeIconClass(iconClass);
    const input = document.getElementById('editModuleIcon');
    if (input) input.value = cleanIcon;

    const preview = document.getElementById('selectedIconPreview');
    if (preview) preview.className = `bi ${cleanIcon}`;

    const labelEl = document.getElementById('selectedIconLabel');
    if (labelEl) labelEl.textContent = iconLabel || 'Icône sélectionnée';

    updateIconPreview(cleanIcon);

    const filter = document.getElementById('iconFilterInput')?.value || '';
    renderIconPicker(cleanIcon, filter);
}

function updateIconPreview(iconClass) {
    const cleanIcon = normalizeIconClass(iconClass);
    const iconEl = document.getElementById('iconPreviewEl');
    if (iconEl) {
        iconEl.className = `bi ${cleanIcon}`;
    }

    const found = AVAILABLE_FORMATION_ICONS.find(item => normalizeIconClass(item.icon) === cleanIcon || item.icon === iconClass);
    const labelEl = document.getElementById('selectedIconLabel');
    if (labelEl) {
        labelEl.textContent = found ? found.label : 'Personnalisée';
    }
    const selPrev = document.getElementById('selectedIconPreview');
    if (selPrev) {
        selPrev.className = `bi ${cleanIcon}`;
    }
}

document.getElementById('iconFilterInput')?.addEventListener('input', (e) => {
    const currentIcon = normalizeIconClass(document.getElementById('editModuleIcon')?.value || 'bi-journal-bookmark');
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
            const correctIndexes = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                ? q.correctIndexes.map(n => parseInt(n, 10))
                : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

            const optionsHtml = (q.options || []).map((opt, optIdx) => {
                const isChecked = correctIndexes.includes(optIdx);
                return `
                <div class="es-option-builder-row">
                    <input type="checkbox" name="correct_q_${q.id}" value="${optIdx}" ${isChecked ? 'checked' : ''} title="Cocher pour définir comme bonne réponse">
                    <input type="text" class="es-input opt-text-input" data-q-idx="${qIdx}" data-opt-idx="${optIdx}" value="${escapeHtml(opt)}" placeholder="Texte de l'option ${optIdx + 1}" required style="font-size:0.88rem; padding:6px 10px;">
                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-option" data-q-idx="${qIdx}" data-opt-idx="${optIdx}" title="Supprimer cette option" style="color:var(--clr-danger); padding:4px 8px;">
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
            `;
            }).join('');

            typeBody = `
            <div style="margin-top:10px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <label style="font-size:0.8rem; font-weight:700; color:var(--clr-text);">Choix de réponses (cochez la ou les bonnes réponses) :</label>
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
        } else if (q.type === 'cloze') {
            const clozeText = q.clozeText || '';
            const distractors = Array.isArray(q.distractors) ? q.distractors : [];
            const regex = /\[([^\]]+)\]/g;
            const detectedBlanks = [];
            let match;
            while ((match = regex.exec(clozeText)) !== null) {
                const w = match[1].trim();
                if (w) detectedBlanks.push(w);
            }

            typeBody = `
            <div class="es-cloze-builder-box">
                <div class="es-cloze-builder-help">
                    <div style="font-weight:700; color:var(--clr-primary); margin-bottom:2px; display:flex; align-items:center; gap:6px;">
                        <i class="bi bi-info-circle-fill"></i> Comment créer le texte à trous :
                    </div>
                    <div>Entourez chaque mot ou nombre à deviner avec des crochets <code>[mot]</code>.</div>
                    <div style="margin-top:2px; color:var(--clr-text-muted);">
                        Exemple : <em>« En ACM, il faut 1 animateur pour <strong>[8]</strong> enfants de moins de <strong>[6]</strong> ans. »</em>
                    </div>
                </div>

                <div>
                    <label class="es-field__label" style="font-size:0.8rem; font-weight:700; display:block; margin-bottom:4px;">Texte avec trous [entre crochets] :</label>
                    <textarea class="es-input q-cloze-text-input" data-q-idx="${qIdx}" rows="3" placeholder="Rédigez votre texte en plaçant les réponses attendues entre [crochets]..." style="font-size:0.9rem; line-height:1.5;">${escapeHtml(clozeText)}</textarea>
                </div>

                <div>
                    <div style="font-size:0.78rem; font-weight:700; color:var(--clr-text-muted); margin-bottom:4px; display:flex; justify-content:space-between; align-items:center;">
                        <span>Trous détectés (${detectedBlanks.length}) :</span>
                        <span style="font-size:0.75rem; color:var(--clr-primary); font-weight:700;">Total étiquettes banque : ${detectedBlanks.length + distractors.length}</span>
                    </div>
                    <div class="es-cloze-detected-blanks" id="cloze_blanks_preview_${qIdx}">
                        ${detectedBlanks.length > 0 ? detectedBlanks.map((b, bIdx) => `
                            <span class="es-cloze-detected-pill">
                                <span style="opacity:0.75; font-size:0.7rem;">#${bIdx + 1}</span>
                                <span>${escapeHtml(b)}</span>
                            </span>
                        `).join('') : '<span style="font-size:0.75rem; color:var(--clr-text-muted); font-style:italic;">Aucun trou détecté pour le moment (utilisez [mot])</span>'}
                    </div>
                </div>

                <div style="padding-top:8px; border-top:1px dashed var(--clr-surface-3);">
                    <label class="es-field__label" style="font-size:0.8rem; font-weight:700; display:block; margin-bottom:4px;">
                        Étiquettes pièges / Distracteurs supplémentaires (optionnel) :
                    </label>
                    <input type="text" class="es-input q-cloze-distractors-input" data-q-idx="${qIdx}" value="${escapeHtml(distractors.join(', '))}" placeholder="Ex: 10, 12, 14, BAFD (séparés par des virgules)" style="font-size:0.85rem; padding:6px 10px;">
                    <div style="font-size:0.72rem; color:var(--clr-text-muted); margin-top:2px;">
                        💡 Vous pouvez ajouter autant d'étiquettes que souhaité pour avoir <strong>plus de tags dans la banque que de trous</strong> dans le texte.
                    </div>
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
                        <option value="qcm" ${q.type === 'qcm' ? 'selected' : ''}>☑️ QCM (Cases à cocher / Choix multiple)</option>
                        <option value="cloze" ${q.type === 'cloze' ? 'selected' : ''}>🔤 Texte à trous (Drag & Drop)</option>
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
                } else if (newType === 'cloze') {
                    if (!currentEditingQuestions[idx].clozeText) {
                        currentEditingQuestions[idx].clozeText = "En ACM, il faut 1 animateur pour [8] enfants de moins de [6] ans.";
                    }
                    if (!currentEditingQuestions[idx].distractors) {
                        currentEditingQuestions[idx].distractors = ['10', '12'];
                    }
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

    container.querySelectorAll('input[name^="correct_q_"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const qId = e.target.name.replace('correct_q_', '');
            const qIdx = currentEditingQuestions.findIndex(q => q.id === qId);
            if (qIdx >= 0) {
                const checked = container.querySelectorAll(`input[name="correct_q_${qId}"]:checked`);
                const indexes = Array.from(checked).map(c => parseInt(c.value, 10)).filter(n => !isNaN(n));
                currentEditingQuestions[qIdx].correctIndexes = indexes.length > 0 ? indexes : [0];
                currentEditingQuestions[qIdx].correctIndex = currentEditingQuestions[qIdx].correctIndexes[0];
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

    // Cloze text & distractors listeners
    container.querySelectorAll('.q-cloze-text-input').forEach(textarea => {
        textarea.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            const val = e.target.value;
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].clozeText = val;
                // Live preview of detected blanks
                const previewContainer = document.getElementById(`cloze_blanks_preview_${idx}`);
                if (previewContainer) {
                    const regex = /\[([^\]]+)\]/g;
                    const detected = [];
                    let match;
                    while ((match = regex.exec(val)) !== null) {
                        const w = match[1].trim();
                        if (w) detected.push(w);
                    }
                    if (detected.length > 0) {
                        previewContainer.innerHTML = detected.map((b, bIdx) => `
                            <span class="es-cloze-detected-pill">
                                <span style="opacity:0.75; font-size:0.7rem;">#${bIdx + 1}</span>
                                <span>${escapeHtml(b)}</span>
                            </span>
                        `).join('');
                    } else {
                        previewContainer.innerHTML = '<span style="font-size:0.75rem; color:var(--clr-text-muted); font-style:italic;">Aucun trou détecté pour le moment (utilisez [mot])</span>';
                    }
                }
            }
        });
    });

    container.querySelectorAll('.q-cloze-distractors-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-q-idx'), 10);
            if (currentEditingQuestions[idx]) {
                const raw = e.target.value;
                currentEditingQuestions[idx].distractors = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
            }
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
                if (Array.isArray(currentEditingQuestions[qIdx].correctIndexes)) {
                    currentEditingQuestions[qIdx].correctIndexes = currentEditingQuestions[qIdx].correctIndexes
                        .filter(i => i !== optIdx)
                        .map(i => i > optIdx ? i - 1 : i);
                    if (currentEditingQuestions[qIdx].correctIndexes.length === 0) {
                        currentEditingQuestions[qIdx].correctIndexes = [0];
                    }
                    currentEditingQuestions[qIdx].correctIndex = currentEditingQuestions[qIdx].correctIndexes[0];
                } else if (currentEditingQuestions[qIdx].correctIndex >= currentEditingQuestions[qIdx].options.length) {
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
            const cIdxs = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                ? q.correctIndexes.map(n => parseInt(n, 10))
                : [(q.correctIndex !== undefined ? parseInt(q.correctIndex, 10) : 0)];
            item.correctIndexes = cIdxs;
            item.correctIndex = cIdxs[0];
        } else if (q.type === 'cloze') {
            item.clozeText = q.clozeText || '';
            if (Array.isArray(q.distractors) && q.distractors.length > 0) item.distractors = q.distractors;
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
            } else if (item.type === 'cloze' || item.type === 'trous' || item.type === 'fill_blanks' || item.type === 'texte_a_trous') {
                type = 'cloze';
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
                let correctIndexes = [];
                if (Array.isArray(item.correctIndexes)) {
                    correctIndexes = item.correctIndexes.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n < options.length);
                } else if (Array.isArray(item.correctAnswers)) {
                    correctIndexes = item.correctAnswers.map(n => parseInt(n, 10)).filter(n => !isNaN(n) && n >= 0 && n < options.length);
                } else if (typeof item.correctIndex === 'number' && item.correctIndex >= 0 && item.correctIndex < options.length) {
                    correctIndexes = [item.correctIndex];
                } else if (typeof item.answer === 'number' && item.answer >= 0 && item.answer < options.length) {
                    correctIndexes = [item.answer];
                } else if (typeof item.correctAnswer === 'number' && item.correctAnswer >= 0 && item.correctAnswer < options.length) {
                    correctIndexes = [item.correctAnswer];
                }
                if (correctIndexes.length === 0) correctIndexes = [0];

                resQ.options = options;
                resQ.correctIndexes = correctIndexes;
                resQ.correctIndex = correctIndexes[0];
            } else if (type === 'cloze') {
                resQ.clozeText = item.clozeText || item.textWithBlanks || item.template || '';
                if (Array.isArray(item.distractors)) {
                    resQ.distractors = item.distractors.map(d => String(d).trim()).filter(Boolean);
                } else if (typeof item.distractors === 'string') {
                    resQ.distractors = item.distractors.split(',').map(s => s.trim()).filter(Boolean);
                } else {
                    resQ.distractors = [];
                }
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
    societe: [
        "https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1563941402622-4e7a488bcc57?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1585504198199-20277593b94f?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80"
    ],
    foret: [
        "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1511497584788-87676104235f?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800&auto=format&fit=crop&q=80"
    ],
    feu: [
        "https://images.unsplash.com/photo-1508873696983-2df5293cb395?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1517824806704-9040b037703b?w=800&auto=format&fit=crop&q=80",
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
    pedagogie: [
        "https://images.unsplash.com/photo-1456513080510-7bf3a84b82f8?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=800&auto=format&fit=crop&q=80"
    ],
    sport: [
        "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1526232761682-d26e03ac148e?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&auto=format&fit=crop&q=80"
    ],
    nuit: [
        "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1444703686981-a3abbc4d4fe3?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=800&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=800&auto=format&fit=crop&q=80"
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
    switchFormationTab('bilan');
    const effectiveRole = (actualRole === 'admin' && isSimulatedStagiaireRole) ? 'stagiaire' : actualRole;
    if (effectiveRole === 'admin' || effectiveRole === 'formateur') {
        const btnAnalytics = document.getElementById('btnAdminSubtabAnalytics');
        btnAnalytics?.click();
        if (moduleId) {
            const select = document.getElementById('adminAnalyticsModuleSelect');
            if (select) {
                select.value = moduleId;
                adminAnalyticsModuleId = moduleId;
                renderAdminModuleAnalytics(moduleId);
            }
        }
    }
    return;
}


async function gradeOpenQuestionAnswer(moduleId, submissionId, questionId, decisionBool, targetBtn) {
    if (targetBtn) btnLoading(targetBtn, true);
    try {
        const isAdminUser = (actualRole === 'admin' || actualUserData?.role === 'admin' || (typeof isAnimAdmin !== 'undefined' && isAnimAdmin) || (typeof isFormateurAdmin !== 'undefined' && isFormateurAdmin) || (typeof currentRole !== 'undefined' && currentRole === 'admin'));
        const subRef = db.collection('formation').doc(moduleId).collection('submissions').doc(submissionId);
        const subDoc = await subRef.get();
        if (!subDoc.exists) {
            showToast("Soumission introuvable.", "error");
            if (targetBtn) btnLoading(targetBtn, false);
            return;
        }

        const subData = subDoc.data();
        const prevEvals = subData.evaluations || {};
        const curEval = prevEvals[questionId] || {};

        if (!isAdminUser && curEval.status === 'reviewed' && curEval.gradedByUid) {
            showToast("Cette décision a déjà été tranchée et est verrouillée pour les formateurs.", "warning");
            if (targetBtn) btnLoading(targetBtn, false);
            return;
        }

        const questions = await fetchModuleQuestions(moduleId);
        const updatedEval = {
            autoSuggested: (curEval.autoSuggested !== undefined) ? curEval.autoSuggested : null,
            isCorrect: decisionBool,
            status: 'reviewed',
            gradedByUid: currentUser.uid,
            gradedByName: actualUserData?.displayName || `${actualUserData?.firstName || ''} ${actualUserData?.lastName || ''}`.trim() || currentUser.email,
            gradedByRole: isAdminUser ? 'admin' : 'formateur',
            gradedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const newEvals = { ...prevEvals, [questionId]: updatedEval };

        const hasNegativePoints = Boolean(subData.score?.negativePointsEnabled);
        let totalScore = 0;
        let correctCount = 0;
        let pointsTotal = 0;

        questions.forEach(q => {
            totalScore++;
            const ans = subData.answers ? subData.answers[q.id] : null;
            let isCorrect = false;
            let isAnswered = false;

            if (q.type === 'qcm') {
                const userIndices = Array.isArray(ans)
                    ? ans.map(n => parseInt(n, 10))
                    : (ans !== null && ans !== undefined && ans !== '' ? [parseInt(ans, 10)] : []);
                const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

                const sortedUser = [...userIndices].sort((a, b) => a - b);
                const sortedExp = [...expectedIndices].sort((a, b) => a - b);
                isAnswered = sortedUser.length > 0;
                isCorrect = (sortedUser.length === sortedExp.length && isAnswered && sortedUser.every((v, i) => v === sortedExp[i]));
            } else if (q.type === 'image_choice') {
                const ansNum = (ans !== null && ans !== undefined && ans !== '') ? parseInt(ans, 10) : null;
                const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                isAnswered = (ansNum !== null && !isNaN(ansNum));
                isCorrect = isAnswered && (ansNum === correctIdx);
            } else if (q.type === 'table_choice') {
                const rows = q.tableRows || [];
                const userAnsObj = (ans && typeof ans === 'object') ? ans : {};
                let allRowsCorrect = (rows.length > 0);
                rows.forEach((row, rIdx) => {
                    const userRow = userAnsObj[rIdx] || {};
                    const uCol1 = !!userRow.col1;
                    const uCol2 = !!userRow.col2;
                    if (uCol1 || uCol2) isAnswered = true;
                    if (uCol1 !== !!row.correctCol1 || uCol2 !== !!row.correctCol2) {
                        allRowsCorrect = false;
                    }
                });
                isCorrect = isAnswered && allRowsCorrect;
            } else if (q.type === 'boolean') {
                const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                const userBool = (ans === true || ans === 'true');
                isAnswered = (ans !== null && ans !== undefined && ans !== '');
                isCorrect = isAnswered && (userBool === expectedBool);
            } else if (q.type === 'pinpoint') {
                const userCoords = (ans && typeof ans === 'object') ? ans : (ans ? (typeof ans === 'string' ? (()=>{ try { return JSON.parse(ans); } catch(e){ return null; } })() : null) : null);
                const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                isAnswered = Boolean(userCoords && userCoords.x !== undefined && userCoords.y !== undefined);
                if (isAnswered) {
                    const dx = userCoords.x - targetX;
                    const dy = userCoords.y - targetY;
                    isCorrect = Math.sqrt(dx * dx + dy * dy) <= radius;
                }
            } else if (q.type === 'range') {
                const val = (ans !== null && ans !== undefined && ans !== '') ? parseFloat(ans) : null;
                isAnswered = (val !== null && !isNaN(val));
                if (isAnswered && q.correctValue !== undefined) {
                    const targetVal = parseFloat(q.correctValue);
                    const tol = parseFloat(q.tolerance) || 0;
                    isCorrect = Math.abs(val - targetVal) <= tol;
                }
            } else if (q.type === 'classification') {
                const rawItems = q.items || [];
                const userPlacements = (ans && typeof ans === 'object') ? ans : {};
                isAnswered = rawItems.some(it => userPlacements[it.id]);
                isCorrect = isAnswered && (rawItems.length > 0) && rawItems.every(it => userPlacements[it.id] === it.categoryId);
            } else if (q.type === 'cloze') {
                const { blanks: expectedBlanks } = (typeof parseClozeQuestion === 'function') ? parseClozeQuestion(q.clozeText || '') : { blanks: [] };
                const userAnswersObj = (ans && typeof ans === 'object') ? ans : {};
                isAnswered = Object.values(userAnswersObj).some(v => v !== null && v !== undefined && String(v).trim().length > 0);
                isCorrect = isAnswered && (expectedBlanks.length > 0) && expectedBlanks.every((expWord, bIdx) => {
                    const uWord = userAnswersObj[bIdx];
                    return uWord && String(uWord).trim().toLowerCase() === String(expWord).trim().toLowerCase();
                });
            } else if (q.type === 'puzzle') {
                const cOrder = Array.isArray(ans) ? ans : [];
                const expOrder = q.items || [];
                isAnswered = cOrder.length > 0;
                isCorrect = isAnswered && (cOrder.length === expOrder.length) && cOrder.every((it, idx) => it === expOrder[idx]);
            } else if (q.type === 'matching') {
                const rawPairs = q.pairs || [];
                const userMatchesObj = (ans && typeof ans === 'object') ? ans : {};
                isAnswered = Object.values(userMatchesObj).some(v => v && String(v).trim().length > 0);
                isCorrect = isAnswered && (rawPairs.length > 0) && rawPairs.every(pair => {
                    const uRight = userMatchesObj[pair.left] || userMatchesObj[(pair.left || '').trim()];
                    return uRight && String(uRight).trim().toLowerCase() === String(pair.right).trim().toLowerCase();
                });
            } else {
                const qEv = newEvals[q.id];
                isAnswered = Boolean(ans && String(ans).trim().length > 0);
                isCorrect = (qEv && qEv.isCorrect === true);
            }

            if (isCorrect) {
                correctCount++;
                pointsTotal += 1;
            } else if (isAnswered && hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        });

        const finalPoints = hasNegativePoints ? Math.max(0, Math.round(pointsTotal * 10) / 10) : correctCount;
        const percent = totalScore > 0 ? Math.max(0, Math.min(100, Math.round((finalPoints / totalScore) * 100))) : 100;
        const newScore = {
            correct: correctCount,
            points: finalPoints,
            rawPoints: pointsTotal,
            negativePointsEnabled: hasNegativePoints,
            total: totalScore,
            percent: percent
        };

        await subRef.update({
            evaluations: newEvals,
            score: newScore
        });

        showToast(decisionBool ? "Réponse validée (Vrai) !" : "Réponse invalidée (Faux) !", "success");
        showFirestoreSyncCountdown(30);

        // Recharger les modales si ouvertes
        const resultsOverlay = document.getElementById('overlayFormationResults');
        const candBilanOverlay = document.getElementById('overlayAdminCandidateBilan');
        if (resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
            await openFormationResultsModal(moduleId);
        } else if (candBilanOverlay && !candBilanOverlay.classList.contains('hidden')) {
            await openAdminCandidateBilanModal(subData.userId);
        }
    } catch (err) {
        if (targetBtn) btnLoading(targetBtn, false);
        console.error("gradeOpenQuestionAnswer error:", err);
        showToast("Erreur lors de l'enregistrement de l'évaluation.", "error");
    }
}

document.getElementById('btnCloseResultsModal')?.addEventListener('click', () => closeModal('overlayFormationResults'));
document.getElementById('btnCloseResultsModal2')?.addEventListener('click', () => closeModal('overlayFormationResults'));

// ================================================================
// SUPPRESSION DES RÉPONSES (ADMIN UNIQUEMENT)
// ================================================================

// 1. Purge des réponses de toute la promo pour un module (Plusieurs confirmations)
function openPurgePromoSubmissionsModal(moduleData, subCount = 0) {
    if (actualRole !== 'admin') {
        showToast("Action réservée à l'administrateur.", "error");
        return;
    }

    const modal = document.getElementById('overlayConfirmPromoSubmissionsPurge');
    if (!modal || !moduleData) return;

    document.getElementById('purgeModuleId').value = moduleData.id;
    document.getElementById('purgeModalModuleName').textContent = moduleData.title || `Module ${moduleData.num}`;
    document.getElementById('purgeModalSubCount').textContent = subCount;

    const inputConfirm = document.getElementById('purgeConfirmInput');
    const checkAck = document.getElementById('purgeCheckAcknowledge');
    const btnConfirm = document.getElementById('btnConfirmPurgePromoSubmissions');

    if (inputConfirm) inputConfirm.value = '';
    if (checkAck) checkAck.checked = false;
    if (btnConfirm) btnConfirm.disabled = true;

    openModal('overlayConfirmPromoSubmissionsPurge');
}

function updatePurgePromoConfirmState() {
    const inputConfirm = document.getElementById('purgeConfirmInput');
    const checkAck = document.getElementById('purgeCheckAcknowledge');
    const btnConfirm = document.getElementById('btnConfirmPurgePromoSubmissions');

    const isTextValid = (inputConfirm?.value || '').trim().toUpperCase() === 'SUPPRIMER';
    const isAckValid = checkAck?.checked === true;

    if (btnConfirm) {
        btnConfirm.disabled = !(isTextValid && isAckValid);
    }
}

document.getElementById('purgeConfirmInput')?.addEventListener('input', updatePurgePromoConfirmState);
document.getElementById('purgeCheckAcknowledge')?.addEventListener('change', updatePurgePromoConfirmState);

document.getElementById('btnClosePurgeModal')?.addEventListener('click', () => closeModal('overlayConfirmPromoSubmissionsPurge'));
document.getElementById('btnCancelPurge')?.addEventListener('click', () => closeModal('overlayConfirmPromoSubmissionsPurge'));

document.getElementById('btnConfirmPurgePromoSubmissions')?.addEventListener('click', async () => {
    if (actualRole !== 'admin') {
        showToast("Action réservée à l'administrateur.", "error");
        return;
    }

    const btn = document.getElementById('btnConfirmPurgePromoSubmissions');
    const moduleId = document.getElementById('purgeModuleId').value;
    const inputConfirm = document.getElementById('purgeConfirmInput');
    const checkAck = document.getElementById('purgeCheckAcknowledge');

    if ((inputConfirm?.value || '').trim().toUpperCase() !== 'SUPPRIMER' || !checkAck?.checked) {
        showToast("Veuillez valider toutes les étapes de confirmation.", "warning");
        return;
    }

    if (!moduleId) return;

    btnLoading(btn, true);
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('submissions').get();
        const totalDocs = snap.size;

        // Suppression par batch
        const batchSize = 450;
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += batchSize) {
            const batch = db.batch();
            const chunk = docs.slice(i, i + batchSize);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        btnLoading(btn, false);
        closeModal('overlayConfirmPromoSubmissionsPurge');
        showToast(`Toutes les réponses de la promo ont été supprimées (${totalDocs} copie(s) effacée(s)).`, "success");
        showFirestoreSyncCountdown(30);

        // Rafraîchir les données
        await loadFormationModules();
        if (typeof loadAdminCandidatesBilan === 'function') {
            await loadAdminCandidatesBilan();
        }

        const resultsOverlay = document.getElementById('overlayFormationResults');
        if (resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
            await openFormationResultsModal(moduleId);
        }
    } catch (err) {
        btnLoading(btn, false);
        console.error("Purge promo submissions error:", err);
        showToast("Erreur lors de la suppression groupée des réponses.", "error");
    }
});

// 2. Suppression des réponses d'un stagiaire individuel sur un module
function openSingleDeleteConfirmModal({ subId = '', userId = '', moduleId = '', userName = '', moduleTitle = '' } = {}) {
    if (actualRole !== 'admin') {
        showToast("Action réservée à l'administrateur.", "error");
        return;
    }

    const modal = document.getElementById('overlayConfirmSingleSubmissionDelete');
    if (!modal) return;

    document.getElementById('singleDeleteSubId').value = subId;
    document.getElementById('singleDeleteUserId').value = userId;
    document.getElementById('singleDeleteModuleId').value = moduleId;
    document.getElementById('singleDeleteUserName').textContent = userName || 'Ce candidat';
    document.getElementById('singleDeleteModuleName').textContent = moduleTitle || 'ce module';

    openModal('overlayConfirmSingleSubmissionDelete');
}

document.getElementById('btnCloseSingleSubDelete')?.addEventListener('click', () => closeModal('overlayConfirmSingleSubmissionDelete'));
document.getElementById('btnCancelSingleSubDelete')?.addEventListener('click', () => closeModal('overlayConfirmSingleSubmissionDelete'));

document.getElementById('btnConfirmSingleSubDelete')?.addEventListener('click', async () => {
    if (actualRole !== 'admin') {
        showToast("Action réservée à l'administrateur.", "error");
        return;
    }

    const btn = document.getElementById('btnConfirmSingleSubDelete');
    const subId = document.getElementById('singleDeleteSubId').value;
    const userId = document.getElementById('singleDeleteUserId').value;
    const moduleId = document.getElementById('singleDeleteModuleId').value;

    if (!moduleId || (!subId && !userId)) return;

    btnLoading(btn, true);
    try {
        if (subId) {
            await db.collection('formation').doc(moduleId).collection('submissions').doc(subId).delete();
        } else if (userId) {
            const snap = await db.collection('formation').doc(moduleId).collection('submissions').where('userId', '==', userId).get();
            for (const doc of snap.docs) {
                await doc.ref.delete();
            }
        }

        btnLoading(btn, false);
        closeModal('overlayConfirmSingleSubmissionDelete');
        showToast("Réponses supprimées avec succès !", "success");
        showFirestoreSyncCountdown(30);

        // Rafraîchir les données
        await loadFormationModules();
        if (typeof loadAdminCandidatesBilan === 'function') {
            await loadAdminCandidatesBilan();
        }

        const resultsOverlay = document.getElementById('overlayFormationResults');
        const candBilanOverlay = document.getElementById('overlayAdminCandidateBilan');
        if (resultsOverlay && !resultsOverlay.classList.contains('hidden')) {
            await openFormationResultsModal(moduleId);
        }
        if (candBilanOverlay && !candBilanOverlay.classList.contains('hidden') && userId) {
            await openAdminCandidateBilanModal(userId);
        }
    } catch (err) {
        btnLoading(btn, false);
        console.error("Delete single submission error:", err);
        showToast("Erreur lors de la suppression.", "error");
    }
});

// ================================================================
// EXPORTS PDF DU BILAN (STAGIAIRE & PROMOTION)
// ================================================================
function exportStagiaireBilanPDF({ candidateUser, modulesList, submissionsMap, promoName } = {}) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast("Erreur : Bibliothèque PDF non disponible. Veuillez recharger la page.", "error");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const user = candidateUser || (typeof actualUserData !== 'undefined' && actualUserData) || currentUser || {};
        const displayName = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Stagiaire';
        const email = user.email || '';
        const promo = promoName || document.getElementById('promoCurrentName')?.textContent.trim() || 'Session de formation BAFA';

        const modules = (modulesList || currentFormationModulesList || []).filter(m => m.visible !== false);
        const subMap = submissionsMap || stagiaireSubmissionsMap || {};

        let completedCount = 0;
        let totalAttempts = 0;
        let scoredList = [];

        modules.forEach(m => {
            const sub = subMap[m.id];
            if (sub) {
                completedCount++;
                totalAttempts += (sub.attemptsCount || sub.attemptNumber || 1);
                if (sub.score && typeof sub.score.percent === 'number') {
                    scoredList.push(sub.score.percent);
                }
            }
        });

        const completionPercent = modules.length > 0 ? Math.round((completedCount / modules.length) * 100) : 0;
        const avgScore = scoredList.length > 0 ? Math.round(scoredList.reduce((a, b) => a + b, 0) / scoredList.length) : null;

        // --- En-tête / Header ---
        doc.setFillColor(30, 41, 59); // Slate-800
        doc.rect(0, 0, 210, 36, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text("BILAN DE FORMATION BAFA", 14, 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(166, 216, 102); // Primary Green
        doc.text("Contrôle des connaissances & Épreuves individuelles", 14, 24);

        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225);
        const genDate = `Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        doc.text(genDate, 196, 24, { align: 'right' });

        // --- Bloc Informations Stagiaire & Session ---
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 42, 182, 26, 2, 2, 'FD');

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.text(displayName, 20, 50);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(100, 116, 139);
        doc.text(`Email : ${email || 'Non renseigné'}`, 20, 56);
        doc.text(`Promotion : ${promo}`, 20, 62);

        // KPIs dans le bloc
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`Progression : ${completedCount}/${modules.length} (${completionPercent}%)`, 115, 50);
        doc.text(`Score Moyen : ${avgScore !== null ? `${avgScore}%` : (completedCount > 0 ? 'Transmis' : '—')}`, 115, 56);
        doc.text(`Épreuves passées : ${totalAttempts}`, 115, 62);

        // --- Tableau Récapitulatif par Module (Simple, sans détail des questions) ---
        const tableBody = modules.map(m => {
            const sub = subMap[m.id];
            const isCompleted = !!sub;
            const qConfig = m.quizConfig || {};
            const showResultsAtEnd = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);

            let statusText = 'Non commencé';
            let resultText = '—';
            let attemptsText = '—';
            let dateText = '—';

            if (isCompleted) {
                statusText = 'Validé';
                if (showResultsAtEnd && sub.score) {
                    resultText = `${sub.score.percent}% (${sub.score.correct || 0}/${sub.score.total || 0} QCM)`;
                } else {
                    resultText = 'Transmis au formateur';
                }
                attemptsText = `Tentative #${sub.attemptNumber || 1}${sub.timeExpired ? ' (Temps écoulé)' : ''}`;
                dateText = formatFullDate(sub.submittedAt);
            }

            const modNum = `Module ${m.num < 10 ? '0' + m.num : m.num}`;
            return [
                modNum,
                m.title || 'Sans titre',
                statusText,
                resultText,
                attemptsText,
                dateText
            ];
        });

        doc.autoTable({
            startY: 74,
            head: [['N°', 'Module de formation', 'Statut', 'Résultat / Score', 'Tentative', 'Date & Heure']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [30, 41, 59],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5
            },
            styles: {
                fontSize: 8,
                cellPadding: 3.5,
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 22, fontStyle: 'bold' },
                1: { cellWidth: 56 },
                2: { cellWidth: 24 },
                3: { cellWidth: 32 },
                4: { cellWidth: 24 },
                5: { cellWidth: 24 }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            didDrawPage: function () {
                const pageHeight = doc.internal.pageSize.height || 297;
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text("Plateforme Jeux-BAFA • Bilan pédagogique individuel", 14, pageHeight - 8);
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, 196, pageHeight - 8, { align: 'right' });
            }
        });

        const safeName = displayName.replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Bilan_BAFA_${safeName}.pdf`);
        showToast("📄 Bilan PDF téléchargé avec succès !", "success");

    } catch (err) {
        console.error("exportStagiaireBilanPDF error:", err);
        showToast("Erreur lors de la génération du PDF.", "error");
    }
}

function exportPromoBilanPDF({ promoName, candidatesList, submissionsByUser, modulesList } = {}) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        showToast("Erreur : Bibliothèque PDF non disponible. Veuillez recharger la page.", "error");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');

        const promo = promoName || document.getElementById('promoCurrentName')?.textContent.trim() || 'Toutes les promotions';
        const candidates = candidatesList || adminAllCandidatesList || [];
        const modules = modulesList || currentFormationModulesList || [];
        const subByUser = submissionsByUser || adminAllSubmissionsByUser || {};

        const totalCandidates = candidates.length;
        const totalModules = modules.length;

        let activeCount = 0;
        let totalAttempts = 0;
        let totalCompletionSum = 0;
        let allScores = [];

        candidates.forEach(cand => {
            const userData = subByUser[cand.uid];
            const candModulesMap = userData?.modulesMap || {};
            const completedCount = Object.keys(candModulesMap).length;
            const subsList = userData?.allSubs || [];

            if (completedCount > 0) {
                activeCount++;
                totalAttempts += subsList.length;
            }

            const compPct = totalModules > 0 ? (completedCount / totalModules) * 100 : 0;
            totalCompletionSum += compPct;

            Object.values(candModulesMap).forEach(sub => {
                if (sub.score && typeof sub.score.percent === 'number') {
                    allScores.push(sub.score.percent);
                }
            });
        });

        const avgCompletion = totalCandidates > 0 ? Math.round(totalCompletionSum / totalCandidates) : 0;
        const avgScore = allScores.length > 0 ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length) : null;

        // --- En-tête / Header ---
        doc.setFillColor(30, 41, 59); // Slate-800
        doc.rect(0, 0, 210, 36, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text("BILAN GLOBAL DE PROMOTION BAFA", 14, 16);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(166, 216, 102); // Primary Green
        doc.text(`Session : ${promo}`, 14, 24);

        doc.setFontSize(8);
        doc.setTextColor(203, 213, 225);
        const genDate = `Édité le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
        doc.text(genDate, 196, 24, { align: 'right' });

        // --- Bloc Synthèse KPIs Promotion ---
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(14, 42, 182, 24, 2, 2, 'FD');

        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(`Stagiaires inscrits : ${totalCandidates}`, 20, 51);
        doc.text(`Stagiaires actifs : ${activeCount}`, 20, 58);

        doc.text(`Complétion moyenne : ${avgCompletion}%`, 110, 51);
        doc.text(`Moyenne promo : ${avgScore !== null ? `${avgScore}%` : '—'} (${allScores.length} quiz notés)`, 110, 58);

        // --- Tableau des Candidats ---
        const tableBody = candidates.map(cand => {
            const candData = subByUser[cand.uid];
            const candModulesMap = candData?.modulesMap || {};
            const allSubs = candData?.allSubs || [];
            const completedCount = Object.keys(candModulesMap).length;
            const completionPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

            const candScores = [];
            Object.values(candModulesMap).forEach(sub => {
                if (sub.score && typeof sub.score.percent === 'number') candScores.push(sub.score.percent);
            });
            const candAvg = candScores.length > 0 ? Math.round(candScores.reduce((a, b) => a + b, 0) / candScores.length) : null;

            let lastDate = 'Jamais';
            if (allSubs.length > 0) {
                allSubs.sort((a, b) => {
                    const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                    const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                    return tb - ta;
                });
                lastDate = formatFullDate(allSubs[0].submittedAt);
            }

            const displayName = cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || cand.email || 'Candidat';

            return [
                displayName,
                cand.email || '—',
                `${completedCount} / ${totalModules} (${completionPct}%)`,
                candAvg !== null ? `${candAvg}%` : (completedCount > 0 ? 'Transmis' : '—'),
                `${allSubs.length}`,
                lastDate
            ];
        });

        doc.autoTable({
            startY: 72,
            head: [['Stagiaire / Candidat', 'Email', 'Progression', 'Score Moyen', 'Épreuves', 'Dernière Activité']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [30, 41, 59],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5
            },
            styles: {
                fontSize: 8,
                cellPadding: 3.5,
                valign: 'middle'
            },
            columnStyles: {
                0: { cellWidth: 44, fontStyle: 'bold' },
                1: { cellWidth: 44 },
                2: { cellWidth: 26 },
                3: { cellWidth: 22 },
                4: { cellWidth: 20 },
                5: { cellWidth: 26 }
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            didDrawPage: function () {
                const pageHeight = doc.internal.pageSize.height || 297;
                doc.setFontSize(7.5);
                doc.setTextColor(148, 163, 184);
                doc.text("Plateforme Jeux-BAFA • Récapitulatif de promotion", 14, pageHeight - 8);
                doc.text(`Page ${doc.internal.getNumberOfPages()}`, 196, pageHeight - 8, { align: 'right' });
            }
        });

        const safePromo = promo.replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Bilan_Promo_${safePromo}.pdf`);
        showToast("📄 Bilan de promotion PDF téléchargé avec succès !", "success");

    } catch (err) {
        console.error("exportPromoBilanPDF error:", err);
        showToast("Erreur lors de la génération du PDF de la promo.", "error");
    }
}

// ================================================================
// GESTION DU BILAN STAGIAIRE / CANDIDAT
// ================================================================
let currentFormationTab = 'modules'; // 'modules' | 'bilan'
let currentBilanFilter = 'all'; // 'all' | 'completed' | 'pending'

// ----------------------------------------------------------------
// FONCTIONS D'EXPORT CSV POUR LE BILAN
// ----------------------------------------------------------------
function downloadCSV(csvContent, filename) {
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportStagiaireBilanCSV() {
    const user = (typeof actualUserData !== 'undefined' && actualUserData) ? actualUserData : (currentUser || {});
    const userName = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Stagiaire';
    const promoName = document.getElementById('promoCurrentName')?.textContent.trim() || 'BAFA';
    const modules = (currentFormationModulesList || []).filter(m => m.visible !== false);

    let csv = `Bilan de formation BAFA - ${promoName}\r\n`;
    csv += `Stagiaire : "${userName.replace(/"/g, '""')}";Email : "${(user.email || '').replace(/"/g, '""')}";Date d'export : "${new Date().toLocaleDateString('fr-FR')}"\r\n\r\n`;
    csv += `Module N°;Titre Module;Statut;Score (%);Score QCM;Tentatives;Dernière épreuve\r\n`;

    modules.forEach(m => {
        const sub = stagiaireSubmissionsMap ? stagiaireSubmissionsMap[m.id] : null;
        const isCompleted = !!sub;
        const numStr = `Module ${m.num < 10 ? '0' + m.num : m.num}`;
        const title = (m.title || '').replace(/"/g, '""');
        const status = isCompleted ? 'Complété' : 'À réaliser';
        const scorePct = (sub && sub.score && typeof sub.score.percent === 'number') ? `${sub.score.percent}%` : (isCompleted ? 'Transmis' : '--');
        const scoreDetail = (sub && sub.score && typeof sub.score.correct === 'number') ? `${sub.score.correct}/${sub.score.total}` : '--';
        const attempts = sub ? (sub.attemptsCount || 1) : 0;
        const lastDate = sub ? formatFullDate(sub.submittedAt) : '--';

        csv += `"${numStr}";"${title}";"${status}";"${scorePct}";"${scoreDetail}";"${attempts}";"${lastDate}"\r\n`;
    });

    const safeName = userName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    downloadCSV(csv, `Bilan_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Export CSV de votre bilan téléchargé.", "success");
}

function exportPromoBilanCSV() {
    const promoName = document.getElementById('promoCurrentName')?.textContent.trim() || 'Promo';
    const totalModules = (currentFormationModulesList || []).length;
    const candidates = adminAllCandidatesList || [];

    let csv = `Bilan Général Promotion - ${promoName}\r\n`;
    csv += `Date d'export : "${new Date().toLocaleDateString('fr-FR')}";Total Candidats : ${candidates.length};Total Modules : ${totalModules}\r\n\r\n`;
    csv += `Candidat;Email;Statut;Modules Validés;Total Modules;Complétion (%);Score Moyen (%);Épreuves passées;Dernière activité\r\n`;

    candidates.forEach(cand => {
        const candData = adminAllSubmissionsByUser[cand.uid];
        const candModulesMap = candData?.modulesMap || {};
        const allSubs = candData?.allSubs || [];
        const completedCount = Object.keys(candModulesMap).length;
        const completionPct = totalModules > 0 ? Math.round((completedCount / totalModules) * 100) : 0;

        let status = 'Non commencé';
        if (completedCount >= totalModules && totalModules > 0) {
            status = 'Validé';
        } else if (completedCount > 0) {
            status = 'En cours';
        }

        const candScores = [];
        Object.values(candModulesMap).forEach(sub => {
            if (sub.score && typeof sub.score.percent === 'number') {
                candScores.push(sub.score.percent);
            }
        });
        const avgScore = candScores.length > 0 ? `${Math.round(candScores.reduce((a, b) => a + b, 0) / candScores.length)}%` : (completedCount > 0 ? 'Transmis' : '--');

        let lastDateText = '--';
        if (allSubs.length > 0) {
            const sorted = [...allSubs].sort((a, b) => {
                const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                return tb - ta;
            });
            lastDateText = formatFullDate(sorted[0].submittedAt);
        }

        const displayName = cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || 'Candidat';
        const email = cand.email || '';

        csv += `"${displayName.replace(/"/g, '""')}";"${email.replace(/"/g, '""')}";"${status}";${completedCount};${totalModules};"${completionPct}%";"${avgScore}";${allSubs.length};"${lastDateText}"\r\n`;
    });

    const safePromo = promoName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    downloadCSV(csv, `Bilan_Promo_${safePromo}_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Export CSV de la promotion téléchargé.", "success");
}

async function exportModuleAnalyticsCSV(moduleId) {
    if (!moduleId) moduleId = adminAnalyticsModuleId;
    const mod = (currentFormationModulesList || []).find(m => m.id === moduleId);
    if (!mod) {
        showToast("Aucun module sélectionné pour l'export.", "warning");
        return;
    }

    const subs = adminAllSubmissionsByModule[moduleId] || [];
    const questions = await fetchModuleQuestions(moduleId);

    let csv = `Résultats détaillés - Module ${mod.num < 10 ? '0' + mod.num : mod.num} : ${(mod.title || '').replace(/"/g, '""')}\r\n`;
    csv += `Date d'export : "${new Date().toLocaleDateString('fr-FR')}";Total copies : ${subs.length}\r\n\r\n`;

    let headers = ['Candidat', 'Email', 'Tentative #', 'Date de soumission', 'Score (%)', 'Score QCM', 'Statut'];
    questions.forEach((q, qIdx) => {
        headers.push(`Q${qIdx + 1} (${(q.type || 'qcm').toUpperCase()})`);
    });
    csv += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(';') + '\r\n';

    subs.forEach(sub => {
        const candName = sub.userName || sub.userEmail || 'Stagiaire';
        const candEmail = sub.userEmail || '';
        const attempt = sub.attemptNumber || 1;
        const subDate = formatFullDate(sub.submittedAt);
        const scorePct = (sub.score && typeof sub.score.percent === 'number') ? `${sub.score.percent}%` : 'Transmis';
        const scoreDet = (sub.score && typeof sub.score.correct === 'number') ? `${sub.score.correct}/${sub.score.total}` : '--';
        const status = (sub.score && typeof sub.score.percent === 'number') ? (sub.score.percent >= 50 ? 'Validé' : 'À retravailler') : 'Transmis';

        let row = [candName, candEmail, attempt, subDate, scorePct, scoreDet, status];

        questions.forEach(q => {
            const ans = sub.answers ? sub.answers[q.id] : null;
            let ansStr = '--';
            if (ans !== null && ans !== undefined) {
                if (q.type === 'qcm') {
                    const userIndices = Array.isArray(ans)
                        ? ans.map(n => parseInt(n, 10))
                        : (ans !== null && ans !== undefined && ans !== '' ? [parseInt(ans, 10)] : []);
                    const texts = userIndices.map(idx => (q.options && q.options[idx]) ? q.options[idx] : `Choix #${idx + 1}`);
                    ansStr = texts.length > 0 ? texts.join(', ') : '--';
                } else if (q.type === 'boolean') {
                    ansStr = (ans === true || ans === 'true') ? 'VRAI' : 'FAUX';
                } else if (typeof ans === 'object') {
                    ansStr = JSON.stringify(ans);
                } else {
                    ansStr = String(ans).trim();
                }
            }
            row.push(ansStr);
        });

        csv += row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(';') + '\r\n';
    });

    const safeTitle = (mod.title || `Module_${mod.num}`).replace(/[^a-zA-Z0-9_\-]/g, '_');
    downloadCSV(csv, `Resultats_Module_${mod.num < 10 ? '0' + mod.num : mod.num}_${safeTitle}_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Export CSV du module téléchargé.", "success");
}

function exportCandidateAdminBilanCSV(cand, candModulesMap) {
    if (!cand) return;
    const displayName = cand.displayName || `${cand.firstName || ''} ${cand.lastName || ''}`.trim() || cand.email || 'Candidat';
    const promoName = document.getElementById('promoCurrentName')?.textContent.trim() || 'BAFA';
    const modules = currentFormationModulesList || [];

    let csv = `Bilan Individuel Candidat - ${promoName}\r\n`;
    csv += `Candidat : "${displayName.replace(/"/g, '""')}";Email : "${(cand.email || '').replace(/"/g, '""')}";Date d'export : "${new Date().toLocaleDateString('fr-FR')}"\r\n\r\n`;
    csv += `Module N°;Titre Module;Statut;Score (%);Score QCM;Tentative #;Date de soumission\r\n`;

    modules.forEach(m => {
        const sub = candModulesMap ? candModulesMap[m.id] : null;
        const isCompleted = !!sub;
        const numStr = `Module ${m.num < 10 ? '0' + m.num : m.num}`;
        const title = (m.title || '').replace(/"/g, '""');
        const status = isCompleted ? 'Complété' : 'Non commencé';
        const scorePct = (sub && sub.score && typeof sub.score.percent === 'number') ? `${sub.score.percent}%` : (isCompleted ? 'Transmis' : '--');
        const scoreDetail = (sub && sub.score && typeof sub.score.correct === 'number') ? `${sub.score.correct}/${sub.score.total}` : '--';
        const attempt = sub ? (sub.attemptNumber || 1) : '--';
        const lastDate = sub ? formatFullDate(sub.submittedAt) : '--';

        csv += `"${numStr}";"${title}";"${status}";"${scorePct}";"${scoreDetail}";"${attempt}";"${lastDate}"\r\n`;
    });

    const safeName = displayName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    downloadCSV(csv, `Bilan_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
    showToast("Export CSV du candidat téléchargé.", "success");
}

function initBilanTabs() {
    const tabModules = document.getElementById('tabFormationModules');
    const tabBilan = document.getElementById('tabFormationBilan');
    const btnRefresh = document.getElementById('btnRefreshBilan');
    const btnExportStagiaire = document.getElementById('btnExportStagiaireBilanPdf');
    const btnExportStagiaireCsv = document.getElementById('btnExportStagiaireBilanCsv');
    const filterBtns = document.querySelectorAll('#bilanFilterButtons .es-bilan-filter-btn');

    tabModules?.addEventListener('click', () => switchFormationTab('modules'));
    tabBilan?.addEventListener('click', () => switchFormationTab('bilan'));

    btnExportStagiaire?.addEventListener('click', () => {
        exportStagiaireBilanPDF({
            candidateUser: (typeof actualUserData !== 'undefined' && actualUserData) ? actualUserData : (currentUser || {}),
            modulesList: currentFormationModulesList,
            submissionsMap: stagiaireSubmissionsMap,
            promoName: document.getElementById('promoCurrentName')?.textContent.trim()
        });
    });

    btnExportStagiaireCsv?.addEventListener('click', () => {
        exportStagiaireBilanCSV();
    });

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

    if (effectiveRole === 'admin' || effectiveRole === 'formateur') {
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

async function toggleBilanModuleAccordion(moduleId, btn) {
    const acc = document.getElementById(`bilanAccordion_${moduleId}`);
    if (!acc) return;

    const isHidden = acc.classList.contains('hidden');
    const arrow = btn ? btn.querySelector('.accordion-arrow') : null;

    if (!isHidden) {
        acc.classList.add('hidden');
        if (arrow) arrow.style.transform = 'rotate(0deg)';
        return;
    }

    acc.classList.remove('hidden');
    if (arrow) arrow.style.transform = 'rotate(180deg)';

    const sub = (typeof stagiaireSubmissionsMap !== 'undefined') ? stagiaireSubmissionsMap[moduleId] : null;
    if (!sub) {
        acc.innerHTML = `<div style="padding:16px; color:var(--clr-text-muted); font-size:0.85rem;">Aucune copie transmise pour ce module.</div>`;
        return;
    }

    try {
        const questions = await fetchModuleQuestions(moduleId);
        const answers = sub.answers || {};

        acc.innerHTML = questions.map((q, qIdx) => {
            const userAns = answers[q.id];
            let ansDisplay = '';

            if (q.type === 'qcm') {
                const userIndices = Array.isArray(userAns)
                    ? userAns.map(n => parseInt(n, 10))
                    : (userAns !== null && userAns !== undefined && userAns !== '' ? [parseInt(userAns, 10)] : []);
                const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

                const sortedUser = [...userIndices].sort((a, b) => a - b);
                const sortedExp = [...expectedIndices].sort((a, b) => a - b);
                const isCorrect = (sortedUser.length === sortedExp.length && sortedUser.length > 0 && sortedUser.every((v, i) => v === sortedExp[i]));

                const options = q.options || [];
                const chosenTexts = sortedUser.map(idx => options[idx]).filter(Boolean);
                const chosenDisplay = chosenTexts.length > 0 ? chosenTexts.join(', ') : 'Pas de réponse';
                const expectedTexts = sortedExp.map(idx => options[idx]).filter(Boolean).join(', ');

                ansDisplay = `
                <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                    <strong>Votre choix :</strong> ${escapeHtml(chosenDisplay)}
                    <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Exact (+1 pt)' : '❌ Incorrect (0 pt)'}</span>
                    ${!isCorrect && expectedTexts ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Bonne(s) réponse(s) : <strong>${escapeHtml(expectedTexts)}</strong>)</div>` : ''}
                </div>`;
            } else if (q.type === 'boolean') {
                const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                const userBool = (userAns === true || userAns === 'true');
                const isCorrect = (userAns !== null && userAns !== undefined && userBool === expectedBool);
                ansDisplay = `
                <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                    <strong>Votre choix :</strong> ${userBool ? '👍 VRAI' : '👎 FAUX'}
                    <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Exact (+1 pt)' : '❌ Incorrect (0 pt)'}</span>
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
                    <div><strong>Repère placé :</strong> ${userCoords ? `X: ${userCoords.x.toFixed(1)}%, Y: ${userCoords.y.toFixed(1)}%` : '<span style="color:var(--clr-danger)">Pas de repère</span>'} <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Dans la cible (+1 pt)' : '❌ Hors cible (0 pt)'}</span></div>
                </div>`;
            } else if (q.type === 'cloze') {
                const clozeMatches = (q.clozeText || '').match(/\[([^\]]+)\]/g) || [];
                const expectedBlanks = clozeMatches.map(m => m.replace(/^\[|\]$/g, '').trim());
                const userAnswersObj = userAns && typeof userAns === 'object' ? userAns : (userAns ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return {}; } })() : {});
                
                let correctBlanksCount = 0;
                expectedBlanks.forEach((expWord, bIdx) => {
                    const uWord = userAnswersObj[bIdx];
                    if (uWord && String(uWord).trim().toLowerCase() === String(expWord).trim().toLowerCase()) {
                        correctBlanksCount++;
                    }
                });
                const isAllCorrect = (expectedBlanks.length > 0) && (correctBlanksCount === expectedBlanks.length);

                ansDisplay = `<div style="background:#ffffff; border:1px solid ${isAllCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                    <div><strong>Texte à trous :</strong> <span style="font-weight:700; color:${isAllCorrect ? '#27ae60' : '#e74c3c'};">${isAllCorrect ? '✅ 100% Correct (+1 pt)' : `❌ ${correctBlanksCount}/${expectedBlanks.length} trou(s) correct(s)`}</span></div>
                </div>`;
            } else if (q.type === 'range') {
                const val = (userAns !== null && userAns !== undefined) ? parseFloat(userAns) : null;
                ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Valeur choisie :</strong> <span style="font-weight:700;">${val !== null ? `${val} ${escapeHtml(q.unit || '')}` : 'Non renseigné'}</span></div>`;
            } else if (q.type === 'puzzle') {
                const order = Array.isArray(userAns) ? userAns : [];
                ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Ordre proposé :</strong> <ol style="margin:4px 0 0 16px; padding:0;">${order.map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ol></div>`;
            } else {
                // Type text / open pour le stagiaire : AUCUNE métadonnée interne visible !
                const qEv = (sub.evaluations && sub.evaluations[q.id]) ? sub.evaluations[q.id] : null;
                let evalBadge = '';
                if (qEv && qEv.status === 'reviewed') {
                    evalBadge = qEv.isCorrect ? `
                        <span style="font-weight:700; color:var(--clr-success); margin-left:8px; font-size:0.82rem;">
                            <i class="bi bi-check-circle-fill"></i> Validé (+1 pt)
                        </span>` : `
                        <span style="font-weight:700; color:var(--clr-danger); margin-left:8px; font-size:0.82rem;">
                            <i class="bi bi-x-circle-fill"></i> Non validé (0 pt)
                        </span>`;
                } else {
                    evalBadge = `
                        <span style="font-size:0.74rem; font-weight:600; color:#e67e22; background:rgba(243,156,18,0.12); padding:2px 8px; border-radius:12px; margin-left:8px;">
                            <i class="bi bi-hourglass-split"></i> En cours d'évaluation par l'équipe pédagogique
                        </span>`;
                }
                ansDisplay = `
                <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
                        <strong>Votre réponse rédigée :</strong>
                        ${evalBadge}
                    </div>
                    <div style="white-space:pre-wrap; color:var(--clr-text);">${escapeHtml(userAns || 'Pas de texte rédigé.')}</div>
                </div>`;
            }

            return `
            <div style="margin-top:12px; padding-top:10px; border-top:1px dashed var(--clr-surface-3);">
                <div style="font-size:0.72rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Question ${qIdx + 1} • ${q.type}</div>
                <div style="font-size:0.88rem; font-weight:600; color:var(--clr-text); margin-top:2px;">${escapeHtml(q.text)}</div>
                ${ansDisplay}
            </div>`;
        }).join('');

    } catch (err) {
        console.error("toggleBilanModuleAccordion error:", err);
        acc.innerHTML = `<div style="padding:16px; color:var(--clr-danger); font-size:0.85rem;">Erreur lors du chargement de la copie.</div>`;
    }
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
    const btnExportPromo = document.getElementById('btnExportPromoPdf');
    const btnExportPromoCsv = document.getElementById('btnExportPromoCsv');
    const btnExportModuleCsv = document.getElementById('btnExportModuleCsv');
    const moduleSelect = document.getElementById('adminAnalyticsModuleSelect');

    btnExportPromo?.addEventListener('click', () => {
        exportPromoBilanPDF({
            promoName: document.getElementById('promoCurrentName')?.textContent.trim(),
            candidatesList: adminAllCandidatesList,
            submissionsByUser: adminAllSubmissionsByUser,
            modulesList: currentFormationModulesList
        });
    });

    btnExportPromoCsv?.addEventListener('click', () => {
        exportPromoBilanCSV();
    });

    btnExportModuleCsv?.addEventListener('click', () => {
        exportModuleAnalyticsCSV(adminAnalyticsModuleId);
    });

    btnCandidates?.addEventListener('click', () => {
        adminBilanSubtab = 'candidates';
        btnCandidates.classList.add('active');
        btnCandidates.setAttribute('aria-selected', 'true');
        btnAnalytics?.classList.remove('active');
        btnAnalytics?.setAttribute('aria-selected', 'false');
        viewCandidates?.classList.remove('hidden');
        viewAnalytics?.classList.add('hidden');
    });

    btnAnalytics?.addEventListener('click', () => {
        adminBilanSubtab = 'analytics';
        btnAnalytics.classList.add('active');
        btnAnalytics.setAttribute('aria-selected', 'true');
        btnCandidates?.classList.remove('active');
        btnCandidates?.setAttribute('aria-selected', 'false');
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
        let completedCandidatesCount = 0;
        let activeCandidatesCount = 0;
        let totalSubmissionsCount = 0;
        let totalCompletionRatesSum = 0;
        let allScoresPromo = [];

        adminAllCandidatesList.forEach(cand => {
            const userData = adminAllSubmissionsByUser[cand.uid];
            const candModulesMap = userData?.modulesMap || {};
            const completedCount = Object.keys(candModulesMap).length;
            const subsList = userData?.allSubs || [];

            if (completedCount >= totalModules && totalModules > 0) {
                completedCandidatesCount++;
            } else if (completedCount > 0) {
                activeCandidatesCount++;
            }

            if (completedCount > 0) {
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
        const inactiveCount = Math.max(0, totalCandidates - (completedCandidatesCount + activeCandidatesCount));

        // Mise à jour de l'affichage des KPIs
        const kpiTotalCand = document.getElementById('adminKpiTotalCandidates');
        const kpiActiveCand = document.getElementById('adminKpiActiveCandidates');
        const kpiAvgScore = document.getElementById('adminKpiAvgScore');
        const kpiAvgScoreSub = document.getElementById('adminKpiAvgScoreSub');
        const kpiTotalSubs = document.getElementById('adminKpiTotalSubmissions');
        const kpiAvgCompletion = document.getElementById('adminKpiAvgCompletion');

        const totalActiveOrCompleted = completedCandidatesCount + activeCandidatesCount;
        if (kpiTotalCand) kpiTotalCand.textContent = totalCandidates;
        if (kpiActiveCand) kpiActiveCand.textContent = `${totalActiveOrCompleted} candidat${totalActiveOrCompleted > 1 ? 's' : ''} actif${totalActiveOrCompleted > 1 ? 's' : ''}`;
        if (kpiAvgScore) kpiAvgScore.textContent = avgScorePromo !== null ? `${avgScorePromo}%` : '--%';
        if (kpiAvgScoreSub) kpiAvgScoreSub.textContent = allScoresPromo.length > 0 ? `Sur ${allScoresPromo.length} copies notées` : 'Aucune note disponible';
        if (kpiTotalSubs) kpiTotalSubs.textContent = totalSubmissionsCount;
        if (kpiAvgCompletion) kpiAvgCompletion.textContent = `${avgCompletion}% de complétion moyenne`;

        // Mise à jour des compteurs filtres
        const cAll = document.getElementById('adminCandidateCountAll');
        const cComp = document.getElementById('adminCandidateCountCompleted');
        const cAct = document.getElementById('adminCandidateCountActive');
        const cInact = document.getElementById('adminCandidateCountInactive');
        if (cAll) cAll.textContent = totalCandidates;
        if (cComp) cComp.textContent = completedCandidatesCount;
        if (cAct) cAct.textContent = activeCandidatesCount;
        if (cInact) cInact.textContent = inactiveCount;

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
        const isFullyCompleted = (completedCount >= totalModules && totalModules > 0);
        const isInProgress = (completedCount > 0 && !isFullyCompleted);
        const isNotStarted = (completedCount === 0);

        if (adminCandidateFilter === 'completed' && !isFullyCompleted) return false;
        if (adminCandidateFilter === 'active' && !isInProgress) return false;
        if (adminCandidateFilter === 'inactive' && !isNotStarted) return false;

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
                <td colspan="7" style="text-align:center; padding:36px 16px; color:var(--clr-text-muted);">
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

        // Statut du candidat
        let statusBadge = '<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-dash-circle"></i> Non commencé</span>';
        if (completedCount >= totalModules && totalModules > 0) {
            statusBadge = '<span class="es-badge es-badge--approved" style="font-size:0.75rem; background:rgba(46,204,113,0.15); color:#27ae60; font-weight:700;"><i class="bi bi-check-circle-fill"></i> Validé</span>';
        } else if (completedCount > 0) {
            statusBadge = '<span class="es-badge" style="font-size:0.75rem; background:rgba(243,156,18,0.15); color:#d35400; font-weight:700;"><i class="bi bi-hourglass-split"></i> En cours</span>';
        }

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
            <td style="text-align:center;">${statusBadge}</td>
            <td style="text-align:center;">
                <div style="font-weight:700; font-size:0.88rem; color:var(--clr-text);">${completedCount} / ${totalModules} <span style="font-size:0.75rem; color:var(--clr-text-muted);">(${completionPct}%)</span></div>
                <div class="es-progress-bar-wrap" style="margin:4px auto 0 auto; max-width:140px;">
                    <div class="es-progress-bar-inner" style="width:${completionPct}%; background:${completionPct >= 100 ? '#27ae60' : 'var(--clr-primary)'};"></div>
                </div>
            </td>
            <td style="text-align:center;">${scoreBadge}</td>
            <td style="text-align:center;">
                <span class="es-badge es-badge--approved" style="font-size:0.78rem;">${allSubs.length} tentative${allSubs.length > 1 ? 's' : ''}</span>
            </td>
            <td style="text-align:center;">${lastDateText}</td>
            <td style="text-align:center;">
                <div style="display:inline-flex; flex-direction:column; align-items:center; gap:5px;">
                    <button type="button" class="es-btn es-btn--primary es-btn--sm btn-open-candidate-sheet" data-user-id="${cand.uid}" style="padding:5px 12px; font-size:0.8rem; font-weight:700; width:100%; justify-content:center; white-space:nowrap;">
                        <i class="bi bi-person-lines-fill"></i> Voir le bilan
                    </button>
                    <div style="display:inline-flex; gap:5px; width:100%; justify-content:center;">
                        <button type="button" class="es-btn es-btn--ghost btn-download-candidate-pdf" data-user-id="${cand.uid}" title="Télécharger le bilan PDF de ce candidat" style="padding:3px 8px; font-size:0.75rem; font-weight:600; color:#e74c3c; border-color:rgba(231,76,60,0.3); background:rgba(231,76,60,0.06); border-radius:4px; display:inline-flex; align-items:center; gap:4px; flex:1; justify-content:center;">
                            <i class="bi bi-file-earmark-pdf-fill"></i> PDF
                        </button>
                        <button type="button" class="es-btn es-btn--ghost btn-download-candidate-csv" data-user-id="${cand.uid}" title="Télécharger le bilan CSV de ce candidat" style="padding:3px 8px; font-size:0.75rem; font-weight:600; color:#198754; border-color:rgba(25,135,84,0.3); background:rgba(25,135,84,0.06); border-radius:4px; display:inline-flex; align-items:center; gap:4px; flex:1; justify-content:center;">
                            <i class="bi bi-file-earmark-spreadsheet-fill"></i> CSV
                        </button>
                    </div>
                </div>
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

    // Listeners pour télécharger le CSV du candidat
    tbody.querySelectorAll('.btn-download-candidate-csv').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const uid = btn.getAttribute('data-user-id');
            const cand = adminAllCandidatesList.find(u => u.uid === uid);
            if (!cand) return;
            const candData = adminAllSubmissionsByUser[uid];
            const candModulesMap = candData?.modulesMap || {};
            exportCandidateAdminBilanCSV(cand, candModulesMap);
        });
    });

    // Listeners pour télécharger directement le PDF du candidat
    tbody.querySelectorAll('.btn-download-candidate-pdf').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const uid = btn.getAttribute('data-user-id');
            const cand = adminAllCandidatesList.find(u => u.uid === uid);
            if (!cand) return;
            const candData = adminAllSubmissionsByUser[uid];
            const candModulesMap = candData?.modulesMap || {};
            exportStagiaireBilanPDF({
                candidateUser: cand,
                modulesList: currentFormationModulesList,
                submissionsMap: candModulesMap,
                promoName: document.getElementById('promoCurrentName')?.textContent.trim()
            });
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
                    const userIndices = Array.isArray(ans)
                        ? ans.map(n => parseInt(n, 10))
                        : (ans !== null && ans !== undefined && ans !== '' ? [parseInt(ans, 10)] : []);
                    userIndices.forEach(idx => {
                        choiceDistribution[idx] = (choiceDistribution[idx] || 0) + 1;
                    });
                    const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                        ? q.correctIndexes.map(n => parseInt(n, 10))
                        : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

                    const sortedUser = [...userIndices].sort((a, b) => a - b);
                    const sortedExp = [...expectedIndices].sort((a, b) => a - b);
                    const isCorrect = (sortedUser.length === sortedExp.length && sortedUser.length > 0 && sortedUser.every((v, i) => v === sortedExp[i]));
                    if (isCorrect) correctCount++;
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
                const correctIndexes = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];
                breakdownHtml = `
                <div class="es-distribution-legend">
                    ${options.map((opt, optIdx) => {
                        const count = choiceDistribution[optIdx] || 0;
                        const pct = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
                        const isCorrectOpt = correctIndexes.includes(optIdx);
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

    // Bouton de téléchargement du PDF de ce candidat
    const btnExportModalPdf = document.getElementById('btnExportAdminCandidatePdf');
    if (btnExportModalPdf) {
        btnExportModalPdf.onclick = () => {
            exportStagiaireBilanPDF({
                candidateUser: cand,
                modulesList: currentFormationModulesList,
                submissionsMap: candModulesMap,
                promoName: document.getElementById('promoCurrentName')?.textContent.trim()
            });
        };
    }

    // Bouton de téléchargement du CSV de ce candidat
    const btnExportModalCsv = document.getElementById('btnExportAdminCandidateCsv');
    if (btnExportModalCsv) {
        btnExportModalCsv.onclick = () => {
            exportCandidateAdminBilanCSV(cand, candModulesMap);
        };
    }

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
                        const userIndices = Array.isArray(userAns)
                            ? userAns.map(n => parseInt(n, 10))
                            : (userAns !== null && userAns !== undefined && userAns !== '' ? [parseInt(userAns, 10)] : []);
                        const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                            ? q.correctIndexes.map(n => parseInt(n, 10))
                            : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

                        const sortedUser = [...userIndices].sort((a, b) => a - b);
                        const sortedExp = [...expectedIndices].sort((a, b) => a - b);
                        const isCorrect = (sortedUser.length === sortedExp.length && sortedUser.length > 0 && sortedUser.every((v, i) => v === sortedExp[i]));

                        const options = q.options || [];
                        const chosenTexts = sortedUser.map(idx => options[idx]).filter(Boolean);
                        const chosenDisplay = chosenTexts.length > 0 ? chosenTexts.join(', ') : 'Pas de réponse';
                        const expectedTexts = sortedExp.map(idx => options[idx]).filter(Boolean).join(', ');

                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                            <strong>Choix candidat :</strong> ${escapeHtml(chosenDisplay)}
                            <span style="margin-left:8px; font-weight:700; color:${isCorrect ? '#27ae60' : '#e74c3c'};">${isCorrect ? '✅ Exact' : '❌ Faux'}</span>
                            ${!isCorrect && expectedTexts ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">(Bonne(s) réponse(s) : <strong>${escapeHtml(expectedTexts)}</strong>)</div>` : ''}
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
                    } else if (q.type === 'cloze') {
                        const clozeMatches = (q.clozeText || '').match(/\[([^\]]+)\]/g) || [];
                        const expectedBlanks = clozeMatches.map(m => m.replace(/^\[|\]$/g, '').trim());
                        const userAnswersObj = userAns && typeof userAns === 'object' ? userAns : (userAns ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return {}; } })() : {});
                        
                        let correctBlanksCount = 0;
                        expectedBlanks.forEach((expWord, bIdx) => {
                            const uWord = userAnswersObj[bIdx];
                            if (uWord && String(uWord).trim().toLowerCase() === String(expWord).trim().toLowerCase()) {
                                correctBlanksCount++;
                            }
                        });
                        const isAllCorrect = (expectedBlanks.length > 0) && (correctBlanksCount === expectedBlanks.length);

                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid ${isAllCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;">
                            <strong>Texte à trous :</strong> <span style="font-weight:700; color:${isAllCorrect ? '#27ae60' : '#e74c3c'};">${isAllCorrect ? '✅ 100% Exact (+1 pt)' : `❌ ${correctBlanksCount}/${expectedBlanks.length} trou(s) correct(s)`}</span>
                        </div>`;
                    } else if (q.type === 'range') {
                        const val = (userAns !== null && userAns !== undefined) ? parseFloat(userAns) : null;
                        ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Curseur :</strong> <span style="font-weight:700;">${val !== null ? `${val} ${escapeHtml(q.unit || '')}` : 'Non renseigné'}</span> (Cible : ${q.correctValue || '—'})</div>`;
                    } else if (q.type === 'puzzle') {
                        const order = Array.isArray(userAns) ? userAns : [];
                        ansDisplay = `<div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:10px 12px; margin-top:6px; font-size:0.86rem;"><strong>Ordre proposé :</strong> <ol style="margin:4px 0 0 16px; padding:0;">${order.map(it => `<li>${escapeHtml(it)}</li>`).join('')}</ol></div>`;
                    } else {
                        const ev = (sub.evaluations && sub.evaluations[q.id]) ? sub.evaluations[q.id] : { autoSuggested: null, isCorrect: null, status: 'auto_draft', gradedByUid: null };
                        const isAdminUser = (actualRole === 'admin' || actualUserData?.role === 'admin' || (typeof isAnimAdmin !== 'undefined' && isAnimAdmin) || (typeof isFormateurAdmin !== 'undefined' && isFormateurAdmin) || (typeof currentRole !== 'undefined' && currentRole === 'admin'));
                        const isTranche = (ev.status === 'reviewed' && !!ev.gradedByUid);

                        let autoDraftBadge = '';
                        if (ev.autoSuggested === true) {
                            autoDraftBadge = `<span class="es-badge" style="background:rgba(46, 204, 113, 0.14); color:#27ae60; font-size:0.75rem; padding:2px 8px; border-radius:12px;"><i class="bi bi-robot"></i> 1er jet algo : Vrai</span>`;
                        } else if (ev.autoSuggested === false) {
                            autoDraftBadge = `<span class="es-badge" style="background:rgba(231, 76, 60, 0.14); color:#e74c3c; font-size:0.75rem; padding:2px 8px; border-radius:12px;"><i class="bi bi-robot"></i> 1er jet algo : Faux</span>`;
                        }

                        let statusBadge = '';
                        let metaChip = '';
                        if (isTranche) {
                            const isOk = (ev.isCorrect === true);
                            statusBadge = `<span style="font-weight:700; color:${isOk ? 'var(--clr-success)' : 'var(--clr-danger)'}; font-size:0.86rem;">${isOk ? '✅ Validé (Vrai)' : '❌ Invalidé (Faux)'}</span>`;
                            metaChip = `
                            <div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:6px; padding:4px 8px; background:rgba(0,0,0,0.04); border-radius:4px; border:1px solid var(--clr-surface-3);">
                                <i class="bi bi-shield-check" style="color:var(--clr-primary);"></i> Tranché par <strong>${escapeHtml(ev.gradedByName || 'Équipe pédagogique')}</strong> (${ev.gradedByRole || 'formateur'}) le ${formatFullDate(ev.gradedAt)}
                            </div>`;
                        } else {
                            statusBadge = `<span style="font-size:0.78rem; font-weight:600; color:#e67e22; background:rgba(243,156,18,0.12); padding:2px 8px; border-radius:12px;"><i class="bi bi-hourglass-split"></i> En attente de validation</span>`;
                        }

                        let actionButtonsHtml = '';
                        if (isAdminUser || !isTranche) {
                            actionButtonsHtml = `
                            <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
                                <button type="button" class="es-btn es-btn--sm ${ev.isCorrect === true ? 'es-btn--primary' : 'es-btn--ghost'} btn-grade-eval" data-module-id="${m.id}" data-sub-id="${sub.id}" data-q-id="${q.id}" data-val="true" style="padding:4px 10px; font-size:0.78rem;">
                                    <i class="bi bi-check-lg"></i> Vrai (Valider)
                                </button>
                                <button type="button" class="es-btn es-btn--sm ${ev.isCorrect === false ? 'es-btn--danger' : 'es-btn--ghost'} btn-grade-eval" data-module-id="${m.id}" data-sub-id="${sub.id}" data-q-id="${q.id}" data-val="false" style="padding:4px 10px; font-size:0.78rem;">
                                    <i class="bi bi-x-lg"></i> Faux (Invalider)
                                </button>
                                ${isAdminUser && isTranche ? `<span style="font-size:0.72rem; color:var(--clr-text-muted);">(Admin : modifiable)</span>` : ''}
                            </div>`;
                        } else {
                            actionButtonsHtml = `
                            <div style="margin-top:8px; font-size:0.74rem; color:var(--clr-text-muted); background:rgba(0,0,0,0.03); padding:4px 8px; border-radius:4px; border:1px solid var(--clr-surface-3);">
                                <i class="bi bi-lock-fill" style="color:var(--clr-warning);"></i> Décision tranchée et verrouillée (seul l'administrateur peut modifier).
                            </div>`;
                        }

                        ansDisplay = `
                        <div style="background:#ffffff; border:1px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:6px; font-size:0.88rem; line-height:1.5; color:var(--clr-text);">
                            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <strong>Réponse rédigée :</strong>
                                    ${autoDraftBadge}
                                </div>
                                <div>${statusBadge}</div>
                            </div>
                            <div style="white-space:pre-wrap; color:var(--clr-text); font-size:0.88rem;">${escapeHtml(userAns || 'Pas de texte rédigé.')}</div>
                            ${q.hint ? `<div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:6px;"><i class="bi bi-lightbulb"></i> Piste attendue : ${escapeHtml(q.hint)}</div>` : ''}
                            ${metaChip}
                            ${actionButtonsHtml}
                        </div>`;
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
                        </button>
                        ${(actualRole === 'admin') ? `
                        <button type="button" class="es-btn es-btn--danger es-btn--sm btn-delete-candidate-module-sub" data-user-id="${cand.uid}" data-module-id="${m.id}" data-user-name="${escapeHtml(displayName)}" data-module-title="${escapeHtml(m.title)}" style="font-size:0.78rem; padding:4px 10px;" title="Supprimer les réponses de ce candidat pour ce module">
                            <i class="bi bi-trash3"></i> Supprimer
                        </button>` : ''}
                        ` : ''}
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

            list.querySelectorAll('.btn-grade-eval').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const modId = btn.getAttribute('data-module-id');
                    const subId = btn.getAttribute('data-sub-id');
                    const qId = btn.getAttribute('data-q-id');
                    const decision = (btn.getAttribute('data-val') === 'true');
                    await gradeOpenQuestionAnswer(modId, subId, qId, decision, btn);
                });
            });

            list.querySelectorAll('.btn-delete-candidate-module-sub').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const uId = btn.getAttribute('data-user-id');
                    const mId = btn.getAttribute('data-module-id');
                    const uName = btn.getAttribute('data-user-name');
                    const mTitle = btn.getAttribute('data-module-title');
                    openSingleDeleteConfirmModal({ userId: uId, moduleId: mId, userName: uName, moduleTitle: mTitle });
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

    // Vérifier si le compte stagiaire ou formateur correspond exactement à la promo en cours
    if ((userData.role === 'stagiaire' || userData.role === 'formateur') && typeof isUserPromoMismatch === 'function') {
        const mismatch = await isUserPromoMismatch(userData, currentPromoId, user.uid);
        if (mismatch) {
            if (typeof showFormationExpiredScreen === 'function') {
                showFormationExpiredScreen();
            }
            return;
        }
    } else if (userData.role === 'stagiaire' && typeof isStagiairePromoMismatch === 'function' && isStagiairePromoMismatch(userData, currentPromoId)) {
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

    // Initialiser le dropdown switcher d'espace pour l'admin et formateur
    const btnBrandDropdown = document.getElementById('btnBrandDropdown');
    const brandDropdownMenu = document.getElementById('brandDropdownMenu');
    const brandChevron = document.getElementById('brandChevron');
    const menuItemColos = document.getElementById('menuItemColos');

    if (actualRole === 'admin' || actualRole === 'formateur') {
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

// ----------------------------------------------------------------
// REDIRECTION ÉDITION / GESTION DU MODULE (PAGE DÉDIÉE)
// ----------------------------------------------------------------
function openAddQuestionFormateur(moduleId) {
    if (moduleId) {
        window.location.href = `formation-edit.html?id=${encodeURIComponent(moduleId)}`;
    } else {
        window.location.href = 'formation-edit.html';
    }
}




// ================================================================
// MODULE IA : AUDIT QUALITÉ, ORTHOGRAPHE & COHÉRENCE DES QUIZ (ADMIN)
// ================================================================

let _lastAIAuditRawReport = "";
let _aiAuditEventsInitialized = false;

async function getGeminiApiKey() {
    let key = '';

    // 1. Lire depuis globalSettings/dashboard (enregistré par l'onglet Configuration de l'administration)
    try {
        const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
        if (globalDoc.exists && globalDoc.data().geminiKey) {
            key = globalDoc.data().geminiKey.trim();
        }
    } catch (e) {}

    // 2. Lire depuis le profil de l'utilisateur admin connecté
    if (!key && currentUser) {
        try {
            const uDoc = await db.collection('users').doc(currentUser.uid).get();
            if (uDoc.exists && uDoc.data().geminiKey) {
                key = uDoc.data().geminiKey.trim();
            }
        } catch (e) {}
    }

    // 3. Fallback : parcourir les comptes administrateurs pour récupérer la clé configurée
    if (!key) {
        try {
            const adminSnap = await db.collection('users').where('role', '==', 'admin').get();
            for (const d of adminSnap.docs) {
                if (d.data().geminiKey) {
                    key = d.data().geminiKey.trim();
                    break;
                }
            }
        } catch (e) {}
    }

    // 4. Fallback localStorage
    if (!key) {
        try {
            const localSaved = localStorage.getItem('gemini_api_key') || localStorage.getItem('GEMINI_API_KEY');
            if (localSaved) key = localSaved.trim();
        } catch (e) {}
    }

    return key;
}

let _cachedGeminiModelsList = null;

async function getAvailableGeminiModels(apiKey) {
    if (_cachedGeminiModelsList && _cachedGeminiModelsList.length > 0) {
        return _cachedGeminiModelsList;
    }

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            const rawModels = data.models || [];
            
            // Filtrer les modèles supportant generateContent
            const usableModels = rawModels
                .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
                .map(m => m.name.replace(/^models\//, ''))
                .filter(name => !name.includes('vision') && !name.includes('embedding') && !name.includes('aqa') && !name.includes('learnlm') && !name.includes('pro'));

            // Prioriser les modèles Flash (forfait 100% gratuit)
            const flashModels = usableModels.filter(m => m.includes('flash'));
            const otherModels = usableModels.filter(m => !m.includes('flash'));

            const ordered = [...flashModels, ...otherModels];
            if (ordered.length > 0) {
                _cachedGeminiModelsList = ordered;
                return ordered;
            }
        }
    } catch (e) {
        console.warn("Échec découverte dynamique des modèles Gemini:", e);
    }

    // Fallback si la liste ne peut être requêtée
    return ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash-8b'];
}

async function callGeminiForAudit(apiKey, prompt) {
    // Résolution dynamique des modèles actifs et autorisés sur votre clé API
    const models = await getAvailableGeminiModels(apiKey);
    let lastError = "";

    for (const model of models) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        responseMimeType: "application/json",
                        temperature: 0.1,
                        maxOutputTokens: 8192
                    }
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
                if (lastError.includes('API key not valid')) {
                    throw new Error("Clé API Gemini non valide.");
                }
                console.warn(`Modèle ${model} erreur (${response.status}):`, lastError);
            }
        } catch (e) {
            lastError = e.message;
            if (e.message?.includes('non valide')) throw e;
            console.warn(`Modèle ${model} exception:`, e);
        }
    }

    if (lastError.includes('quota') || lastError.includes('RESOURCE_EXHAUSTED')) {
        throw new Error("Quota gratuit Google Gemini temporairement atteint (Rate limit). Réessayez dans quelques instants.");
    }

    throw new Error(lastError || "Impossible de joindre l'API Google Gemini.");
}

async function openAIAuditModal() {
    const select = document.getElementById('selectAIAuditScope');
    const noKeyAlert = document.getElementById('aiAuditNoKeyAlert');
    const resultsContainer = document.getElementById('aiAuditResultsContainer');
    const initialState = document.getElementById('aiAuditInitialState');
    const loadingState = document.getElementById('aiAuditLoadingState');
    const btnCopy = document.getElementById('btnCopyAIAuditReport');

    if (resultsContainer) resultsContainer.classList.add('hidden');
    if (loadingState) loadingState.classList.add('hidden');
    if (initialState) initialState.classList.remove('hidden');
    if (btnCopy) btnCopy.classList.add('hidden');

    // Vérifier clé API
    const key = await getGeminiApiKey();
    if (noKeyAlert) {
        noKeyAlert.classList.toggle('hidden', Boolean(key));
    }

    // Peupler le sélecteur avec les modules existants
    if (select) {
        const modules = currentFormationModulesList || [];
        select.innerHTML = `
            <option value="all">📚 Tous les modules (${modules.length} modules)</option>
            ${modules.map(m => `
                <option value="${m.id}">Module ${m.num < 10 ? '0' + m.num : m.num} : ${escapeHtml(m.title || 'Sans titre')} (${m.questionsCount || (m.questions ? m.questions.length : 0)} question(s))</option>
            `).join('')}
        `;
    }

    openModal('overlayAIAuditFormation');
}

async function executeAIAudit() {
    const btn = document.getElementById('btnLaunchAIAudit');
    const select = document.getElementById('selectAIAuditScope');
    const noKeyAlert = document.getElementById('aiAuditNoKeyAlert');
    const resultsContainer = document.getElementById('aiAuditResultsContainer');
    const initialState = document.getElementById('aiAuditInitialState');
    const loadingState = document.getElementById('aiAuditLoadingState');
    const btnCopy = document.getElementById('btnCopyAIAuditReport');

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        if (noKeyAlert) noKeyAlert.classList.remove('hidden');
        showToast("Clé API Gemini introuvable. Veuillez l'ajouter dans l'Admin.", "warning");
        return;
    }
    if (noKeyAlert) noKeyAlert.classList.add('hidden');

    const scope = select ? select.value : 'all';
    let targetModules = [];
    if (scope === 'all') {
        targetModules = currentFormationModulesList || [];
    } else {
        const found = (currentFormationModulesList || []).find(m => m.id === scope);
        if (found) targetModules = [found];
    }

    if (targetModules.length === 0) {
        showToast("Aucun module à analyser.", "warning");
        return;
    }

    btnLoading(btn, true);
    if (initialState) initialState.classList.add('hidden');
    if (resultsContainer) resultsContainer.classList.add('hidden');
    if (loadingState) loadingState.classList.remove('hidden');
    if (btnCopy) btnCopy.classList.add('hidden');

    try {
        // 1. Préparer les données de tous les modules cibles (allégé et propre)
        const modulesPayload = [];
        for (const mod of targetModules) {
            const questions = await fetchModuleQuestions(mod.id);
            modulesPayload.push({
                moduleId: mod.id,
                moduleNum: mod.num,
                moduleTitle: mod.title || '',
                questions: questions.map((q, idx) => ({
                    questionId: q.id,
                    order: idx + 1,
                    type: q.type || 'qcm',
                    text: q.text || '',
                    options: q.options || [],
                    correctIndex: q.correctIndex !== undefined ? q.correctIndex : null,
                    correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : null,
                    hint: q.hint || ''
                }))
            });
        }

        // 2. Construire le prompt d'analyse
        const prompt = `Tu es un expert pédagogique national BAFA/BAFD et un correcteur d'édition professionnel de langue française.
Mission : Effectuer un audit qualité complet sur les modules et questions de quiz suivants :

${JSON.stringify(modulesPayload)}

Critères stricts d'évaluation :
1. "orthographe" : Fautes d'orthographe, coquilles, grammaire, accords, ponctuation, majuscules nécessaires ou manquantes (énoncés, options de réponse, pistes).
2. "coherence" : 
   - Pour les QCM : est-ce que la réponse déclarée correcte (correctIndex) est incontestable et exacte selon la réglementation BAFA ? Y a-t-il 2 options plausibles ou aucune bonne option ?
   - Pour les Vrai/Faux : l'affirmation est-elle claire, sans double négation trompeuse ?
   - Les options de réponses sont-elles claires et non ambiguës ?
3. "pedagogie" : Qualité pédagogique pour des candidats BAFA (niveau de difficulté adapté, consigne claire, absence de piège injustifié, indice pertinent).

INSTRUCTIONS DE RÉPONSE :
Réponds UNIQUEMENT par un objet JSON valide au format strict suivant :
{
  "globalScore": 92,
  "summary": "Court résumé de la qualité globale...",
  "stats": {
    "orthographeCount": 2,
    "coherenceCount": 1,
    "pedagogieCount": 1
  },
  "issues": [
    {
      "type": "orthographe",
      "severity": "medium",
      "moduleId": "identifiant_module",
      "moduleTitle": "Titre du module",
      "questionNum": 1,
      "questionText": "Énoncé court",
      "problem": "Explication claire de l'erreur constatée",
      "suggestion": "Texte ou consigne corrigée recommandée"
    }
  ]
}`;

        // 3. Appel Gemini
        const rawAiResponse = await callGeminiForAudit(apiKey, prompt);
        _lastAIAuditRawReport = rawAiResponse;

        // 4. Parser le JSON avec extraction et tolérance robuste
        let cleanJsonStr = rawAiResponse.trim();
        if (cleanJsonStr.startsWith('```json')) {
            cleanJsonStr = cleanJsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
        } else if (cleanJsonStr.startsWith('```')) {
            cleanJsonStr = cleanJsonStr.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        let auditData = null;
        try {
            auditData = JSON.parse(cleanJsonStr);
        } catch (jsonErr) {
            console.warn("JSON parse direct failed, attempting extraction:", jsonErr);
            const firstBrace = cleanJsonStr.indexOf('{');
            const lastBrace = cleanJsonStr.lastIndexOf('}');
            if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                const extracted = cleanJsonStr.substring(firstBrace, lastBrace + 1);
                auditData = JSON.parse(extracted);
            } else {
                throw new Error("Format JSON non structuré reçu de l'IA.");
            }
        }

        // 5. Afficher les résultats
        renderAIAuditResults(auditData);

        if (loadingState) loadingState.classList.add('hidden');
        if (resultsContainer) resultsContainer.classList.remove('hidden');
        if (btnCopy) btnCopy.classList.remove('hidden');
        showToast("Audit IA terminé avec succès !", "success");

    } catch (err) {
        console.error("AI Audit error:", err);
        if (loadingState) loadingState.classList.add('hidden');
        if (initialState) initialState.classList.remove('hidden');
        showToast("Erreur lors de l'analyse IA : " + (err.message || err), "error", 6000);
    } finally {
        btnLoading(btn, false);
    }
}

function renderAIAuditResults(data) {
    const summaryCard = document.getElementById('aiAuditSummaryCard');
    const detailsList = document.getElementById('aiAuditDetailsList');
    if (!summaryCard || !detailsList) return;

    const score = parseInt(data.globalScore, 10) || 100;
    const issues = data.issues || [];
    const stats = data.stats || {
        orthographeCount: issues.filter(i => i.type === 'orthographe').length,
        coherenceCount: issues.filter(i => i.type === 'coherence').length,
        pedagogieCount: issues.filter(i => i.type === 'pedagogie').length
    };

    let scoreColor = 'var(--clr-success)';
    let scoreBg = 'var(--clr-success-soft)';
    let scoreText = 'Excellente qualité pédagogique';
    if (score < 70) {
        scoreColor = 'var(--clr-danger)';
        scoreBg = 'var(--clr-danger-soft)';
        scoreText = 'Corrections recommandées';
    } else if (score < 85) {
        scoreColor = 'var(--clr-accent)';
        scoreBg = 'var(--clr-warning-soft)';
        scoreText = 'Bonne qualité globale (quelques retouches suggérées)';
    }

    summaryCard.innerHTML = `
        <div style="background:var(--clr-surface-2); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:18px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:16px;">
            <div style="display:flex; align-items:center; gap:14px;">
                <div style="width:58px; height:58px; border-radius:50%; background:${scoreBg}; border:3px solid ${scoreColor}; display:flex; flex-direction:column; align-items:center; justify-content:center; color:${scoreColor}; font-weight:800; font-size:1.15rem; line-height:1; flex-shrink:0;">
                    <span>${score}</span>
                    <span style="font-size:0.6rem; opacity:0.8;">/ 100</span>
                </div>
                <div>
                    <div style="font-size:1rem; font-weight:800; color:var(--clr-text);">${scoreText}</div>
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:2px; max-width:480px; line-height:1.4;">
                        ${escapeHtml(data.summary || 'Analyse terminée avec succès.')}
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <span class="es-badge es-badge--danger" style="font-weight:700;">
                    <i class="bi bi-spellcheck"></i> ${stats.orthographeCount || 0} orthographe
                </span>
                <span class="es-badge es-badge--pending" style="font-weight:700;">
                    <i class="bi bi-question-diamond"></i> ${stats.coherenceCount || 0} cohérence
                </span>
                <span class="es-badge" style="background:var(--clr-info-soft); color:var(--clr-info); font-weight:700;">
                    <i class="bi bi-lightbulb"></i> ${stats.pedagogieCount || 0} conseil(s)
                </span>
            </div>
        </div>
    `;

    if (issues.length === 0) {
        detailsList.innerHTML = `
            <div style="text-align:center; padding:32px 20px; background:var(--clr-success-soft); border:1.5px solid rgba(39, 174, 96, 0.25); border-radius:var(--radius-md);">
                <div style="font-size:2rem; margin-bottom:8px;">🎉</div>
                <div style="font-weight:700; color:var(--clr-success); font-size:1rem;">Aucune anomalie détectée !</div>
                <p style="font-size:0.82rem; color:var(--clr-text-muted); margin:4px 0 0 0;">Vos modules et questions sont impeccables, sans faute d'orthographe et parfaitement cohérents.</p>
            </div>
        `;
        return;
    }

    detailsList.innerHTML = issues.map((iss, idx) => {
        let typeBadge = '';
        let typeBorderCol = 'var(--clr-surface-3)';
        if (iss.type === 'orthographe') {
            typeBadge = `<span class="es-badge es-badge--danger"><i class="bi bi-spellcheck"></i> Orthographe</span>`;
            typeBorderCol = 'rgba(231, 76, 60, 0.25)';
        } else if (iss.type === 'coherence') {
            typeBadge = `<span class="es-badge es-badge--pending"><i class="bi bi-question-diamond"></i> Cohérence Quiz</span>`;
            typeBorderCol = 'rgba(243, 156, 18, 0.25)';
        } else {
            typeBadge = `<span class="es-badge" style="background:var(--clr-info-soft); color:var(--clr-info);"><i class="bi bi-lightbulb"></i> Pédagogie</span>`;
            typeBorderCol = 'rgba(41, 128, 185, 0.25)';
        }

        return `
            <div style="background:var(--clr-surface); border:1.5px solid ${typeBorderCol}; border-radius:var(--radius-md); padding:16px; box-shadow:var(--shadow-sm);">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                    <div style="display:flex; align-items:center; gap:8px;">
                        ${typeBadge}
                        <span style="font-weight:700; font-size:0.86rem; color:var(--clr-text);">
                            ${escapeHtml(iss.moduleTitle || 'Module')} ${iss.questionNum ? `• Question ${iss.questionNum}` : ''}
                        </span>
                    </div>
                    ${iss.moduleId ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-ai-audit-edit-module" data-module-id="${iss.moduleId}" style="padding:4px 10px; font-size:0.75rem;">
                            <i class="bi bi-pencil"></i> Modifier le module
                        </button>
                    ` : ''}
                </div>

                ${iss.questionText ? `
                    <div style="font-size:0.84rem; color:var(--clr-text-muted); font-style:italic; margin-bottom:8px; padding:8px 12px; background:var(--clr-surface-2); border-left:3px solid var(--clr-primary); border-radius:4px;">
                        « ${escapeHtml(iss.questionText)} »
                    </div>
                ` : ''}

                <div style="font-size:0.88rem; color:var(--clr-text); line-height:1.45; margin-bottom:8px;">
                    <strong style="color:var(--clr-danger);">Anomalie constatée :</strong> ${escapeHtml(iss.problem || '')}
                </div>

                <div style="font-size:0.86rem; background:var(--clr-success-soft); border:1px solid rgba(39, 174, 96, 0.25); border-radius:6px; padding:10px 12px; color:var(--clr-text); line-height:1.45;">
                    <strong style="color:var(--clr-success);"><i class="bi bi-check-circle-fill"></i> Proposition corrigée :</strong> ${escapeHtml(iss.suggestion || '')}
                </div>
            </div>
        `;
    }).join('');

    // Listener "Modifier le module"
    detailsList.querySelectorAll('.btn-ai-audit-edit-module').forEach(btn => {
        btn.addEventListener('click', async () => {
            const mId = btn.getAttribute('data-module-id');
            closeModal('overlayAIAuditFormation');
            if (mId) {
                await openFormationModuleEdit(mId);
            }
        });
    });
}

function initAIAuditEvents() {
    if (_aiAuditEventsInitialized) return;
    _aiAuditEventsInitialized = true;

    document.getElementById('btnOpenAIAuditFormation')?.addEventListener('click', openAIAuditModal);
    document.getElementById('btnCloseAIAuditModal')?.addEventListener('click', () => closeModal('overlayAIAuditFormation'));
    document.getElementById('btnCloseAIAuditFooter')?.addEventListener('click', () => closeModal('overlayAIAuditFormation'));
    document.getElementById('btnLaunchAIAudit')?.addEventListener('click', executeAIAudit);

    document.getElementById('btnCopyAIAuditReport')?.addEventListener('click', () => {
        if (!_lastAIAuditRawReport) return;
        navigator.clipboard.writeText(_lastAIAuditRawReport).then(() => {
            showToast("Rapport d'audit IA copié dans le presse-papier !", "success");
        }).catch(() => {
            showToast("Impossible de copier le rapport.", "error");
        });
    });
}

// Initialisation au chargement
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAIAuditEvents);
} else {
    initAIAuditEvents();
}


