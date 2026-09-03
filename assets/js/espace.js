// ============================================================
// ESPACE.JS — Authentification Firebase + gestion des profils
// Profils : "admin" | "anim"
// ============================================================

// ---------- Éléments DOM ----------
const loginView = document.getElementById('loginView');
const pageContent = document.getElementById('pageContent');
const loginForm = document.getElementById('loginForm');
const signupForm = document.getElementById('signupForm');

const emailLoginInput = document.getElementById('emailLogin');
const passwordLoginInput = document.getElementById('passwordLogin');
const loginError = document.getElementById('loginError');

const emailSignupInput = document.getElementById('emailSignup');
const passwordSignupInput = document.getElementById('passwordSignup');
const signupError = document.getElementById('signupError');

const btnGoogleLogin = document.getElementById('btnGoogleLogin');
const btnGoogleSignup = document.getElementById('btnGoogleSignup');
const btnLogout = document.getElementById('btnLogout');

const profileBadge = document.getElementById('profileBadge');
const userEmailDisplay = document.getElementById('userEmailDisplay');

// Onglets login / inscription
const tabLogin = document.getElementById('tabLogin');
const tabSignup = document.getElementById('tabSignup');

tabLogin.addEventListener('click', () => {
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
});

tabSignup.addEventListener('click', () => {
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
});

// ---------- Helpers ----------
function showError(el, msg) {
    el.textContent = msg;
    el.classList.remove('hidden');
}

function clearError(el) {
    el.textContent = '';
    el.classList.add('hidden');
}

function setLoading(btn, loading) {
    btn.disabled = loading;
    btn.querySelector('.btn-text').style.opacity = loading ? '0' : '1';
    btn.querySelector('.btn-spinner') && (btn.querySelector('.btn-spinner').style.display = loading ? 'inline-block' : 'none');
}

// ---------- Récupérer le rôle depuis Firestore ----------
async function getUserRole(uid) {
    try {
        const doc = await db.collection('users').doc(uid).get();
        if (doc.exists) {
            return doc.data().role || null;
        }
        return null;
    } catch (e) {
        console.error('Erreur récupération rôle :', e);
        return null;
    }
}

// ---------- Afficher le contenu selon le rôle ----------
function showContent(user, role) {
    loginView.classList.add('hidden');
    pageContent.classList.remove('hidden');
    pageContent.classList.add('visible');

    userEmailDisplay.textContent = user.displayName || user.email;

    // Badge de profil
    profileBadge.textContent = role === 'admin' ? '👑 Admin' : '🎨 Anim';
    profileBadge.className = 'profile-badge ' + (role === 'admin' ? 'badge-admin' : 'badge-anim');

    // Masquer / afficher les sections selon le rôle
    document.querySelectorAll('[data-role]').forEach(el => {
        const allowed = el.getAttribute('data-role').split(',').map(r => r.trim());
        el.style.display = (allowed.includes(role) || allowed.includes('all')) ? '' : 'none';
    });

    // Charger les participants depuis Firestore puis générer les groupes
    loadParticipants();
}

// ---------- Listener d'état de connexion ----------
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const role = await getUserRole(user.uid);
        if (role) {
            showContent(user, role);
        } else {
            // Compte existant mais pas encore dans Firestore (rare)
            auth.signOut();
            showError(loginError, "Compte non autorisé. Contacte un administrateur.");
        }
    } else {
        loginView.classList.remove('hidden');
        pageContent.classList.add('hidden');
        pageContent.classList.remove('visible');
    }
});

