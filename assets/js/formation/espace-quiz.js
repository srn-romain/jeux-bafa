/* ================================================================
   ESPACE-QUIZ.JS
   Page dédiée pour le passage des épreuves et quiz de formation BAFA
   Gestion stricte du pré-quiz (briefing & avertissement tentatives),
   mode actif avec anti-abandon et affichage du corrigé détaillé.
   ================================================================ */

let currentUser = null;
let currentRole = 'stagiaire';
let actualUserData = null;
let currentModuleData = null;
let currentQuestions = [];
let userPreviousSubmissions = [];
let isQuizActive = false;

// ----------------------------------------------------------------
// GESTION ANTI-ABANDON PENDANT L'ÉPREUVE
// ----------------------------------------------------------------
function handleBeforeUnload(e) {
    if (isQuizActive) {
        const msg = "⚠️ Attention ! Une épreuve est en cours. Si vous quittez ou rechargez maintenant, votre tentative sera perdue.";
        e.preventDefault();
        e.returnValue = msg;
        return msg;
    }
}

// ----------------------------------------------------------------
// UTILITAIRES
// ----------------------------------------------------------------
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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

// ----------------------------------------------------------------
// RÉCUPÉRATION DU MODULE & DES QUESTIONS
// ----------------------------------------------------------------
function getModuleIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('module') || params.get('id') || null;
}

async function loadQuizModule(moduleId) {
    const loader = document.getElementById('pageLoader');
    try {
        let mod = null;
        const docSnap = await db.collection('formation').doc(moduleId).get();
        if (docSnap.exists) {
            mod = { id: docSnap.id, ...docSnap.data() };
        } else if (typeof FORMATION_MODULES !== 'undefined') {
            mod = FORMATION_MODULES.find(m => m.id === moduleId);
        }

        if (!mod) {
            alert("Module introuvable.");
            window.location.href = 'formation.html';
            return;
        }

        // Charger les questions depuis la sous-collection Firestore
        let questions = [];
        try {
            const qSnap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
            if (!qSnap.empty) {
                questions = qSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
        } catch (qErr) {
            console.warn("Could not fetch subcollection questions, fallback to array:", qErr);
        }

        if (questions.length === 0 && mod.questions) {
            questions = mod.questions.map((q, idx) => ({ id: q.id || `q_${idx + 1}`, ...q }));
        }

        currentModuleData = mod;
        currentQuestions = questions;

        // Charger les soumissions antérieures du candidat
        await loadUserSubmissions(moduleId);

        // Afficher l'écran de briefing
        renderBriefingScreen();

        if (loader) loader.classList.add('hidden');
        document.getElementById('quizTopbar').style.display = 'block';

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("loadQuizModule error:", err);
        showToast("Erreur lors du chargement de l'épreuve.", "error");
    }
}

async function loadUserSubmissions(moduleId) {
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('submissions')
            .where('userId', '==', currentUser.uid)
            .get();

        if (!snap.empty) {
            userPreviousSubmissions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            userPreviousSubmissions.sort((a, b) => {
                const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                return tb - ta;
            });
        } else {
            userPreviousSubmissions = [];
        }
    } catch (err) {
        console.warn("loadUserSubmissions error:", err);
        userPreviousSubmissions = [];
    }
}

