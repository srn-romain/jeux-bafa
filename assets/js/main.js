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

});



