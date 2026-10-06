/* ================================================================
   ESPACE-FORMATION-RESULTS.JS
   Page dédiée pour la consultation approfondie des copies,
   la notation des rédactions libres, les statistiques et les exports (CSV/PDF).
   Réservé aux Administrateurs et Formateurs BAFA.
   ================================================================ */

let currentUser = null;
let currentRole = 'stagiaire';
let actualUserData = null;
let allFormationModules = [];
let selectedModuleId = null;
let allLoadedSubmissions = [];
let filteredSubmissions = [];
let currentFilterStatus = 'all';
let currentSearchQuery = '';
let activeInspectingSubmission = null;
let cachedModuleQuestions = {};

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

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || null;
}

// ----------------------------------------------------------------
// RÉCUPÉRATION DES QUESTIONS D'UN MODULE
// ----------------------------------------------------------------
async function getModuleQuestions(moduleId) {
    if (cachedModuleQuestions[moduleId]) {
        return cachedModuleQuestions[moduleId];
    }
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
        if (!snap.empty) {
            const qList = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            cachedModuleQuestions[moduleId] = qList;
            return qList;
        }
    } catch (e) {
        console.warn("getModuleQuestions subcollection error:", e);
    }
    const mod = allFormationModules.find(m => m.id === moduleId);
    const fallback = mod?.questions || [];
    cachedModuleQuestions[moduleId] = fallback;
    return fallback;
}

// ----------------------------------------------------------------
// CHARGEMENT INITIAL DES DONNÉES
// ----------------------------------------------------------------
async function loadResultsData() {
    const loader = document.getElementById('pageLoader');
    const header = document.getElementById('resultsHeader');
    const mainView = document.getElementById('resultsMainView');

    try {
        const paramModId = getQueryParam('module') || getQueryParam('id');

        // Charger tous les modules
        const modSnap = await db.collection('formation').orderBy('num', 'asc').get();
        if (!modSnap.empty) {
            allFormationModules = modSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            allFormationModules = [];
        }

        // Remplir le dropdown des modules
        const selectFilter = document.getElementById('selectModuleFilter');
        if (selectFilter) {
            selectFilter.innerHTML = `
                <option value="all">🌐 Tous les modules (Vue globale)</option>
                ${allFormationModules.map(m => `
                    <option value="${m.id}" ${m.id === paramModId ? 'selected' : ''}>
                        Module ${m.num < 10 ? '0' + m.num : m.num} : ${escapeHtml(m.title)}
                    </option>
                `).join('')}
            `;
        }

        selectedModuleId = paramModId || 'all';

        // Charger les soumissions
        await fetchAllSubmissions();

        if (loader) loader.classList.add('hidden');
        if (header) header.style.display = 'block';
        if (mainView) mainView.style.display = 'block';

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("loadResultsData error:", err);
        showToast("Erreur lors du chargement des réponses.", "error");
    }
}

async function fetchAllSubmissions() {
    allLoadedSubmissions = [];

    const modulesToFetch = (selectedModuleId && selectedModuleId !== 'all') 
        ? allFormationModules.filter(m => m.id === selectedModuleId) 
        : allFormationModules;

    for (const mod of modulesToFetch) {
        try {
            const subSnap = await db.collection('formation').doc(mod.id).collection('submissions').get();
            if (!subSnap.empty) {
                subSnap.docs.forEach(doc => {
                    allLoadedSubmissions.push({
                        ...doc.data(),
                        id: doc.id,
                        moduleId: mod.id,
                        moduleNum: mod.num,
                        moduleTitle: mod.title
                    });
                });
            }
        } catch (e) {
            console.warn(`Could not fetch subs for module ${mod.id}:`, e);
        }
    }

    // Trier par date décroissante
    allLoadedSubmissions.sort((a, b) => {
        const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
        const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
        return tb - ta;
    });

    updateHeaderInfo();
    updateStatsCards();
    applyFiltersAndRender();
}