// ----------------------------------------------------------------
// VUE 1 : ÉCRAN DE BRIEFING & AVERTISSEMENT
// ----------------------------------------------------------------
function renderBriefingScreen() {
    const mod = currentModuleData;
    const qConfig = mod.quizConfig || {};
    const maxAttempts = parseInt(qConfig.maxAttempts, 10) || 0;
    const prevAttempts = userPreviousSubmissions.length;
    const isLocked = (maxAttempts > 0 && prevAttempts >= maxAttempts);
    const showResults = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);

    // Topbar
    document.getElementById('topbarModuleTitle').textContent = qConfig.quizTitle || mod.title;
    document.getElementById('topbarModuleNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;

    // Briefing
    document.getElementById('briefingModuleNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;
    document.getElementById('briefingModuleTitle').textContent = qConfig.quizTitle || mod.title;
    document.getElementById('briefingModuleSubtitle').textContent = mod.subtitle || '';
    document.getElementById('briefingModuleDesc').innerHTML = `
        <div style="font-weight:700; color:var(--clr-primary); margin-bottom:4px;"><i class="bi bi-info-circle"></i> Objectifs & Consignes :</div>
        ${escapeHtml(mod.description || 'Contrôle de connaissances théoriques et pratiques liées à ce module de formation.')}
    `;

    const iconEl = document.getElementById('briefingIcon');
    if (iconEl) iconEl.innerHTML = `<i class="bi ${mod.icon || 'bi-journal-bookmark'}"></i>`;

    // Badges / Pilules
    document.getElementById('pillQuestionsCount').innerHTML = `<i class="bi bi-list-check"></i> <span>${currentQuestions.length} question${currentQuestions.length > 1 ? 's' : ''}</span>`;
    
    const attemptsPill = document.getElementById('pillAttempts');
    const attemptsText = document.getElementById('pillAttemptsText');
    if (maxAttempts > 0) {
        attemptsText.textContent = `Tentative ${Math.min(prevAttempts + 1, maxAttempts)} / ${maxAttempts}`;
        if (isLocked) {
            attemptsPill.className = 'es-quiz-pill es-quiz-pill--warning';
            attemptsText.textContent = `${prevAttempts} / ${maxAttempts} tentatives utilisées`;
        }
    } else {
        attemptsText.textContent = `Tentative #${prevAttempts + 1} (Illimitées)`;
    }

    const pillCorrection = document.getElementById('pillCorrectionText');
    if (showResults) {
        pillCorrection.textContent = "Corrigé immédiat à la fin";
    } else {
        pillCorrection.textContent = "Corrigé différé par le formateur";
    }

    // Gestion du bloc d'avertissement & boutons
    const warningBox = document.getElementById('briefingWarningBox');
    const lockedAlert = document.getElementById('briefingLockedAlert');
    const btnStart = document.getElementById('btnStartQuizNow');
    const btnViewResults = document.getElementById('btnViewPreviousResults');

    if (isLocked) {
        if (warningBox) warningBox.classList.add('hidden');
        if (lockedAlert) lockedAlert.classList.remove('hidden');
        if (btnStart) {
            btnStart.disabled = true;
            btnStart.style.opacity = '0.5';
            btnStart.innerHTML = `<i class="bi bi-lock-fill"></i> Tentatives épuisées (${prevAttempts}/${maxAttempts})`;
        }
        if (showResults && userPreviousSubmissions.length > 0 && btnViewResults) {
            btnViewResults.classList.remove('hidden');
            btnViewResults.onclick = () => renderResultsScreen(userPreviousSubmissions[0]);
        }
    } else {
        if (warningBox) warningBox.classList.remove('hidden');
        if (lockedAlert) lockedAlert.classList.add('hidden');
        if (btnStart) {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
            btnStart.innerHTML = `<i class="bi bi-rocket-takeoff-fill"></i> J'ai compris, commencer l'épreuve`;
            btnStart.onclick = () => startActiveQuiz();
        }
        if (showResults && userPreviousSubmissions.length > 0 && btnViewResults) {
            btnViewResults.classList.remove('hidden');
            btnViewResults.onclick = () => renderResultsScreen(userPreviousSubmissions[0]);
        }
    }

    document.getElementById('quizBriefingView').classList.remove('hidden');
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('quizResultsView').classList.add('hidden');
}

// ----------------------------------------------------------------
// VUE 2 : MODE QUIZ ACTIF (ÉPREUVE EN COURS)
// ----------------------------------------------------------------
function startActiveQuiz() {
    isQuizActive = true;
    window.addEventListener('beforeunload', handleBeforeUnload);

    const mod = currentModuleData;
    const prevAttempts = userPreviousSubmissions.length;
    const maxAttempts = parseInt(mod.quizConfig?.maxAttempts, 10) || 0;

    document.getElementById('activeHeaderNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;
    document.getElementById('activeHeaderTitle').textContent = mod.quizConfig?.quizTitle || mod.title;
    document.getElementById('activeAttemptBadge').innerHTML = `<i class="bi bi-lightning-charge-fill"></i> Tentative #${prevAttempts + 1}${maxAttempts > 0 ? ` / ${maxAttempts}` : ''}`;
    document.getElementById('activeProgressLabel').textContent = `0 / ${currentQuestions.length} répondues`;

    renderQuizQuestions();

    document.getElementById('quizBriefingView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.remove('hidden');
    document.getElementById('quizResultsView').classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderQuizQuestions() {
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;

    if (currentQuestions.length === 0) {
        container.innerHTML = `
        <div style="text-align:center; padding:40px; color:var(--clr-text-muted); background:var(--clr-surface); border-radius:var(--radius-md);">
            <i class="bi bi-info-circle" style="font-size:2rem; display:block; margin-bottom:8px;"></i>
            Aucune question configurée pour ce module.
        </div>`;
        return;
    }

    container.innerHTML = currentQuestions.map((q, qIdx) => {
        let inputHtml = '';
        const imageHtml = q.imageUrl ? `
        <div class="es-quiz-image-box">
            <img src="${escapeHtml(q.imageUrl)}" alt="Illustration question ${qIdx + 1}" onerror="this.parentElement.style.display='none'">
        </div>` : '';

        if (q.type === 'qcm') {
            inputHtml = `
            <div class="es-quiz-options">
                ${(q.options || []).map((opt, optIdx) => `
                    <label class="es-quiz-option-label">
                        <input type="radio" name="question_${q.id}" value="${optIdx}" class="quiz-track-input" required>
                        <span>${escapeHtml(opt)}</span>
                    </label>
                `).join('')}
            </div>`;
        } else if (q.type === 'boolean') {
            inputHtml = `
            <div class="es-boolean-grid">
                <label class="es-boolean-btn-label">
                    <input type="radio" name="question_${q.id}" value="true" class="quiz-track-input" required>
                    <span>👍 VRAI</span>
                </label>
                <label class="es-boolean-btn-label">
                    <input type="radio" name="question_${q.id}" value="false" class="quiz-track-input" required>
                    <span>👎 FAUX</span>
                </label>
            </div>`;
        } else if (q.type === 'range') {
            const minVal = parseFloat(q.min) || 0;
            const maxVal = parseFloat(q.max) || 10;
            const stepVal = parseFloat(q.step) || 1;
            const unit = q.unit || '';
            const defaultVal = Math.round((minVal + maxVal) / 2);

            inputHtml = `
            <div class="es-range-wrap">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <span style="font-size:0.82rem; font-weight:700; color:var(--clr-text-muted);">Ajustez le curseur horizontal :</span>
                    <span class="es-range-display-badge" id="range_val_display_${q.id}">
                        ${defaultVal} ${escapeHtml(unit)}
                    </span>
                </div>
                <input type="range" class="es-range-slider quiz-range-input quiz-track-input" name="question_${q.id}" id="range_input_${q.id}"
                    min="${minVal}" max="${maxVal}" step="${stepVal}" value="${defaultVal}"
                    data-unit="${escapeHtml(unit)}" data-display-id="range_val_display_${q.id}">
                <div class="es-range-labels">
                    <span>${escapeHtml(q.minLabel || String(minVal))} (${minVal})</span>
                    <span>${escapeHtml(q.maxLabel || String(maxVal))} (${maxVal})</span>
                </div>
            </div>`;
        } else if (q.type === 'puzzle') {
            const expectedItems = q.items || [];
            let displayItems = [...expectedItems];
            if (displayItems.length > 1) {
                displayItems.reverse();
            }

            inputHtml = `
            <div class="es-puzzle-wrap">
                <div class="es-puzzle-instructions">
                    <i class="bi bi-info-circle-fill" style="color:var(--clr-primary);"></i>
                    Placez les éléments dans l'ordre exact à l'aide des flèches ⬆️ ⬇️ (ou en glissant-déposant) :
                </div>
                <div class="es-puzzle-list" id="puzzle_list_${q.id}" data-q-id="${q.id}">
                    ${displayItems.map((item, itemIdx) => `
                        <div class="es-puzzle-item" draggable="true" data-item-text="${escapeHtml(item)}">
                            <span class="es-puzzle-handle" title="Glisser pour déplacer"><i class="bi bi-grip-vertical"></i></span>
                            <span class="es-puzzle-num">${itemIdx + 1}</span>
                            <span class="es-puzzle-text">${escapeHtml(item)}</span>
                            <div class="es-puzzle-controls">
                                <button type="button" class="es-puzzle-btn-move btn-puzzle-up" ${itemIdx === 0 ? 'disabled' : ''} title="Monter">
                                    <i class="bi bi-chevron-up"></i>
                                </button>
                                <button type="button" class="es-puzzle-btn-move btn-puzzle-down" ${itemIdx === displayItems.length - 1 ? 'disabled' : ''} title="Descendre">
                                    <i class="bi bi-chevron-down"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;
        } else {
            inputHtml = `
            <div class="es-quiz-textarea-wrap">
                ${q.hint ? `<div class="es-quiz-hint"><i class="bi bi-lightbulb"></i> <strong>Piste :</strong> ${escapeHtml(q.hint)}</div>` : ''}
                <textarea class="es-quiz-textarea quiz-track-input" name="question_${q.id}" placeholder="Rédigez votre réponse détaillée ici..." required></textarea>
            </div>`;
        }

        let typeBadgeLabel = 'QCM';
        if (q.type === 'range') typeBadgeLabel = 'Curseur horizontal';
        else if (q.type === 'boolean') typeBadgeLabel = 'Vrai / Faux';
        else if (q.type === 'puzzle') typeBadgeLabel = 'Puzzle / Ordonnancement';
        else if (q.type === 'text') typeBadgeLabel = 'Réponse rédigée';

        return `
        <div class="es-quiz-question-box" id="q_box_${q.id}">
            <div class="es-quiz-q-num">Question ${qIdx + 1} sur ${currentQuestions.length} • ${typeBadgeLabel}</div>
            <div class="es-quiz-q-text">${escapeHtml(q.text)}</div>
            ${imageHtml}
            ${inputHtml}
        </div>`;
    }).join('');

    attachQuizInteractions(container);
    updateProgress();
}

function attachQuizInteractions(container) {
    // Sliders
    container.querySelectorAll('.quiz-range-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const displayId = e.target.getAttribute('data-display-id');
            const unit = e.target.getAttribute('data-unit') || '';
            const displayEl = document.getElementById(displayId);
            if (displayEl) {
                displayEl.textContent = `${e.target.value} ${unit}`.trim();
            }
            updateProgress();
        });
    });

    // Boutons radio boolean sélection visuelle
    container.querySelectorAll('.es-boolean-btn-label input[type="radio"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const parent = radio.closest('.es-boolean-grid');
            if (parent) {
                parent.querySelectorAll('.es-boolean-btn-label').forEach(lbl => lbl.classList.remove('selected'));
                radio.closest('.es-boolean-btn-label').classList.add('selected');
            }
            updateProgress();
        });
    });

    // Puzzle Move buttons
    container.querySelectorAll('.btn-puzzle-up').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.es-puzzle-item');
            if (item && item.previousElementSibling) {
                item.parentElement.insertBefore(item, item.previousElementSibling);
                updatePuzzleNumbers(item.parentElement);
                updateProgress();
            }
        });
    });

    container.querySelectorAll('.btn-puzzle-down').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const item = e.target.closest('.es-puzzle-item');
            if (item && item.nextElementSibling) {
                item.parentElement.insertBefore(item.nextElementSibling, item);
                updatePuzzleNumbers(item.parentElement);
                updateProgress();
            }
        });
    });

    // Puzzle Drag & Drop
    container.querySelectorAll('.es-puzzle-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            updatePuzzleNumbers(item.parentElement);
            updateProgress();
        });
    });

    container.querySelectorAll('.es-puzzle-list').forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingItem = list.querySelector('.dragging');
            if (!draggingItem) return;
            const siblings = [...list.querySelectorAll('.es-puzzle-item:not(.dragging)')];
            const nextSibling = siblings.find(sibling => {
                const box = sibling.getBoundingClientRect();
                return e.clientY <= box.top + box.height / 2;
            });
            list.insertBefore(draggingItem, nextSibling);
        });
    });

    // Track text & radio changes
    container.querySelectorAll('.quiz-track-input').forEach(inp => {
        inp.addEventListener('input', () => updateProgress());
        inp.addEventListener('change', () => updateProgress());
    });
}

