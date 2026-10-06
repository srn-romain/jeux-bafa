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
let isQuizUnlocked = false;

// Variables pour le chronomètre / timer
let quizTimerInterval = null;
let quizRemainingSeconds = 0;
let quizTotalSeconds = 0;
let hasWarnedTenPercent = false;
let hasWarnedFivePercent = false;

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

function formatTimerDisplay(totalSeconds) {
    if (totalSeconds < 0) totalSeconds = 0;
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins < 10 ? '0' + mins : mins}:${secs < 10 ? '0' + secs : secs}`;
}

function getQuizTotalDurationSeconds(mod) {
    if (!mod || !mod.quizConfig) return 0;
    const qConfig = mod.quizConfig;
    if (qConfig.timerTotalSeconds !== undefined && qConfig.timerTotalSeconds !== null) {
        return parseInt(qConfig.timerTotalSeconds, 10) || 0;
    }
    const mins = parseInt(qConfig.timerMinutes, 10) || 0;
    const secs = parseInt(qConfig.timerSeconds, 10) || 0;
    return (mins * 60) + secs;
}

function formatDurationText(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return 'Temps libre (sans chrono)';
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    if (mins > 0 && secs > 0) {
        return `${mins} min ${secs} s`;
    } else if (mins > 0) {
        return `${mins} minute${mins > 1 ? 's' : ''}`;
    } else {
        return `${secs} seconde${secs > 1 ? 's' : ''}`;
    }
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
    const totalDurationSecs = getQuizTotalDurationSeconds(mod);
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
    
    // Pilule Chronomètre
    const timerPill = document.getElementById('pillQuizTimer');
    const timerPillText = document.getElementById('pillQuizTimerText');
    if (timerPill && timerPillText) {
        if (totalDurationSecs > 0) {
            timerPillText.textContent = `⏱️ ${formatDurationText(totalDurationSecs)} max`;
            timerPill.className = 'es-quiz-pill es-quiz-pill--warning';
        } else {
            timerPillText.textContent = `Temps libre (sans chrono)`;
            timerPill.className = 'es-quiz-pill';
        }
    }

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

    // Avertissement de début d'épreuve
    const warningTextEl = document.getElementById('briefingWarningText');
    if (warningTextEl) {
        let warnContent = `Ce module ${maxAttempts > 0 ? `autorise un maximum de <strong>${maxAttempts} tentative(s)</strong>.` : `est disponible pour évaluation.`} <br>`;
        if (totalDurationSecs > 0) {
            warnContent += `⏱️ <strong>Épreuve minutée (${formatDurationText(totalDurationSecs)}) :</strong> Le chronomètre deviendra <strong>rouge à 10% du temps</strong> puis <strong>clignotant / animé à 5% du temps restant</strong>. Vos réponses seront automatiquement transmises à l'échéance.<br>`;
        }
        warnContent += `Ne tentez pas de recharger ou de fermer la page en cours de route, cette tentative sera considérée comme <strong>consommée</strong>.`;
        warningTextEl.innerHTML = warnContent;
    }

    // Gestion de la protection par mot de passe
    const isPasswordRequired = Boolean(qConfig.requirePassword === true || (qConfig.password && String(qConfig.password).trim() !== ''));
    const expectedPassword = String(qConfig.password || '').trim();
    const lockBlock = document.getElementById('quizPasswordLockBlock');
    const unlockForm = document.getElementById('quizUnlockForm');
    const unlockBadge = document.getElementById('unlockStatusBadge');
    const unlockTitle = document.getElementById('unlockBlockTitle');
    const unlockIcon = document.getElementById('unlockIconState');
    const unlockAdminHint = document.getElementById('unlockAdminHint');
    const unlockAdminHintVal = document.getElementById('unlockAdminHintVal');
    const errAlert = document.getElementById('quizUnlockErrorAlert');
    const succAlert = document.getElementById('quizUnlockSuccessAlert');

    if (!isPasswordRequired) {
        // Protection désactivée : masquer totalement le bloc de mot de passe
        if (lockBlock) lockBlock.classList.add('hidden');
        isQuizUnlocked = true;
    } else {
        // Protection activée
        if (lockBlock) lockBlock.classList.remove('hidden');

        // Afficher l'indice pour les admins / formateurs
        if (currentRole === 'admin' || currentRole === 'formateur') {
            if (unlockAdminHint && unlockAdminHintVal) {
                unlockAdminHint.classList.remove('hidden');
                unlockAdminHintVal.textContent = expectedPassword || '(aucun)';
            }
        } else {
            if (unlockAdminHint) unlockAdminHint.classList.add('hidden');
        }

        if (isQuizUnlocked) {
            if (unlockForm) unlockForm.classList.add('hidden');
            if (errAlert) errAlert.classList.add('hidden');
            if (succAlert) succAlert.classList.remove('hidden');
            if (unlockBadge) {
                unlockBadge.className = 'es-badge es-badge--approved';
                unlockBadge.textContent = 'Déverrouillé';
            }
            if (unlockTitle) unlockTitle.innerHTML = '🔓 Épreuve déverrouillée';
            if (unlockIcon) unlockIcon.className = 'bi bi-unlock-fill';
        } else {
            if (unlockForm) unlockForm.classList.remove('hidden');
            if (errAlert) errAlert.classList.add('hidden');
            if (succAlert) succAlert.classList.add('hidden');
            if (unlockBadge) {
                unlockBadge.className = 'es-badge es-badge--pending';
                unlockBadge.textContent = 'Code requis';
            }
            if (unlockTitle) unlockTitle.innerHTML = '🔐 Épreuve protégée par mot de passe';
            if (unlockIcon) unlockIcon.className = 'bi bi-shield-lock-fill';
        }
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
            btnStart.classList.remove('hidden');
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
            if (isPasswordRequired && !isQuizUnlocked) {
                btnStart.disabled = true;
                btnStart.style.opacity = '0.5';
                btnStart.classList.remove('hidden');
                btnStart.innerHTML = `<i class="bi bi-shield-lock-fill"></i> Déverrouillage requis`;
            } else {
                btnStart.disabled = false;
                btnStart.style.opacity = '1';
                btnStart.classList.remove('hidden');
                btnStart.innerHTML = `<i class="bi bi-rocket-takeoff-fill"></i> Commencer l'épreuve`;
                btnStart.onclick = () => startActiveQuiz();
            }
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
// DÉVERROUILLAGE DU QUIZ PAR MOT DE PASSE
// ----------------------------------------------------------------
function handleUnlockQuiz() {
    const mod = currentModuleData;
    const qConfig = mod?.quizConfig || {};
    const expectedPassword = String(qConfig.password || '').trim();
    const input = document.getElementById('quizUnlockPasswordInput');
    const entered = (input?.value || '').trim();
    const errAlert = document.getElementById('quizUnlockErrorAlert');
    const succAlert = document.getElementById('quizUnlockSuccessAlert');
    const unlockForm = document.getElementById('quizUnlockForm');
    const unlockBadge = document.getElementById('unlockStatusBadge');
    const unlockTitle = document.getElementById('unlockBlockTitle');
    const unlockIcon = document.getElementById('unlockIconState');
    const btnStart = document.getElementById('btnStartQuizNow');

    if (!entered) {
        if (errAlert) {
            document.getElementById('quizUnlockErrorMsg').textContent = "Veuillez saisir un mot de passe.";
            errAlert.classList.remove('hidden');
        }
        return;
    }

    // Comparaison (insensible à la casse et sans espaces superflus)
    if (entered.toLowerCase() === expectedPassword.toLowerCase()) {
        isQuizUnlocked = true;
        if (errAlert) errAlert.classList.add('hidden');
        if (succAlert) succAlert.classList.remove('hidden');
        if (unlockForm) unlockForm.classList.add('hidden');
        if (unlockBadge) {
            unlockBadge.className = 'es-badge es-badge--approved';
            unlockBadge.textContent = 'Déverrouillé';
        }
        if (unlockTitle) unlockTitle.innerHTML = '🔓 Épreuve déverrouillée';
        if (unlockIcon) unlockIcon.className = 'bi bi-unlock-fill';

        const maxAttempts = parseInt(qConfig.maxAttempts, 10) || 0;
        const prevAttempts = userPreviousSubmissions.length;
        const isLocked = (maxAttempts > 0 && prevAttempts >= maxAttempts);

        if (!isLocked && btnStart) {
            btnStart.disabled = false;
            btnStart.style.opacity = '1';
            btnStart.classList.remove('hidden');
            btnStart.innerHTML = `<i class="bi bi-rocket-takeoff-fill"></i> Commencer l'épreuve`;
            btnStart.onclick = () => startActiveQuiz();
        }

        showToast("Quiz déverrouillé avec succès !", "success");
    } else {
        if (errAlert) {
            document.getElementById('quizUnlockErrorMsg').textContent = "Mot de passe incorrect. Demandez le mot de passe à votre formateur.";
            errAlert.classList.remove('hidden');
        }
        if (succAlert) succAlert.classList.add('hidden');
        if (input) input.focus();
    }
}

document.getElementById('btnUnlockQuiz')?.addEventListener('click', handleUnlockQuiz);
document.getElementById('quizUnlockPasswordInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        handleUnlockQuiz();
    }
});

