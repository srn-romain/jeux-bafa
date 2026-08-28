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
        { n: '13', e: '🍽️', t: 'Alimentation', l: 'nourriture.html' },
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

            <div class="navbar-links">
                <a href="${basePath}index.html" class="nav-link">Accueil</a>
                <div class="nav-dropdown">
                    <button class="nav-link" id="themesToggle">Thèmes <i class="bi bi-chevron-down"></i></button>
                    <div class="themes-grid" id="themesGrid">
                        ${themes.map(t => `<a href="${pagesPath}${t.l}" class="theme-item"><span>${t.e}</span> ${t.t}</a>`).join('')}
                    </div>
                </div>
                <a href="${pagesPath}espace/index.html" class="nav-btn-espace">
                    <i class="bi bi-lock-fill"></i> Espace Anim
                </a>
            </div>

            <button class="nav-toggle" id="navToggle">
                <i class="bi bi-list"></i>
            </button>
        </div>
    </nav>

    <div class="nav-menu-mobile" id="navMobileMenu">
        <a href="${basePath}index.html" class="mobile-link"><i class="bi bi-house"></i> Accueil</a>
        <div class="mobile-section-title">Thèmes</div>
        <div class="mobile-themes-grid text-white">
            ${themes.map(t => `<a href="${pagesPath}${t.l}" class="mobile-theme-item">${t.e} ${t.t}</a>`).join('')}
        </div>
        <div class="mobile-section-title">Plus</div>
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
        event.preventDefault();
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
        event.preventDefault();
        const modal = closeBtn.closest('.modalspe');
        if (modal) {
            modal.style.display = 'none';
            document.body.style.overflow = '';
        }
        return;
    }

    // Fermeture par clic extérieur
    if (event.target.classList.contains('modalspe')) {
        event.preventDefault();
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
    var traderidera = document.getElementById('traderidera');

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

    if (traderidera) {
        traderidera.addEventListener('click', function () {
            copyText('copyContentTraderidera');
        });
    }

});

/*--------------------------------------------------------------
# Persistance globale des Checkboxes (localStorage)
--------------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", function () {
    persistCheckboxes();
});

function persistCheckboxes() {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    const pageKey = encodeURIComponent(window.location.pathname);

    checkboxes.forEach((checkbox, index) => {
        let checkKey = "";
        
        if (checkbox.id) {
            checkKey = `cb_id_${checkbox.id}`;
        } else {
            const parentLabel = checkbox.closest('label');
            const parentLi = checkbox.closest('li');
            let textContent = "";
            
            if (parentLabel) {
                textContent = parentLabel.innerText.trim();
            } else if (parentLi) {
                textContent = parentLi.innerText.trim();
            }
            
            if (textContent) {
                const cleanText = textContent
                    .replace(/[\s\r\n\t]+/g, '_')
                    .toLowerCase()
                    .substring(0, 100);
                checkKey = `cb_txt_${pageKey}_${cleanText}`;
            } else {
                checkKey = `cb_idx_${pageKey}_${index}`;
            }
        }

        // Charger l'état sauvegardé
        const savedState = localStorage.getItem(checkKey);
        if (savedState !== null) {
            checkbox.checked = savedState === "true";
        }

        // Enregistrer l'état lors d'un changement
        checkbox.addEventListener("change", function () {
            localStorage.setItem(checkKey, checkbox.checked);
        });
    });
}

/*--------------------------------------------------------------
# Système de Votes (Pouces Verts / Rouges)
--------------------------------------------------------------*/
document.addEventListener("DOMContentLoaded", function () {
    const targetPages = [
        'activites.html', 
        'veillees.html', 
        'semaine.html', 
        'presentation.html', 
        'conversation.html', 
        'animateur.html', 
        'manuels.html', 
        'calme.html'
    ];
    
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const isTargetPage = targetPages.some(page => currentPath.includes(page));
    const isIndexPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || !window.location.pathname.includes('/pages/');
    
    if (isTargetPage || isIndexPage) {
        loadFirebaseAndInit(isTargetPage, isIndexPage);
    }
});