function updatePuzzleNumbers(listEl) {
    if (!listEl) return;
    const items = listEl.querySelectorAll('.es-puzzle-item');
    items.forEach((item, idx) => {
        const numEl = item.querySelector('.es-puzzle-num');
        if (numEl) numEl.textContent = idx + 1;
        const upBtn = item.querySelector('.btn-puzzle-up');
        const downBtn = item.querySelector('.btn-puzzle-down');
        if (upBtn) upBtn.disabled = (idx === 0);
        if (downBtn) downBtn.disabled = (idx === items.length - 1);
    });
}

function updateProgress() {
    const form = document.getElementById('quizFormEl');
    if (!form || currentQuestions.length === 0) return;

    let answeredCount = 0;
    currentQuestions.forEach(q => {
        if (q.type === 'qcm' || q.type === 'boolean') {
            const sel = form.querySelector(`input[name="question_${q.id}"]:checked`);
            if (sel) answeredCount++;
        } else if (q.type === 'range' || q.type === 'puzzle') {
            answeredCount++;
        } else {
            const txt = form.querySelector(`textarea[name="question_${q.id}"]`);
            if (txt && txt.value.trim().length >= 10) answeredCount++;
        }
    });

    const percent = Math.round((answeredCount / currentQuestions.length) * 100);
    const bar = document.getElementById('quizProgressBar');
    if (bar) bar.style.width = `${percent}%`;

    const label = document.getElementById('activeProgressLabel');
    if (label) label.textContent = `${answeredCount} / ${currentQuestions.length} répondues (${percent}%)`;
}