// ----------------------------------------------------------------
// VUE 2 : MODE QUIZ ACTIF (ÉPREUVE EN COURS)
// ----------------------------------------------------------------
function startActiveQuiz() {
    isQuizActive = true;
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Réinitialiser le timer
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }
    hasWarnedTenPercent = false;
    hasWarnedFivePercent = false;

    const mod = currentModuleData;
    const prevAttempts = userPreviousSubmissions.length;
    const maxAttempts = parseInt(mod.quizConfig?.maxAttempts, 10) || 0;
    quizTotalSeconds = getQuizTotalDurationSeconds(mod);

    document.getElementById('activeHeaderNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;
    document.getElementById('activeHeaderTitle').textContent = mod.quizConfig?.quizTitle || mod.title;
    document.getElementById('activeAttemptBadge').innerHTML = `<i class="bi bi-lightning-charge-fill"></i> Tentative #${prevAttempts + 1}${maxAttempts > 0 ? ` / ${maxAttempts}` : ''}`;
    document.getElementById('activeProgressLabel').textContent = `0 / ${currentQuestions.length} répondues`;
    document.getElementById('quizWarningLabel')?.classList.add('hidden');

    // Gestion de l'affichage et du lancement du timer
    const timerBadge = document.getElementById('quizActiveTimerBadge');
    const timerText = document.getElementById('quizActiveTimerText');

    if (quizTotalSeconds > 0) {
        quizRemainingSeconds = quizTotalSeconds;
        if (timerBadge) {
            timerBadge.classList.remove('hidden');
            timerBadge.classList.remove('es-quiz-timer-badge--danger');
            timerBadge.classList.remove('es-quiz-timer-badge--pulsing');
        }
        if (timerText) {
            timerText.textContent = formatTimerDisplay(quizRemainingSeconds);
        }

        quizTimerInterval = setInterval(() => {
            quizRemainingSeconds--;
            if (quizRemainingSeconds < 0) quizRemainingSeconds = 0;

            if (timerText) {
                timerText.textContent = formatTimerDisplay(quizRemainingSeconds);
            }

            const ratio = quizTotalSeconds > 0 ? (quizRemainingSeconds / quizTotalSeconds) : 1;

            // 1. Alerte ROUGE (statique) à 10% ou moins du temps restant
            if (ratio <= 0.10 && quizRemainingSeconds > 0) {
                if (timerBadge) timerBadge.classList.add('es-quiz-timer-badge--danger');
                if (!hasWarnedTenPercent) {
                    hasWarnedTenPercent = true;
                    showToast("⚠️ Attention : Il ne reste plus que 10% du temps !", "warning", 4500);
                }
            }

            // 2. Alerte ROUGE + ANIMATION BOUGE / PULSE à 5% ou moins du temps restant
            if (ratio <= 0.05 && quizRemainingSeconds > 0) {
                if (timerBadge) {
                    timerBadge.classList.add('es-quiz-timer-badge--danger');
                    timerBadge.classList.add('es-quiz-timer-badge--pulsing');
                }
                if (!hasWarnedFivePercent) {
                    hasWarnedFivePercent = true;
                    showToast("🚨 Dernières secondes : Il ne reste plus que 5% du temps !", "warning", 5000);
                }
            }

            // 3. Expiration du chronomètre
            if (quizRemainingSeconds <= 0) {
                clearInterval(quizTimerInterval);
                quizTimerInterval = null;
                if (timerBadge) timerBadge.classList.remove('es-quiz-timer-badge--pulsing');
                showToast("⏰ Temps écoulé ! Envoi automatique de votre copie...", "error", 4500);
                submitQuizAnswers({ autoSubmitByTimer: true });
            }
        }, 1000);
    } else {
        if (timerBadge) timerBadge.classList.add('hidden');
    }

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
        } else if (q.type === 'pinpoint') {
            inputHtml = `
            <div class="es-pinpoint-candidate-wrap" style="text-align:center; margin-top:8px;">
                <input type="hidden" name="question_${q.id}" id="pinpoint_input_${q.id}" class="quiz-track-input" required>
                <div class="es-pinpoint-candidate-zone" id="pinpoint_zone_${q.id}" data-q-id="${q.id}">
                    <img src="${escapeHtml(q.pinImage || '')}" alt="Schéma à pointer" class="es-pinpoint-candidate-img" draggable="false">
                    <div class="es-pinpoint-pin es-pinpoint-pin--candidate hidden" id="pinpoint_pin_${q.id}">
                        <i class="bi bi-geo-alt-fill"></i>
                    </div>
                    <div class="es-pinpoint-instructions-overlay" id="pinpoint_overlay_${q.id}">
                        <i class="bi bi-hand-index-thumb"></i> Cliquez sur l'image pour placer votre repère 📍
                    </div>
                </div>
                <div id="pinpoint_feedback_${q.id}" style="font-size:0.78rem; font-weight:600; color:var(--clr-text-muted); margin-top:6px;">
                    👆 Cliquez sur l'élément correspondant dans l'image pour positionner votre pin.
                </div>
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
        if (q.type === 'pinpoint') typeBadgeLabel = '📍 Repère sur image';
        else if (q.type === 'range') typeBadgeLabel = 'Curseur horizontal';
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

    // Pinpoint candidate zone click
    container.querySelectorAll('.es-pinpoint-candidate-zone').forEach(zone => {
        zone.addEventListener('click', (e) => {
            const qId = zone.getAttribute('data-q-id');
            const rect = zone.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            const xPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
            const yPercent = Math.max(0, Math.min(100, (clickY / rect.height) * 100));

            const pinEl = document.getElementById(`pinpoint_pin_${qId}`);
            const inputEl = document.getElementById(`pinpoint_input_${qId}`);
            const overlayEl = document.getElementById(`pinpoint_overlay_${qId}`);
            const feedbackEl = document.getElementById(`pinpoint_feedback_${qId}`);

            if (pinEl) {
                pinEl.style.left = `${xPercent}%`;
                pinEl.style.top = `${yPercent}%`;
                pinEl.classList.remove('hidden');
            }
            if (inputEl) {
                inputEl.value = JSON.stringify({
                    x: parseFloat(xPercent.toFixed(1)),
                    y: parseFloat(yPercent.toFixed(1))
                });
            }
            if (overlayEl) {
                overlayEl.style.display = 'none';
            }
            if (feedbackEl) {
                feedbackEl.innerHTML = `📍 <span style="color:var(--clr-primary);">Repère positionné (X: ${xPercent.toFixed(0)}%, Y: ${yPercent.toFixed(0)}%)</span> — Cliquez ailleurs pour modifier`;
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

    // Masquage direct du warning dès toute interaction sur le formulaire
    const form = document.getElementById('quizFormEl');
    form?.addEventListener('input', () => {
        document.getElementById('quizWarningLabel')?.classList.add('hidden');
    });
    form?.addEventListener('change', () => {
        document.getElementById('quizWarningLabel')?.classList.add('hidden');
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
        } else if (q.type === 'pinpoint') {
            const pinInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (pinInp && pinInp.value) answeredCount++;
        } else if (q.type === 'range' || q.type === 'puzzle') {
            answeredCount++;
        } else {
            const txt = form.querySelector(`textarea[name="question_${q.id}"]`);
            if (txt && txt.value.trim().length > 0) answeredCount++;
        }
    });

    const percent = Math.round((answeredCount / currentQuestions.length) * 100);
    const bar = document.getElementById('quizProgressBar');
    if (bar) bar.style.width = `${percent}%`;

    const label = document.getElementById('activeProgressLabel');
    if (label) label.textContent = `${answeredCount} / ${currentQuestions.length} répondues (${percent}%)`;

    // Dès qu'une réponse est modifiée / saisie, faire disparaître l'avertissement
    const warningLabel = document.getElementById('quizWarningLabel');
    if (warningLabel && !warningLabel.classList.contains('hidden')) {
        warningLabel.classList.add('hidden');
    }
}

// ----------------------------------------------------------------
// SOUMISSION DU QUIZ (MANUELLE OU AUTOMATIQUE PAR TIMER)
// ----------------------------------------------------------------
async function submitQuizAnswers({ autoSubmitByTimer = false } = {}) {
    if (!currentModuleData || !currentUser) return;

    // Arrêter immédiatement le compte à rebours s'il tourne
    if (quizTimerInterval) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
    }

    const form = document.getElementById('quizFormEl');
    const warningLabel = document.getElementById('quizWarningLabel');
    const btn = document.getElementById('btnSubmitQuiz');
    const qConfig = currentModuleData.quizConfig || {};

    const answers = {};
    const evaluations = {};
    let missingCount = 0;
    let qcmTotal = 0;
    let qcmCorrect = 0;

    currentQuestions.forEach(q => {
        if (q.type === 'qcm') {
            qcmTotal++;
            const selected = form ? form.querySelector(`input[name="question_${q.id}"]:checked`) : null;
            const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
            if (selected) {
                const val = parseInt(selected.value, 10);
                answers[q.id] = val;
                if (val === correctIdx) qcmCorrect++;
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'boolean') {
            qcmTotal++;
            const selected = form ? form.querySelector(`input[name="question_${q.id}"]:checked`) : null;
            const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
            if (selected) {
                const val = (selected.value === 'true');
                answers[q.id] = val;
                if (val === expectedBool) qcmCorrect++;
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'range') {
            const rangeInput = form ? form.querySelector(`input[name="question_${q.id}"]`) : null;
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
                answers[q.id] = (q.min !== undefined) ? parseFloat(q.min) : 0;
                missingCount++;
            }
        } else if (q.type === 'pinpoint') {
            qcmTotal++;
            const pinInp = form ? form.querySelector(`input[name="question_${q.id}"]`) : null;
            if (pinInp && pinInp.value) {
                try {
                    const parsed = typeof pinInp.value === 'object' ? pinInp.value : JSON.parse(pinInp.value);
                    answers[q.id] = parsed;
                    const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                    const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                    const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                    const dx = parsed.x - targetX;
                    const dy = parsed.y - targetY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist <= radius) {
                        qcmCorrect++;
                    }
                } catch(e) {
                    answers[q.id] = null;
                    missingCount++;
                }
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'puzzle') {
            qcmTotal++;
            const puzzleContainer = form ? form.querySelector(`#puzzle_list_${q.id}`) : null;
            if (puzzleContainer) {
                const currentOrder = Array.from(puzzleContainer.querySelectorAll('.es-puzzle-item')).map(el => el.getAttribute('data-item-text'));
                answers[q.id] = currentOrder;
                const expected = q.items || [];
                const isExact = (currentOrder.length === expected.length && currentOrder.every((it, idx) => it === expected[idx]));
                if (isExact) {
                    qcmCorrect++;
                }
            } else {
                answers[q.id] = [];
                missingCount++;
            }
        } else {
            qcmTotal++;
            const textarea = form ? form.querySelector(`textarea[name="question_${q.id}"]`) : null;
            const val = textarea ? textarea.value.trim() : '';
            answers[q.id] = val;
            if (val.length > 0) {
                // Algorithme de premier jet pour les réponses rédigées :
                const words = val.split(/\s+/).filter(w => w.length > 2);
                let isSuggestedValid = false;
                
                // Si la question comporte une piste (hint)
                if (q.hint && q.hint.trim().length > 3) {
                    const hintKeywords = q.hint.toLowerCase().split(/[\s,.;:!?()]+/).filter(w => w.length > 3);
                    const valLower = val.toLowerCase();
                    const matched = hintKeywords.filter(kw => valLower.includes(kw));
                    isSuggestedValid = (words.length >= 3) && (matched.length > 0 || words.length >= 8);
                } else {
                    isSuggestedValid = (words.length >= 4);
                }

                if (!evaluations[q.id]) {
                    evaluations[q.id] = {
                        autoSuggested: isSuggestedValid,
                        isCorrect: isSuggestedValid, // Premier jet algorithmique
                        status: 'auto_draft', // en attente de validation formateur/admin
                        suggestedReason: isSuggestedValid ? 'Premier jet algorithmique : Réponse développée et cohérente' : 'Premier jet algorithmique : Réponse courte ou incomplète',
                        gradedByUid: null,
                        gradedByName: null,
                        gradedByRole: null,
                        gradedAt: null
                    };
                }

                if (isSuggestedValid) {
                    qcmCorrect++;
                }
            } else {
                evaluations[q.id] = {
                    autoSuggested: false,
                    isCorrect: false,
                    status: 'auto_draft',
                    suggestedReason: 'Premier jet algorithmique : Réponse non renseignée',
                    gradedByUid: null,
                    gradedByName: null,
                    gradedByRole: null,
                    gradedAt: null
                };
                answers[q.id] = '';
                missingCount++;
            }
        }
    });

    // Si des questions sont incomplètes lors d'une soumission manuelle :
    // Au 1er clic, on affiche le libellé warning in-page. Au 2ème clic (warning déjà visible), on valide quand même !
    if (missingCount > 0 && !autoSubmitByTimer) {
        if (warningLabel && warningLabel.classList.contains('hidden')) {
            warningLabel.classList.remove('hidden');
            warningLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }

    if (warningLabel) warningLabel.classList.add('hidden');
    if (btn) btnLoading(btn, true);

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
            evaluations: evaluations,
            attemptNumber: nextAttemptCount,
            attemptsCount: nextAttemptCount,
            timeExpired: autoSubmitByTimer === true,
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

        // Invalider le cache formation/submissions pour actualisation immédiate
        try {
            sessionStorage.removeItem('cached_formation_modules');
            sessionStorage.removeItem('cached_formation_modules_ts');
            sessionStorage.removeItem('cached_stagiaire_subs_' + currentUser.uid);
            sessionStorage.removeItem('cached_stagiaire_subs_ts_' + currentUser.uid);
        } catch (cErr) {}

        // Désactiver l'anti-abandon
        isQuizActive = false;
        window.removeEventListener('beforeunload', handleBeforeUnload);

        if (btn) btnLoading(btn, false);
        if (autoSubmitByTimer) {
            showToast("⏰ Temps écoulé : Votre copie a été transmise automatiquement !", "info", 5000);
        } else {
            showToast("🎉 Vos réponses ont bien été enregistrées !", "success", 4000);
        }

        // Passer à la vue résultats
        renderResultsScreen(submissionData);

    } catch (err) {
        if (btn) btnLoading(btn, false);
        console.error("Erreur soumission quiz:", err);
        showToast("Erreur lors de la transmission du quiz.", "error");
    }
}