function updateHeaderInfo() {
    const headerTitle = document.getElementById('headerModuleTitle');
    const headerBadge = document.getElementById('headerModuleBadge');
    const btnEdit = document.getElementById('btnEditCurrentModule');
    const btnTest = document.getElementById('btnTestCurrentQuiz');

    if (selectedModuleId && selectedModuleId !== 'all') {
        const mod = allFormationModules.find(m => m.id === selectedModuleId);
        if (mod) {
            headerTitle.textContent = `Réponses : ${mod.title}`;
            headerBadge.textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;
            if (btnEdit) {
                btnEdit.href = `formation-edit.html?id=${encodeURIComponent(mod.id)}`;
                btnEdit.classList.remove('hidden');
            }
            if (btnTest) {
                btnTest.href = `quiz.html?module=${encodeURIComponent(mod.id)}`;
                btnTest.classList.remove('hidden');
            }
        }
    } else {
        headerTitle.textContent = "Bilan global de tous les modules";
        headerBadge.textContent = "Vue d'ensemble";
        if (btnEdit) btnEdit.classList.add('hidden');
        if (btnTest) btnTest.classList.add('hidden');
    }
}

// ----------------------------------------------------------------
// CALCUL DES STATISTIQUES
// ----------------------------------------------------------------
function updateStatsCards() {
    const totalAttempts = allLoadedSubmissions.length;
    const uniqueUids = new Set(allLoadedSubmissions.map(s => s.userId).filter(Boolean));
    const uniqueCount = uniqueUids.size;

    let passedCount = 0;
    let sumPercent = 0;

    allLoadedSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        sumPercent += pct;
        if (pct >= 50) passedCount++;
    });

    const avgScore = totalAttempts > 0 ? Math.round(sumPercent / totalAttempts) : 0;
    const successRate = totalAttempts > 0 ? Math.round((passedCount / totalAttempts) * 100) : 0;

    document.getElementById('statTotalAttempts').textContent = totalAttempts;
    document.getElementById('statUniqueStagiaires').textContent = uniqueCount;
    document.getElementById('statSuccessRate').textContent = `${successRate}%`;
    document.getElementById('statAverageScore').textContent = `${avgScore}%`;

    // Filtres compteurs
    let countPassed = 0;
    let countFailed = 0;
    let countToGrade = 0;

    allLoadedSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        if (pct >= 50) countPassed++;
        else countFailed++;

        if (s.evaluations) {
            const hasDraft = Object.values(s.evaluations).some(ev => ev.status === 'auto_draft');
            if (hasDraft) countToGrade++;
        }
    });

    document.getElementById('countFilterAll').textContent = totalAttempts;
    document.getElementById('countFilterPassed').textContent = countPassed;
    document.getElementById('countFilterFailed').textContent = countFailed;
    document.getElementById('countFilterToGrade').textContent = countToGrade;
}