function loadFirebaseAndInit(isTargetPage, isIndexPage) {
    if (window.firebase && window.db) {
        if (isTargetPage) initVotesSystem();
        if (isIndexPage) {
            loadPublicBroadcastMessage();
            if (typeof initGameSearch === 'function') initGameSearch();
        }
        return;
    }

    // Déterminer le chemin relatif de firebase-config.js
    const isRoot = window.location.pathname.endsWith('index.html') || window.location.pathname === '/' || !window.location.pathname.includes('/pages/');
    const basePath = isRoot ? '' : '../';
    const configPath = basePath + "assets/js/firebase-config.js";

    const scripts = [
        "https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js",
        "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore-compat.js",
        "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth-compat.js",
        configPath
    ];

    let loadedCount = 0;
    function loadNext() {
        if (loadedCount >= scripts.length) {
            if (window.firebase) {
                if (!window.db) window.db = firebase.firestore();
                if (!window.auth) window.auth = firebase.auth();
                if (isTargetPage) initVotesSystem();
                if (isIndexPage) {
                    loadPublicBroadcastMessage();
                    if (typeof initGameSearch === 'function') initGameSearch();
                }
            }
            return;
        }
        const script = document.createElement("script");
        script.src = scripts[loadedCount];
        script.onload = () => {
            loadedCount++;
            loadNext();
        };
        script.onerror = () => {
            console.error("Erreur de chargement du script Firebase : " + scripts[loadedCount]);
        };
        document.head.appendChild(script);
    }
    loadNext();
}

function formatBroadcastMessage(rawMsg) {
    if (!rawMsg) return '';
    let safeMsg = rawMsg
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    safeMsg = safeMsg.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    safeMsg = safeMsg.replace(/\[(.*?)\]/g, '<span style="color:#f39c12;">$1</span>');
    safeMsg = safeMsg.replace(/\n/g, '<br>');
    return safeMsg;
}

function loadPublicBroadcastMessage() {
    if (!window.db) return;
    db.collection('globalSettings').doc('dashboard').get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            const msg = data.publicBroadcastMessage || '';
            const msgContainer = document.getElementById('public-broadcast-msg');
            const msgText = document.getElementById('public-broadcast-msg-text');
            const msgTitle = document.getElementById('public-broadcast-msg-title');
            if (msgContainer && msgText) {
                if (msg.trim() !== '') {
                    msgText.innerHTML = formatBroadcastMessage(msg);
                    if (msgTitle) {
                        const isUtile = data.publicBroadcastType !== 'pas_utile';
                        msgTitle.innerHTML = isUtile ? 'news <span style="color: #f39c12;">utile</span> du jour' : 'news <span style="color: #f39c12;">pas utile</span> du jour';
                    }
                    msgContainer.classList.remove('hidden');
                } else {
                    msgContainer.classList.add('hidden');
                }
            }
        }
    }).catch(err => {
        console.error("Error loading public broadcast message:", err);
    });
}

let currentUserData = null;

