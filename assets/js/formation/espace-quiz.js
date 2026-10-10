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

// Variables pour la pagination par sections / pages
let currentSectionIndex = 0;
let quizSections = [];
let userAnswersState = {};

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

function formatQuestionRichText(str) {
    if (!str) return '';
    const text = String(str);
    const hasHtmlTags = /<[a-z][\s\S]*>/i.test(text);
    if (!hasHtmlTags) {
        return escapeHtml(text).replace(/\r?\n/g, '<br>');
    }

    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'MARK', 'SPAN', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'SMALL', 'SUB', 'SUP']);

        function sanitizeNode(node) {
            const children = Array.from(node.childNodes);
            for (const child of children) {
                if (child.nodeType === Node.ELEMENT_NODE) {
                    const tag = child.tagName.toUpperCase();
                    if (!allowedTags.has(tag)) {
                        const textNode = document.createTextNode(child.textContent);
                        node.replaceChild(textNode, child);
                    } else {
                        const attrs = Array.from(child.attributes);
                        for (const attr of attrs) {
                            const name = attr.name.toLowerCase();
                            if (name === 'style') {
                                const styleVal = attr.value;
                                const safeStyles = [];
                                const bgMatch = styleVal.match(/background(?:-color)?\s*:\s*([^;]+)/i);
                                if (bgMatch && !/expression|javascript|url/i.test(bgMatch[1])) {
                                    safeStyles.push(`background-color:${bgMatch[1].trim()}`);
                                }
                                const colMatch = styleVal.match(/(?:^|;)\s*color\s*:\s*([^;]+)/i);
                                if (colMatch && !/expression|javascript|url/i.test(colMatch[1])) {
                                    safeStyles.push(`color:${colMatch[1].trim()}`);
                                }
                                const tdMatch = styleVal.match(/text-decoration(?:-line)?\s*:\s*([^;]+)/i);
                                if (tdMatch && !/expression|javascript|url/i.test(tdMatch[1])) {
                                    safeStyles.push(`text-decoration:${tdMatch[1].trim()}`);
                                }
                                const fwMatch = styleVal.match(/font-weight\s*:\s*([^;]+)/i);
                                if (fwMatch && !/expression|javascript|url/i.test(fwMatch[1])) {
                                    safeStyles.push(`font-weight:${fwMatch[1].trim()}`);
                                }
                                const fsMatch = styleVal.match(/font-style\s*:\s*([^;]+)/i);
                                if (fsMatch && !/expression|javascript|url/i.test(fsMatch[1])) {
                                    safeStyles.push(`font-style:${fsMatch[1].trim()}`);
                                }
                                if (safeStyles.length > 0) {
                                    child.setAttribute('style', safeStyles.join('; '));
                                } else {
                                    child.removeAttribute('style');
                                }
                            } else if (name === 'class') {
                                const classVal = attr.value;
                                if (/^[a-zA-Z0-9_\-\s]+$/.test(classVal)) {
                                    child.setAttribute('class', classVal);
                                } else {
                                    child.removeAttribute('class');
                                }
                            } else if (name === 'type' && (child.tagName === 'OL' || child.tagName === 'UL' || child.tagName === 'LI')) {
                                const typeVal = attr.value;
                                if (['1', 'a', 'A', 'i', 'I', 'disc', 'circle', 'square'].includes(typeVal)) {
                                    child.setAttribute('type', typeVal);
                                } else {
                                    child.removeAttribute('type');
                                }
                            } else {
                                child.removeAttribute(attr.name);
                            }
                        }
                        sanitizeNode(child);
                    }
                }
            }
        }
        sanitizeNode(doc.body);
        return doc.body.innerHTML;
    } catch (e) {
        return escapeHtml(text).replace(/\r?\n/g, '<br>');
    }
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
    const isAdminOrFormateur = (currentRole === 'admin' || currentRole === 'formateur');
    const isLocked = !isAdminOrFormateur && (maxAttempts > 0 && prevAttempts >= maxAttempts);
    const showResults = isAdminOrFormateur || Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1);

    // Bannière spéciale Admin / Formateur
    const adminNotice = document.getElementById('adminFormateurNotice');
    if (adminNotice) {
        if (isAdminOrFormateur) adminNotice.classList.remove('hidden');
        else adminNotice.classList.add('hidden');
    }

    if (isAdminOrFormateur) {
        isQuizUnlocked = true;
    }

    // Topbar
    document.getElementById('topbarModuleTitle').textContent = qConfig.quizTitle || mod.title;
    document.getElementById('topbarModuleNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;

    // Briefing
    document.getElementById('briefingModuleNum').textContent = `Module ${mod.num < 10 ? '0' + mod.num : mod.num}`;
    document.getElementById('briefingModuleTitle').textContent = qConfig.quizTitle || mod.title;
    document.getElementById('briefingModuleSubtitle').textContent = mod.subtitle || '';
    document.getElementById('briefingModuleDesc').innerHTML = `
        <div style="font-weight:700; color:var(--clr-primary); margin-bottom:4px;"><i class="bi bi-info-circle"></i> Objectifs & Consignes :</div>
        ${escapeHtml(mod.subtitle || mod.description || 'Contrôle de connaissances théoriques et pratiques liées à ce module de formation.')}
    `;

    const iconEl = document.getElementById('briefingIcon');
    if (iconEl) iconEl.innerHTML = `<i class="bi ${mod.icon || 'bi-journal-bookmark'}"></i>`;

    // Badges / Pilules
    const regularQuestions = currentQuestions.filter(q => q.type !== 'section');
    const sectionsCount = currentQuestions.filter(q => q.type === 'section').length;
    const drawCount = parseInt(qConfig.drawCount, 10) || 0;
    const hasDraw = (drawCount > 0 && drawCount < regularQuestions.length);
    const activeQuestionsCount = hasDraw ? drawCount : regularQuestions.length;

    let pillQText = `${activeQuestionsCount} question${activeQuestionsCount > 1 ? 's' : ''}`;
    if (hasDraw) {
        pillQText += ` (tirage sur ${regularQuestions.length})`;
    }
    if (sectionsCount > 1) {
        pillQText += ` · ${sectionsCount} pages`;
    }
    const qCountTextEl = document.getElementById('pillQuestionsCountText');
    if (qCountTextEl) {
        qCountTextEl.textContent = pillQText;
    } else {
        const qCountEl = document.getElementById('pillQuestionsCount');
        if (qCountEl) qCountEl.innerHTML = `<div class="es-quiz-spec-icon"><i class="bi bi-list-check"></i></div><div class="es-quiz-spec-content"><span class="es-quiz-spec-label">Questions</span><span class="es-quiz-spec-val" id="pillQuestionsCountText">${pillQText}</span></div>`;
    }
    
    // Carte Chronomètre
    const timerPill = document.getElementById('pillQuizTimer');
    const timerPillText = document.getElementById('pillQuizTimerText');
    if (timerPill && timerPillText) {
        if (totalDurationSecs > 0) {
            timerPillText.textContent = `${formatDurationText(totalDurationSecs)} max`;
            timerPill.classList.add('es-quiz-spec-card--warning');
        } else {
            timerPillText.textContent = `Temps libre (sans chrono)`;
            timerPill.classList.remove('es-quiz-spec-card--warning');
        }
    }

    // Carte Tentatives
    const attemptsPill = document.getElementById('pillAttempts');
    const attemptsText = document.getElementById('pillAttemptsText');
    if (attemptsPill && attemptsText) {
        if (maxAttempts > 0) {
            attemptsText.textContent = `Tentative ${Math.min(prevAttempts + 1, maxAttempts)} / ${maxAttempts}`;
            if (isLocked) {
                attemptsPill.classList.add('es-quiz-spec-card--warning');
                attemptsText.textContent = `${prevAttempts} / ${maxAttempts} tentatives utilisées`;
            } else {
                attemptsPill.classList.remove('es-quiz-spec-card--warning');
            }
        } else {
            attemptsText.textContent = `Tentative #${prevAttempts + 1} (Illimitées)`;
            attemptsPill.classList.remove('es-quiz-spec-card--warning');
        }
    }

    const displayMode = qConfig.resultsDisplayMode || (Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1) ? 'all' : 'none');
    const pillCorrection = document.getElementById('pillCorrectionText');
    if (pillCorrection) {
        if (displayMode === 'all') {
            pillCorrection.textContent = "Note & corrigé complets à la fin";
        } else if (displayMode === 'score_only') {
            pillCorrection.textContent = "Note immédiate (sans corrigé)";
        } else {
            pillCorrection.textContent = "Corrigé différé par le formateur";
        }
    }

    // Pilule Points Négatifs
    const hasNegativePoints = Boolean(qConfig.negativePoints === true || qConfig.negativePoints === 'true');
    const pillNeg = document.getElementById('pillNegativePoints');
    if (pillNeg) {
        if (hasNegativePoints) pillNeg.classList.remove('hidden');
        else pillNeg.classList.add('hidden');
    }

    // Pilule Ordre Aléatoire
    const hasShuffle = Boolean(qConfig.shuffleQuestions === true || qConfig.shuffleQuestions === 'true' || qConfig.randomizeQuestions === true);
    const pillShuffle = document.getElementById('pillShuffleQuestions');
    if (pillShuffle) {
        if (hasShuffle) pillShuffle.classList.remove('hidden');
        else pillShuffle.classList.add('hidden');
    }

    // Pilule Tirage Aléatoire
    const pillDraw = document.getElementById('pillDrawQuestions');
    const pillDrawText = document.getElementById('pillDrawQuestionsText');
    if (pillDraw) {
        if (hasDraw) {
            if (pillDrawText) pillDrawText.textContent = `Tirage au sort (${drawCount}/${regularQuestions.length})`;
            pillDraw.classList.remove('hidden');
        } else {
            pillDraw.classList.add('hidden');
        }
    }

    // Avertissement de début d'épreuve
    const warningTextEl = document.getElementById('briefingWarningText');
    if (warningTextEl) {
        const allowPrev = (qConfig.allowPreviousPage !== false);
        let warnContent = '';

        if (hasDraw) {
            const mandatoryCount = regularQuestions.filter(q => q.isMandatory === true || q.isMandatory === 'true').length;
            let drawMsg = `<strong>Tirage au sort :</strong> Seules <strong>${drawCount} questions</strong> seront tirées au sort parmi les ${regularQuestions.length} questions créées`;
            if (mandatoryCount > 0) {
                drawMsg += ` (dont <strong>${mandatoryCount} question${mandatoryCount > 1 ? 's' : ''} obligatoire${mandatoryCount > 1 ? 's' : ''}</strong>).`;
            } else {
                drawMsg += `.`;
            }
            warnContent += `${drawMsg}<br>`;
        }

        if (hasShuffle) {
            warnContent += `<strong>Ordre aléatoire des questions :</strong> Afin de garantir l'équité, les questions sont présentées dans un <strong>ordre aléatoire unique</strong> pour chaque stagiaire.<br>`;
        }

        if (maxAttempts > 0) {
            warnContent += `Ce module autorise un maximum de <strong>${maxAttempts} tentative(s)</strong>.<br>`;
        } else {
            warnContent += `Ce module autorise un <strong>nombre illimité de tentatives</strong>. Notez toutefois que <strong>l'ensemble de vos essais</strong> sera enregistré. Veillez à traiter chaque tentative avec sérieux.<br>`;
        }

        if (hasNegativePoints) {
            warnContent += `<strong>Barème à points négatifs :</strong> Une bonne réponse rapporte <strong>+1 point</strong>. Une mauvaise réponse retire <strong>-0.5 point</strong>. Les questions laissées sans réponse valent <strong>0 point</strong>.<br>`;
        }

        if (totalDurationSecs > 0) {
            warnContent += `<strong>Épreuve minutée (${formatDurationText(totalDurationSecs)}) :</strong> Le chronomètre deviendra <strong>rouge à 10% du temps</strong> puis <strong>clignotant / animé à 5% du temps restant</strong>. Vos réponses seront automatiquement transmises à l'échéance.<br>`;
        }

        if (sectionsCount > 1 && !allowPrev) {
            warnContent += `<strong>Navigation sans retour arrière :</strong> Ce quiz est composé de <strong>${sectionsCount} pages</strong>. Une fois passée à la page suivante, <strong>aucun retour en arrière n'est possible</strong>. Assurez-vous d'avoir validé l'ensemble de vos réponses sur chaque page avant de poursuivre.<br>`;
        }

        if (maxAttempts > 0) {
            warnContent += `Ne tentez pas de recharger ou de fermer la page en cours de route, cette tentative sera considérée comme <strong>consommée</strong>.`;
        }

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
function parseQuizSections(questions, shouldShuffle = false) {
    const sections = [];
    let currentSec = null;

    questions.forEach((q, idx) => {
        if (q.type === 'section') {
            currentSec = {
                id: q.id || `sec_${idx}`,
                type: 'section',
                title: q.title || q.text || `Section ${sections.length + 1}`,
                description: q.description || '',
                questions: []
            };
            sections.push(currentSec);
        } else {
            if (!currentSec) {
                currentSec = {
                    id: 'sec_default_0',
                    type: 'section',
                    title: 'Section 1',
                    description: '',
                    questions: []
                };
                sections.push(currentSec);
            }
            currentSec.questions.push(q);
        }
    });

    const validSections = sections.filter(s => s.questions.length > 0);
    const finalSections = (validSections.length > 0) ? validSections : [{
        id: 'sec_default_0',
        type: 'section',
        title: 'Épreuve',
        description: '',
        questions: questions.filter(q => q.type !== 'section')
    }];

    if (shouldShuffle) {
        finalSections.forEach(sec => {
            sec.questions = shuffleArray(sec.questions);
        });
    }

    return finalSections;
}

function saveCurrentPageAnswersToState() {
    const form = document.getElementById('quizFormEl');
    if (!form || !quizSections[currentSectionIndex]) return;

    const currentSecQuestions = quizSections[currentSectionIndex].questions;
    currentSecQuestions.forEach(q => {
        if (q.type === 'qcm') {
            const selBoxes = form.querySelectorAll(`input[name="question_${q.id}"]:checked`);
            userAnswersState[q.id] = Array.from(selBoxes).map(cb => parseInt(cb.value, 10));
        } else if (q.type === 'image_choice') {
            const sel = form.querySelector(`input[name="question_${q.id}"]:checked`);
            userAnswersState[q.id] = sel ? parseInt(sel.value, 10) : (userAnswersState[q.id] !== undefined ? userAnswersState[q.id] : null);
        } else if (q.type === 'boolean') {
            const sel = form.querySelector(`input[name="question_${q.id}"]:checked`);
            userAnswersState[q.id] = sel ? (sel.value === 'true') : (userAnswersState[q.id] !== undefined ? userAnswersState[q.id] : null);
        } else if (q.type === 'range') {
            const rangeInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (rangeInp) {
                userAnswersState[q.id] = parseFloat(rangeInp.value);
            }
        } else if (q.type === 'pinpoint') {
            const pinInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (pinInp && pinInp.value) {
                try {
                    userAnswersState[q.id] = typeof pinInp.value === 'object' ? pinInp.value : JSON.parse(pinInp.value);
                } catch(e) {
                    userAnswersState[q.id] = pinInp.value;
                }
            }
        } else if (q.type === 'cloze') {
            const clozeInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (clozeInp && clozeInp.value) {
                try {
                    userAnswersState[q.id] = typeof clozeInp.value === 'object' ? clozeInp.value : JSON.parse(clozeInp.value);
                } catch(e) {
                    userAnswersState[q.id] = {};
                }
            }
        } else if (q.type === 'puzzle') {
            const list = form.querySelector(`#puzzle_list_${q.id}`);
            if (list) {
                const currentOrder = Array.from(list.querySelectorAll('.es-puzzle-item')).map(el => el.getAttribute('data-item-text'));
                userAnswersState[q.id] = currentOrder;
            }
        } else if (q.type === 'table_choice') {
            const rows = q.tableRows || [];
            const isMulti = rows.some(r => r.correctCol1 && r.correctCol2);
            const ansObj = (userAnswersState[q.id] && typeof userAnswersState[q.id] === 'object') ? userAnswersState[q.id] : {};
            rows.forEach((r, rIdx) => {
                if (isMulti) {
                    const c1 = form.querySelector(`input[name="q_${q.id}_r_${rIdx}_c1"]`);
                    const c2 = form.querySelector(`input[name="q_${q.id}_r_${rIdx}_c2"]`);
                    if (c1 || c2) {
                        ansObj[rIdx] = {
                            col1: c1 ? c1.checked : false,
                            col2: c2 ? c2.checked : false
                        };
                    }
                } else {
                    const sel = form.querySelector(`input[name="q_${q.id}_r_${rIdx}"]:checked`);
                    if (sel) {
                        ansObj[rIdx] = {
                            col1: sel.value === 'col1',
                            col2: sel.value === 'col2'
                        };
                    }
                }
            });
            userAnswersState[q.id] = ansObj;
        } else if (q.type === 'classification') {
            const classInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (classInp && classInp.value) {
                try {
                    userAnswersState[q.id] = typeof classInp.value === 'object' ? classInp.value : JSON.parse(classInp.value);
                } catch(e) {
                    userAnswersState[q.id] = {};
                }
            }
        } else if (q.type === 'matching') {
            const matchInp = form.querySelector(`input[name="question_${q.id}"]`);
            if (matchInp && matchInp.value) {
                try {
                    userAnswersState[q.id] = typeof matchInp.value === 'object' ? matchInp.value : JSON.parse(matchInp.value);
                } catch(e) {
                    userAnswersState[q.id] = {};
                }
            }
        } else {
            const txt = form.querySelector(`textarea[name="question_${q.id}"]`);
            if (txt) {
                userAnswersState[q.id] = txt.value;
            }
        }
    });
}

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
    
    const regularQuestions = currentQuestions.filter(q => q.type !== 'section');
    document.getElementById('activeProgressLabel').textContent = `0 / ${regularQuestions.length} répondues`;
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

    currentSectionIndex = 0;
    userAnswersState = {};

    // 1. Filtrage éventuel par tirage au sort (pool & obligatoires)
    const drawCount = parseInt(mod.quizConfig?.drawCount, 10) || 0;
    const allRegular = currentQuestions.filter(q => q.type !== 'section');
    let activeQuestionsPool = currentQuestions;

    if (drawCount > 0 && drawCount < allRegular.length) {
        const mandatory = allRegular.filter(q => q.isMandatory === true || q.isMandatory === 'true');
        const nonMandatory = allRegular.filter(q => !q.isMandatory && q.isMandatory !== 'true');
        const neededFromPool = Math.max(0, drawCount - mandatory.length);
        const drawnNonMandatory = shuffleArray(nonMandatory).slice(0, neededFromPool);
        const drawnSet = new Set([...mandatory, ...drawnNonMandatory].map(q => q.id));
        activeQuestionsPool = currentQuestions.filter(q => q.type === 'section' || drawnSet.has(q.id));
    }

    const shouldShuffle = Boolean(mod.quizConfig?.shuffleQuestions === true || mod.quizConfig?.shuffleQuestions === 'true' || mod.quizConfig?.randomizeQuestions === true);
    quizSections = parseQuizSections(activeQuestionsPool, shouldShuffle);

    const totalActiveQuestions = quizSections.flatMap(s => s.questions || []).length;
    document.getElementById('activeProgressLabel').textContent = `0 / ${totalActiveQuestions} répondues`;

    renderActiveSectionPage();

    document.getElementById('quizBriefingView').classList.add('hidden');
    document.getElementById('quizActiveView').classList.remove('hidden');
    document.getElementById('quizResultsView').classList.add('hidden');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ----------------------------------------------------------------
// HELPER TEXTE À TROUS (CLOZE)
// ----------------------------------------------------------------
function parseClozeQuestion(clozeText) {
    const regex = /\[([^\]]+)\]/g;
    const parts = [];
    const blanks = [];
    let lastIdx = 0;
    let match;
    let bIdx = 0;
    const textStr = clozeText || '';
    while ((match = regex.exec(textStr)) !== null) {
        if (match.index > lastIdx) {
            parts.push({ type: 'text', text: textStr.substring(lastIdx, match.index) });
        }
        const expected = match[1].trim();
        blanks.push(expected);
        parts.push({ type: 'blank', index: bIdx, expected: expected });
        bIdx++;
        lastIdx = regex.lastIndex;
    }
    if (lastIdx < textStr.length) {
        parts.push({ type: 'text', text: textStr.substring(lastIdx) });
    }
    return { parts, blanks };
}

