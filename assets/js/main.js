/*--------------------------------------------------------------
# Back to top button
--------------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", function () {
    let backToTopButton = document.querySelector(".back-to-top");

    window.addEventListener("scroll", function () {
        if (window.scrollY > 200) { // Afficher après 200px de défilement
            backToTopButton.classList.add("active");
        } else {
            backToTopButton.classList.remove("active");
        }
    });

    // Ajoute un effet de retour en haut
    backToTopButton.addEventListener("click", function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

/*--------------------------------------------------------------
# Modale
--------------------------------------------------------------*/
const openModalBtns = document.querySelectorAll('.openModalBtn');
const closeModalBtns = document.querySelectorAll('.modal__closespe');
const modals = document.querySelectorAll('.modalspe');

// Ouvrir la bonne modale
openModalBtns.forEach(button => {
    button.addEventListener('click', () => {
        const modalId = button.getAttribute('data-modal');
        document.getElementById(modalId).style.display = 'block';
    });
});

// Fermer la modale en cliquant sur la croix
closeModalBtns.forEach(button => {
    button.addEventListener('click', () => {
        button.closest('.modalspe').style.display = 'none';
    });
});

// Fermer la modale en cliquant en dehors du contenu
window.addEventListener('click', (event) => {
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
});

/*--------------------------------------------------------------
# Copier le texte
--------------------------------------------------------------*/

// Exécuter le script uniquement quand le DOM est chargé
document.addEventListener("DOMContentLoaded", function () {

    // Fonction pour copier le texte d'un élément spécifique
    function copyText(elementId) {
        var textElement = document.getElementById(elementId);

        if (!textElement) {
            console.error("L'élément à copier n'existe pas :", elementId);
            return;
        }

        var textToCopy = textElement.innerText; // Récupère uniquement le texte du bon élément

        var textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        document.body.appendChild(textarea);

        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

    }

    // Vérifier si les boutons existent avant d'ajouter un event listener
    var copySongButton = document.getElementById('copyMessageSong');
    var copySongButton2 = document.getElementById('copyMessageSong2');
    var copySongButton3 = document.getElementById('copyMessageSong3');
    var copyDayButton = document.getElementById('copyMessageDay');
    var copyButton1 = document.getElementById('copyMessageChaussette');
    var copyButton2 = document.getElementById('copyMessageVaisselle');
    var copyRallyePhoto1 = document.getElementById('RallyePhoto1');
    var copyRallyePhoto2 = document.getElementById('RallyePhoto2');
    var dirlo = document.getElementById('recrutement');
    var scoutisme = document.getElementById('scout');
    var whatsapp = document.getElementById('copyMessageWhatsapp');
    var GD = document.getElementById('copyMessageJeuGD');
    var PI = document.getElementById('copyMessageJeuPI');
    var annonce = document.getElementById('copyMessageAnnonce');
    var questions = document.getElementById('copyMessageQuestion');
    var tante = document.getElementById('tante');
    var hibou = document.getElementById('hibou');

    if (copySongButton) {
        copySongButton.addEventListener('click', function () {
            copyText('copyContent');
        });
    }

    if (copySongButton2) {
        copySongButton2.addEventListener('click', function () {
            copyText('copyContent2');
        });
    }

    if (copySongButton3) {
        copySongButton3.addEventListener('click', function () {
            copyText('copyContent3');
        });
    }

    if (copyDayButton) {
        copyDayButton.addEventListener('click', function () {
            copyText('copyContentDay');
        });
    }

    if (copyButton1) {
        copyButton1.addEventListener('click', function () {
            copyText('copyContentChaussette');
        });
    }

    if (copyButton2) {
        copyButton2.addEventListener('click', function () {
            copyText('copyContentVaisselle');
        });
    }

    if (copyRallyePhoto1) {
        copyRallyePhoto1.addEventListener('click', function () {
            copyText('copyContentPhoto1');
        });
    }

    if (copyRallyePhoto2) {
        copyRallyePhoto2.addEventListener('click', function () {
            copyText('copyContentPhoto2');
        });
    }

    if (dirlo) {
        dirlo.addEventListener('click', function () {
            copyText('dirloContent');
        });
    }

    if (scoutisme) {
        scoutisme.addEventListener('click', function () {
            copyText('scoutismeContent');
        });
    }

    if (whatsapp) {
        whatsapp.addEventListener('click', function () {
            copyText('copyContent1');
        });
    }

    if (GD) {
        GD.addEventListener('click', function () {
            copyText('copyContent2');
        });
    }

    if (PI) {
        PI.addEventListener('click', function () {
            copyText('copyContent3');
        });
    }

    if (annonce) {
        annonce.addEventListener('click', function () {
            copyText('copyContent2');
        });
    }

    if (questions) {
        questions.addEventListener('click', function () {
            copyText('copyContent3');
        });
    }

    if (tante) {
        tante.addEventListener('click', function () {
            copyText('copyContent4');
        });
    }

    if (hibou) {
        hibou.addEventListener('click', function () {
            copyText('copyContenthibou');
        });
    }

});