// ----------------------------------------------------------------
// SOUMISSION DU QUIZ
// ----------------------------------------------------------------
document.getElementById('btnSubmitQuiz')?.addEventListener('click', async () => {
    if (!currentModuleData || !currentUser) return;

    const form = document.getElementById('quizFormEl');
    const errorAlert = document.getElementById('quizErrorAlert');
    const errorMsg = document.getElementById('quizErrorMsg');
    const btn = document.getElementById('btnSubmitQuiz');
    const qConfig = currentModuleData.quizConfig || {};
    const showResults = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);

    const answers = {};
    let hasMissing = false;
    let qcmTotal = 0;
    let qcmCorrect = 0;

    currentQuestions.forEach(q => {
        if (q.type === 'qcm') {
            qcmTotal++;
            const selected = form.querySelector(`input[name="question_${q.id}"]:checked`);
            const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
            if (selected) {
                const val = parseInt(selected.value, 10);
                answers[q.id] = val;
                if (val === correctIdx) qcmCorrect++;
            } else {
                hasMissing = true;
            }
        } else if (q.type === 'boolean') {
            qcmTotal++;
            const selected = form.querySelector(`input[name="question_${q.id}"]:checked`);
            const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
            if (selected) {
                const val = (selected.value === 'true');
                answers[q.id] = val;
                if (val === expectedBool) qcmCorrect++;
            } else {
                hasMissing = true;
            }
        } else if (q.type === 'range') {
            const rangeInput = form.querySelector(`input[name="question_${q.id}"]`);
            if (rangeInput) {
                const val = parseFloat(rangeInput.value);
                answers[q.id] = val;
                if (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) {
                    qcmTotal++;
                    const targetVal = parseFloat(q.correctValue);
                    const tolerance = parseFloat(q.tolerance) || 0;
                    if (Math.abs(val - targetVal) <= tolerance) {
                        qcmCorrect++;
                    }
                }
            } else {
                hasMissing = true;
            }
        } else if (q.type === 'puzzle') {
            qcmTotal++;
            const puzzleContainer = form.querySelector(`#puzzle_list_${q.id}`);
            if (puzzleContainer) {
                const currentOrder = Array.from(puzzleContainer.querySelectorAll('.es-puzzle-item')).map(el => el.getAttribute('data-item-text'));
                answers[q.id] = currentOrder;
                const expected = q.items || [];
                const isExact = (currentOrder.length === expected.length && currentOrder.every((it, idx) => it === expected[idx]));
                if (isExact) {
                    qcmCorrect++;
                }
            } else {
                hasMissing = true;
            }
        } else {
            const textarea = form.querySelector(`textarea[name="question_${q.id}"]`);
            const val = textarea ? textarea.value.trim() : '';
            if (val.length >= 10) {
                answers[q.id] = val;
            } else {
                hasMissing = true;
            }
        }
    });

    if (hasMissing) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Merci de répondre à toutes les questions (les réponses rédigées doivent comporter au moins 10 caractères).";
            errorAlert.classList.remove('hidden');
            errorAlert.scrollIntoView({ behavior: 'smooth' });
        }
        return;
    }

    if (errorAlert) errorAlert.classList.add('hidden');
    btnLoading(btn, true);

    try {
        const nextAttemptCount = userPreviousSubmissions.length + 1;
        const scorePercent = qcmTotal > 0 ? Math.round((qcmCorrect / qcmTotal) * 100) : 100;
        const submissionId = `${currentUser.uid}_${Date.now()}`;

        const submissionData = {
            id: submissionId,
            moduleId: currentModuleData.id,
            moduleTitle: currentModuleData.title,
            moduleNum: currentModuleData.num,
            userId: currentUser.uid,
            userEmail: currentUser.email,
            userName: actualUserData?.displayName || `${actualUserData?.firstName || ''} ${actualUserData?.lastName || ''}`.trim() || currentUser.email,
            answers: answers,
            attemptNumber: nextAttemptCount,
            attemptsCount: nextAttemptCount,
            score: {
                correct: qcmCorrect,
                total: qcmTotal,
                percent: scorePercent
            },
            submittedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Enregistrer dans Firestore
        await db.collection('formation').doc(currentModuleData.id)
            .collection('submissions').doc(submissionId)
            .set(submissionData);

        userPreviousSubmissions.unshift(submissionData);

        // Désactiver l'anti-abandon
        isQuizActive = false;
        window.removeEventListener('beforeunload', handleBeforeUnload);

        btnLoading(btn, false);
        showToast("🎉 Vos réponses ont bien été enregistrées !", "success", 4000);

        // Passer à la vue résultats
        renderResultsScreen(submissionData);

    } catch (err) {
        btnLoading(btn, false);
        console.error("Erreur soumission quiz:", err);
        showToast("Erreur lors de la transmission du quiz.", "error");
    }
});

