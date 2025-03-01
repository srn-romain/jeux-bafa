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



// Fonction pour copier le texte dans le presse-papiers
document.getElementById('copyMessage').addEventListener('click', function() {
    // Sélectionner tout le texte dans la modal
    var textToCopy = document.querySelector('.modal__contentspe').innerText;

    // Créer un champ de texte temporaire pour copier le texte
    var textarea = document.createElement('textarea');
    textarea.value = textToCopy;
    document.body.appendChild(textarea);

    // Sélectionner et copier le texte
    textarea.select();
    document.execCommand('copy');

    // Retirer le champ de texte temporaire
    document.body.removeChild(textarea);
});