/*--------------------------------------------------------------
# Gestion du mot de passe pour accéder à la page
--------------------------------------------------------------*/

async function md5(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('passwordModal');
    const passwordInput = document.getElementById('passwordInput');
    const passwordError = document.getElementById('passwordError');
    const confirmBtn = document.getElementById('confirmPassword');
    const closeBtn = document.getElementById('closePasswordModal');
    const pageContent = document.getElementById('pageContent');
    
    const correctPasswordHash = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';

    // Vérifier si l'utilisateur a déjà saisi le mot de passe
    const isAuthenticated = sessionStorage.getItem('authenticated');
    if (isAuthenticated === 'true') {
        modal.classList.add('hidden');
        pageContent.classList.add('visible');

        // Générer les groupes si nécessaire
        if (typeof regenerateGroups === 'function') {
            regenerateGroups();
        }
    }

    confirmBtn.addEventListener('click', async function() {
        // Hacher le mot de passe saisi
        const enteredPassword = passwordInput.value;
        const enteredPasswordHash = await md5(enteredPassword);

        if (enteredPasswordHash === correctPasswordHash) {
            modal.classList.add('hidden');
            pageContent.classList.add('visible');
            sessionStorage.setItem('authenticated', 'true');

            // Générer les groupes après authentification
            if (typeof regenerateGroups === 'function') {
                regenerateGroups();
            }
        } else {
            passwordError.classList.remove('hidden');
        }
    });

    closeBtn.addEventListener('click', function() {
        window.location.href = 'index.html'; // Redirection si l'utilisateur ferme
    });

    // Empêche la fermeture en cliquant à côté
    modal.addEventListener('click', function(e) {
        if(e.target === modal) {
            e.stopPropagation();
        }
    });

    // Permettre la validation avec la touche Entrée
    passwordInput.addEventListener('keyup', async function(e) {
        if (e.key === 'Enter') {
            // Hacher le mot de passe saisi
            const enteredPassword = passwordInput.value;
            const enteredPasswordHash = await md5(enteredPassword);

            if (enteredPasswordHash === correctPasswordHash) {
                modal.classList.add('hidden');
                pageContent.classList.add('visible');
                sessionStorage.setItem('authenticated', 'true');

                // Générer les groupes après authentification
                if (typeof regenerateGroups === 'function') {
                    regenerateGroups();
                }
            } else {
                passwordError.classList.remove('hidden');
            }
        }
    });
});

/*--------------------------------------------------------------
# Gestion des groupes de participants
--------------------------------------------------------------*/

