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
var modalBtn = document.getElementById("open-modalspe");
var modal = document.getElementById("modal-locspe");
var modalCloseBtn = modal.querySelector(".modal__closespe");

function openModalspe() {
    modal.style.display = "block";
}

function closeModalspe() {
    modal.style.display = "none";
}

modalBtn.addEventListener("click", openModalspe);
modalCloseBtn.addEventListener("click", closeModalspe);

window.addEventListener("click", function(event) {
    if (event.target === modal) { // Si l'utilisateur clique sur l'arrière-plan (modale elle-même)
        closeModalspe();
    }
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
    var copyDayButton = document.getElementById('copyMessageDay');

    if (copySongButton) {
        copySongButton.addEventListener('click', function () {
            copyText('copyContent'); // Copie uniquement la chanson
        });
    }

    if (copyDayButton) {
        copyDayButton.addEventListener('click', function () {
            copyText('copyContentDay'); // Copie uniquement la journée type
        });
    }
});