// ---------- Connexion Email/Mot de passe ----------
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(loginError);
    const btn = document.getElementById('btnLogin');
    setLoading(btn, true);

    try {
        await auth.signInWithEmailAndPassword(
            emailLoginInput.value.trim(),
            passwordLoginInput.value
        );
    } catch (err) {
        setLoading(btn, false);
        let msg = "Erreur de connexion.";
        if (err.code === 'auth/user-not-found') msg = "Aucun compte avec cet email.";
        if (err.code === 'auth/wrong-password') msg = "Mot de passe incorrect.";
        if (err.code === 'auth/invalid-email') msg = "Email invalide.";
        if (err.code === 'auth/too-many-requests') msg = "Trop de tentatives. Réessaie plus tard.";
        if (err.code === 'auth/user-disabled') msg = "Ce compte a été désactivé par l'administrateur.";
        showError(loginError, msg);
    }
});

// ---------- Inscription Email/Mot de passe ----------
signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearError(signupError);
    const btn = document.getElementById('btnSignup');
    setLoading(btn, true);

    try {
        const cred = await auth.createUserWithEmailAndPassword(
            emailSignupInput.value.trim(),
            passwordSignupInput.value
        );
        // Le rôle par défaut est "anim" — un admin peut ensuite le changer
        await db.collection('users').doc(cred.user.uid).set({
            email: cred.user.email,
            role: 'anim',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        setLoading(btn, false);
        let msg = "Erreur lors de l'inscription.";
        if (err.code === 'auth/email-already-in-use') msg = "Cet email est déjà utilisé.";
        if (err.code === 'auth/weak-password') msg = "Mot de passe trop faible (6 caractères min).";
        if (err.code === 'auth/invalid-email') msg = "Email invalide.";
        showError(signupError, msg);
    }
});