document.getElementById('btnSubmitQuiz')?.addEventListener('click', () => {
    submitQuizAnswers({ autoSubmitByTimer: false });
});

// ----------------------------------------------------------------
// VUE 3 : ÉCRAN DE RÉSULTATS & CORRIGÉ DÉTAILLÉ
// ----------------------------------------------------------------
function renderResultsScreen(submission = {}) {
    const qConfig = currentModuleData.quizConfig || {};
    const showResults = Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);
    const score = submission?.score || { correct: 0, total: 0, percent: 100 };
    const answers = submission?.answers || {};

    const scoreCircle = document.getElementById('resultScoreCircle');
    const titleEl = document.getElementById('resultTitle');
    const subEl = document.getElementById('resultSubtitle');
    const attemptBadge = document.getElementById('resultAttemptBadge');
    const deferredInfo = document.getElementById('resultDeferredInfo');
    const correctionSection = document.getElementById('resultCorrectionSection');
    const questionsList = document.getElementById('resultQuestionsList');

    const timeExpiredBadge = submission?.timeExpired ? ' • ⏰ Temps écoulé' : '';
    if (attemptBadge) {
        attemptBadge.textContent = `Tentative #${submission?.attemptNumber || 1}${timeExpiredBadge}`;
    }

    if (showResults) {
        if (scoreCircle) {
            scoreCircle.style.display = 'flex';
            scoreCircle.innerHTML = `
                <span class="val" id="resultScoreVal">${score.percent}%</span>
                <span class="max" id="resultScoreRatio">${score.total > 0 ? `${score.correct} / ${score.total} QCM corrects` : 'Épreuve complétée'}</span>
            `;
        }

        if (deferredInfo) deferredInfo.classList.add('hidden');

        if (submission.timeExpired) {
            titleEl.textContent = "⏰ Épreuve clôturée (Temps écoulé)";
            subEl.textContent = "Le chronomètre est arrivé à terme. Vos réponses enregistrées jusqu'à l'échéance ont été transmises avec succès à l'équipe pédagogique.";
        } else if (score.percent >= 80) {
            titleEl.textContent = "🎉 Excellent résultat !";
            subEl.textContent = "Vous avez brillamment validé l'évaluation de ce module. Vos résultats ont été transmis aux formateurs.";
        } else if (score.percent >= 50) {
            titleEl.textContent = "👍 Épreuve complétée avec succès !";
            subEl.textContent = "Vos réponses ont bien été enregistrées. Prenez le temps d'analyser le corrigé ci-dessous pour consolider vos acquis.";
        } else {
            titleEl.textContent = "📝 Épreuve transmise !";
            subEl.textContent = "Vos réponses ont été envoyées à l'équipe pédagogique. Vous pourrez retravailler les points abordés avec votre formateur.";
        }

        if (correctionSection) {
            correctionSection.classList.remove('hidden');
        }
    } else {
        // Mode sans diffusion directe des résultats/notes
        if (scoreCircle) {
            scoreCircle.style.display = 'flex';
            scoreCircle.innerHTML = `
                <i class="bi bi-send-check" style="font-size: 2.8rem; color: var(--clr-primary); line-height: 1;"></i>
                <span class="max" style="margin-top: 4px; font-weight: 700; color: var(--clr-primary);">Transmis</span>
            `;
        }

        if (submission.timeExpired) {
            titleEl.textContent = "⏰ Épreuve clôturée (Temps écoulé)";
            subEl.textContent = "Le chronomètre est arrivé à terme. Vos réponses enregistrées jusqu'à l'échéance ont été transmises avec succès à votre formateur.";
        } else {
            titleEl.textContent = "🎉 Vos réponses ont bien été transmises !";
            subEl.textContent = "Merci d'avoir complété cette épreuve. Vos réponses sont enregistrées et ont été envoyées à l'équipe pédagogique pour évaluation.";
        }

        if (deferredInfo) {
            deferredInfo.classList.remove('hidden');
        }

        if (correctionSection) {
            correctionSection.classList.add('hidden');
        }
    }

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
                const isAnswered = (userAns !== null && userAns !== undefined && userAns !== '');
                const isCorrect = isAnswered && (userBool === expectedBool);
                const userChoiceText = isAnswered ? (userBool ? '👍 VRAI' : '👎 FAUX') : '<span style="color:var(--clr-text-muted); font-style:italic;">Non renseigné</span>';

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Votre choix :</strong> ${userChoiceText}
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
            } else if (q.type === 'pinpoint') {
                const userCoords = userAns && typeof userAns === 'object' ? userAns : (userAns ? (typeof userAns === 'string' ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return null; } })() : null) : null);
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
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : '#e74c3c'}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                        <div>
                            <strong>Votre repère :</strong> 
                            ${userCoords ? `Position X: ${userCoords.x.toFixed(1)}%, Y: ${userCoords.y.toFixed(1)}%` : '<span style="color:var(--clr-danger)">Non renseigné</span>'}
                        </div>
                        <span style="font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                            ${isCorrect ? '✅ Cible exacte atteinte (+1 pt)' : '❌ Hors de la zone cible'}
                        </span>
                    </div>
                    ${q.pinImage ? `
                    <div style="text-align:center; background:#181c19; padding:8px; border-radius:6px; margin-top:6px;">
                        <div class="es-pinpoint-result-zone" style="max-width:520px; margin:0 auto;">
                            <img src="${escapeHtml(q.pinImage)}" alt="Résultat repère" class="es-pinpoint-result-img">
                            <div class="es-pinpoint-target-zone es-pinpoint-target-zone--result" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; height:${radius * 2}%;" title="Zone attendue (±${radius}%)"></div>
                            <div class="es-pinpoint-pin es-pinpoint-pin--admin" style="left:${targetX}%; top:${targetY}%;" title="Cible"><i class="bi bi-bullseye" style="font-size:24px; color:#2ecc71;"></i></div>
                            ${userCoords ? `
                            <div class="es-pinpoint-pin ${isCorrect ? 'es-pinpoint-pin--correct' : 'es-pinpoint-pin--incorrect'}" style="left:${userCoords.x}%; top:${userCoords.y}%;" title="Votre repère"><i class="bi bi-geo-alt-fill"></i></div>
                            ` : ''}
                        </div>
                        <div style="font-size:0.78rem; color:#ffffff; margin-top:6px; opacity:0.85;">
                            🎯 Zone cible attendue (cercle vert) : X=${targetX.toFixed(1)}%, Y=${targetY.toFixed(1)}% (tolérance ±${radius}%) ${q.targetLabel ? `— <em>${escapeHtml(q.targetLabel)}</em>` : ''}
                        </div>
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
                const qEval = (submission?.evaluations && submission.evaluations[q.id]) ? submission.evaluations[q.id] : null;
                let evalBadge = '';
                if (qEval && qEval.status === 'reviewed') {
                    evalBadge = qEval.isCorrect ? `
                        <span style="font-weight:700; color:var(--clr-success); margin-left:8px; font-size:0.84rem;">
                            <i class="bi bi-check-circle-fill"></i> Validé (+1 pt)
                        </span>` : `
                        <span style="font-weight:700; color:var(--clr-danger); margin-left:8px; font-size:0.84rem;">
                            <i class="bi bi-x-circle-fill"></i> Non validé (0 pt)
                        </span>`;
                } else {
                    evalBadge = `
                        <span style="font-size:0.75rem; font-weight:600; color:#e67e22; background:rgba(243,156,18,0.12); padding:2px 8px; border-radius:12px; margin-left:8px;">
                            <i class="bi bi-hourglass-split"></i> Transmis pour évaluation formateur
                        </span>`;
                }

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:8px; font-size:0.88rem; line-height:1.5; color:var(--clr-text);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                        <strong style="color:var(--clr-primary);"><i class="bi bi-person-check"></i> Votre réponse :</strong>
                        ${evalBadge}
                    </div>
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

    // Configuration du bouton de partage WhatsApp
    const btnShareWA = document.getElementById('btnShareWhatsAppQuiz');
    if (btnShareWA) {
        const siteUrl = 'https://srn-romain.github.io/jeux-bafa/index.html';
        const modTitle = currentModuleData?.title || `Module ${currentModuleData?.num || ''}`;
        
        let shareText = '';
        if (showResults && score.total > 0) {
            const percent = score.percent !== undefined ? score.percent : Math.round((score.correct / score.total) * 100);
            let emoji = percent >= 80 ? '🏆' : (percent >= 50 ? '🎉' : '🎯');
            shareText = `${emoji} *Mon résultat Quiz Formation BAFA*\n\n` +
                `📖 *Module :* ${modTitle}\n` +
                `✨ *Score :* ${score.correct} / ${score.total} (${percent}%)\n\n` +
                `🎓 Je prépare mon BAFA et je m'entraîne sur *Jeux BAFA* !\n` +
                `Découvre la boîte à outils et les jeux pour l'animation ici : ${siteUrl}`;
        } else {
            shareText = `🎉 *Quiz Formation BAFA validé !*\n\n` +
                `📖 *Module :* ${modTitle}\n` +
                `📝 Mes réponses ont été transmises à l'équipe de formation !\n\n` +
                `🎓 Je prépare mon BAFA et je m'entraîne sur *Jeux BAFA* !\n` +
                `Découvre la boîte à outils et les jeux pour l'animation ici : ${siteUrl}`;
        }

        btnShareWA.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
        btnShareWA.classList.remove('hidden');
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

    if (actualUserData && (actualUserData.banned === true || actualUserData.isBanned === true)) {
        if (typeof showBannedScreen === 'function') showBannedScreen();
        return;
    }

    if (actualUserData && (actualUserData.role === 'stagiaire' || actualUserData.role === 'formateur')) {
        let currentPromoId = window.globalFormationActivePromoId || '';
        if (!currentPromoId) {
            try {
                const formSetDoc = await db.collection('globalSettings').doc('formation').get();
                if (formSetDoc.exists && formSetDoc.data().activePromoId) {
                    currentPromoId = formSetDoc.data().activePromoId;
                    window.globalFormationActivePromoId = currentPromoId;
                }
            } catch (e) {}
        }
        if (typeof isUserPromoMismatch === 'function') {
            const mismatch = await isUserPromoMismatch(actualUserData, currentPromoId, user.uid);
            if (mismatch) {
                if (typeof showFormationExpiredScreen === 'function') showFormationExpiredScreen();
                return;
            }
        } else if (typeof isStagiairePromoMismatch === 'function' && isStagiairePromoMismatch(actualUserData, currentPromoId)) {
            if (typeof showFormationExpiredScreen === 'function') showFormationExpiredScreen();
            return;
        }
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