function initVotesSystem() {
    const listItems = document.querySelectorAll('.categories ul:not(.fads-grid) li, .categories ol:not(.fads-grid) li');
    const pageKey = window.location.pathname.split('/').pop() || 'index.html';

    const itemsToVote = [];

    listItems.forEach((li, index) => {
        if (li.closest('.regles-vie') || li.closest('.modalspe') || li.closest('.no-vote')) return;

        const text = li.innerText.trim();
        if (!text) return;

        const cleanText = text
            .replace(/[\s\r\n\t/]+/g, '_')
            .toLowerCase()
            .substring(0, 80);
        
        const voteId = `${pageKey}_${cleanText}`;

        itemsToVote.push({
            li: li,
            voteId: voteId
        });
    });

    if (itemsToVote.length === 0) return;

    itemsToVote.forEach(item => {
        const voteContainer = document.createElement('span');
        voteContainer.className = 'vote-container';
        voteContainer.setAttribute('data-vote-id', item.voteId);

        const userVoteKey = `vote_${item.voteId}`;
        const localVote = localStorage.getItem(userVoteKey);

        const upIconClass = localVote === 'up' ? 'bi-hand-thumbs-up-fill' : 'bi-hand-thumbs-up';
        const downIconClass = localVote === 'down' ? 'bi-hand-thumbs-down-fill' : 'bi-hand-thumbs-down';
        const upActive = localVote === 'up' ? 'active' : '';
        const downActive = localVote === 'down' ? 'active' : '';

        voteContainer.innerHTML = `
            <button class="vote-btn vote-up ${upActive}" title="J'aime">
                <i class="bi ${upIconClass}"></i>
                <span class="vote-count-up">0</span>
            </button>
            <button class="vote-btn vote-down ${downActive}" title="Je n'aime pas">
                <i class="bi ${downIconClass}"></i>
                <span class="vote-count-down" style="display: none;">0</span>
            </button>
        `;

        item.li.prepend(voteContainer);

        const btnUp = voteContainer.querySelector('.vote-up');
        const btnDown = voteContainer.querySelector('.vote-down');
        const countUpSpan = voteContainer.querySelector('.vote-count-up');
        const countDownSpan = voteContainer.querySelector('.vote-count-down');

        btnUp.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleVoteClick(item.voteId, 'up', btnUp, btnDown, countUpSpan, countDownSpan);
        });

        btnDown.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleVoteClick(item.voteId, 'down', btnUp, btnDown, countUpSpan, countDownSpan);
        });
    });

    // Charger les votes positifs
    db.collection('positive_votes').get().then(snapshot => {
        const votesMap = {};
        snapshot.forEach(doc => {
            votesMap[doc.id] = Math.max(0, doc.data().count || 0);
        });

        itemsToVote.forEach(item => {
            const count = Math.max(0, votesMap[item.voteId] || 0);
            const container = item.li.querySelector(`.vote-container[data-vote-id="${item.voteId}"]`);
            if (container) {
                container.querySelector('.vote-count-up').innerText = count;
            }
        });
    }).catch(err => {
        console.error("Erreur de chargement des votes positifs:", err);
    });

    // Charger les votes négatifs (visible uniquement par l'admin connecté) et récupérer les données utilisateur
    auth.onAuthStateChanged(user => {
        if (user) {
            db.collection('users').doc(user.uid).get().then(doc => {
                if (doc.exists) {
                    currentUserData = doc.data();
                    currentUserData.uid = user.uid;

                    if (currentUserData.role === 'admin') {
                        db.collection('negative_votes').get().then(snapshot => {
                            const negVotesMap = {};
                            snapshot.forEach(doc => {
                                negVotesMap[doc.id] = Math.max(0, doc.data().count || 0);
                            });

                            itemsToVote.forEach(item => {
                                const count = Math.max(0, negVotesMap[item.voteId] || 0);
                                const container = item.li.querySelector(`.vote-container[data-vote-id="${item.voteId}"]`);
                                if (container) {
                                    const countDownSpan = container.querySelector('.vote-count-down');
                                    countDownSpan.innerText = count;
                                    countDownSpan.style.display = 'inline';
                                }
                            });
                        }).catch(err => {
                            console.error("Erreur de chargement des votes négatifs (admin):", err);
                        });

                        // Initialiser les tooltips pour l'admin
                        setupAdminTooltips(itemsToVote);
                    }
                }
            }).catch(err => {
                console.error("Erreur de lecture du rôle utilisateur:", err);
            });
        } else {
            currentUserData = null;
        }
    });

    // Affiche la modale de bienvenue/incitation au vote pour les nouveaux visiteurs
    if (!localStorage.getItem('vote_welcome_modal_shown')) {
        showVoteWelcomeModal();
        localStorage.setItem('vote_welcome_modal_shown', 'true');
    }
}

function getOrCreateVisitorId() {
    let visitorId = localStorage.getItem('vote_visitor_id');
    if (!visitorId) {
        visitorId = 'v_' + Math.random().toString(36).substring(2, 15) + '_' + Date.now().toString(36);
        localStorage.setItem('vote_visitor_id', visitorId);
    }
    return visitorId;
}