const participants = [
    {nom: "GOSSART", prenom: "Luc Francis", age: 11, genre: "masculin"},
    {nom: "FAZENDA", prenom: "Simao", age: 12, genre: "masculin"},
    {nom: "MARGUET BONTEMS", prenom: "Eliot", age: 13, genre: "masculin"},
    {nom: "BOTTEY", prenom: "Sarah", age: 12, genre: "feminin"},
    {nom: "DULIAN", prenom: "Callie", age: 12, genre: "feminin"},
    {nom: "COURTINE", prenom: "Anouk", age: 11, genre: "feminin"},
    {nom: "CREMOUX", prenom: "Romain", age: 12, genre: "masculin"},
    {nom: "DA CUNHA", prenom: "Fernando", age: 13, genre: "masculin"},
    {nom: "DEBIEVE", prenom: "Leo", age: 12, genre: "masculin"},
    {nom: "DEFRESNE", prenom: "Alyssa", age: 12, genre: "feminin"},
    {nom: "BRIDOUX", prenom: "Zelie", age: 11, genre: "feminin"},
    {nom: "GARACHON", prenom: "Isild", age: 12, genre: "feminin"},
    {nom: "GUERMONPREZ", prenom: "Garance", age: 11, genre: "feminin"},
    {nom: "HAGER", prenom: "Mathilde", age: 12, genre: "feminin"},
    {nom: "HAOUAM", prenom: "Neyla", age: 13, genre: "feminin"},
    {nom: "KERVRANBERTRAND", prenom: "Apolline", age: 13, genre: "feminin"},
    {nom: "MEYNIER", prenom: "Lucas", age: 12, genre: "masculin"},
    {nom: "MONTET", prenom: "Andrea", age: 13, genre: "masculin"},
    {nom: "BOUILLIN", prenom: "Aaron", age: 13, genre: "masculin"},
    {nom: "ORIOLA", prenom: "Nolan", age: 13, genre: "masculin"},
    {nom: "PIPPONIAU", prenom: "Faustine", age: 13, genre: "feminin"},
    {nom: "TUFFERY", prenom: "Adrien", age: 12, genre: "masculin"},
    {nom: "THEZARD", prenom: "Gaël", age: 11, genre: "masculin"},
    {nom: "ANTONUCCI", prenom: "Talia", age: 11, genre: "feminin"},
    {nom: "ADJEROUD", prenom: "Liam", age: 12, genre: "masculin"}
];

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
    container.innerHTML = '';

    groups.forEach((group, index) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = `group group${index + 1}`;

        const boys = group.filter(p => p.genre === 'masculin').length;
        const girls = group.filter(p => p.genre === 'feminin').length;
        const avgAge = (group.reduce((sum, p) => sum + p.age, 0) / group.length).toFixed(1);

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

// Générer les groupes quand la page est chargée et authentifiée
document.addEventListener('DOMContentLoaded', function() {
    // Si le contenu est déjà visible (authentifié), générer les groupes
    if (document.getElementById('pageContent').classList.contains('visible')) {
        regenerateGroups();
    }

    // Sinon, attendre que l'authentification soit terminée
    document.getElementById('confirmPassword').addEventListener('click', function() {
        if (document.getElementById('pageContent').classList.contains('visible')) {
            regenerateGroups();
        }
    });
});

function createBalancedGroups() {
    // Récupérer les options du formulaire
    const groupCount = parseInt(document.getElementById('groupCount').value);
    const balanceMode = document.getElementById('balanceMode').value;

    // Récupérer les groupes d'âge sélectionnés
    const selectedAges = Array.from(document.querySelectorAll('input[name="ageGroups"]:checked'))
        .map(checkbox => parseInt(checkbox.value));

    // Récupérer les genres sélectionnés
    const selectedGenders = Array.from(document.querySelectorAll('input[name="genderSelection"]:checked'))
        .map(checkbox => checkbox.value);

    // Filtrer les participants selon les critères
    let filteredParticipants = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );

    // Créer le nombre de groupes demandé
    const groups = Array.from({ length: groupCount }, () => []);

    // Calculer la taille idéale de chaque groupe
    const idealGroupSize = Math.floor(filteredParticipants.length / groupCount);
    const remainder = filteredParticipants.length % groupCount;

    if (balanceMode === 'gender') {
        // Équilibrer par genre
        const boys = filteredParticipants.filter(p => p.genre === 'masculin');
        const girls = filteredParticipants.filter(p => p.genre === 'feminin');

        // Distribution équilibrée des garçons
        distributeEvenly(shuffleArray(boys), groups);

        // Distribution équilibrée des filles
        distributeEvenly(shuffleArray(girls), groups);
    } else if (balanceMode === 'age') {
        // Équilibrer par âge
        const age11 = filteredParticipants.filter(p => p.age === 11);
        const age12 = filteredParticipants.filter(p => p.age === 12);
        const age13 = filteredParticipants.filter(p => p.age === 13);

        // Distribution équilibrée par âge
        distributeEvenly(shuffleArray(age11), groups);
        distributeEvenly(shuffleArray(age12), groups);
        distributeEvenly(shuffleArray(age13), groups);
    } else if (balanceMode === 'both') {
        // Équilibrer par genre ET âge
        const categories = [];

        // Créer des catégories pour chaque combinaison âge/genre
        selectedAges.forEach(age => {
            selectedGenders.forEach(genre => {
                const filtered = filteredParticipants.filter(p => p.age === age && p.genre === genre);
                if (filtered.length > 0) {
                    categories.push(shuffleArray(filtered));
                }
            });
        });

        // Distribution équilibrée de chaque catégorie
        categories.forEach(category => {
            distributeEvenly(category, groups);
        });
    } else {
        // Totalement aléatoire mais avec des groupes équilibrés
        distributeEvenly(shuffleArray(filteredParticipants), groups);
    }

    // Mélanger l'ordre dans chaque groupe
    return groups.map(group => shuffleArray(group));
}