function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function renderActiveSectionPage() {
    if (!quizSections || quizSections.length === 0) return;
    if (currentSectionIndex < 0) currentSectionIndex = 0;
    if (currentSectionIndex >= quizSections.length) currentSectionIndex = quizSections.length - 1;

    const sec = quizSections[currentSectionIndex];
    const allowPrev = (currentModuleData?.quizConfig?.allowPreviousPage !== false);
    const regularQuestions = currentQuestions.filter(q => q.type !== 'section');
    const allActiveRegularQuestions = quizSections.flatMap(s => s.questions);

    // 1. Bannière de section active
    const bannerEl = document.getElementById('quizSectionActiveBanner');
    if (bannerEl) {
        if (quizSections.length > 1 || (sec.description && sec.description.trim())) {
            bannerEl.classList.remove('hidden');
            bannerEl.innerHTML = `
                <div class="es-quiz-section-banner__header">
                    <i class="bi bi-bookmark-fill"></i>
                    <span>Section ${currentSectionIndex + 1} / ${quizSections.length}</span>
                    <span style="font-size:0.82rem; font-weight:600; color:var(--clr-text-muted); margin-left:4px;">(Page ${currentSectionIndex + 1})</span>
                </div>
                <h3 class="es-quiz-section-banner__title">${escapeHtml(sec.title)}</h3>
                ${sec.description ? `<p class="es-quiz-section-banner__desc">${escapeHtml(sec.description)}</p>` : ''}
            `;
        } else {
            bannerEl.classList.add('hidden');
        }
    }

    // 3. Rendu des questions de cette page
    const container = document.getElementById('quizQuestionsContainer');
    if (!container) return;

    if (!sec.questions || sec.questions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:40px; color:var(--clr-text-muted); background:var(--clr-surface); border-radius:var(--radius-md);">
                Aucune question dans cette section.
            </div>
        `;
    } else {
        container.innerHTML = sec.questions.map(q => {
            const activeIndex = allActiveRegularQuestions.findIndex(rq => rq.id === q.id);
            const qNum = (activeIndex !== -1) ? activeIndex + 1 : 1;
            const savedVal = userAnswersState[q.id];

            let inputHtml = '';
            const imageHtml = q.imageUrl ? `
                <div class="es-quiz-image-box">
                    <img src="${escapeHtml(q.imageUrl)}" alt="Illustration question ${qNum}" onerror="this.parentElement.style.display='none'">
                </div>` : '';

            if (q.type === 'qcm') {
                const chosenIndices = Array.isArray(savedVal)
                    ? savedVal.map(n => parseInt(n, 10))
                    : (savedVal !== undefined && savedVal !== null && savedVal !== '' ? [parseInt(savedVal, 10)] : []);
                inputHtml = `
                <div class="es-quiz-options">
                    ${(q.options || []).map((opt, optIdx) => {
                        const isChecked = chosenIndices.includes(optIdx);
                        return `
                        <label class="es-quiz-option-label ${isChecked ? 'selected' : ''}">
                            <input type="checkbox" name="question_${q.id}" value="${optIdx}" class="quiz-track-input" ${isChecked ? 'checked' : ''}>
                            <span>${escapeHtml(opt)}</span>
                        </label>`;
                    }).join('')}
                </div>`;
            } else if (q.type === 'image_choice') {
                const chosenIdx = (savedVal !== undefined && savedVal !== null) ? parseInt(savedVal, 10) : -1;
                inputHtml = `
                <div class="es-image-choice-grid">
                    ${(q.imageOptions || []).map((opt, optIdx) => {
                        const isSelected = (chosenIdx === optIdx);
                        return `
                        <label class="es-image-choice-label ${isSelected ? 'selected' : ''}" data-q-id="${q.id}" data-oidx="${optIdx}">
                            <input type="radio" name="question_${q.id}" value="${optIdx}" class="quiz-track-input" ${isSelected ? 'checked' : ''} style="position:absolute; opacity:0; pointer-events:none;">
                            <div class="es-image-choice-img-box">
                                <img src="${escapeHtml(opt.imageUrl || '')}" alt="${escapeHtml(opt.label || ('Option ' + (optIdx + 1)))}" class="es-image-choice-img" draggable="false">
                            </div>
                            <div class="es-image-choice-footer">
                                <div class="es-radio-custom" style="width:20px; height:20px; border-radius:50%; border:2px solid ${isSelected ? 'var(--clr-primary)' : 'var(--clr-surface-3)'}; background:${isSelected ? 'var(--clr-primary)' : 'transparent'}; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                                    ${isSelected ? '<div style="width:8px; height:8px; border-radius:50%; background:#fff;"></div>' : ''}
                                </div>
                                <span style="flex:1;">${escapeHtml(opt.label || ('Option ' + (optIdx + 1)))}</span>
                            </div>
                        </label>
                    `}).join('')}
                </div>`;
            } else if (q.type === 'table_choice') {
                const col1 = q.col1Label || 'VRAI';
                const col2 = q.col2Label || 'FAUX';
                const rows = q.tableRows || [];
                const savedAns = (savedVal && typeof savedVal === 'object') ? savedVal : {};
                const isMulti = rows.some(r => r.correctCol1 && r.correctCol2);

                const tableRowsHtml = rows.map((row, rIdx) => {
                    const userRow = savedAns[rIdx] || {};
                    const isCol1Selected = !!userRow.col1;
                    const isCol2Selected = !!userRow.col2;

                    return `
                    <tr class="es-table-choice-tr" data-q-id="${q.id}" data-ridx="${rIdx}">
                        <td class="es-table-choice-td-stmt">
                            <span style="font-weight:800; color:var(--clr-primary); margin-right:6px;">${rIdx + 1}.</span>
                            ${escapeHtml(row.text)}
                        </td>
                        <td class="es-table-choice-td-choice">
                            <label class="es-table-choice-cell-btn ${isMulti ? 'is-checkbox' : 'is-radio'} ${isCol1Selected ? 'selected' : ''}" title="${escapeHtml(col1)}">
                                ${isMulti ? `
                                    <input type="checkbox" name="q_${q.id}_r_${rIdx}_c1" value="col1" class="quiz-track-input table-choice-input" data-q-id="${q.id}" data-ridx="${rIdx}" data-col="col1" ${isCol1Selected ? 'checked' : ''} style="position:absolute; opacity:0; pointer-events:none;">
                                    <i class="bi ${isCol1Selected ? 'bi-check-square-fill' : 'bi-square'}"></i>
                                ` : `
                                    <input type="radio" name="q_${q.id}_r_${rIdx}" value="col1" class="quiz-track-input table-choice-input" data-q-id="${q.id}" data-ridx="${rIdx}" data-col="col1" ${isCol1Selected ? 'checked' : ''} style="position:absolute; opacity:0; pointer-events:none;">
                                    <i class="bi ${isCol1Selected ? 'bi-circle-fill' : 'bi-circle'}"></i>
                                `}
                            </label>
                        </td>
                        <td class="es-table-choice-td-choice">
                            <label class="es-table-choice-cell-btn ${isMulti ? 'is-checkbox' : 'is-radio'} ${isCol2Selected ? 'selected' : ''}" title="${escapeHtml(col2)}">
                                ${isMulti ? `
                                    <input type="checkbox" name="q_${q.id}_r_${rIdx}_c2" value="col2" class="quiz-track-input table-choice-input" data-q-id="${q.id}" data-ridx="${rIdx}" data-col="col2" ${isCol2Selected ? 'checked' : ''} style="position:absolute; opacity:0; pointer-events:none;">
                                    <i class="bi ${isCol2Selected ? 'bi-check-square-fill' : 'bi-square'}"></i>
                                ` : `
                                    <input type="radio" name="q_${q.id}_r_${rIdx}" value="col2" class="quiz-track-input table-choice-input" data-q-id="${q.id}" data-ridx="${rIdx}" data-col="col2" ${isCol2Selected ? 'checked' : ''} style="position:absolute; opacity:0; pointer-events:none;">
                                    <i class="bi ${isCol2Selected ? 'bi-circle-fill' : 'bi-circle'}"></i>
                                `}
                            </label>
                        </td>
                    </tr>
                    `;
                }).join('');

                inputHtml = `
                <div class="es-table-choice-wrap">
                    <table class="es-table-choice-table">
                        <thead>
                            <tr>
                                <th>Affirmations</th>
                                <th class="col-head-center"><span class="es-col-badge">${escapeHtml(col1)}</span></th>
                                <th class="col-head-center"><span class="es-col-badge">${escapeHtml(col2)}</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>`;
            } else if (q.type === 'boolean') {
                const isTrue = (savedVal === true || savedVal === 'true');
                const isFalse = (savedVal === false || savedVal === 'false');
                inputHtml = `
                <div class="es-boolean-grid">
                    <label class="es-boolean-btn-label ${isTrue ? 'selected' : ''}">
                        <input type="radio" name="question_${q.id}" value="true" class="quiz-track-input" ${isTrue ? 'checked' : ''}>
                        <span>👍 VRAI</span>
                    </label>
                    <label class="es-boolean-btn-label ${isFalse ? 'selected' : ''}">
                        <input type="radio" name="question_${q.id}" value="false" class="quiz-track-input" ${isFalse ? 'checked' : ''}>
                        <span>👎 FAUX</span>
                    </label>
                </div>`;
            } else if (q.type === 'classification') {
                const categories = q.categories || [];
                const rawItems = q.items || [];
                const savedPlacements = (savedVal && typeof savedVal === 'object') ? savedVal : {};

                const placedCount = Object.keys(savedPlacements).filter(itemId => savedPlacements[itemId]).length;

                const catBoxesHtml = categories.map(cat => {
                    const catItems = rawItems.filter(it => savedPlacements[it.id] === cat.id);
                    const placedTagsHtml = catItems.map(it => `
                        <div class="es-classification-placed-tag" id="tag_placed_${q.id}_${it.id}" data-q-id="${q.id}" data-item-id="${it.id}" draggable="true">
                            <span class="es-classification-tag-handle"><i class="bi bi-grip-vertical"></i></span>
                            <span>${escapeHtml(it.text)}</span>
                            <button type="button" class="es-classification-tag-remove" data-q-id="${q.id}" data-item-id="${it.id}" title="Retirer et remettre dans la banque">
                                <i class="bi bi-x"></i>
                            </button>
                        </div>
                    `).join('');

                    return `
                        <div class="es-classification-cat-card" id="cat_card_${q.id}_${cat.id}" data-q-id="${q.id}" data-cat-id="${cat.id}">
                            <div class="es-classification-cat-header">
                                <h4 class="es-classification-cat-title"><i class="bi bi-folder-fill" style="color:var(--clr-primary-dark); margin-right:4px;"></i> ${escapeHtml(cat.title)}</h4>
                                <span class="es-badge es-badge--stagiaire cat-count-badge" style="font-size:0.7rem; padding:2px 6px;">
                                    ${catItems.length}
                                </span>
                            </div>
                            <div class="es-classification-cat-dropzone" id="dropzone_${q.id}_${cat.id}" data-q-id="${q.id}" data-cat-id="${cat.id}">
                                ${placedTagsHtml}
                                <div class="es-classification-drop-empty ${catItems.length > 0 ? 'hidden' : ''}">
                                    <i class="bi bi-box-arrow-in-down" style="font-size:1.3rem; margin-bottom:4px; opacity:0.6;"></i>
                                    Déposez ou cliquez pour classer ici
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');

                const bankItems = rawItems.filter(it => !savedPlacements[it.id]);
                const bankTagsHtml = bankItems.map(it => `
                    <div class="es-classification-tag" id="tag_bank_${q.id}_${it.id}" data-q-id="${q.id}" data-item-id="${it.id}" draggable="true">
                        <span class="es-classification-tag-handle"><i class="bi bi-grip-vertical"></i></span>
                        <span>${escapeHtml(it.text)}</span>
                    </div>
                `).join('');

                inputHtml = `
                <div class="es-classification-wrap" id="classification_wrap_${q.id}" data-q-id="${q.id}">
                    <input type="hidden" name="question_${q.id}" id="classification_input_${q.id}" class="quiz-track-input" value="${escapeHtml(JSON.stringify(savedPlacements))}">

                    <!-- Banque des étiquettes -->
                    <div class="es-classification-bank-card">
                        <div class="es-classification-bank-header">
                            <div class="es-classification-bank-title">
                                <i class="bi bi-tags-fill" style="color:var(--clr-primary-dark);"></i>
                                Étiquettes à ranger :
                            </div>
                            <span class="es-badge es-badge--stagiaire" id="classification_status_${q.id}" style="font-size:0.75rem; padding:3px 8px;">
                                ${placedCount} / ${rawItems.length} classée${placedCount > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div class="es-classification-bank" id="bank_${q.id}" data-q-id="${q.id}">
                            ${bankTagsHtml}
                            <div class="es-classification-drop-empty ${bankItems.length > 0 ? 'hidden' : ''}" style="width:100%; padding:8px 0; font-style:italic;">
                                ✨ Toutes les étiquettes ont été réparties !
                            </div>
                        </div>
                    </div>

                    <!-- Grille des catégories réceptrices -->
                    <div class="es-classification-grid">
                        ${catBoxesHtml}
                    </div>
                </div>`;
            } else if (q.type === 'pinpoint') {
                const coords = (savedVal && typeof savedVal === 'object') ? savedVal : null;
                inputHtml = `
                <div class="es-pinpoint-candidate-wrap" style="text-align:center; margin-top:8px;">
                    <input type="hidden" name="question_${q.id}" id="pinpoint_input_${q.id}" class="quiz-track-input" value="${coords ? escapeHtml(JSON.stringify(coords)) : ''}">
                    <div class="es-pinpoint-candidate-zone" id="pinpoint_zone_${q.id}" data-q-id="${q.id}">
                        <img src="${escapeHtml(q.pinImage || '')}" alt="Schéma à pointer" class="es-pinpoint-candidate-img" draggable="false">
                        <div class="es-pinpoint-pin es-pinpoint-pin--candidate ${coords ? '' : 'hidden'}" id="pinpoint_pin_${q.id}" style="${coords ? `left:${coords.x}%; top:${coords.y}%;` : ''}">
                            <i class="bi bi-geo-alt-fill"></i>
                        </div>
                        <div class="es-pinpoint-instructions-overlay" id="pinpoint_overlay_${q.id}" style="${coords ? 'display:none;' : ''}">
                            <i class="bi bi-hand-index-thumb"></i> Cliquez sur l'image pour placer votre repère 📍
                        </div>
                    </div>
                    <div id="pinpoint_feedback_${q.id}" style="font-size:0.78rem; font-weight:600; color:var(--clr-text-muted); margin-top:6px;">
                        ${coords ? `📍 <span style="color:var(--clr-primary);">Repère positionné (X: ${coords.x.toFixed(0)}%, Y: ${coords.y.toFixed(0)}%)</span> — Cliquez ailleurs pour modifier` : '👆 Cliquez sur l\'élément correspondant dans l\'image pour positionner votre pin.'}
                    </div>
                </div>`;
            } else if (q.type === 'range') {
                const minVal = parseFloat(q.min) || 0;
                const maxVal = parseFloat(q.max) || 10;
                const stepVal = parseFloat(q.step) || 1;
                const unit = q.unit || '';
                const currentVal = (savedVal !== undefined && savedVal !== null) ? parseFloat(savedVal) : Math.round((minVal + maxVal) / 2);

                inputHtml = `
                <div class="es-range-wrap">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:0.82rem; font-weight:700; color:var(--clr-text-muted);">Ajustez le curseur horizontal :</span>
                        <span class="es-range-display-badge" id="range_val_display_${q.id}">
                            ${currentVal} ${escapeHtml(unit)}
                        </span>
                    </div>
                    <input type="range" class="es-range-slider quiz-range-input quiz-track-input" name="question_${q.id}" id="range_input_${q.id}"
                        min="${minVal}" max="${maxVal}" step="${stepVal}" value="${currentVal}"
                        data-unit="${escapeHtml(unit)}" data-display-id="range_val_display_${q.id}">
                    <div class="es-range-labels">
                        <span>${escapeHtml(q.minLabel || String(minVal))} (${minVal})</span>
                        <span>${escapeHtml(q.maxLabel || String(maxVal))} (${maxVal})</span>
                    </div>
                </div>`;
            } else if (q.type === 'puzzle') {
                const expectedItems = q.items || [];
                let displayItems = (Array.isArray(savedVal) && savedVal.length === expectedItems.length) ? savedVal : [...expectedItems];
                if (!savedVal && displayItems.length > 1) {
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
            } else if (q.type === 'matching') {
                const rawPairs = q.pairs || [];
                const leftItems = rawPairs.map((p, idx) => ({
                    id: `l_${q.id}_${idx}`,
                    text: (p.left || '').trim(),
                    originalIndex: idx
                })).filter(it => it.text.length > 0);

                // Dédoublonnage des correspondances droites pour autoriser plusieurs éléments gauches vers un même élément droit
                const rightSet = new Set();
                const rightItemsList = [];

                rawPairs.forEach((p, idx) => {
                    const rText = (p.right || '').trim();
                    if (rText && !rightSet.has(rText.toLowerCase())) {
                        rightSet.add(rText.toLowerCase());
                        rightItemsList.push({
                            id: `r_${q.id}_${rightItemsList.length}`,
                            text: rText
                        });
                    }
                });

                // Ajouter les éventuels distracteurs / options pièges à droite
                let distractors = [];
                if (typeof q.rightDistractors === 'string') {
                    distractors = q.rightDistractors.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
                } else if (Array.isArray(q.rightDistractors)) {
                    distractors = q.rightDistractors.map(s => String(s).trim()).filter(Boolean);
                }

                distractors.forEach(dText => {
                    if (dText && !rightSet.has(dText.toLowerCase())) {
                        rightSet.add(dText.toLowerCase());
                        rightItemsList.push({
                            id: `r_${q.id}_${rightItemsList.length}`,
                            text: dText,
                            isDistractor: true
                        });
                    }
                });

                const rightItems = shuffleArray(rightItemsList);
                const savedMatches = (savedVal && typeof savedVal === 'object') ? savedVal : {};

                inputHtml = `
                <div class="es-matching-wrap" id="matching_wrap_${q.id}" data-q-id="${q.id}">
                    <input type="hidden" name="question_${q.id}" id="matching_input_${q.id}" class="quiz-track-input" data-pairs-count="${leftItems.length}" value="${escapeHtml(JSON.stringify(savedMatches))}">
                    
                    <div class="es-matching-instructions">
                        <i class="bi bi-info-circle-fill" style="color:var(--clr-primary);"></i>
                        <span>Cliquez sur un élément à gauche, puis cliquez sur son correspondant à droite pour les relier.</span>
                    </div>

                    <div class="es-matching-grid">
                        <div class="es-matching-col es-matching-col--left">
                            <div class="es-matching-col-header"><i class="bi bi-list-columns-reverse"></i> Colonne de gauche</div>
                            <div class="es-matching-list es-matching-list--left" data-q-id="${q.id}">
                                ${leftItems.map(item => `
                                    <div class="es-matching-item es-matching-item--left" id="${item.id}" data-q-id="${q.id}" data-side="left" data-item-text="${escapeHtml(item.text)}">
                                        <span class="es-matching-item-num"><i class="bi bi-circle"></i></span>
                                        <span class="es-matching-item-text">${escapeHtml(item.text)}</span>
                                        <span class="es-matching-link-badge hidden" title="Relié"></span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>

                        <div class="es-matching-col es-matching-col--right">
                            <div class="es-matching-col-header"><i class="bi bi-list-columns"></i> Colonne de droite</div>
                            <div class="es-matching-list es-matching-list--right" data-q-id="${q.id}">
                                ${rightItems.map(item => `
                                    <div class="es-matching-item es-matching-item--right" id="${item.id}" data-q-id="${q.id}" data-side="right" data-item-text="${escapeHtml(item.text)}">
                                        <span class="es-matching-item-num"><i class="bi bi-circle"></i></span>
                                        <span class="es-matching-item-text">${escapeHtml(item.text)}</span>
                                        <span class="es-matching-link-badge hidden" title="Relié"></span>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    </div>

                    <div class="es-matching-status-bar" id="matching_status_bar_${q.id}">
                        <span class="es-matching-count-badge" id="matching_count_${q.id}">0 / ${leftItems.length} reliés</span>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-reset-matching" data-q-id="${q.id}" style="font-size:0.76rem; padding:3px 8px;">
                            <i class="bi bi-arrow-counterclockwise"></i> Réinitialiser les liaisons
                        </button>
                    </div>
                </div>`;
            } else if (q.type === 'cloze') {
                const { parts, blanks } = parseClozeQuestion(q.clozeText || '');
                const distractors = Array.isArray(q.distractors) ? q.distractors : [];
                const allWords = [...blanks, ...distractors].filter(w => w && String(w).trim().length > 0);
                const tagObjects = allWords.map((word, wIdx) => ({
                    tagId: `tag_${q.id}_${wIdx}`,
                    word: String(word).trim()
                }));
                const shuffledTags = shuffleArray(tagObjects);
                const savedCloze = (savedVal && typeof savedVal === 'object') ? savedVal : {};

                inputHtml = `
                <div class="es-cloze-wrap" id="cloze_wrap_${q.id}" data-q-id="${q.id}">
                    <input type="hidden" name="question_${q.id}" id="cloze_input_${q.id}" class="quiz-track-input" data-blanks-count="${blanks.length}" value="${escapeHtml(JSON.stringify(savedCloze))}">
                    
                    <div class="es-cloze-bank-container" id="cloze_bank_box_${q.id}" data-q-id="${q.id}">
                        <div class="es-cloze-bank-header">
                            <div class="es-cloze-bank-title">
                                <i class="bi bi-tags-fill" style="color:var(--clr-primary);"></i>
                                <span>Étiquettes à placer (<span id="cloze_bank_count_${q.id}">${tagObjects.length}</span> disponibles pour ${blanks.length} trou${blanks.length > 1 ? 's' : ''})</span>
                            </div>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <span class="es-badge es-badge--stagiaire" id="cloze_status_${q.id}" style="font-size:0.75rem; padding:2px 8px;">
                                    0 / ${blanks.length} trou(s)
                                </span>
                                <div class="es-cloze-bank-hint">
                                    <i class="bi bi-hand-index-thumb"></i> Glissez ou cliquez
                                </div>
                            </div>
                        </div>
                        <div class="es-cloze-bank" id="cloze_bank_${q.id}" data-q-id="${q.id}">
                            ${shuffledTags.map(t => `
                                <div class="es-cloze-tag" id="${t.tagId}" draggable="true" data-tag-id="${t.tagId}" data-tag-word="${escapeHtml(t.word)}" data-q-id="${q.id}">
                                    <span class="es-cloze-tag-handle"><i class="bi bi-grip-vertical"></i></span>
                                    <span class="es-cloze-tag-text">${escapeHtml(t.word)}</span>
                                </div>
                            `).join('')}
                            <div class="es-cloze-bank-empty hidden" id="cloze_empty_${q.id}">Toutes les étiquettes ont été placées.</div>
                        </div>
                    </div>

                    <div class="es-cloze-text-card">
                        ${parts.map(part => {
                            if (part.type === 'text') {
                                return `<span>${escapeHtml(part.text)}</span>`;
                            } else {
                                return `
                                <span class="es-cloze-dropzone" id="cloze_drop_${q.id}_${part.index}" data-q-id="${q.id}" data-blank-idx="${part.index}" title="Trou n°${part.index + 1}">
                                    <span class="es-cloze-dropzone-placeholder">
                                        <i class="bi bi-dash"></i> [ ${part.index + 1} ] <i class="bi bi-dash"></i>
                                    </span>
                                </span>`;
                            }
                        }).join('')}
                    </div>
                </div>`;
            } else {
                const textVal = (typeof savedVal === 'string') ? savedVal : '';
                inputHtml = `
                <div class="es-quiz-textarea-wrap">
                    ${q.hint ? `<div class="es-quiz-hint"><i class="bi bi-lightbulb"></i> <strong>Piste :</strong> ${escapeHtml(q.hint)}</div>` : ''}
                    <textarea class="es-quiz-textarea quiz-track-input" name="question_${q.id}" placeholder="Rédigez votre réponse détaillée ici...">${escapeHtml(textVal)}</textarea>
                </div>`;
            }

            let typeBadgeLabel = 'QCM';
            if (q.type === 'image_choice') typeBadgeLabel = '🖼️ QCM Choix d\'images';
            else if (q.type === 'table_choice') typeBadgeLabel = '📋 Tableau d\'affirmations';
            else if (q.type === 'classification') typeBadgeLabel = '🗂️ Classement par catégories';
            else if (q.type === 'cloze') typeBadgeLabel = '🔤 Texte à trous';
            else if (q.type === 'pinpoint') typeBadgeLabel = '📍 Repère sur image';
            else if (q.type === 'range') typeBadgeLabel = 'Curseur horizontal';
            else if (q.type === 'boolean') typeBadgeLabel = 'Vrai / Faux';
            else if (q.type === 'puzzle') typeBadgeLabel = 'Puzzle / Ordonnancement';
            else if (q.type === 'matching') typeBadgeLabel = '🔗 Relier les colonnes';
            else if (q.type === 'text') typeBadgeLabel = 'Réponse rédigée';

            return `
            <div class="es-quiz-question-box" id="q_box_${q.id}">
                <div class="es-quiz-q-num">Question ${qNum} sur ${allActiveRegularQuestions.length} • ${typeBadgeLabel}</div>
                <div class="es-quiz-q-text">${formatQuestionRichText(q.text)}</div>
                ${imageHtml}
                ${inputHtml}
            </div>`;
        }).join('');
    }

    attachQuizInteractions(container);

    // 4. Boutons de navigation
    const isFirstPage = (currentSectionIndex === 0);
    const isLastPage = (currentSectionIndex === quizSections.length - 1);

    const btnPrev = document.getElementById('btnPrevSection');
    const noPrevWarn = document.getElementById('quizNoPrevWarn');
    const btnNext = document.getElementById('btnNextSection');
    const btnSubmit = document.getElementById('btnSubmitQuiz');
    const pageBadge = document.getElementById('quizPageCounterBadge');

    if (pageBadge) {
        pageBadge.textContent = quizSections.length > 1 ? `Page ${currentSectionIndex + 1} / ${quizSections.length}` : `Page 1 / 1`;
    }

    if (btnPrev) {
        if (!isFirstPage && allowPrev) {
            btnPrev.classList.remove('hidden');
        } else {
            btnPrev.classList.add('hidden');
        }
    }

    if (noPrevWarn) {
        if (!isFirstPage && !allowPrev && quizSections.length > 1) {
            noPrevWarn.classList.remove('hidden');
        } else {
            noPrevWarn.classList.add('hidden');
        }
    }

    if (btnNext) {
        if (!isLastPage) {
            btnNext.classList.remove('hidden');
        } else {
            btnNext.classList.add('hidden');
        }
    }

    if (btnSubmit) {
        if (isLastPage) {
            btnSubmit.classList.remove('hidden');
        } else {
            btnSubmit.classList.add('hidden');
        }
    }

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

    // Image choice candidate selection
    container.querySelectorAll('.es-image-choice-label').forEach(label => {
        label.addEventListener('click', (e) => {
            const qId = label.getAttribute('data-q-id');
            const oIdx = parseInt(label.getAttribute('data-oidx'), 10);
            const parent = label.closest('.es-image-choice-grid');
            if (parent) {
                parent.querySelectorAll('.es-image-choice-label').forEach(lbl => {
                    lbl.classList.remove('selected');
                    const radioBox = lbl.querySelector('.es-radio-custom');
                    if (radioBox) {
                        radioBox.style.borderColor = 'var(--clr-surface-3)';
                        radioBox.style.background = 'transparent';
                        radioBox.innerHTML = '';
                    }
                });
            }
            label.classList.add('selected');
            const radio = label.querySelector('input[type="radio"]');
            if (radio) radio.checked = true;
            const radioBox = label.querySelector('.es-radio-custom');
            if (radioBox) {
                radioBox.style.borderColor = 'var(--clr-primary)';
                radioBox.style.background = 'var(--clr-primary)';
                radioBox.innerHTML = '<div style="width:8px; height:8px; border-radius:50%; background:#fff;"></div>';
            }
            userAnswersState[qId] = oIdx;
            updateProgress();
        });
    });

    // Table choice interactions
    container.querySelectorAll('.es-table-choice-cell-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const input = btn.querySelector('.table-choice-input');
            if (!input) return;
            const qId = input.getAttribute('data-q-id');
            const rIdx = input.getAttribute('data-ridx');
            const col = input.getAttribute('data-col');
            const isRadio = input.type === 'radio';

            if (!userAnswersState[qId]) userAnswersState[qId] = {};
            if (!userAnswersState[qId][rIdx]) userAnswersState[qId][rIdx] = { col1: false, col2: false };

            const tr = btn.closest('.es-table-choice-tr');

            if (isRadio) {
                input.checked = true;
                userAnswersState[qId][rIdx] = {
                    col1: (col === 'col1'),
                    col2: (col === 'col2')
                };
                if (tr) {
                    tr.querySelectorAll('.es-table-choice-cell-btn').forEach(b => {
                        b.classList.remove('selected');
                        const icon = b.querySelector('i');
                        if (icon) icon.className = 'bi bi-circle';
                    });
                }
                btn.classList.add('selected');
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'bi bi-circle-fill';
            } else {
                input.checked = !input.checked;
                userAnswersState[qId][rIdx][col] = input.checked;
                btn.classList.toggle('selected', input.checked);
                const icon = btn.querySelector('i');
                if (icon) icon.className = `bi ${input.checked ? 'bi-check-square-fill' : 'bi-square'}`;
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

    // ----------------------------------------------------------------
    // INTERACTIONS TEXTE À TROUS (CLOZE / DRAG & DROP & TAP-TO-PLACE)
    // ----------------------------------------------------------------
    function syncClozeValue(qId) {
        const wrap = document.getElementById(`cloze_wrap_${qId}`);
        const input = document.getElementById(`cloze_input_${qId}`);
        const bank = document.getElementById(`cloze_bank_${qId}`);
        const emptyNotice = document.getElementById(`cloze_empty_${qId}`);
        if (!wrap || !input) return;

        const dropzones = wrap.querySelectorAll('.es-cloze-dropzone');
        const answersObj = {};
        let filledCount = 0;

        dropzones.forEach(dz => {
            const bIdx = dz.getAttribute('data-blank-idx');
            const placedTag = dz.querySelector('.es-cloze-tag');
            if (placedTag) {
                const word = placedTag.getAttribute('data-tag-word') || '';
                answersObj[bIdx] = word;
                dz.classList.add('es-cloze-dropzone--filled');
                const placeholder = dz.querySelector('.es-cloze-dropzone-placeholder');
                if (placeholder) placeholder.style.display = 'none';
                filledCount++;
            } else {
                answersObj[bIdx] = null;
                dz.classList.remove('es-cloze-dropzone--filled');
                const placeholder = dz.querySelector('.es-cloze-dropzone-placeholder');
                if (placeholder) placeholder.style.display = 'inline-flex';
            }
        });

        input.value = filledCount > 0 ? JSON.stringify(answersObj) : '';

        const totalBlanks = dropzones.length;
        const statusEl = document.getElementById(`cloze_status_${qId}`);
        if (statusEl) {
            statusEl.textContent = `${filledCount} / ${totalBlanks} trou${totalBlanks > 1 ? 's' : ''}`;
            if (filledCount === totalBlanks) {
                statusEl.className = 'es-badge es-badge--success';
            } else {
                statusEl.className = 'es-badge es-badge--stagiaire';
            }
        }

        if (bank) {
            const remainingTags = bank.querySelectorAll('.es-cloze-tag').length;
            const bankCountEl = document.getElementById(`cloze_bank_count_${qId}`);
            if (bankCountEl) bankCountEl.textContent = remainingTags;

            if (emptyNotice) {
                if (remainingTags === 0) {
                    emptyNotice.classList.remove('hidden');
                } else {
                    emptyNotice.classList.add('hidden');
                }
            }
        }

        updateProgress();
    }

    container.querySelectorAll('.es-cloze-tag').forEach(tag => {
        tag.addEventListener('dragstart', (e) => {
            tag.classList.add('dragging');
            e.dataTransfer.setData('text/plain', tag.id);
            e.dataTransfer.effectAllowed = 'move';
        });

        tag.addEventListener('dragend', () => {
            tag.classList.remove('dragging');
        });

        // Click sur tag (Tap-to-place ou remise en banque)
        tag.addEventListener('click', (e) => {
            const qId = tag.getAttribute('data-q-id');
            const isInDropzone = tag.closest('.es-cloze-dropzone');

            if (isInDropzone) {
                // Si on clique sur un tag dans un trou, le renvoyer dans la banque
                const bank = document.getElementById(`cloze_bank_${qId}`);
                if (bank) {
                    const removeBtn = tag.querySelector('.es-cloze-tag-remove');
                    if (removeBtn) removeBtn.remove();
                    bank.appendChild(tag);
                    syncClozeValue(qId);
                }
            } else {
                // Tag dans la banque : bascule sélection
                const isSelected = tag.classList.contains('is-selected');
                const wrap = document.getElementById(`cloze_wrap_${qId}`);
                if (wrap) {
                    wrap.querySelectorAll('.es-cloze-tag.is-selected').forEach(t => t.classList.remove('is-selected'));
                }
                if (!isSelected) {
                    tag.classList.add('is-selected');
                }
            }
        });
    });

    container.querySelectorAll('.es-cloze-dropzone').forEach(dropzone => {
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            dropzone.classList.add('es-cloze-dropzone--dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('es-cloze-dropzone--dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('es-cloze-dropzone--dragover');
            const tagId = e.dataTransfer.getData('text/plain');
            const tag = document.getElementById(tagId);
            const qId = dropzone.getAttribute('data-q-id');
            if (!tag || tag.getAttribute('data-q-id') !== qId) return;

            const existingTag = dropzone.querySelector('.es-cloze-tag');
            const bank = document.getElementById(`cloze_bank_${qId}`);
            if (existingTag && existingTag !== tag && bank) {
                const removeBtn = existingTag.querySelector('.es-cloze-tag-remove');
                if (removeBtn) removeBtn.remove();
                bank.appendChild(existingTag);
            }

            if (!tag.querySelector('.es-cloze-tag-remove')) {
                const removeBtn = document.createElement('span');
                removeBtn.className = 'es-cloze-tag-remove';
                removeBtn.title = 'Retirer du trou';
                removeBtn.innerHTML = '<i class="bi bi-x"></i>';
                removeBtn.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (bank) {
                        removeBtn.remove();
                        bank.appendChild(tag);
                        syncClozeValue(qId);
                    }
                });
                tag.appendChild(removeBtn);
            }

            dropzone.appendChild(tag);
            tag.classList.remove('is-selected');
            syncClozeValue(qId);
        });

        // Click sur dropzone pour déposer le tag sélectionné (Tap-to-place)
        dropzone.addEventListener('click', (e) => {
            if (e.target.closest('.es-cloze-tag')) return;
            const qId = dropzone.getAttribute('data-q-id');
            const wrap = document.getElementById(`cloze_wrap_${qId}`);
            if (!wrap) return;

            const selectedTag = wrap.querySelector('.es-cloze-bank .es-cloze-tag.is-selected');
            if (selectedTag) {
                const bank = document.getElementById(`cloze_bank_${qId}`);
                const existingTag = dropzone.querySelector('.es-cloze-tag');
                if (existingTag && existingTag !== selectedTag && bank) {
                    const removeBtn = existingTag.querySelector('.es-cloze-tag-remove');
                    if (removeBtn) removeBtn.remove();
                    bank.appendChild(existingTag);
                }

                if (!selectedTag.querySelector('.es-cloze-tag-remove')) {
                    const removeBtn = document.createElement('span');
                    removeBtn.className = 'es-cloze-tag-remove';
                    removeBtn.title = 'Retirer du trou';
                    removeBtn.innerHTML = '<i class="bi bi-x"></i>';
                    removeBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        if (bank) {
                            removeBtn.remove();
                            bank.appendChild(selectedTag);
                            syncClozeValue(qId);
                        }
                    });
                    selectedTag.appendChild(removeBtn);
                }

                dropzone.appendChild(selectedTag);
                selectedTag.classList.remove('is-selected');
                syncClozeValue(qId);
            }
        });
    });

    container.querySelectorAll('.es-cloze-bank-container').forEach(bankContainer => {
        bankContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            bankContainer.classList.add('es-cloze-bank--dragover');
        });

        bankContainer.addEventListener('dragleave', () => {
            bankContainer.classList.remove('es-cloze-bank--dragover');
        });

        bankContainer.addEventListener('drop', (e) => {
            e.preventDefault();
            bankContainer.classList.remove('es-cloze-bank--dragover');
            const tagId = e.dataTransfer.getData('text/plain');
            const tag = document.getElementById(tagId);
            const qId = tag?.getAttribute('data-q-id');
            const bank = document.getElementById(`cloze_bank_${qId}`);
            if (tag && bank) {
                const removeBtn = tag.querySelector('.es-cloze-tag-remove');
                if (removeBtn) removeBtn.remove();
                bank.appendChild(tag);
                syncClozeValue(qId);
            }
        });
    });

    // Interaction du type Matching (Relier les colonnes)
    container.querySelectorAll('.es-matching-wrap').forEach(wrap => {
        const qId = wrap.getAttribute('data-q-id');
        const input = document.getElementById(`matching_input_${qId}`);
        const countBadge = document.getElementById(`matching_count_${qId}`);
        const resetBtn = wrap.querySelector('.btn-reset-matching');
        
        let selectedLeftEl = null;
        let userMatches = {}; // { leftText: rightText }

        if (input && input.value) {
            try {
                userMatches = typeof input.value === 'object' ? input.value : JSON.parse(input.value);
            } catch(e) {
                userMatches = {};
            }
        }

        const MATCHING_PALETTE = [
            { bg: 'rgba(52, 152, 219, 0.12)', border: '#3498db', text: '#2980b9' },
            { bg: 'rgba(155, 89, 182, 0.12)', border: '#9b59b6', text: '#8e44ad' },
            { bg: 'rgba(230, 126, 34, 0.12)', border: '#e67e22', text: '#d35400' },
            { bg: 'rgba(39, 174, 96, 0.12)', border: '#27ae60', text: '#229954' },
            { bg: 'rgba(26, 188, 156, 0.12)', border: '#1abc9c', text: '#16a085' },
            { bg: 'rgba(231, 76, 60, 0.12)', border: '#e74c3c', text: '#c0392b' },
            { bg: 'rgba(241, 196, 15, 0.14)', border: '#f39c12', text: '#b7791f' },
            { bg: 'rgba(52, 73, 94, 0.12)', border: '#34495e', text: '#2c3e50' },
        ];

        function syncMatchingUI() {
            const leftItems = wrap.querySelectorAll('.es-matching-item--left');
            const rightItems = wrap.querySelectorAll('.es-matching-item--right');

            // Mise à jour de la colonne de gauche
            leftItems.forEach((item, idx) => {
                const lText = item.getAttribute('data-item-text');
                const matchedRight = userMatches[lText];
                const badge = item.querySelector('.es-matching-link-badge');
                const icon = item.querySelector('.es-matching-item-num i');

                if (matchedRight) {
                    const color = MATCHING_PALETTE[idx % MATCHING_PALETTE.length];
                    item.classList.add('es-matching-item--connected');
                    item.style.backgroundColor = color.bg;
                    item.style.borderColor = color.border;
                    if (badge) {
                        badge.classList.remove('hidden');
                        badge.textContent = `➔ ${matchedRight}`;
                        badge.style.backgroundColor = color.border;
                        badge.style.color = '#ffffff';
                    }
                    if (icon) icon.className = 'bi bi-check-circle-fill';
                } else {
                    item.classList.remove('es-matching-item--connected');
                    item.style.backgroundColor = '';
                    item.style.borderColor = '';
                    if (badge) badge.classList.add('hidden');
                    if (icon) icon.className = 'bi bi-circle';
                }
            });

            // Mise à jour de la colonne de droite (support N vers 1)
            rightItems.forEach((item, rIdx) => {
                const rText = (item.getAttribute('data-item-text') || '').trim();
                const connectedLeftEntries = Object.keys(userMatches).filter(k => (userMatches[k] || '').trim().toLowerCase() === rText.toLowerCase());
                const badge = item.querySelector('.es-matching-link-badge');
                const icon = item.querySelector('.es-matching-item-num i');

                if (connectedLeftEntries.length > 0) {
                    item.classList.add('es-matching-item--connected');
                    if (connectedLeftEntries.length === 1) {
                        const leftIdx = Array.from(leftItems).findIndex(el => el.getAttribute('data-item-text') === connectedLeftEntries[0]);
                        const color = MATCHING_PALETTE[(leftIdx >= 0 ? leftIdx : rIdx) % MATCHING_PALETTE.length];
                        item.style.backgroundColor = color.bg;
                        item.style.borderColor = color.border;
                        if (badge) {
                            badge.classList.remove('hidden');
                            badge.textContent = `🔗 1 liaison`;
                            badge.style.backgroundColor = color.border;
                            badge.style.color = '#ffffff';
                        }
                    } else {
                        item.style.backgroundColor = 'rgba(52, 152, 219, 0.15)';
                        item.style.borderColor = 'var(--clr-primary)';
                        if (badge) {
                            badge.classList.remove('hidden');
                            badge.textContent = `🔗 ${connectedLeftEntries.length} liaisons`;
                            badge.style.backgroundColor = 'var(--clr-primary)';
                            badge.style.color = '#ffffff';
                        }
                    }
                    if (icon) icon.className = 'bi bi-check-circle-fill';
                } else {
                    item.classList.remove('es-matching-item--connected');
                    item.style.backgroundColor = '';
                    item.style.borderColor = '';
                    if (badge) badge.classList.add('hidden');
                    if (icon) icon.className = 'bi bi-circle';
                }
            });

            const totalPairs = parseInt(input.getAttribute('data-pairs-count'), 10) || leftItems.length;
            const connectedCount = Object.keys(userMatches).filter(k => userMatches[k]).length;
            if (countBadge) {
                countBadge.textContent = `${connectedCount} / ${totalPairs} élément${totalPairs > 1 ? 's' : ''} relié${connectedCount > 1 ? 's' : ''}`;
            }

            input.value = connectedCount > 0 ? JSON.stringify(userMatches) : '';
            updateProgress();
        }

        wrap.querySelectorAll('.es-matching-item--left').forEach(item => {
            item.addEventListener('click', () => {
                if (selectedLeftEl === item) {
                    item.classList.remove('es-matching-item--selected');
                    selectedLeftEl = null;
                } else {
                    wrap.querySelectorAll('.es-matching-item--left').forEach(el => el.classList.remove('es-matching-item--selected'));
                    item.classList.add('es-matching-item--selected');
                    selectedLeftEl = item;
                }
            });
        });

        wrap.querySelectorAll('.es-matching-item--right').forEach(item => {
            item.addEventListener('click', () => {
                const rText = item.getAttribute('data-item-text');
                if (selectedLeftEl) {
                    const lText = selectedLeftEl.getAttribute('data-item-text');
                    // Si on clique sur la même correspondance déjà attribuée à cet élément, on la délie
                    if (userMatches[lText] === rText) {
                        delete userMatches[lText];
                    } else {
                        // Relier l'élément gauche à cet élément droit
                        userMatches[lText] = rText;
                    }
                    selectedLeftEl.classList.remove('es-matching-item--selected');
                    selectedLeftEl = null;
                    syncMatchingUI();
                }
            });
        });

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                userMatches = {};
                if (selectedLeftEl) {
                    selectedLeftEl.classList.remove('es-matching-item--selected');
                    selectedLeftEl = null;
                }
                syncMatchingUI();
            });
        }

        syncMatchingUI();
    });

    // ----------------------------------------------------------------
    // INTERACTIONS CLASSIFICATION (CLASSEMENT PAR CATÉGORIES / GLISSER-DÉPOSER)
    // ----------------------------------------------------------------
    function syncClassificationValue(qId) {
        const wrap = document.getElementById(`classification_wrap_${qId}`);
        const input = document.getElementById(`classification_input_${qId}`);
        const bank = document.getElementById(`bank_${qId}`);
        const statusEl = document.getElementById(`classification_status_${qId}`);
        if (!wrap || !input) return;

        const currentQ = (currentQuestions || []).find(q => q.id === qId);
        const totalItems = (currentQ?.items || []).length;

        const placements = {};
        let placedCount = 0;

        wrap.querySelectorAll('.es-classification-cat-card').forEach(card => {
            const catId = card.getAttribute('data-cat-id');
            const dropzone = card.querySelector('.es-classification-cat-dropzone');
            const countBadge = card.querySelector('.cat-count-badge');
            const emptyNotice = card.querySelector('.es-classification-drop-empty');
            
            const placedTags = dropzone ? dropzone.querySelectorAll('.es-classification-placed-tag') : [];
            placedTags.forEach(tag => {
                const itemId = tag.getAttribute('data-item-id');
                if (itemId) {
                    placements[itemId] = catId;
                    placedCount++;
                }
            });

            if (countBadge) countBadge.textContent = placedTags.length;
            if (emptyNotice) {
                if (placedTags.length > 0) emptyNotice.classList.add('hidden');
                else emptyNotice.classList.remove('hidden');
            }
        });

        if (bank) {
            const bankEmptyNotice = bank.querySelector('.es-classification-drop-empty');
            const remainingTags = bank.querySelectorAll('.es-classification-tag').length;
            if (bankEmptyNotice) {
                if (remainingTags === 0) bankEmptyNotice.classList.remove('hidden');
                else bankEmptyNotice.classList.add('hidden');
            }
        }

        input.value = JSON.stringify(placements);
        userAnswersState[qId] = placements;

        if (statusEl) {
            statusEl.textContent = `${placedCount} / ${totalItems} classée${placedCount > 1 ? 's' : ''}`;
            if (placedCount === totalItems) {
                statusEl.className = 'es-badge es-badge--success';
            } else {
                statusEl.className = 'es-badge es-badge--stagiaire';
            }
        }

        updateProgress();
    }

    container.querySelectorAll('.es-classification-wrap').forEach(wrap => {
        const qId = wrap.getAttribute('data-q-id');
        const currentQ = (currentQuestions || []).find(q => q.id === qId);
        const rawItems = currentQ?.items || [];
        const itemMap = {};
        rawItems.forEach(it => { itemMap[it.id] = it; });

        let selectedTagId = null;

        function clearSelected() {
            wrap.querySelectorAll('.es-classification-tag, .es-classification-placed-tag').forEach(el => el.classList.remove('selected'));
            selectedTagId = null;
        }

        function moveItemToCategory(itemId, catId) {
            const item = itemMap[itemId];
            if (!item) return;
            const dropzone = wrap.querySelector(`#dropzone_${qId}_${catId}`);
            if (!dropzone) return;

            const oldBankEl = wrap.querySelector(`#tag_bank_${qId}_${itemId}`);
            if (oldBankEl) oldBankEl.remove();
            const oldPlacedEl = wrap.querySelector(`#tag_placed_${qId}_${itemId}`);
            if (oldPlacedEl) oldPlacedEl.remove();

            const newTag = document.createElement('div');
            newTag.className = 'es-classification-placed-tag';
            newTag.id = `tag_placed_${qId}_${itemId}`;
            newTag.setAttribute('data-q-id', qId);
            newTag.setAttribute('data-item-id', itemId);
            newTag.setAttribute('draggable', 'true');
            newTag.innerHTML = `
                <span class="es-classification-tag-handle"><i class="bi bi-grip-vertical"></i></span>
                <span>${escapeHtml(item.text)}</span>
                <button type="button" class="es-classification-tag-remove" data-q-id="${qId}" data-item-id="${itemId}" title="Retirer et remettre dans la banque">
                    <i class="bi bi-x"></i>
                </button>
            `;

            dropzone.appendChild(newTag);
            bindTagEvents(newTag);
            clearSelected();
            syncClassificationValue(qId);
        }

        function moveItemToBank(itemId) {
            const item = itemMap[itemId];
            if (!item) return;
            const bank = wrap.querySelector(`#bank_${qId}`);
            if (!bank) return;

            const oldBankEl = wrap.querySelector(`#tag_bank_${qId}_${itemId}`);
            if (oldBankEl) oldBankEl.remove();
            const oldPlacedEl = wrap.querySelector(`#tag_placed_${qId}_${itemId}`);
            if (oldPlacedEl) oldPlacedEl.remove();

            const newTag = document.createElement('div');
            newTag.className = 'es-classification-tag';
            newTag.id = `tag_bank_${qId}_${itemId}`;
            newTag.setAttribute('data-q-id', qId);
            newTag.setAttribute('data-item-id', itemId);
            newTag.setAttribute('draggable', 'true');
            newTag.innerHTML = `
                <span class="es-classification-tag-handle"><i class="bi bi-grip-vertical"></i></span>
                <span>${escapeHtml(item.text)}</span>
            `;

            bank.appendChild(newTag);
            bindTagEvents(newTag);
            clearSelected();
            syncClassificationValue(qId);
        }

        function bindTagEvents(tagEl) {
            const itemId = tagEl.getAttribute('data-item-id');

            tagEl.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', JSON.stringify({ qId, itemId }));
                tagEl.classList.add('is-dragging');
            });

            tagEl.addEventListener('dragend', () => {
                tagEl.classList.remove('is-dragging');
            });

            tagEl.addEventListener('click', (e) => {
                if (e.target.closest('.es-classification-tag-remove')) {
                    e.stopPropagation();
                    moveItemToBank(itemId);
                    return;
                }
                e.stopPropagation();
                if (selectedTagId === itemId) {
                    clearSelected();
                } else {
                    clearSelected();
                    selectedTagId = itemId;
                    tagEl.classList.add('selected');
                }
            });
        }

        wrap.querySelectorAll('.es-classification-tag, .es-classification-placed-tag').forEach(tag => {
            bindTagEvents(tag);
        });

        wrap.querySelectorAll('.es-classification-cat-dropzone').forEach(dz => {
            const catId = dz.getAttribute('data-cat-id');

            dz.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                dz.classList.add('drag-over');
            });

            dz.addEventListener('dragleave', () => {
                dz.classList.remove('drag-over');
            });

            dz.addEventListener('drop', (e) => {
                e.preventDefault();
                dz.classList.remove('drag-over');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (data && data.qId === qId && data.itemId) {
                        moveItemToCategory(data.itemId, catId);
                    }
                } catch(err) {}
            });

            dz.addEventListener('click', () => {
                if (selectedTagId) {
                    moveItemToCategory(selectedTagId, catId);
                }
            });
        });

        const bank = wrap.querySelector('.es-classification-bank');
        if (bank) {
            bank.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                bank.classList.add('drag-over');
            });

            bank.addEventListener('dragleave', () => {
                bank.classList.remove('drag-over');
            });

            bank.addEventListener('drop', (e) => {
                e.preventDefault();
                bank.classList.remove('drag-over');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                    if (data && data.qId === qId && data.itemId) {
                        moveItemToBank(data.itemId);
                    }
                } catch(err) {}
            });

            bank.addEventListener('click', () => {
                if (selectedTagId) {
                    moveItemToBank(selectedTagId);
                }
            });
        }
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