function getVoterMetadata() {
    const ua = navigator.userAgent;
    let browser = "Inconnu";
    let os = "Inconnu";
    
    // OS simple
    if (ua.indexOf("Win") !== -1) os = "Windows";
    else if (ua.indexOf("Mac") !== -1) os = "MacOS";
    else if (ua.indexOf("Linux") !== -1) os = "Linux";
    else if (ua.indexOf("Android") !== -1) os = "Android";
    else if (ua.indexOf("like Mac") !== -1) os = "iOS";
    
    // Navigateur simple
    if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
    else if (ua.indexOf("SamsungBrowser") !== -1) browser = "Samsung Browser";
    else if (ua.indexOf("Opera") !== -1 || ua.indexOf("OPR") !== -1) browser = "Opera";
    else if (ua.indexOf("Trident") !== -1) browser = "Internet Explorer";
    else if (ua.indexOf("Edge") !== -1 || ua.indexOf("Edg") !== -1) browser = "Edge";
    else if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
    else if (ua.indexOf("Safari") !== -1) browser = "Safari";

    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const device = isMobile ? "Mobile" : "Desktop";

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const formattedDate = `le ${dateStr} à ${timeStr}`;

    const metadata = {
        date: formattedDate,
        rawTimestamp: now.getTime(),
        browser: browser,
        os: os,
        device: device,
        lang: navigator.language || "fr"
    };

    if (currentUserData) {
        metadata.uid = currentUserData.uid || '';
        let name = currentUserData.displayName || '';
        if (!name) {
            const parts = [];
            if (currentUserData.firstName) parts.push(currentUserData.firstName);
            if (currentUserData.lastName) parts.push(currentUserData.lastName);
            name = parts.join(' ');
        }
        metadata.userName = name || currentUserData.email || 'Anonyme';
        metadata.userRole = currentUserData.role || 'anim';
    } else if (auth.currentUser) {
        const user = auth.currentUser;
        metadata.uid = user.uid;
        metadata.userName = user.displayName || user.email || 'Anonyme';
        metadata.userRole = 'anim';
    }

    return metadata;
}

let activeBtn = null;
let touchStartTimer = null;
let touchX = 0;
let touchY = 0;

function showTooltipForBtn(btn, voteId, direction) {
    if (activeBtn === btn) return;
    activeBtn = btn;
    
    const rect = btn.getBoundingClientRect();
    const tooltip = document.getElementById('vote-admin-tooltip');
    if (!tooltip) return;
    
    tooltip.innerHTML = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4><span class="vote-meta-loading">Chargement...</span>`;
    tooltip.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
    tooltip.style.top = `${window.scrollY + rect.top - 8}px`;
    tooltip.style.transform = 'translate(-50%, -100%) translateY(-5px)';
    tooltip.classList.add('active');

    const colName = direction === 'up' ? 'positive_votes' : 'negative_votes';
    
    db.collection(colName).doc(voteId).get().then(doc => {
        if (activeBtn !== btn) return;
        
        let voters = {};
        if (doc.exists) {
            const data = doc.data() || {};
            
            // 1. Essayer de récupérer le map imbriqué "voters"
            if (data.voters && typeof data.voters === 'object') {
                voters = { ...data.voters };
            }
            
            // 2. Récupérer également les clés plates "voters.v_xxxxx" créées par .set(..., {merge: true})
            Object.keys(data).forEach(key => {
                if (key.startsWith('voters.')) {
                    const visitorId = key.substring(7); // "voters.".length
                    voters[visitorId] = data[key];
                }
            });
        }
        
        const sortedVoters = Object.values(voters).sort((a, b) => (b.rawTimestamp || 0) - (a.rawTimestamp || 0));
        
        if (doc.exists && sortedVoters.length > 0) {
            let html = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4>`;
            html += `<ul>`;
            sortedVoters.forEach(v => {
                const isInactive = v.active === false;
                const inactiveClass = isInactive ? ' class="vote-item-inactive"' : '';
                const statusLabel = isInactive ? ' <span class="vote-meta-status-retire">(Retiré)</span>' : '';
                const userLine = v.userName ? `<span class="vote-meta-user"><strong>${v.userName}</strong> (${v.userRole || 'Utilisateur'})${statusLabel}</span>` : '';
                html += `
                    <li${inactiveClass}>
                        ${userLine}
                        <span class="vote-meta-time">${v.date || 'Date inconnue'}</span>
                        <span class="vote-meta-details">${v.device || 'Appareil'} (${v.os || 'OS'}) - ${v.browser || 'Navigateur'}</span>
                    </li>
                `;
            });
            html += `</ul>`;
            tooltip.innerHTML = html;
        } else {
            tooltip.innerHTML = `<h4>Détails des votes (${direction === 'up' ? "J'aime" : "Je n'aime pas"})</h4><span class="vote-meta-loading">Aucune donnée enregistrée.</span>`;
        }
        
        const newRect = btn.getBoundingClientRect();
        tooltip.style.left = `${window.scrollX + newRect.left + newRect.width / 2}px`;
        tooltip.style.top = `${window.scrollY + newRect.top - 8}px`;
    }).catch(err => {
        if (activeBtn !== btn) return;
        tooltip.innerHTML = `<h4>Erreur</h4><span class="vote-meta-loading">Impossible de charger les données.</span>`;
    });
}