// ----------------------------------------------------------------
// FILTRAGE ET AFFICHAGE DU TABLEAU
// ----------------------------------------------------------------
function applyFiltersAndRender() {
    const tableBody = document.getElementById('submissionsTableBody');
    const emptyPlaceholder = document.getElementById('emptySubmissionsPlaceholder');
    if (!tableBody) return;

    filteredSubmissions = allLoadedSubmissions.filter(sub => {
        // Recherche
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            const name = (sub.userName || '').toLowerCase();
            const email = (sub.userEmail || '').toLowerCase();
            const modTitle = (sub.moduleTitle || '').toLowerCase();
            if (!name.includes(q) && !email.includes(q) && !modTitle.includes(q)) {
                return false;
            }
        }

        // Filtre statut
        const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
        if (currentFilterStatus === 'passed' && pct < 50) return false;
        if (currentFilterStatus === 'failed' && pct >= 50) return false;
        if (currentFilterStatus === 'to_grade') {
            const hasDraft = sub.evaluations && Object.values(sub.evaluations).some(ev => ev.status === 'auto_draft');
            if (!hasDraft) return false;
        }

        return true;
    });

    if (filteredSubmissions.length === 0) {
        tableBody.innerHTML = '';
        if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
        return;
    }

    if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

    tableBody.innerHTML = filteredSubmissions.map((sub, idx) => {
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
                <td>
                    <div style="font-weight:600; color:var(--clr-text); font-size:0.86rem;">
                        <span class="es-badge es-badge--stagiaire" style="font-size:0.68rem; padding:1px 5px; margin-right:4px;">Mod. ${sub.moduleNum || ''}</span>
                        ${escapeHtml(sub.moduleTitle || '')}
                    </div>
                </td>
                <td>
                    <span style="font-size:0.82rem; font-weight:600; color:var(--clr-text);">Tentative #${sub.attemptNumber || 1}</span>
                    ${sub.timeExpired ? '<span style="font-size:0.72rem; color:var(--clr-danger); display:block;">⏰ Expiré</span>' : ''}
                </td>
                <td>
                    <span style="font-size:0.82rem; color:var(--clr-text-muted);">${formatDate(sub.submittedAt)}</span>
                </td>
                <td>
                    <span style="font-weight:800; font-size:0.95rem; color:${isPassed ? 'var(--clr-success)' : 'var(--clr-danger)'};">${pct}%</span>
                    <span style="font-size:0.78rem; color:var(--clr-text-muted); margin-left:4px;">(${scoreRatio})</span>
                </td>
                <td>${statusBadgeHtml}</td>
                <td style="text-align:right;">
                    <button type="button" class="es-btn es-btn--primary es-btn--sm btn-inspect-submission" data-sub-idx="${idx}" style="font-weight:600; padding:6px 14px; font-size:0.82rem;">
                        <i class="bi bi-eye-fill"></i> Inspecter la copie
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('.btn-inspect-submission').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-sub-idx'), 10);
            const sub = filteredSubmissions[idx];
            if (sub) openSubmissionInspectionModal(sub);
        });
    });
}

// ----------------------------------------------------------------
// MODAL D'INSPECTION DÉTAILLÉE D'UNE COPIE & NOTATION
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
        metaEl.textContent = `Module ${sub.moduleNum || ''} : ${sub.moduleTitle || ''} • Tentative #${sub.attemptNumber || 1} • Transmise le ${formatDate(sub.submittedAt)}`;
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

    if (questionsContainer) {
        questionsContainer.innerHTML = `
            <div style="text-align:center; padding:20px; color:var(--clr-text-muted);">
                <span class="es-spinner" style="width:16px; height:16px; display:inline-block; vertical-align:middle; margin-right:8px;"></span>
                Chargement des questions du module…
            </div>
        `;
    }

    modal.classList.remove('hidden');

    // Récupérer les questions
    const questions = await getModuleQuestions(sub.moduleId);
    renderInspectionQuestions(questions, activeInspectingSubmission);
}