// ----------------------------------------------------------------
// VUE 3 : ÉCRAN DE RÉSULTATS & CORRIGÉ DÉTAILLÉ
// ----------------------------------------------------------------
function renderResultsScreen(submission) {
    const qConfig = currentModuleData.quizConfig || {};
    const showResults = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
    const score = submission?.score || { correct: 0, total: 0, percent: 100 };
    const answers = submission?.answers || {};

    document.getElementById('resultScoreVal').textContent = `${score.percent}%`;
    document.getElementById('resultScoreRatio').textContent = `${score.correct} / ${score.total} QCM corrects`;
    document.getElementById('resultAttemptBadge').textContent = `Tentative #${submission.attemptNumber || 1}`;

    const titleEl = document.getElementById('resultTitle');
    const subEl = document.getElementById('resultSubtitle');
    if (score.percent >= 80) {
        titleEl.textContent = "🎉 Excellent résultat !";
        subEl.textContent = "Vous avez brillamment validé l'évaluation de ce module. Vos résultats ont été transmis aux formateurs.";
    } else if (score.percent >= 50) {
        titleEl.textContent = "👍 Épreuve complétée avec succès !";
        subEl.textContent = "Vos réponses ont bien été enregistrées. Prenez le temps d'analyser le corrigé ci-dessous pour consolider vos acquis.";
    } else {
        titleEl.textContent = "📝 Épreuve transmise !";
        subEl.textContent = "Vos réponses ont été envoyées à l'équipe pédagogique. Vous pourrez retravailler les points abordés avec votre formateur.";
    }

    const correctionSection = document.getElementById('resultCorrectionSection');
    const questionsList = document.getElementById('resultQuestionsList');

    if (showResults) {
        correctionSection.classList.remove('hidden');
        questionsList.innerHTML = currentQuestions.map((q, qIdx) => {
            const userAns = answers[q.id];
            let ansDisplay = '';
            const imageThumb = q.imageUrl ? `
            <div style="margin:8px 0;">
                <img src="${escapeHtml(q.imageUrl)}" alt="Illustration" style="max-height:100px; max-width:100%; border-radius:6px; border:1px solid var(--clr-surface-3);" onerror="this.parentElement.style.display='none'">
            </div>` : '';

            if (q.type === 'qcm') {
                const ansNum = (userAns !== null && userAns !== undefined) ? parseInt(userAns, 10) : null;
                const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                const isCorrect = (ansNum === correctIdx);
                const optText = (ansNum !== null && q.options && q.options[ansNum]) ? q.options[ansNum] : 'Pas de réponse';

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Votre choix :</strong> ${escapeHtml(optText)}
                        <span style="margin-left:8px; font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrect ? '✅ Exact (+1 pt)' : '❌ Incorrect'}
                        </span>
                    </div>
                    ${!isCorrect && q.options && q.options[correctIdx] ? `
                        <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:6px; padding-top:4px; border-top:1px dashed var(--clr-surface-3);">
                            Bonne réponse attendue : <strong style="color:#27ae60;">${escapeHtml(q.options[correctIdx])}</strong>
                        </div>
                    ` : ''}
                </div>`;
            } else if (q.type === 'boolean') {
                const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                const userBool = (userAns === true || userAns === 'true');
                const isCorrect = (userAns !== null && userAns !== undefined && userBool === expectedBool);

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Votre choix :</strong> ${userBool ? '👍 VRAI' : '👎 FAUX'}
                        <span style="margin-left:8px; font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrect ? '✅ Exact (+1 pt)' : '❌ Incorrect'}
                        </span>
                    </div>
                    ${!isCorrect ? `
                        <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:6px;">
                            Réponse attendue : <strong style="color:#27ae60;">${expectedBool ? '👍 VRAI' : '👎 FAUX'}</strong>
                        </div>
                    ` : ''}
                </div>`;
            } else if (q.type === 'range') {
                const val = (userAns !== null && userAns !== undefined) ? parseFloat(userAns) : null;
                const unit = q.unit || '';
                const hasTarget = (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null);
                let rangeGrade = '';

                if (val !== null && hasTarget) {
                    const targetVal = parseFloat(q.correctValue);
                    const tol = parseFloat(q.tolerance) || 0;
                    const isCorrectRange = Math.abs(val - targetVal) <= tol;
                    rangeGrade = `
                    <span style="margin-left:8px; font-weight:700; color:${isCorrectRange ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                        ${isCorrectRange ? '✅ Dans la cible (+1 pt)' : '❌ Hors cible attendue'}
                    </span>
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:6px;">
                        Cible attendue : <strong>${targetVal} ${escapeHtml(unit)}</strong> ${tol > 0 ? `± ${tol}` : ''}
                    </div>`;
                }

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Position du curseur :</strong> <span style="font-weight:800; color:var(--clr-primary);">${val !== null ? `${val} ${escapeHtml(unit)}` : 'Non renseigné'}</span>
                        ${rangeGrade}
                    </div>
                </div>`;
            } else if (q.type === 'puzzle') {
                const candidateOrder = Array.isArray(userAns) ? userAns : [];
                const expectedOrder = q.items || [];
                const isExact = (candidateOrder.length === expectedOrder.length && candidateOrder.every((it, idx) => it === expectedOrder[idx]));

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isExact ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong>Votre ordre proposé :</strong>
                        <span style="font-weight:700; color:${isExact ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isExact ? '✅ Ordre parfait (+1 pt)' : '❌ Ordre incorrect'}
                        </span>
                    </div>
                    <ol style="margin:4px 0 0 18px; padding:0; line-height:1.4; color:var(--clr-text);">
                        ${candidateOrder.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
                    </ol>
                    ${!isExact && expectedOrder.length > 0 ? `
                        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--clr-surface-3); font-size:0.82rem; color:var(--clr-text-muted);">
                            <strong style="color:var(--clr-primary);">Ordre exact attendu :</strong>
                            <ol style="margin:4px 0 0 18px; padding:0; color:var(--clr-text); font-weight:600;">
                                ${expectedOrder.map(it => `<li>${escapeHtml(it)}</li>`).join('')}
                            </ol>
                        </div>
                    ` : ''}
                </div>`;
            } else {
                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:8px; font-size:0.88rem; line-height:1.5; color:var(--clr-text);">
                    <strong style="color:var(--clr-primary);"><i class="bi bi-person-check"></i> Votre réponse :</strong>
                    <div style="white-space:pre-wrap; margin-top:4px;">${escapeHtml(userAns || 'Pas de texte rédigé.')}</div>
                    ${q.hint ? `
                        <div style="margin-top:8px; padding-top:6px; border-top:1px dashed var(--clr-surface-3); font-size:0.8rem; color:#b7791f;">
                            <i class="bi bi-lightbulb-fill"></i> Piste du formateur : ${escapeHtml(q.hint)}
                        </div>
                    ` : ''}
                </div>`;
            }

            let typeBadgeLabel = 'QCM';
            if (q.type === 'range') typeBadgeLabel = 'Curseur horizontal';
            else if (q.type === 'boolean') typeBadgeLabel = 'Vrai / Faux';
            else if (q.type === 'puzzle') typeBadgeLabel = 'Puzzle / Ordonnancement';
            else if (q.type === 'text') typeBadgeLabel = 'Rédaction';

            return `
            <div style="background:var(--clr-surface-2); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Question ${qIdx + 1} • ${typeBadgeLabel}</div>
                <div style="font-size:0.92rem; font-weight:700; color:var(--clr-text); margin-top:2px;">${escapeHtml(q.text)}</div>
                ${imageThumb}
                ${ansDisplay}
            </div>`;
        }).join('');
    } else {
        correctionSection.classList.add('hidden');
    }

    document.getElementById('quizBriefingView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.add('hidden');
    document.getElementById('quizResultsView').classList.remove('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------------------
// INITIALISATION AUTH & DÉMARRAGE
// ----------------------------------------------------------------
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

    // Topbar User info
    const nameEl = document.getElementById('quizUserName');
    if (nameEl) nameEl.textContent = actualUserData?.displayName || `${actualUserData?.firstName || ''} ${actualUserData?.lastName || ''}`.trim() || user.email;

    const avatarEl = document.getElementById('quizUserAvatar');
    if (avatarEl && (actualUserData?.photoURL || user.photoURL)) {
        avatarEl.innerHTML = `<img src="${actualUserData?.photoURL || user.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }

    const moduleId = getModuleIdFromUrl();
    if (!moduleId) {
        alert("Aucun module spécifié.");
        window.location.href = 'formation.html';
        return;
    }

    loadQuizModule(moduleId);
});