// ---------- Connexion Google ----------
async function signInWithGoogle() {
    clearError(loginError);
    clearError(signupError);
    try {
        const globalDoc = await db.collection('globalSettings').doc('dashboard').get();
        const allowSignup = !globalDoc.exists || globalDoc.data().allowSignup !== false;

        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;
        const doc = await db.collection('users').doc(user.uid).get();

        if (!doc.exists) {
            if (!allowSignup) {
                try { await user.delete(); } catch(e) {}
                await auth.signOut();
                showError(loginError, "La création de compte est actuellement fermée.");
                return;
            }
            let gFirstName = '';
            let gLastName = '';
            if (user.displayName) {
                const parts = user.displayName.trim().split(' ');
                gFirstName = parts[0] || '';
                gLastName = parts.slice(1).join(' ') || '';
            }
            await db.collection('users').doc(user.uid).set({
                email: user.email,
                displayName: user.displayName || `${gFirstName} ${gLastName}`.trim(),
                firstName: gFirstName,
                lastName: gLastName,
                role: 'anim',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
    } catch (err) {
        if (err.code !== 'auth/popup-closed-by-user') {
            showError(loginError, "Erreur Google : " + err.message);
        }
    }
}

btnGoogleLogin.addEventListener('click', signInWithGoogle);
btnGoogleSignup.addEventListener('click', signInWithGoogle);

// ---------- Déconnexion ----------
btnLogout.addEventListener('click', async () => {
    await auth.signOut();
});

// ============================================================
// GESTION DES PARTICIPANTS (depuis Firestore)
// ============================================================

let participants = [];

async function loadParticipants() {
    try {
        const snapshot = await db.collection('participants').get();
        participants = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateStats();
        regenerateGroups();
    } catch (e) {
        console.error('Erreur chargement participants :', e);
    }
}

// ============================================================
// LOGIQUE DE RÉPARTITION EN GROUPES
// ============================================================

function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

function displayGroups(groups) {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    container.innerHTML = '';

    groups.forEach((group, index) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `group group${index + 1}`;

        const boys = group.filter(p => p.genre === 'masculin').length;
        const girls = group.filter(p => p.genre === 'feminin').length;
        const avgAge = group.length > 0
            ? (group.reduce((sum, p) => sum + p.age, 0) / group.length).toFixed(1)
            : 0;

        groupDiv.innerHTML = `
      <h2 style="font-size: 1.4rem;">Groupe ${index + 1} (${group.length} jeunes - ${boys}♂ ${girls}♀ - Âge: ${avgAge})</h2>
      ${group.map(participant => `
        <div class="participant">
          <span class="name">${participant.prenom}<span>${participant.nom}</span></span>
          <div class="info">
            <span class="age">${participant.age} ans</span>
            <span class="gender ${participant.genre}">${participant.genre === 'masculin' ? '♂' : '♀'}</span>
          </div>
        </div>
      `).join('')}
    `;
        container.appendChild(groupDiv);
    });
}

function createBalancedGroups() {
    const groupCount = parseInt(document.getElementById('groupCount').value);
    const balanceMode = document.getElementById('balanceMode').value;
    const selectedAges = Array.from(document.querySelectorAll('input[name="ageGroups"]:checked'))
        .map(cb => parseInt(cb.value));
    const selectedGenders = Array.from(document.querySelectorAll('input[name="genderSelection"]:checked'))
        .map(cb => cb.value);

    let filteredParticipants = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );

    const groups = Array.from({ length: groupCount }, () => []);

    if (balanceMode === 'gender') {
        distributeEvenly(shuffleArray(filteredParticipants.filter(p => p.genre === 'masculin')), groups);
        distributeEvenly(shuffleArray(filteredParticipants.filter(p => p.genre === 'feminin')), groups);
    } else if (balanceMode === 'age') {
        const age11 = filteredParticipants.filter(p => p.age === 11);
        const age12 = filteredParticipants.filter(p => p.age === 12);
        const age13 = filteredParticipants.filter(p => p.age === 13);
        distributeEvenly(shuffleArray(age11), groups);
        distributeEvenly(shuffleArray(age12), groups);
        distributeEvenly(shuffleArray(age13), groups);
    } else if (balanceMode === 'both') {
        const categories = [];
        selectedAges.forEach(age => {
            selectedGenders.forEach(genre => {
                const filtered = filteredParticipants.filter(p => p.age === age && p.genre === genre);
                if (filtered.length > 0) categories.push(shuffleArray(filtered));
            });
        });
        categories.forEach(cat => distributeEvenly(cat, groups));
    } else {
        distributeEvenly(shuffleArray(filteredParticipants), groups);
    }

    return groups.map(group => shuffleArray(group));
}

function distributeEvenly(participants, groups) {
    participants.forEach(participant => {
        groups.sort((a, b) => a.length - b.length);
        groups[0].push(participant);
    });
}

function regenerateGroups() {
    const container = document.getElementById('groupsContainer');
    if (!container) return;
    const groups = createBalancedGroups();
    displayGroups(groups);
    updateStats();
}

function updateStats() {
    const selectedAges = Array.from(document.querySelectorAll('input[name="ageGroups"]:checked'))
        .map(cb => parseInt(cb.value));
    const selectedGenders = Array.from(document.querySelectorAll('input[name="genderSelection"]:checked'))
        .map(cb => cb.value);

    const filteredParticipants = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );

    const boys = filteredParticipants.filter(p => p.genre === 'masculin').length;
    const girls = filteredParticipants.filter(p => p.genre === 'feminin').length;
    const avgAge = filteredParticipants.length > 0
        ? (filteredParticipants.reduce((sum, p) => sum + p.age, 0) / filteredParticipants.length).toFixed(1).replace('.', ',')
        : '0';

    const statsEl = document.querySelector('.stats');
    if (statsEl) {
        statsEl.innerHTML = `
        <h3>📊 Statistiques</h3>
        <div class="stat-simple">
            <p>Il y a <span class="stat-highlight">${filteredParticipants.length}</span> participants au total</p>
            <p>Dont <span class="stat-highlight">${girls}</span> filles et <span class="stat-highlight">${boys}</span> garçons</p>
            <p>L'âge moyen est de <span class="stat-highlight">${avgAge}</span> ans</p>
        </div>
    `;
    }
}

// Écouteurs pour les filtres
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', () => {
            if (participants.length > 0) {
                updateStats();
                regenerateGroups();
            }
        });
    });
});