function isQuestionAnswered(q, val) {
    if (val === undefined || val === null) return false;
    if (q.type === 'qcm') {
        if (Array.isArray(val)) return val.length > 0;
        return (val !== '' && val !== null && !isNaN(val));
    }
    if (q.type === 'image_choice') {
        return (val !== '' && val !== null && !isNaN(val));
    }
    if (q.type === 'boolean') {
        return (val === true || val === false || val === 'true' || val === 'false');
    }
    if (q.type === 'range' || q.type === 'puzzle') {
        return true;
    }
    if (q.type === 'pinpoint') {
        return (typeof val === 'object' && val.x !== undefined && val.y !== undefined);
    }
    if (q.type === 'cloze') {
        if (!val || typeof val !== 'object') return false;
        const { blanks } = parseClozeQuestion(q.clozeText || '');
        const total = blanks.length || 1;
        const filled = Object.values(val).filter(v => v !== null && v !== undefined && String(v).trim().length > 0).length;
        return filled >= total;
    }
    if (q.type === 'matching') {
        if (!val || typeof val !== 'object') return false;
        const leftPairs = (q.pairs || []).map(p => (p.left || '').trim()).filter(Boolean);
        const totalPairs = leftPairs.length || 1;
        const filled = leftPairs.filter(leftText => val[leftText] && String(val[leftText]).trim().length > 0).length;
        return filled >= totalPairs;
    }
    if (q.type === 'table_choice') {
        const rows = q.tableRows || [];
        if (!val || typeof val !== 'object') return false;
        const answeredRows = rows.filter((r, rIdx) => {
            const rowAns = val[rIdx];
            return rowAns && (rowAns.col1 || rowAns.col2);
        }).length;
        return (answeredRows === rows.length);
    }
    if (q.type === 'classification') {
        const items = q.items || [];
        if (!val || typeof val !== 'object') return false;
        const placedCount = items.filter(it => val[it.id]).length;
        return (placedCount === items.length);
    }
    if (typeof val === 'string') {
        return val.trim().length > 0;
    }
    return true;
}

