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
                    <span style="font-weight:700; font-size:0.85rem; color:var(--clr-primary-xdark);">Question ${idx + 1}</span>
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