function renderInspectionQuestions(questions, sub) {
    const container = document.getElementById('reviewQuestionsContainer');
    if (!container) return;

    if (!questions || questions.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--clr-text-muted);">Aucune question enregistrée pour ce module.</div>`;
        return;
    }

    const answers = sub.answers || {};
    const evaluations = sub.evaluations || {};

    let questionCounter = 0;
    container.innerHTML = questions.map((q, idx) => {
        if (q.type === 'section') {
            return `
                <div style="background:var(--clr-surface); border:1.5px solid var(--clr-primary); border-radius:var(--radius-md); padding:16px 20px; margin: 20px 0 10px 0;">
                    <div style="font-size:0.75rem; font-weight:800; color:var(--clr-primary); text-transform:uppercase; letter-spacing:0.5px;">
                        <i class="bi bi-bookmark-fill"></i> Section
                    </div>
                    <div style="font-size:1.1rem; font-weight:800; color:var(--clr-text); margin-top:2px;">
                        ${escapeHtml(q.title || q.text || 'Section')}
                    </div>
                    ${q.description ? `<div style="font-size:0.84rem; color:var(--clr-text-muted); margin-top:4px; line-height:1.4;">${escapeHtml(q.description)}</div>` : ''}
                </div>
            `;
        }

        questionCounter++;
        const currentQNum = questionCounter;
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
        } else if (type === 'image_choice') {
            const chosenIdx = ans !== undefined && ans !== null && ans !== '' ? parseInt(ans, 10) : -1;
            const correctIdx = q.correctIndex !== undefined ? q.correctIndex : 0;
            const isCorrect = (chosenIdx === correctIdx);
            const options = q.imageOptions || [];

            const optionsHtml = options.map((opt, oIdx) => {
                const isSelected = (chosenIdx === oIdx);
                const isExpected = (correctIdx === oIdx);
                let borderStyle = 'border:1.5px solid var(--clr-surface-3); background:var(--clr-surface);';
                let badge = '';

                if (isSelected && isExpected) {
                    borderStyle = 'border:2px solid var(--clr-success); background:rgba(39, 174, 96, 0.08);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-success); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-check-circle-fill"></i> Choisie & Correcte</span>`;
                } else if (isSelected && !isExpected) {
                    borderStyle = 'border:2px solid var(--clr-danger); background:rgba(231, 76, 60, 0.08);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-danger); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-x-circle-fill"></i> Réponse choisie</span>`;
                } else if (isExpected) {
                    borderStyle = 'border:2px dashed var(--clr-success); background:rgba(39, 174, 96, 0.05);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-success); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-check"></i> Attendu</span>`;
                }

                return `
                    <div style="position:relative; border-radius:var(--radius-sm); padding:10px; display:flex; flex-direction:column; gap:6px; ${borderStyle}">
                        ${badge}
                        <div style="width:100%; height:110px; background:#181c19; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                            <img src="${escapeHtml(opt.imageUrl || '')}" alt="Option ${oIdx + 1}" style="max-width:100%; max-height:100%; object-fit:contain;">
                        </div>
                        <div style="font-size:0.82rem; font-weight:700; color:var(--clr-text); text-align:center;">
                            ${escapeHtml(opt.label || ('Option ' + (oIdx + 1)))}
                        </div>
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        } else if (type === 'table_choice') {
            const col1 = q.col1Label || 'VRAI';
            const col2 = q.col2Label || 'FAUX';
            const rows = q.tableRows || [];
            const userAnsObj = (ans && typeof ans === 'object') ? ans : {};

            const tableRowsHtml = rows.map((row, rIdx) => {
                const userRow = userAnsObj[rIdx] || {};
                const uCol1 = !!userRow.col1;
                const uCol2 = !!userRow.col2;
                const expCol1 = !!row.correctCol1;
                const expCol2 = !!row.correctCol2;
                const isRowCorrect = (uCol1 === expCol1 && uCol2 === expCol2);

                const getCellState = (uSelected, expSelected) => {
                    if (uSelected && expSelected) {
                        return { icon: '<i class="bi bi-check-circle-fill" style="color:var(--clr-success); font-size:1.1rem;"></i>', style: 'background:rgba(39,174,96,0.12);' };
                    } else if (uSelected && !expSelected) {
                        return { icon: '<i class="bi bi-x-circle-fill" style="color:var(--clr-danger); font-size:1.1rem;"></i>', style: 'background:rgba(231,76,60,0.12);' };
                    } else if (!uSelected && expSelected) {
                        return { icon: '<i class="bi bi-arrow-right-circle" style="color:var(--clr-success); font-size:1rem;" title="Attendu"></i>', style: 'background:rgba(39,174,96,0.05);' };
                    }
                    return { icon: '<span style="color:var(--clr-surface-3); font-size:1.1rem;">○</span>', style: '' };
                };

                const cell1 = getCellState(uCol1, expCol1);
                const cell2 = getCellState(uCol2, expCol2);

                return `
                    <tr style="border-bottom:1px solid var(--clr-surface-3); ${isRowCorrect ? '' : 'background:rgba(231,76,60,0.03);'}">
                        <td style="padding:10px 14px; font-size:0.85rem; font-weight:600; color:var(--clr-text);">
                            <span style="font-weight:800; color:var(--clr-text-muted); margin-right:6px;">${rIdx + 1}.</span>
                            ${escapeHtml(row.text || '')}
                        </td>
                        <td style="text-align:center; padding:8px; ${cell1.style}">
                            ${cell1.icon}
                        </td>
                        <td style="text-align:center; padding:8px; ${cell2.style}">
                            ${cell2.icon}
                        </td>
                    </tr>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--clr-surface-2); border-bottom:2px solid var(--clr-surface-3);">
                                <th style="padding:10px 14px; font-size:0.8rem; font-weight:800; text-align:left;">Affirmation</th>
                                <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col1)}</th>
                                <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col2)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (type === 'classification') {
            const categories = q.categories || [];
            const items = q.items || [];
            const userPlacements = (ans && typeof ans === 'object') ? ans : {};

            const catBoxesHtml = categories.map(cat => {
                const placedItems = items.filter(it => userPlacements[it.id] === cat.id);
                const itemsBadges = placedItems.map(it => {
                    const isCorrect = (it.categoryId === cat.id);
                    const expectedCat = categories.find(c => c.id === it.categoryId);
                    return `
                        <span class="es-badge" style="background:${isCorrect ? 'rgba(39, 174, 96, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; color:${isCorrect ? '#27ae60' : '#e74c3c'}; border:1px solid ${isCorrect ? 'rgba(39, 174, 96, 0.3)' : 'rgba(231, 76, 60, 0.3)'}; padding:4px 8px; font-size:0.8rem; font-weight:700;">
                            <i class="bi ${isCorrect ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
                            ${escapeHtml(it.text || '')}
                            ${!isCorrect ? `<small style="font-size:0.7rem; opacity:0.85; margin-left:4px;">(attendu : ${escapeHtml(expectedCat?.title || 'autre')})</small>` : ''}
                        </span>
                    `;
                }).join('');

                const unplacedExpected = items.filter(it => it.categoryId === cat.id && userPlacements[it.id] !== cat.id);
                const missingBadges = unplacedExpected.map(it => `
                    <span class="es-badge" style="background:rgba(243, 156, 18, 0.1); color:#d68910; border:1px dashed rgba(243, 156, 18, 0.4); padding:4px 8px; font-size:0.75rem;">
                        <i class="bi bi-dash-circle"></i> Non placé : ${escapeHtml(it.text || '')}
                    </span>
                `).join('');

                return `
                    <div style="background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-sm); padding:12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:0.85rem; font-weight:800; color:var(--clr-text); border-bottom:1px solid var(--clr-surface-3); padding-bottom:6px;">
                            📁 ${escapeHtml(cat.title || 'Catégorie')}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px; min-height:36px; align-items:center;">
                            ${itemsBadges || '<span style="font-size:0.75rem; color:var(--clr-text-muted); font-style:italic;">Aucune étiquette placée</span>'}
                            ${missingBadges}
                        </div>
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                    ${catBoxesHtml}
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
        } else if (type === 'boolean') {
            const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
            const userBool = (ans === true || ans === 'true' || ans === 1);
            const hasAnswered = (ans !== null && ans !== undefined && ans !== '');
            const isCorrect = (hasAnswered && userBool === expectedBool);

            contentHtml = `
                <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:var(--radius-sm); font-size:0.88rem; font-weight:700; ${isCorrect ? 'background:rgba(39,174,96,0.12); border:1.5px solid var(--clr-success); color:var(--clr-success);' : 'background:rgba(231,76,60,0.12); border:1.5px solid var(--clr-danger); color:var(--clr-danger);'}">
                        ${isCorrect ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-x-circle-fill"></i>'}
                        <span>Réponse choisie : ${hasAnswered ? (userBool ? '👍 VRAI' : '👎 FAUX') : '— (Non répondu)'}</span>
                        ${!isCorrect ? `<span style="font-size:0.75rem; opacity:0.85; margin-left:6px;">(Attendu : ${expectedBool ? 'VRAI' : 'FAUX'})</span>` : ''}
                    </div>
                </div>
            `;
        } else if (type === 'pinpoint') {
            const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
            const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
            const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
            const userCoords = ans && typeof ans === 'object' ? ans : (ans ? (()=>{ try { return JSON.parse(ans); } catch(e){ return null; } })() : null);

            let isCorrect = false;
            if (userCoords && userCoords.x !== undefined && userCoords.y !== undefined) {
                const dx = userCoords.x - targetX;
                const dy = userCoords.y - targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                isCorrect = (dist <= radius);
            }

            contentHtml = `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; font-weight:700;">
                        <span>${isCorrect ? '<span style="color:var(--clr-success);"><i class="bi bi-check-circle-fill"></i> Repère dans la zone tolérée</span>' : '<span style="color:var(--clr-danger);"><i class="bi bi-x-circle-fill"></i> Repère hors zone</span>'}</span>
                        <span style="color:var(--clr-text-muted);">Cible : (${targetX}%, ${targetY}%) ± ${radius}%</span>
                    </div>
                    ${q.pinImage ? `
                        <div class="es-pinpoint-result-zone" style="max-width:440px; margin:0 auto; position:relative; border-radius:6px; overflow:hidden; border:1px solid var(--clr-surface-3); text-align:center;">
                            <img src="${escapeHtml(q.pinImage)}" alt="Résultat repère" style="display:block; margin:0 auto; max-width:100%; height:auto;">
                            <div class="es-pinpoint-target-zone" style="position:absolute; left:${targetX}%; top:${targetY}%; width:${radius * 2}%; aspect-ratio:1 / 1; height:auto; transform:translate(-50%, -50%); border-radius:50%; border:2px dashed #2ecc71; background:rgba(46, 204, 113, 0.25); pointer-events:none;"></div>
                            <div style="position:absolute; left:${targetX}%; top:${targetY}%; transform:translate(-50%, -50%); color:#27ae60; font-size:1.2rem; pointer-events:none;" title="Cible attendue"><i class="bi bi-bullseye"></i></div>
                            ${userCoords ? `
                                <div style="position:absolute; left:${userCoords.x}%; top:${userCoords.y}%; transform:translate(-50%, -50%); color:${isCorrect ? '#27ae60' : '#e74c3c'}; font-size:1.4rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));" title="Position stagiaire"><i class="bi bi-geo-alt-fill"></i></div>
                            ` : ''}
                        </div>
                    ` : '<div style="font-size:0.8rem; color:var(--clr-text-muted);">Aucune image configurée.</div>'}
                </div>
            `;
        } else if (type === 'range') {
            const val = (ans !== undefined && ans !== null) ? parseFloat(ans) : null;
            const targetVal = (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) ? parseFloat(q.correctValue) : null;
            const tol = parseFloat(q.tolerance) || 0;
            const unit = q.unit || '';
            let isCorrect = false;

            if (val !== null && targetVal !== null) {
                isCorrect = Math.abs(val - targetVal) <= tol;
            }

            contentHtml = `
                <div style="margin-top:10px; background:var(--clr-surface); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid ${targetVal !== null ? (isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)') : 'var(--clr-surface-3)'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                        <span style="font-weight:700;">Curseur positionné à : <strong style="color:var(--clr-primary-dark); font-size:0.95rem;">${val !== null ? `${val} ${escapeHtml(unit)}` : '—'}</strong></span>
                        ${targetVal !== null ? `
                            <span style="font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'}; font-size:0.8rem;">
                                ${isCorrect ? '<i class="bi bi-check-circle-fill"></i> Conforme' : `<i class="bi bi-x-circle-fill"></i> Attendu : ${targetVal} ${escapeHtml(unit)} (±${tol})`}
                            </span>
                        ` : '<span style="font-size:0.75rem; color:var(--clr-text-muted);">Pas de correction auto</span>'}
                    </div>
                </div>
            `;
        } else if (type === 'matching') {
            const pairs = q.pairs || [];
            const userMatches = (ans && typeof ans === 'object') ? ans : {};

            const matchesHtml = pairs.map((pair, pIdx) => {
                const userRight = userMatches[pair.left] || userMatches[(pair.left || '').trim()];
                const isMatchedCorrectly = userRight && (userRight.trim().toLowerCase() === (pair.right || '').trim().toLowerCase());

                return `
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.85rem; background:var(--clr-surface); border:1px solid ${isMatchedCorrectly ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:200px;">
                            <span style="font-weight:700; color:var(--clr-primary-dark);">${escapeHtml(pair.left)}</span>
                            <i class="bi bi-arrow-right" style="color:var(--clr-text-muted);"></i>
                            <span style="font-weight:600; color:${userRight ? 'var(--clr-text)' : 'var(--clr-danger)'};">${escapeHtml(userRight || '— (Non relié)')}</span>
                        </div>
                        ${isMatchedCorrectly ?
                            '<span style="color:var(--clr-success); font-weight:700; font-size:0.8rem;"><i class="bi bi-check-circle-fill"></i> Correct</span>' :
                            `<span style="color:var(--clr-danger); font-size:0.75rem; font-weight:600;"><i class="bi bi-x-circle-fill"></i> Attendu : <strong>${escapeHtml(pair.right)}</strong></span>`
                        }
                    </div>
                `;
            }).join('');

            let distractorsHtml = '';
            let distractors = [];
            if (typeof q.rightDistractors === 'string') {
                distractors = q.rightDistractors.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(q.rightDistractors)) {
                distractors = q.rightDistractors.map(s => String(s).trim()).filter(Boolean);
            }
            if (distractors.length > 0) {
                distractorsHtml = `
                    <div style="margin-top:6px; font-size:0.78rem; color:var(--clr-text-muted);">
                        <em>Options pièges / non reliées présentes :</em> ${distractors.map(d => `<span style="background:var(--clr-surface-3); padding:2px 8px; border-radius:4px; margin-left:4px; font-weight:600;">${escapeHtml(d)}</span>`).join('')}
                    </div>
                `;
            }

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${matchesHtml || '<div style="font-size:0.82rem; color:var(--clr-text-muted);">Aucune association définie.</div>'}
                    ${distractorsHtml}
                </div>
            `;
        } else if (type === 'text') {
            const rawUserText = typeof ans === 'string' ? ans : '';
            const userText = rawUserText.trim();
            const evalObj = evaluations[q.id] || {};
            const isAwarded = (evalObj.isCorrect === true);

            contentHtml = `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-text-muted); text-transform:uppercase; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                            <i class="bi bi-chat-square-text-fill" style="color:var(--clr-primary);"></i> Réponse rédigée du candidat :
                        </div>
                        ${userText ? `<div style="padding:12px 14px; background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.88rem; color:var(--clr-text); line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(userText)}</div>` : `<div style="padding:12px 14px; background:var(--clr-surface); border:1.5px dashed var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.85rem; color:var(--clr-text-muted); font-style:italic; text-align:center;">Aucune réponse rédigée.</div>`}
                    </div>

                    ${q.hint ? `
                        <div style="font-size:0.78rem; color:var(--clr-text-muted); background:var(--clr-surface-2); padding:8px 12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                            💡 <strong>Piste pédagogique :</strong> ${escapeHtml(q.hint)}
                        </div>
                    ` : ''}

                    <!-- Section Notation Formateur interactive -->
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
                        <input type="text" class="es-input input-eval-comment" data-qid="${q.id}" value="${escapeHtml(evalObj.comment || '')}" placeholder="Commentaire / remarque du formateur à destination du stagiaire..." style="font-size:0.82rem; padding:6px 10px;">
                    </div>
                </div>
            `;
        }

        return `
            <div style="background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                    <span style="font-weight:700; font-size:0.85rem; color:var(--clr-primary-xdark);">Question ${currentQNum}</span>
                    <span class="es-badge es-badge--stagiaire" style="font-size:0.68rem;">${type.toUpperCase()}</span>
                </div>
                <div style="font-weight:700; font-size:0.92rem; color:var(--clr-text);">${escapeHtml(q.text || '')}</div>
                ${contentHtml}
            </div>
        `;
    }).join('');

    // Listeners pour la notation formateur
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

// Enregistrer les modifications de notation
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

        // Mettre à jour dans la liste locale
        const matchIdx = allLoadedSubmissions.findIndex(s => s.id === activeInspectingSubmission.id);
        if (matchIdx !== -1) {
            allLoadedSubmissions[matchIdx].evaluations = activeInspectingSubmission.evaluations;
        }

        btnLoading(this, false);
        showToast("✅ Notes et commentaires formateur enregistrés avec succès !", "success");
        applyFiltersAndRender();
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

// ----------------------------------------------------------------
// EXPORT CSV & PDF
// ----------------------------------------------------------------
document.getElementById('btnExportCsv')?.addEventListener('click', () => {
    if (allLoadedSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }

    let csvContent = "\uFEFF"; // BOM UTF-8
    csvContent += "Stagiaire;Email;Module Num;Titre Module;Tentative;Score Correct;Score Total;Score Pourcentage;Date\r\n";

    allLoadedSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        const correct = s.score?.correct !== undefined ? s.score.correct : 0;
        const total = s.score?.total !== undefined ? s.score.total : 0;
        csvContent += `"${(s.userName || '').replace(/"/g, '""')}";"${(s.userEmail || '').replace(/"/g, '""')}";${s.moduleNum || ''};"${(s.moduleTitle || '').replace(/"/g, '""')}";${s.attemptNumber || 1};${correct};${total};${pct}%;"${formatDate(s.submittedAt)}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `resultats_formation_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Export CSV généré avec succès !", "success");
});

document.getElementById('btnExportPdf')?.addEventListener('click', () => {
    if (allLoadedSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(16);
        doc.text("Procès-Verbal & Bilan des Quiz Formation BAFA", 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Document officiel généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, 14, 25);

        const tableData = allLoadedSubmissions.map(s => [
            s.userName || s.userEmail || 'Stagiaire',
            `Mod. ${s.moduleNum || ''} - ${s.moduleTitle || ''}`,
            `#${s.attemptNumber || 1}`,
            `${s.score?.percent !== undefined ? s.score.percent : 0}% (${s.score?.correct || 0}/${s.score?.total || 0})`,
            (s.score?.percent >= 50) ? 'Validé' : 'À revoir',
            formatDate(s.submittedAt)
        ]);

        doc.autoTable({
            head: [['Stagiaire', 'Module', 'Tentative', 'Score', 'Résultat', 'Date']],
            body: tableData,
            startY: 32,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [78, 122, 29], textColor: [255, 255, 255] }
        });

        doc.save(`bilan_formation_bafa_${Date.now()}.pdf`);
        showToast("Rapport PDF généré avec succès !", "success");
    } catch (err) {
        console.error("PDF export error:", err);
        showToast("Erreur lors de la génération du PDF.", "error");
    }
});

// ----------------------------------------------------------------
// LISTENERS & RECHERCHE
// ----------------------------------------------------------------
document.getElementById('selectModuleFilter')?.addEventListener('change', (e) => {
    selectedModuleId = e.target.value;
    const url = new URL(window.location);
    if (selectedModuleId && selectedModuleId !== 'all') {
        url.searchParams.set('module', selectedModuleId);
    } else {
        url.searchParams.delete('module');
        url.searchParams.delete('id');
    }
    window.history.replaceState({}, '', url);
    fetchAllSubmissions();
});

document.getElementById('searchSubmissionsInput')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    applyFiltersAndRender();
});

document.querySelectorAll('.filter-status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-status-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterStatus = btn.getAttribute('data-filter');
        applyFiltersAndRender();
    });
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
        }
    } catch (err) {
        console.warn("User profile fetch error:", err);
    }

    if (currentRole !== 'admin' && currentRole !== 'formateur') {
        alert("Accès réservé aux formateurs et administrateurs.");
        window.location.replace('formation.html');
        return;
    }

    loadResultsData();
});