function updateProgress() {
    saveCurrentPageAnswersToState();
    const regularQuestions = (quizSections && quizSections.length > 0)
        ? quizSections.flatMap(s => s.questions || [])
        : currentQuestions.filter(q => q.type !== 'section');
    if (regularQuestions.length === 0) return;

    let answeredCount = 0;
    regularQuestions.forEach(q => {
        if (isQuestionAnswered(q, userAnswersState[q.id])) {
            answeredCount++;
        }
    });

    const percent = Math.round((answeredCount / regularQuestions.length) * 100);
    const bar = document.getElementById('quizProgressBar');
    if (bar) bar.style.width = `${percent}%`;

    const label = document.getElementById('activeProgressLabel');
    if (label) label.textContent = `${answeredCount} / ${regularQuestions.length} répondues (${percent}%)`;

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

    saveCurrentPageAnswersToState();

    const warningLabel = document.getElementById('quizWarningLabel');
    const btn = document.getElementById('btnSubmitQuiz');
    const regularQuestions = (quizSections && quizSections.length > 0)
        ? quizSections.flatMap(s => s.questions || [])
        : currentQuestions.filter(q => q.type !== 'section');
    const qConfig = currentModuleData?.quizConfig || {};
    const hasNegativePoints = Boolean(qConfig.negativePoints === true || qConfig.negativePoints === 'true');

    const answers = {};
    const evaluations = {};
    let missingCount = 0;
    let qcmTotal = 0;
    let qcmCorrect = 0;
    let pointsTotal = 0;

    regularQuestions.forEach(q => {
        const savedVal = userAnswersState[q.id];

        if (q.type === 'qcm') {
            qcmTotal++;
            const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                ? q.correctIndexes.map(n => parseInt(n, 10)).sort((a, b) => a - b)
                : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

            let userIndices = [];
            if (Array.isArray(savedVal)) {
                userIndices = savedVal.map(n => parseInt(n, 10)).filter(n => !isNaN(n)).sort((a, b) => a - b);
            } else if (savedVal !== undefined && savedVal !== null && savedVal !== '') {
                userIndices = [parseInt(savedVal, 10)];
            }

            answers[q.id] = userIndices;
            if (userIndices.length === 0) {
                missingCount++;
            } else {
                const isCorrect = (userIndices.length === expectedIndices.length && userIndices.every((val, i) => val === expectedIndices[i]));
                if (isCorrect) {
                    qcmCorrect++;
                    pointsTotal += 1;
                } else if (hasNegativePoints) {
                    pointsTotal -= 0.5;
                }
            }
        } else if (q.type === 'image_choice') {
            qcmTotal++;
            const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
            if (savedVal !== undefined && savedVal !== null && savedVal !== '') {
                const val = parseInt(savedVal, 10);
                answers[q.id] = val;
                if (val === correctIdx) {
                    qcmCorrect++;
                    pointsTotal += 1;
                } else if (hasNegativePoints) {
                    pointsTotal -= 0.5;
                }
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'table_choice') {
            qcmTotal++;
            const rows = q.tableRows || [];
            const userAnsObj = (savedVal && typeof savedVal === 'object') ? savedVal : {};
            answers[q.id] = userAnsObj;

            let allRowsCorrect = (rows.length > 0);
            let hasAnyAnswer = false;

            rows.forEach((row, rIdx) => {
                const userRow = userAnsObj[rIdx] || {};
                const uCol1 = !!userRow.col1;
                const uCol2 = !!userRow.col2;
                if (uCol1 || uCol2) hasAnyAnswer = true;
                const expCol1 = !!row.correctCol1;
                const expCol2 = !!row.correctCol2;
                if (uCol1 !== expCol1 || uCol2 !== expCol2) {
                    allRowsCorrect = false;
                }
            });

            if (!hasAnyAnswer) {
                missingCount++;
            } else if (allRowsCorrect) {
                qcmCorrect++;
                pointsTotal += 1;
            } else if (hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        } else if (q.type === 'boolean') {
            qcmTotal++;
            const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
            if (savedVal === true || savedVal === false || savedVal === 'true' || savedVal === 'false') {
                const val = (savedVal === true || savedVal === 'true');
                answers[q.id] = val;
                if (val === expectedBool) {
                    qcmCorrect++;
                    pointsTotal += 1;
                } else if (hasNegativePoints) {
                    pointsTotal -= 0.5;
                }
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'range') {
            if (savedVal !== undefined && savedVal !== null && savedVal !== '') {
                const val = parseFloat(savedVal);
                answers[q.id] = val;
                if (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) {
                    qcmTotal++;
                    const targetVal = parseFloat(q.correctValue);
                    const tolerance = parseFloat(q.tolerance) || 0;
                    if (Math.abs(val - targetVal) <= tolerance) {
                        qcmCorrect++;
                        pointsTotal += 1;
                    } else if (hasNegativePoints) {
                        pointsTotal -= 0.5;
                    }
                }
            } else {
                answers[q.id] = (q.min !== undefined) ? parseFloat(q.min) : 0;
                missingCount++;
            }
        } else if (q.type === 'pinpoint') {
            qcmTotal++;
            if (savedVal && typeof savedVal === 'object' && savedVal.x !== undefined && savedVal.y !== undefined) {
                answers[q.id] = savedVal;
                const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
                const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
                const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
                const dx = savedVal.x - targetX;
                const dy = savedVal.y - targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist <= radius) {
                    qcmCorrect++;
                    pointsTotal += 1;
                } else if (hasNegativePoints) {
                    pointsTotal -= 0.5;
                }
            } else {
                answers[q.id] = null;
                missingCount++;
            }
        } else if (q.type === 'classification') {
            qcmTotal++;
            const rawItems = q.items || [];
            const userPlacements = (savedVal && typeof savedVal === 'object') ? savedVal : {};

            answers[q.id] = userPlacements;

            const placedCount = rawItems.filter(it => userPlacements[it.id]).length;
            if (placedCount < rawItems.length) {
                missingCount++;
            }

            let allCorrect = (rawItems.length > 0);
            rawItems.forEach(it => {
                if (userPlacements[it.id] !== it.categoryId) {
                    allCorrect = false;
                }
            });

            if (allCorrect) {
                qcmCorrect++;
                pointsTotal += 1;
            } else if (placedCount > 0 && hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        } else if (q.type === 'cloze') {
            qcmTotal++;
            const { blanks: expectedBlanks } = parseClozeQuestion(q.clozeText || '');
            const userAnswersObj = (savedVal && typeof savedVal === 'object') ? savedVal : {};

            answers[q.id] = userAnswersObj;

            const filledCount = Object.values(userAnswersObj).filter(v => v !== null && v !== undefined && String(v).trim().length > 0).length;
            if (filledCount < expectedBlanks.length) {
                missingCount++;
            }

            // Vérification de chaque trou
            let allCorrect = (expectedBlanks.length > 0);
            expectedBlanks.forEach((expWord, bIdx) => {
                const uWord = userAnswersObj[bIdx];
                if (!uWord || String(uWord).trim().toLowerCase() !== String(expWord).trim().toLowerCase()) {
                    allCorrect = false;
                }
            });

            if (allCorrect) {
                qcmCorrect++;
                pointsTotal += 1;
            } else if (filledCount > 0 && hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        } else if (q.type === 'puzzle') {
            qcmTotal++;
            const currentOrder = Array.isArray(savedVal) ? savedVal : (q.items || []);
            answers[q.id] = currentOrder;
            const expected = q.items || [];
            const isExact = (currentOrder.length === expected.length && currentOrder.every((it, idx) => it === expected[idx]));
            const hasAnswered = Array.isArray(savedVal) && savedVal.length > 0;
            if (isExact) {
                qcmCorrect++;
                pointsTotal += 1;
            } else if (hasAnswered && hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        } else if (q.type === 'matching') {
            qcmTotal++;
            const rawPairs = q.pairs || [];
            const userMatchesObj = (savedVal && typeof savedVal === 'object') ? savedVal : {};

            answers[q.id] = userMatchesObj;

            const leftKeys = rawPairs.map(p => (p.left || '').trim()).filter(Boolean);
            const filledCount = leftKeys.filter(k => userMatchesObj[k] && String(userMatchesObj[k]).trim().length > 0).length;
            if (filledCount < leftKeys.length) {
                missingCount++;
            }

            // Vérification de chaque paire
            let allCorrect = (rawPairs.length > 0);
            rawPairs.forEach(pair => {
                const lText = (pair.left || '').trim();
                const expRight = (pair.right || '').trim();
                const uRight = (userMatchesObj[lText] || userMatchesObj[pair.left] || '').trim();
                if (!uRight || uRight.toLowerCase() !== expRight.toLowerCase()) {
                    allCorrect = false;
                }
            });

            if (allCorrect) {
                qcmCorrect++;
                pointsTotal += 1;
            } else if (filledCount > 0 && hasNegativePoints) {
                pointsTotal -= 0.5;
            }
        } else {
            qcmTotal++;
            const val = (typeof savedVal === 'string') ? savedVal.trim() : '';
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
                    pointsTotal += 1;
                } else if (hasNegativePoints) {
                    pointsTotal -= 0.5;
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
            const textSpan = warningLabel.querySelector('span') || warningLabel;
            textSpan.textContent = `Attention, vous n'avez pas rempli toutes les questions (${missingCount} non répondue${missingCount > 1 ? 's' : ''}). Voulez-vous quand même envoyer vos réponses ? Cliquez à nouveau sur « Valider et envoyer » pour confirmer.`;
            warningLabel.classList.remove('hidden');
            warningLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return;
        }
    }

    if (warningLabel) warningLabel.classList.add('hidden');
    if (btn) btnLoading(btn, true);

    try {
        const nextAttemptCount = userPreviousSubmissions.length + 1;
        const finalPoints = hasNegativePoints ? Math.max(0, Math.round(pointsTotal * 10) / 10) : qcmCorrect;
        const scorePercent = qcmTotal > 0 ? Math.max(0, Math.min(100, Math.round((finalPoints / qcmTotal) * 100))) : 100;
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
            drawnQuestionIds: regularQuestions.map(q => q.id),
            attemptNumber: nextAttemptCount,
            attemptsCount: nextAttemptCount,
            timeExpired: autoSubmitByTimer === true,
            score: {
                correct: qcmCorrect,
                points: finalPoints,
                rawPoints: pointsTotal,
                negativePointsEnabled: hasNegativePoints,
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

// ----------------------------------------------------------------
// LISTENERS NAVIGATION ET SOUMISSION
// ----------------------------------------------------------------
document.getElementById('btnSubmitQuiz')?.addEventListener('click', () => {
    submitQuizAnswers({ autoSubmitByTimer: false });
});

document.getElementById('btnNextSection')?.addEventListener('click', () => {
    saveCurrentPageAnswersToState();

    const allowPrev = (currentModuleData?.quizConfig?.allowPreviousPage !== false);
    const warningLabel = document.getElementById('quizWarningLabel');

    // Si le verrou de page est activé (retour arrière interdit)
    if (!allowPrev) {
        const sec = quizSections[currentSectionIndex];
        const secQuestions = (sec?.questions || []).filter(q => q.type !== 'section');
        const missingOnPage = secQuestions.filter(q => !isQuestionAnswered(q, userAnswersState[q.id]));

        if (missingOnPage.length > 0) {
            if (warningLabel && warningLabel.classList.contains('hidden')) {
                const textSpan = warningLabel.querySelector('span') || warningLabel;
                textSpan.textContent = `Attention, vous n'avez pas répondu à toutes les questions de cette page (${missingOnPage.length} non répondue${missingOnPage.length > 1 ? 's' : ''}). Le retour en arrière étant désactivé, vous ne pourrez plus modifier vos réponses. Voulez-vous vraiment passer à la page suivante ? Cliquez à nouveau sur « Page suivante » pour confirmer.`;
                warningLabel.classList.remove('hidden');
                warningLabel.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
        }
    }

    if (warningLabel) warningLabel.classList.add('hidden');

    if (currentSectionIndex < quizSections.length - 1) {
        currentSectionIndex++;
        renderActiveSectionPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

document.getElementById('btnPrevSection')?.addEventListener('click', () => {
    const allowPrev = (currentModuleData?.quizConfig?.allowPreviousPage !== false);
    if (!allowPrev) {
        showToast("Le retour aux sections précédentes n'est pas autorisé.", "warning");
        return;
    }
    saveCurrentPageAnswersToState();
    if (currentSectionIndex > 0) {
        currentSectionIndex--;
        renderActiveSectionPage();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

// ----------------------------------------------------------------
// VUE 3 : ÉCRAN DE RÉSULTATS & CORRIGÉ DÉTAILLÉ
// ----------------------------------------------------------------
function renderResultsScreen(submission = {}) {
    const qConfig = currentModuleData.quizConfig || {};
    const isAdminOrFormateur = (currentRole === 'admin' || currentRole === 'formateur');
    const displayMode = qConfig.resultsDisplayMode || (Boolean(qConfig.showResultsAtEnd === true || qConfig.showResultsAtEnd === 'true' || qConfig.showResultsAtEnd === 1) ? 'all' : 'none');
    const showScore = isAdminOrFormateur || displayMode === 'all' || displayMode === 'score_only';
    const showCorrection = isAdminOrFormateur || displayMode === 'all';
    const hasNegativePoints = Boolean(submission?.score?.negativePointsEnabled ?? (qConfig.negativePoints === true || qConfig.negativePoints === 'true'));
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

    function getScoreBadge(isCorrect, isAnswered) {
        if (isCorrect) return '<span style="font-weight:700; color:var(--clr-success);">Exact (+1 pt)</span>';
        if (!isAnswered) return '<span style="font-weight:700; color:var(--clr-text-muted);">Non renseigné (0 pt)</span>';
        if (hasNegativePoints) return '<span style="font-weight:700; color:var(--clr-danger);">Incorrect (-0.5 pt)</span>';
        return '<span style="font-weight:700; color:var(--clr-danger);">❌ Incorrect (0 pt)</span>';
    }

    if (showScore) {
        if (scoreCircle) {
            scoreCircle.style.display = 'flex';
            const ratioText = score.total > 0
                ? (hasNegativePoints && score.points !== undefined
                    ? `${score.points} / ${score.total} pts (${score.correct} correct${score.correct > 1 ? 's' : ''})`
                    : `${score.correct} / ${score.total} QCM corrects`)
                : 'Épreuve complétée';
            scoreCircle.innerHTML = `
                <span class="val" id="resultScoreVal">${score.percent}%</span>
                <span class="max" id="resultScoreRatio">${ratioText}</span>
            `;
        }

        if (deferredInfo) deferredInfo.classList.add('hidden');

        if (submission.timeExpired) {
            titleEl.textContent = "⏰ Épreuve clôturée (Temps écoulé)";
            subEl.textContent = "Le chronomètre est arrivé à terme. Vos réponses enregistrées jusqu'à l'échéance ont été transmises avec succès à l'équipe pédagogique.";
        } else if (score.percent >= 80) {
            titleEl.textContent = "🎉 Excellent résultat !";
            subEl.textContent = showCorrection 
                ? "Vous avez brillamment validé l'évaluation de ce module. Vos résultats ont été transmis aux formateurs."
                : "Vous avez brillamment complété ce module. Votre note a bien été enregistrée.";
        } else if (score.percent >= 50) {
            titleEl.textContent = "👍 Épreuve complétée avec succès !";
            subEl.textContent = showCorrection
                ? "Vos réponses ont bien été enregistrées. Prenez le temps d'analyser le corrigé ci-dessous pour consolider vos acquis."
                : "Vos réponses ont bien été enregistrées et votre note a été transmise à l'équipe pédagogique.";
        } else {
            titleEl.textContent = "📝 Épreuve transmise !";
            subEl.textContent = "Vos réponses ont été envoyées à l'équipe pédagogique. Vous pourrez retravailler les points abordés avec votre formateur.";
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
    }

    if (showCorrection) {
        if (correctionSection) correctionSection.classList.remove('hidden');

        let questionsToRender = currentQuestions;
        if (Array.isArray(submission?.drawnQuestionIds) && submission.drawnQuestionIds.length > 0) {
            const drawnSet = new Set(submission.drawnQuestionIds);
            questionsToRender = currentQuestions.filter(q => q.type === 'section' || drawnSet.has(q.id));
        }

        // Nettoyer les sections orphelines sans questions tirées
        const cleanedQuestionsToRender = [];
        let pendingSection = null;
        questionsToRender.forEach(q => {
            if (q.type === 'section') {
                pendingSection = q;
            } else {
                if (pendingSection) {
                    cleanedQuestionsToRender.push(pendingSection);
                    pendingSection = null;
                }
                cleanedQuestionsToRender.push(q);
            }
        });

        let questionCounter = 0;
        questionsList.innerHTML = cleanedQuestionsToRender.map(q => {
            if (q.type === 'section') {
                return `
                <div style="background:var(--clr-surface); border:1.5px solid var(--clr-primary); border-radius:var(--radius-md); padding:16px 20px; margin: 24px 0 12px 0;">
                    <div style="font-size:0.75rem; font-weight:800; color:var(--clr-primary); text-transform:uppercase; letter-spacing:0.5px;">
                        <i class="bi bi-bookmark-fill"></i> Section
                    </div>
                    <div style="font-size:1.15rem; font-weight:800; color:var(--clr-text); margin-top:2px;">
                        ${escapeHtml(q.title || q.text || 'Section')}
                    </div>
                    ${q.description ? `<div style="font-size:0.86rem; color:var(--clr-text-muted); margin-top:4px; line-height:1.4;">${escapeHtml(q.description)}</div>` : ''}
                </div>`;
            }

            questionCounter++;
            const qNum = questionCounter;
            const userAns = answers[q.id];
            let ansDisplay = '';
            const imageThumb = q.imageUrl ? `
            <div style="margin:8px 0;">
                <img src="${escapeHtml(q.imageUrl)}" alt="Illustration" style="max-height:100px; max-width:100%; border-radius:6px; border:1px solid var(--clr-surface-3);" onerror="this.parentElement.style.display='none'">
            </div>` : '';

            if (q.type === 'qcm') {
                const userIndices = Array.isArray(userAns)
                    ? userAns.map(n => parseInt(n, 10))
                    : (userAns !== null && userAns !== undefined && userAns !== '' ? [parseInt(userAns, 10)] : []);
                const expectedIndices = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined && q.correctIndex !== null ? parseInt(q.correctIndex, 10) : 0)];

                const sortedUser = [...userIndices].sort((a, b) => a - b);
                const sortedExp = [...expectedIndices].sort((a, b) => a - b);
                const isAnswered = (sortedUser.length > 0);
                const isCorrect = (sortedUser.length === sortedExp.length && sortedUser.length > 0 && sortedUser.every((v, i) => v === sortedExp[i]));

                const options = q.options || [];
                const chosenTexts = sortedUser.map(idx => options[idx]).filter(Boolean);
                const chosenDisplay = chosenTexts.length > 0 ? chosenTexts.join(', ') : 'Pas de réponse';
                const expectedTexts = sortedExp.map(idx => options[idx]).filter(Boolean).join(', ');

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Votre sélection :</strong> ${escapeHtml(chosenDisplay)}
                        <span style="margin-left:8px;">
                            ${getScoreBadge(isCorrect, isAnswered)}
                        </span>
                    </div>
                    ${!isCorrect && expectedTexts ? `
                        <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:6px; padding-top:4px; border-top:1px dashed var(--clr-surface-3);">
                            Bonne(s) réponse(s) attendue(s) : <strong style="color:#27ae60;">${escapeHtml(expectedTexts)}</strong>
                        </div>
                    ` : ''}
                </div>`;
            } else if (q.type === 'image_choice') {
                const ansNum = (userAns !== null && userAns !== undefined && userAns !== '') ? parseInt(userAns, 10) : null;
                const isAnswered = (ansNum !== null && !isNaN(ansNum));
                const correctIdx = (q.correctIndex !== undefined && q.correctIndex !== null) ? parseInt(q.correctIndex, 10) : 0;
                const isCorrect = isAnswered && (ansNum === correctIdx);
                const options = q.imageOptions || [];
                const chosenOpt = (ansNum !== null && options[ansNum]) ? options[ansNum] : null;
                const expectedOpt = options[correctIdx] || null;

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong>Votre choix :</strong>
                        <span>
                            ${getScoreBadge(isCorrect, isAnswered)}
                        </span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:12px; margin-top:8px;">
                        <div style="border:1.5px solid ${isCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:8px; background:rgba(0,0,0,0.02);">
                            <div style="font-size:0.75rem; font-weight:800; color:${isCorrect ? 'var(--clr-success)' : (isAnswered ? 'var(--clr-danger)' : 'var(--clr-text-muted)')}; margin-bottom:4px;">
                                ${isCorrect ? '✓ Votre sélection (Correcte)' : (isAnswered ? '✗ Votre sélection' : '∅ Non renseigné')}
                            </div>
                            ${chosenOpt && chosenOpt.imageUrl ? `
                                <div style="width:100%; height:110px; background:#181c19; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:6px;">
                                    <img src="${escapeHtml(chosenOpt.imageUrl)}" alt="Votre choix" style="max-width:100%; max-height:100%; object-fit:contain;">
                                </div>
                                <div style="font-size:0.82rem; font-weight:700; text-align:center;">${escapeHtml(chosenOpt.label || ('Option ' + (ansNum + 1)))}</div>
                            ` : '<div style="font-size:0.82rem; color:var(--clr-text-muted); font-style:italic; padding:20px 0; text-align:center;">Aucune réponse</div>'}
                        </div>

                        ${!isCorrect && expectedOpt ? `
                            <div style="border:1.5px dashed #27ae60; border-radius:6px; padding:8px; background:rgba(39,174,96,0.04);">
                                <div style="font-size:0.75rem; font-weight:800; color:var(--clr-success); margin-bottom:4px;">
                                    ⭐ Réponse attendue
                                </div>
                                ${expectedOpt.imageUrl ? `
                                    <div style="width:100%; height:110px; background:#181c19; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center; margin-bottom:6px;">
                                        <img src="${escapeHtml(expectedOpt.imageUrl)}" alt="Bonne réponse" style="max-width:100%; max-height:100%; object-fit:contain;">
                                    </div>
                                    <div style="font-size:0.82rem; font-weight:700; color:#27ae60; text-align:center;">${escapeHtml(expectedOpt.label || ('Option ' + (correctIdx + 1)))}</div>
                                ` : ''}
                            </div>
                        ` : ''}
                    </div>
                </div>`;
            } else if (q.type === 'table_choice') {
                const col1 = q.col1Label || 'VRAI';
                const col2 = q.col2Label || 'FAUX';
                const rows = q.tableRows || [];
                const userAnsObj = (userAns && typeof userAns === 'object') ? userAns : {};

                let allCorrect = (rows.length > 0);
                let isAnswered = false;
                const tableRowsHtml = rows.map((row, rIdx) => {
                    const userRow = userAnsObj[rIdx] || {};
                    const uCol1 = !!userRow.col1;
                    const uCol2 = !!userRow.col2;
                    if (uCol1 || uCol2) isAnswered = true;
                    const expCol1 = !!row.correctCol1;
                    const expCol2 = !!row.correctCol2;
                    const isRowCorrect = (uCol1 === expCol1 && uCol2 === expCol2);
                    if (!isRowCorrect) allCorrect = false;

                    const getCellState = (uSelected, expSelected) => {
                        if (uSelected && expSelected) {
                            return { icon: '<i class="bi bi-check-circle-fill" style="color:#27ae60; font-size:1.1rem;"></i>', style: 'background:rgba(39,174,96,0.12);' };
                        } else if (uSelected && !expSelected) {
                            return { icon: '<i class="bi bi-x-circle-fill" style="color:#e74c3c; font-size:1.1rem;"></i>', style: 'background:rgba(231,76,60,0.12);' };
                        } else if (!uSelected && expSelected) {
                            return { icon: '<i class="bi bi-arrow-right-circle" style="color:#27ae60; font-size:1rem;" title="Attendu"></i>', style: 'background:rgba(39,174,96,0.05);' };
                        }
                        return { icon: '<span style="color:#ccc; font-size:1.1rem;">○</span>', style: '' };
                    };

                    const cell1 = getCellState(uCol1, expCol1);
                    const cell2 = getCellState(uCol2, expCol2);

                    return `
                        <tr style="border-bottom:1px solid #eee; ${isRowCorrect ? '' : 'background:rgba(231,76,60,0.03);'}">
                            <td style="padding:10px 14px; font-size:0.86rem; font-weight:600; color:#2c3e50;">
                                <span style="font-weight:800; color:#7f8c8d; margin-right:6px;">${rIdx + 1}.</span>
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

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${allCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong>Bilan de la grille :</strong>
                        <span>
                            ${getScoreBadge(allCorrect, isAnswered)}
                        </span>
                    </div>
                    <div style="border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; margin-top:8px;">
                        <table style="width:100%; border-collapse:collapse; text-align:left;">
                            <thead>
                                <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0;">
                                    <th style="padding:10px 14px; font-size:0.8rem; font-weight:800;">Affirmations</th>
                                    <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col1)}</th>
                                    <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col2)}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tableRowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>`;
            } else if (q.type === 'classification') {
                const categories = q.categories || [];
                const rawItems = q.items || [];
                const userPlacements = (userAns && typeof userAns === 'object') ? userAns : {};

                let allCorrect = (rawItems.length > 0);
                const isAnswered = rawItems.some(it => userPlacements[it.id]);
                rawItems.forEach(it => {
                    if (userPlacements[it.id] !== it.categoryId) {
                        allCorrect = false;
                    }
                });

                const catResultsHtml = categories.map(cat => {
                    const placedItems = rawItems.filter(it => userPlacements[it.id] === cat.id);
                    const itemsBadges = placedItems.map(it => {
                        const isItemCorrect = (it.categoryId === cat.id);
                        const expectedCat = categories.find(c => c.id === it.categoryId);
                        return `
                            <span class="es-badge" style="background:${isItemCorrect ? 'rgba(39, 174, 96, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; color:${isItemCorrect ? '#27ae60' : '#e74c3c'}; border:1px solid ${isItemCorrect ? 'rgba(39, 174, 96, 0.3)' : 'rgba(231, 76, 60, 0.3)'}; padding:4px 8px; font-size:0.8rem; font-weight:700;">
                                <i class="bi ${isItemCorrect ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
                                ${escapeHtml(it.text || '')}
                                ${!isItemCorrect ? `<small style="font-size:0.7rem; opacity:0.85; margin-left:4px;">(attendu : ${escapeHtml(expectedCat?.title || 'autre')})</small>` : ''}
                            </span>
                        `;
                    }).join('');

                    const unplacedExpected = rawItems.filter(it => it.categoryId === cat.id && userPlacements[it.id] !== cat.id);
                    const missingBadges = unplacedExpected.map(it => `
                        <span class="es-badge" style="background:rgba(243, 156, 18, 0.1); color:#d68910; border:1px dashed rgba(243, 156, 18, 0.4); padding:4px 8px; font-size:0.75rem;">
                            <i class="bi bi-dash-circle"></i> Non classé ici : ${escapeHtml(it.text || '')}
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

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${allCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong>Votre classement :</strong>
                        <span>
                            ${getScoreBadge(allCorrect, isAnswered)}
                        </span>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:10px; margin-top:8px;">
                        ${catResultsHtml}
                    </div>
                </div>`;
            } else if (q.type === 'boolean') {
                const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
                const userBool = (userAns === true || userAns === 'true');
                const isAnswered = (userAns !== null && userAns !== undefined && userAns !== '');
                const isCorrect = isAnswered && (userBool === expectedBool);
                const userChoiceText = isAnswered ? (userBool ? '👍 VRAI' : '👎 FAUX') : '<span style="color:var(--clr-text-muted); font-style:italic;">Non renseigné</span>';

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Votre choix :</strong> ${userChoiceText}
                        <span style="margin-left:8px;">
                            ${getScoreBadge(isCorrect, isAnswered)}
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
                const isAnswered = Boolean(userCoords && userCoords.x !== undefined && userCoords.y !== undefined);

                let isCorrect = false;
                if (isAnswered) {
                    const dx = userCoords.x - targetX;
                    const dy = userCoords.y - targetY;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    isCorrect = dist <= radius;
                }

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:8px;">
                        <div>
                            <strong>Votre repère :</strong> 
                            ${userCoords ? `Position X: ${userCoords.x.toFixed(1)}%, Y: ${userCoords.y.toFixed(1)}%` : '<span style="color:var(--clr-danger)">Non renseigné</span>'}
                        </div>
                        <span>
                            ${getScoreBadge(isCorrect, isAnswered)}
                        </span>
                    </div>
                    ${q.pinImage ? `
                    <div style="text-align:center; background:#181c19; padding:8px; border-radius:6px; margin-top:6px;">
                        <div class="es-pinpoint-result-zone" style="max-width:520px; margin:0 auto; text-align:center;">
                            <img src="${escapeHtml(q.pinImage)}" alt="Résultat repère" class="es-pinpoint-result-img" style="display:block; margin:0 auto; max-width:100%;">
                            <div class="es-pinpoint-target-zone es-pinpoint-target-zone--result" style="left:${targetX}%; top:${targetY}%; width:${radius * 2}%; aspect-ratio:1 / 1; height:auto;" title="Zone attendue (±${radius}%)"></div>
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
                const val = (userAns !== null && userAns !== undefined && userAns !== '') ? parseFloat(userAns) : null;
                const isAnswered = (val !== null && !isNaN(val));
                const unit = q.unit || '';
                const hasTarget = (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null);
                let rangeGrade = '';
                let isCorrectRange = false;

                if (isAnswered && hasTarget) {
                    const targetVal = parseFloat(q.correctValue);
                    const tol = parseFloat(q.tolerance) || 0;
                    isCorrectRange = Math.abs(val - targetVal) <= tol;
                    rangeGrade = `
                    <span style="margin-left:8px;">
                        ${getScoreBadge(isCorrectRange, isAnswered)}
                    </span>
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:6px;">
                        Cible attendue : <strong>${targetVal} ${escapeHtml(unit)}</strong> ${tol > 0 ? `± ${tol}` : ''}
                    </div>`;
                } else if (!isAnswered) {
                    rangeGrade = `<span style="margin-left:8px;">${getScoreBadge(false, false)}</span>`;
                }

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isCorrectRange ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div><strong>Position du curseur :</strong> <span style="font-weight:800; color:var(--clr-primary);">${val !== null ? `${val} ${escapeHtml(unit)}` : 'Non renseigné'}</span>
                        ${rangeGrade}
                    </div>
                </div>`;
            } else if (q.type === 'cloze') {
                const { parts, blanks: expectedBlanks } = parseClozeQuestion(q.clozeText || '');
                const userAnswersObj = userAns && typeof userAns === 'object' ? userAns : (userAns ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return {}; } })() : {});
                
                let correctBlanksCount = 0;
                let isAnswered = false;
                expectedBlanks.forEach((expWord, bIdx) => {
                    const uWord = userAnswersObj[bIdx];
                    if (uWord && String(uWord).trim().length > 0) isAnswered = true;
                    if (uWord && String(uWord).trim().toLowerCase() === String(expWord).trim().toLowerCase()) {
                        correctBlanksCount++;
                    }
                });

                const isAllCorrect = (expectedBlanks.length > 0) && (correctBlanksCount === expectedBlanks.length);

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isAllCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:14px 16px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                        <div style="font-size:0.85rem; font-weight:700; color:var(--clr-text);">
                            Résultat : <span style="color:var(--clr-primary); font-weight:800;">${correctBlanksCount} / ${expectedBlanks.length} trou${expectedBlanks.length > 1 ? 's' : ''} correct${expectedBlanks.length > 1 ? 's' : ''}</span>
                        </div>
                        <span>
                            ${getScoreBadge(isAllCorrect, isAnswered)}
                        </span>
                    </div>

                    <div class="es-cloze-result-card">
                        ${parts.map(part => {
                            if (part.type === 'text') {
                                return `<span>${escapeHtml(part.text)}</span>`;
                            } else {
                                const uWord = userAnswersObj[part.index];
                                const expWord = part.expected;
                                const isBlankCorrect = uWord && String(uWord).trim().toLowerCase() === String(expWord).trim().toLowerCase();

                                if (isBlankCorrect) {
                                    return `<span class="es-cloze-res-tag es-cloze-res-tag--correct"><i class="bi bi-check-lg"></i> ${escapeHtml(uWord)}</span>`;
                                } else if (uWord) {
                                    return `
                                    <span class="es-cloze-res-tag es-cloze-res-tag--wrong"><i class="bi bi-x-lg"></i> ${escapeHtml(uWord)}</span>
                                    <span class="es-cloze-res-tag es-cloze-res-tag--expected">✓ ${escapeHtml(expWord)}</span>`;
                                } else {
                                    return `
                                    <span class="es-cloze-res-tag es-cloze-res-tag--missing">∅ Non rempli</span>
                                    <span class="es-cloze-res-tag es-cloze-res-tag--expected">✓ ${escapeHtml(expWord)}</span>`;
                                }
                            }
                        }).join('')}
                    </div>
                </div>`;
            } else if (q.type === 'puzzle') {
                const candidateOrder = Array.isArray(userAns) ? userAns : [];
                const isAnswered = Array.isArray(userAns) && userAns.length > 0;
                const expectedOrder = q.items || [];
                const isExact = (candidateOrder.length === expectedOrder.length && candidateOrder.every((it, idx) => it === expectedOrder[idx]));

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isExact ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:12px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <strong>Votre ordre proposé :</strong>
                        <span>
                            ${getScoreBadge(isExact, isAnswered)}
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
            } else if (q.type === 'matching') {
                const rawPairs = q.pairs || [];
                const userMatchesObj = userAns && typeof userAns === 'object' ? userAns : (userAns ? (()=>{ try { return JSON.parse(userAns); } catch(e){ return {}; } })() : {});
                
                let correctCount = 0;
                let isAnswered = false;
                rawPairs.forEach(pair => {
                    const uRight = userMatchesObj[pair.left] || userMatchesObj[(pair.left || '').trim()];
                    if (uRight && String(uRight).trim().length > 0) isAnswered = true;
                    if (uRight && String(uRight).trim().toLowerCase() === String(pair.right).trim().toLowerCase()) {
                        correctCount++;
                    }
                });

                const isAllCorrect = (rawPairs.length > 0) && (correctCount === rawPairs.length);

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid ${isAllCorrect ? '#27ae60' : (isAnswered ? '#e74c3c' : 'var(--clr-surface-3)')}; border-radius:6px; padding:14px 16px; margin-top:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
                        <div style="font-size:0.85rem; font-weight:700; color:var(--clr-text);">
                            Résultat : <span style="color:var(--clr-primary-dark); font-weight:800;">${correctCount} / ${rawPairs.length} association${rawPairs.length > 1 ? 's' : ''} correcte${rawPairs.length > 1 ? 's' : ''}</span>
                        </div>
                        <span>
                            ${getScoreBadge(isAllCorrect, isAnswered)}
                        </span>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${rawPairs.map(pair => {
                            const uRight = userMatchesObj[pair.left] || userMatchesObj[(pair.left || '').trim()];
                            const isPairCorrect = uRight && String(uRight).trim().toLowerCase() === String(pair.right).trim().toLowerCase();
                            
                            return `
                                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; padding:8px 12px; border-radius:6px; font-size:0.85rem; background:var(--clr-surface-2); border:1px solid ${isPairCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                                    <div style="display:flex; align-items:center; gap:8px;">
                                        <span style="font-weight:700; color:var(--clr-text);">${escapeHtml(pair.left)}</span>
                                        <i class="bi bi-arrow-right" style="color:var(--clr-text-muted);"></i>
                                        <span style="font-weight:600; color:${uRight ? (isPairCorrect ? 'var(--clr-success)' : 'var(--clr-danger)') : 'var(--clr-text-muted)'};">
                                            ${escapeHtml(uRight || '— (Non relié)')}
                                        </span>
                                    </div>
                                    ${isPairCorrect ? 
                                        '<span style="color:var(--clr-success); font-weight:700; font-size:0.8rem;"><i class="bi bi-check-circle-fill"></i> Correct</span>' : 
                                        `<span style="color:var(--clr-danger); font-size:0.75rem; font-weight:600;"><i class="bi bi-x-circle-fill"></i> Attendu : ${escapeHtml(pair.right)}</span>`
                                    }
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>`;
            } else {
                const qEval = (submission?.evaluations && submission.evaluations[q.id]) ? submission.evaluations[q.id] : null;
                const isAnswered = Boolean(userAns && String(userAns).trim().length > 0);
                const isGraded = Boolean(qEval && (qEval.status === 'graded' || qEval.status === 'reviewed' || qEval.gradedByName || qEval.status !== 'auto_draft'));

                let evalBadge = '';
                if (isGraded) {
                    if (qEval.isCorrect === true) {
                        evalBadge = `
                            <span style="font-weight:700; color:var(--clr-success); background:rgba(39,174,96,0.12); padding:2px 8px; border-radius:12px; font-size:0.82rem;">
                                <i class="bi bi-check-circle-fill"></i> Validé (+1 pt)
                            </span>`;
                    } else {
                        const negMsg = (hasNegativePoints && isAnswered) ? '-0.5 pt' : '0 pt';
                        evalBadge = `
                            <span style="font-weight:700; color:var(--clr-danger); background:rgba(231,76,60,0.12); padding:2px 8px; border-radius:12px; font-size:0.82rem;">
                                <i class="bi bi-x-circle-fill"></i> Non validé (${negMsg})
                            </span>`;
                    }
                } else {
                    evalBadge = `
                        <span style="font-size:0.75rem; font-weight:600; color:#e67e22; background:rgba(243,156,18,0.12); padding:2px 8px; border-radius:12px;">
                            <i class="bi bi-hourglass-split"></i> En attente d'évaluation formateur
                        </span>`;
                }

                ansDisplay = `
                <div style="background:#ffffff; border:1.5px solid var(--clr-surface-3); border-radius:6px; padding:12px; margin-top:8px; font-size:0.88rem; line-height:1.5; color:var(--clr-text);">
                    ${q.hint && q.hint.trim() ? `
                        <div style="margin-bottom:10px; padding:8px 12px; background:rgba(243, 156, 18, 0.08); border-left:3.5px solid #e67e22; border-radius:4px; font-size:0.82rem; color:var(--clr-text);">
                            <strong style="color:#d35400; display:flex; align-items:center; gap:6px;"><i class="bi bi-lightbulb-fill"></i> Piste / Indice optionnel :</strong>
                            <div style="margin-top:2px; line-height:1.45;">${escapeHtml(q.hint.trim())}</div>
                        </div>
                    ` : ''}

                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:6px;">
                            <strong style="color:var(--clr-primary);"><i class="bi bi-chat-square-text"></i> Réponse du candidat :</strong>
                            ${evalBadge}
                        </div>
                        ${(userAns && String(userAns).trim()) ? `
                            <div style="padding:10px 12px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:6px; white-space:pre-wrap; word-break:break-word; margin-top:4px;">${escapeHtml(String(userAns).trim())}</div>
                        ` : `
                            <div style="padding:10px 12px; background:var(--clr-surface); border:1px dashed var(--clr-surface-3); border-radius:6px; margin-top:4px; font-style:italic; color:var(--clr-text-muted); text-align:center;">Aucune réponse rédigée.</div>
                        `}
                    </div>

                    ${(qEval && (qEval.comment || isGraded)) ? `
                        <div style="margin-top:10px; padding:10px 12px; background:rgba(52, 152, 219, 0.08); border-left:3.5px solid #3498db; border-radius:4px; font-size:0.84rem; color:var(--clr-text);">
                            <div style="font-weight:700; color:#2980b9; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                <i class="bi bi-person-workspace"></i> Évaluation Formateur :
                            </div>
                            <div style="white-space:pre-wrap; word-break:break-word; line-height:1.5;">${qEval.comment && qEval.comment.trim() ? escapeHtml(qEval.comment.trim()) : (qEval.isCorrect ? '✅ Réponse validée par le formateur.' : '❌ Réponse non validée par le formateur.')}</div>
                            ${(isAdminOrFormateur && (qEval.gradedByName || qEval.gradedAt)) ? `
                                <div style="font-size:0.75rem; color:var(--clr-text-muted); margin-top:6px; padding:4px 8px; background:rgba(0,0,0,0.04); border-radius:4px; border:1px solid var(--clr-surface-3); display:flex; align-items:center; gap:6px;">
                                    <i class="bi bi-shield-check" style="color:${qEval.gradedByRole === 'admin' ? 'var(--clr-warning, #f39c12)' : 'var(--clr-primary, #3498db)'};"></i>
                                    <span>${qEval.isCorrect ? 'Validé' : (qEval.isCorrect === false ? 'Invalidé' : 'Évalué')} par <strong>${escapeHtml(qEval.gradedByName || 'Formateur')}</strong> (${qEval.gradedByRole === 'admin' ? 'Admin' : 'Formateur'}) le ${typeof formatFullDate === 'function' ? formatFullDate(qEval.gradedAt) : (typeof formatDate === 'function' ? formatDate(qEval.gradedAt) : (qEval.gradedAt || ''))}</span>
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}

                    ${q.sampleAnswer && q.sampleAnswer.trim() ? `
                        <div style="margin-top:10px; padding:10px 12px; background:rgba(39, 174, 96, 0.08); border-left:3.5px solid #27ae60; border-radius:4px; font-size:0.84rem; color:var(--clr-text);">
                            <div style="font-weight:700; color:#27ae60; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
                                <i class="bi bi-check2-circle"></i> Réponse proposée / Proposition de correction :
                            </div>
                            <div style="white-space:pre-wrap; word-break:break-word; line-height:1.5;">${escapeHtml(q.sampleAnswer.trim())}</div>
                        </div>
                    ` : ''}
                </div>`;
            }

            let typeBadgeLabel = 'QCM';
            if (q.type === 'cloze') typeBadgeLabel = '🔤 Texte à trous';
            else if (q.type === 'range') typeBadgeLabel = 'Curseur horizontal';
            else if (q.type === 'boolean') typeBadgeLabel = 'Vrai / Faux';
            else if (q.type === 'puzzle') typeBadgeLabel = 'Puzzle / Ordonnancement';
            else if (q.type === 'matching') typeBadgeLabel = '🔗 Relier les colonnes';
            else if (q.type === 'text') typeBadgeLabel = 'Rédaction';

            return `
            <div style="background:var(--clr-surface-2); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase;">Question ${qNum} • ${typeBadgeLabel}</div>
                <div style="font-size:0.92rem; font-weight:400; color:var(--clr-text); margin-top:2px;" class="es-q-rich-text">${formatQuestionRichText(q.text)}</div>
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

    const badgeEl = document.getElementById('quizUserBadge');
    if (badgeEl) {
        if (currentRole === 'admin') {
            badgeEl.className = 'es-badge es-badge--admin';
            badgeEl.textContent = '⚡ Admin';
        } else if (currentRole === 'formateur') {
            badgeEl.className = 'es-badge es-badge--formateur';
            badgeEl.textContent = '👨‍🏫 Formateur';
        } else {
            badgeEl.className = 'es-badge es-badge--stagiaire';
            badgeEl.textContent = '🎓 BAFA';
        }
    }

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