function hideTooltip() {
    activeBtn = null;
    const tooltip = document.getElementById('vote-admin-tooltip');
    if (tooltip) {
        tooltip.classList.remove('active');
    }
}

function setupAdminTooltips(itemsToVote) {
    let tooltipEl = document.getElementById('vote-admin-tooltip');
    if (!tooltipEl) {
        tooltipEl = document.createElement('div');
        tooltipEl.id = 'vote-admin-tooltip';
        tooltipEl.className = 'vote-admin-tooltip';
        document.body.appendChild(tooltipEl);
    }

    itemsToVote.forEach(item => {
        const container = item.li.querySelector(`.vote-container[data-vote-id="${item.voteId}"]`);
        if (!container) return;

        const btnUp = container.querySelector('.vote-up');
        const btnDown = container.querySelector('.vote-down');

        [ { btn: btnUp, dir: 'up' }, { btn: btnDown, dir: 'down' } ].forEach(({ btn, dir }) => {
            if (!btn) return;

            btn.addEventListener('mouseenter', () => {
                showTooltipForBtn(btn, item.voteId, dir);
            });

            btn.addEventListener('mouseleave', () => {
                hideTooltip();
            });

            btn.addEventListener('touchstart', (e) => {
                const touch = e.touches[0];
                touchX = touch.clientX;
                touchY = touch.clientY;

                if (touchStartTimer) clearTimeout(touchStartTimer);
                
                touchStartTimer = setTimeout(() => {
                    showTooltipForBtn(btn, item.voteId, dir);
                    if (navigator.vibrate) {
                        navigator.vibrate(50);
                    }
                }, 600);
            }, { passive: true });

            btn.addEventListener('touchmove', (e) => {
                const touch = e.touches[0];
                if (Math.abs(touch.clientX - touchX) > 10 || Math.abs(touch.clientY - touchY) > 10) {
                    if (touchStartTimer) {
                        clearTimeout(touchStartTimer);
                        touchStartTimer = null;
                    }
                    hideTooltip();
                }
            }, { passive: true });

            btn.addEventListener('touchend', () => {
                if (touchStartTimer) {
                    clearTimeout(touchStartTimer);
                    touchStartTimer = null;
                }
                hideTooltip();
            });

            btn.addEventListener('touchcancel', () => {
                if (touchStartTimer) {
                    clearTimeout(touchStartTimer);
                    touchStartTimer = null;
                }
                hideTooltip();
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (activeBtn && !activeBtn.contains(e.target)) {
            hideTooltip();
        }
    });
    document.addEventListener('touchstart', (e) => {
        if (activeBtn && !activeBtn.contains(e.target)) {
            hideTooltip();
        }
    }, { passive: true });
}

function handleVoteClick(voteId, direction, btnUp, btnDown, countUpSpan, countDownSpan) {
    const userVoteKey = `vote_${voteId}`;
    const currentVote = localStorage.getItem(userVoteKey);
    const visitorId = getOrCreateVisitorId();
    const metadata = getVoterMetadata();

    if (currentVote === direction) {
        localStorage.removeItem(userVoteKey);
        const inactiveMetadata = { ...metadata, active: false };
        updateVoteFirestore(voteId, direction, -1, visitorId, inactiveMetadata);
        updateLocalUI(direction, -1, btnUp, btnDown, countUpSpan, countDownSpan);
    } else if (currentVote) {
        localStorage.setItem(userVoteKey, direction);
        const inactiveMetadata = { ...metadata, active: false };
        updateVoteFirestore(voteId, currentVote, -1, visitorId, inactiveMetadata);
        const activeMetadata = { ...metadata, active: true };
        updateVoteFirestore(voteId, direction, 1, visitorId, activeMetadata);
        updateLocalUI(currentVote, -1, btnUp, btnDown, countUpSpan, countDownSpan);
        updateLocalUI(direction, 1, btnUp, btnDown, countUpSpan, countDownSpan);
    } else {
        localStorage.setItem(userVoteKey, direction);
        const activeMetadata = { ...metadata, active: true };
        updateVoteFirestore(voteId, direction, 1, visitorId, activeMetadata);
        updateLocalUI(direction, 1, btnUp, btnDown, countUpSpan, countDownSpan);
    }
}

function updateVoteFirestore(voteId, direction, val, visitorId, metadata) {
    const colName = direction === 'up' ? 'positive_votes' : 'negative_votes';
    const docRef = db.collection(colName).doc(voteId);

    db.runTransaction(async (transaction) => {
        const docSnap = await transaction.get(docRef);
        const currentCount = docSnap.exists ? (docSnap.data().count || 0) : 0;
        const newCount = Math.max(0, currentCount + val);

        const updateData = { count: newCount };

        if (visitorId) {
            if (metadata) {
                updateData[`voters.${visitorId}`] = metadata;
            } else {
                updateData[`voters.${visitorId}`] = firebase.firestore.FieldValue.delete();
            }
        }

        transaction.set(docRef, updateData, { merge: true });
    }).catch(err => {
        console.error(`Erreur mise à jour vote ${direction} dans Firestore:`, err);
    });
}


function updateLocalUI(direction, val, btnUp, btnDown, countUpSpan, countDownSpan) {
    if (direction === 'up') {
        const count = parseInt(countUpSpan.innerText) + val;
        countUpSpan.innerText = count >= 0 ? count : 0;
        if (val > 0) {
            btnUp.classList.add('active');
            btnUp.querySelector('i').className = 'bi bi-hand-thumbs-up-fill';
        } else {
            btnUp.classList.remove('active');
            btnUp.querySelector('i').className = 'bi bi-hand-thumbs-up';
        }
    } else {
        const count = parseInt(countDownSpan.innerText) + val;
        countDownSpan.innerText = count >= 0 ? count : 0;
        if (val > 0) {
            btnDown.classList.add('active');
            btnDown.querySelector('i').className = 'bi bi-hand-thumbs-down-fill';
        } else {
            btnDown.classList.remove('active');
            btnDown.querySelector('i').className = 'bi bi-hand-thumbs-down';
        }
    }
}

/**
 * Affiche une modale d'information et d'incitation au vote (gros coup de pub)
 * pour l'utilisateur qui ouvre l'application pour la première fois.
 */
function showVoteWelcomeModal() {
    // Injecter les styles CSS de la modale s'ils ne sont pas déjà présents
    if (!document.getElementById('vote-modal-styles')) {
        const style = document.createElement('style');
        style.id = 'vote-modal-styles';
        style.innerHTML = `
            .vote-welcome-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(44, 62, 80, 0.7);
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s ease;
                max-width: none !important;
            }
            .vote-welcome-overlay.active {
                opacity: 1;
            }
            .vote-welcome-card {
                background: #ffffff;
                width: 90%;
                max-width: 480px;
                border-radius: 20px;
                padding: 30px;
                box-shadow: 0 15px 40px rgba(0, 0, 0, 0.25);
                transform: scale(0.8);
                transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                text-align: center;
                position: relative;
                border: 1px solid #f9e2b3;
                font-family: 'Inter', 'Roboto', Arial, sans-serif;
            }
            .vote-welcome-overlay.active .vote-welcome-card {
                transform: scale(1);
            }
            .vote-welcome-close {
                position: absolute;
                top: 15px;
                right: 18px;
                background: none;
                border: none;
                font-size: 1.8rem;
                color: #95a5a6;
                cursor: pointer;
                transition: color 0.2s;
                line-height: 1;
            }
            .vote-welcome-close:hover {
                color: #e74c3c;
            }
            .vote-welcome-badge {
                display: inline-block;
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                color: #ffffff;
                font-size: 0.75rem;
                font-weight: 800;
                padding: 4px 12px;
                border-radius: 20px;
                letter-spacing: 1px;
                margin-bottom: 15px;
                box-shadow: 0 4px 10px rgba(231, 76, 60, 0.2);
            }
            .vote-welcome-icon-container {
                display: flex;
                justify-content: center;
                gap: 15px;
                margin: 10px 0 20px 0;
            }
            .vote-welcome-icon-circle {
                width: 60px;
                height: 60px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 1.8rem;
                color: #ffffff;
                box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
            }
            .vote-welcome-icon-circle.up {
                background: linear-gradient(135deg, #2ecc71, #27ae60);
                animation: float-up 3s infinite ease-in-out;
            }
            .vote-welcome-icon-circle.down {
                background: linear-gradient(135deg, #e74c3c, #c0392b);
                animation: float-down 3s infinite ease-in-out;
                animation-delay: 0.5s;
            }
            @keyframes float-up {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-8px); }
            }
            @keyframes float-down {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }
            .vote-welcome-card h2 {
                color: #2c3e50;
                font-size: 1.5rem;
                font-weight: 800;
                margin-bottom: 12px;
                margin-top: 0;
            }
            .vote-welcome-card p {
                font-size: 0.92rem;
                color: #5d6d7e;
                line-height: 1.6;
                margin-bottom: 24px;
            }
            .vote-welcome-card strong {
                color: #2c3e50;
            }
            .vote-welcome-cta {
                background: linear-gradient(135deg, #f39c12, #d68910);
                color: #ffffff;
                border: none;
                border-radius: 30px;
                padding: 12px 30px;
                font-size: 0.95rem;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 5px 15px rgba(243, 156, 18, 0.3);
                transition: transform 0.2s, box-shadow 0.2s, filter 0.15s;
                width: 100%;
            }
            .vote-welcome-cta:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 20px rgba(243, 156, 18, 0.4);
                filter: brightness(1.05);
            }
            .vote-welcome-cta:active {
                transform: translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    // Structure HTML de la modale
    const modalHtml = `
        <div class="vote-welcome-overlay" id="voteWelcomeOverlay">
            <div class="vote-welcome-card">
                <button class="vote-welcome-close" id="voteWelcomeCloseBtn">&times;</button>
                <span class="vote-welcome-badge">COMMUNAUTÉ</span>
                <h2>Votre avis compte ! 🌟</h2>
                
                <div class="vote-welcome-icon-container">
                    <div class="vote-welcome-icon-circle up">
                        <i class="bi bi-hand-thumbs-up-fill"></i>
                    </div>
                    <div class="vote-welcome-icon-circle down">
                        <i class="bi bi-hand-thumbs-down-fill"></i>
                    </div>
                </div>

                <p>
                    <strong>Aidez-nous à améliorer les ressources !</strong><br>
                    Vous pouvez désormais voter pour vos idées et jeux préférés. 
                    <br><br>
                    <strong>Aucun compte n'est requis</strong>, il suffit d'un simple clic sur le pouce vert 👍 ou le pouce rouge 👎. Chaque vote nous aide à savoir ce qui plaît le plus en colo !
                </p>

                <button class="vote-welcome-cta" id="voteWelcomeCtaBtn">C'est parti ! 🚀</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    const overlay = document.getElementById('voteWelcomeOverlay');
    const closeBtn = document.getElementById('voteWelcomeCloseBtn');
    const ctaBtn = document.getElementById('voteWelcomeCtaBtn');

    // Empêcher le défilement de la page arrière pendant que la modale est active
    document.body.style.overflow = 'hidden';

    // Activer l'animation d'apparition
    setTimeout(() => {
        overlay.classList.add('active');
    }, 50);

    // Fonction de fermeture
    function closeModal() {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => {
            overlay.remove();
        }, 300);
    }

    closeBtn.addEventListener('click', closeModal);
    ctaBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closeModal();
        }
    });
}

/*--------------------------------------------------------------
# Auto-ancrage et défilement pour la recherche de jeux
--------------------------------------------------------------*/
document.addEventListener('DOMContentLoaded', function () {
    const isContentPage = window.location.pathname.includes('/pages/');
    if (!isContentPage) return;

    function generateSlug(str) {
        return str
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s-]/g, ' ')
            .trim()
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // Injecter un id="slug" sur chaque <li> qui commence par un <b>
    const listItems = document.querySelectorAll('.categories li');
    listItems.forEach(function (li) {
        const firstB = li.querySelector(':scope > b');
        if (!firstB) return;
        const rawName = firstB.textContent.trim();
        if (!rawName) return;
        const slug = generateSlug(rawName);
        if (slug && !li.id) {
            li.id = slug;
        }
    });

    // Si l'URL contient une ancre (#slug), faire défiler vers l'élément
    if (window.location.hash) {
        const targetId = decodeURIComponent(window.location.hash.substring(1));
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            setTimeout(function () {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                targetEl.style.transition = 'background 0.3s ease, border-radius 0.3s ease, padding 0.3s ease';
                targetEl.style.borderRadius = '10px';
                targetEl.style.padding = '6px 12px';
                targetEl.style.background = 'rgba(39, 174, 96, 0.18)';
                setTimeout(function () {
                    targetEl.style.background = '';
                    targetEl.style.borderRadius = '';
                    targetEl.style.padding = '';
                }, 2500);
            }, 350);
        }
    }
});
