/*--------------------------------------------------------------
# Back to top button
--------------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", function () {
    injectNavbar();

    let backToTopButton = document.querySelector(".back-to-top");
    if (backToTopButton) {
        window.addEventListener("scroll", function () {
            if (window.scrollY > 200) {
                backToTopButton.classList.add("active");
            } else {
                backToTopButton.classList.remove("active");
            }
        });

        backToTopButton.addEventListener("click", function (e) {
            e.preventDefault();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }
});

/**
 * Génère et injecte la navbar sur toutes les pages du site principal
 */
function injectNavbar() {
    const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || !window.location.pathname.includes('/pages/');
    const basePath = isRoot ? '' : '../';
    const pagesPath = isRoot ? 'pages/' : '';

    const themes = [
        { n: '01', e: '🤝', t: 'Jeux Présentation', l: 'presentation.html' },
        { n: '02', e: '📅', t: 'Jeux Fil Rouge', l: 'semaine.html' },
        { n: '03', e: '🗣️', t: 'Débats & Echanges', l: 'conversation.html' },
        { n: '04', e: '🧢', t: 'Animateur', l: 'animateur.html' },
        { n: '05', e: '🏠', t: 'Vie Quotidienne', l: 'quotidien.html' },
        { n: '06', e: '⚽', t: 'Activités', l: 'activites.html' },
        { n: '07', e: '🌙', t: 'Veillées', l: 'veillees.html' },
        { n: '08', e: '✂️', t: 'Activités Manuelles', l: 'manuels.html' },
        { n: '09', e: '🧘', t: 'Temps Calme', l: 'calme.html' },
        { n: '10', e: '🚫', t: 'Idées de Gages', l: 'gage.html' },
        { n: '11', e: '📜', t: 'Règles de Vie', l: 'regles.html' },
        { n: '12', e: '🎶', t: 'Musiques', l: 'musique.html' },
        { n: '13', e: '🍽️', t: 'Alimentation', l: 'bouffe.html' },
        { n: '14', e: '💼', t: 'Direction', l: 'direction.html' },
        { n: '15', e: '⚖️', t: 'Réglementation', l: 'reglementation.html' },
        { n: '16', e: '🎓', t: 'Formation', l: 'formation.html' }
    ];

    const navHtml = `
    <nav class="navbar">
        <div class="navbar-container">
            <a href="${basePath}index.html" class="navbar-brand">
                <span>🏕️ BAFA & BAFD</span>
            </a>

            <test class="navbar-links">
                <a href="${basePath}index.html" class="nav-link">Accueil</a>
                <test class="nav-dropdown">
                    <button class="nav-link" id="themesToggle">Thèmes <i class="bi bi-chevron-down"></i></button>
                    <div class="themes-grid" id="themesGrid">
                        ${themes.map(t => `<a href="${pagesPath}${t.l}" class="theme-item"><span>${t.e}</span> ${t.t}</a>`).join('')}
                    </div>
                </test>
                <a href="${pagesPath}espace/index.html" class="nav-btn-espace">
                    <i class="bi bi-lock-fill"></i> Espace Anim
                </a>
            </test>

            <button class="nav-toggle" id="navToggle">
                <i class="bi bi-list"></i>
            </button>
        </div>
    </nav>

    <div class="nav-menu-mobile" id="navMobileMenu">
        <a href="${basePath}index.html" class="mobile-link"><i class="bi bi-house"></i> Accueil</a>
        <test class="mobile-section-title">Thèmes</test>
        <test class="mobile-themes-grid text-white">
            ${themes.map(t => `<a href="${pagesPath}${t.l}" class="mobile-theme-item">${t.e} ${t.t}</a>`).join('')}
        </test>
        <test class="mobile-section-title">Plus</test>
        <a href="${pagesPath}espace/index.html" class="mobile-link active" style="background:var(--clr-primary); color:#fff; font-size: medium">
            <i class="bi bi-lock-fill"></i> Espace Animateur Privé
        </a>
    </div>
    `;

    document.body.insertAdjacentHTML('afterbegin', navHtml);

    // Toggle menu mobile
    const navToggle = document.getElementById('navToggle');
    const navMobileMenu = document.getElementById('navMobileMenu');

    if (navToggle && navMobileMenu) {
        navToggle.addEventListener('click', () => {
            navMobileMenu.classList.toggle('active');
            const icon = navToggle.querySelector('i');
            icon.className = navMobileMenu.classList.contains('active') ? 'bi bi-x-lg' : 'bi bi-list';
        });
    }

    // Themes Dropdown Desktop Toggle
    const themesToggle = document.getElementById('themesToggle');
    const themesGrid = document.getElementById('themesGrid');
    if (themesToggle && themesGrid) {
        themesToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            themesGrid.classList.toggle('active');
        });
        document.addEventListener('click', () => themesGrid.classList.remove('active'));
    }

    // Highlighting active page
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link, .mobile-link, .theme-item, .mobile-theme-item').forEach(link => {
        const href = link.getAttribute('href');
        if (href && currentPath.endsWith(href.split('/').pop())) {
            link.classList.add('active');
        }
    });
}

/*--------------------------------------------------------------
# Modale
--------------------------------------------------------------*/
// Gestion des Modales (Ouverture/Fermeture)
document.addEventListener('click', (event) => {
    // Ouverture
    const openBtn = event.target.closest('.openModalBtn');
    if (openBtn) {
        const modalId = openBtn.getAttribute('data-modal');
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden'; 
        }
        return;
    }

    // Fermeture par la croix
    const closeBtn = event.target.closest('.modal__closespe');
    if (closeBtn) {
        const modal = closeBtn.closest('.modalspe');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        return;
    }

    // Fermeture par clic extérieur
    if (event.target.classList.contains('modalspe')) {
        event.target.style.display = 'none';
        document.body.style.overflow = '';
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
    var elan = document.getElementById('copyMessageJeuElan');
    var chevreuil = document.getElementById('copyMessageJeuChevreuil');

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

    if (elan) {
        elan.addEventListener('click', function () {
            copyText('copyContentElan');
        });
    }

    if (chevreuil) {
        chevreuil.addEventListener('click', function () {
            copyText('copyContentChevreuil');
        });
    }

});