// Fonction pour distribuer les participants de manière équilibrée
function distributeEvenly(participants, groups) {
    // Trie les groupes par nombre de participants (du plus petit au plus grand)
    // puis ajoute le participant au groupe le moins rempli
    participants.forEach(participant => {
        groups.sort((a, b) => a.length - b.length);
        groups[0].push(participant);
    });
}

function regenerateGroups() {
    const groups = createBalancedGroups();
    displayGroups(groups);
    updateStats();
}

function updateStats() {
    // Récupérer les groupes d'âge et genres sélectionnés
    const selectedAges = Array.from(document.querySelectorAll('input[name="ageGroups"]:checked'))
        .map(checkbox => parseInt(checkbox.value));

    const selectedGenders = Array.from(document.querySelectorAll('input[name="genderSelection"]:checked'))
        .map(checkbox => checkbox.value);

    // Filtrer les participants
    const filteredParticipants = participants.filter(p =>
        selectedAges.includes(p.age) && selectedGenders.includes(p.genre)
    );

    const boys = filteredParticipants.filter(p => p.genre === 'masculin').length;
    const girls = filteredParticipants.filter(p => p.genre === 'feminin').length;

    // Calculer l'âge moyen des participants filtrés
    const avgAge = filteredParticipants.length > 0
        ? (filteredParticipants.reduce((sum, p) => sum + p.age, 0) / filteredParticipants.length).toFixed(1).replace('.', ',')
        : '0';

    // Mettre à jour l'affichage
    document.querySelector('.stats').innerHTML = `
        <h3>📊 Statistiques</h3>
        <div class="stat-simple">
            <p>Il y a <span class="stat-highlight">${filteredParticipants.length}</span> participants au total</p>
            <p>Dont <span class="stat-highlight">${girls}</span> filles et <span class="stat-highlight">${boys}</span> garçons</p>
            <p>L'âge moyen est de <span class="stat-highlight">${avgAge}</span> ans</p>
        </div>
    `;
}

// Ajouter des écouteurs d'événements pour mettre à jour les stats quand les options changent
document.addEventListener('DOMContentLoaded', function() {
    // Pour les cases à cocher d'âge et de genre
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.addEventListener('change', updateStats);
    });
});