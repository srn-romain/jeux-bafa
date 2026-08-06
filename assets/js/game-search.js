/*--------------------------------------------------------------
# Recherche Globale de Jeux (index.html uniquement, connectés non bannis)
# game-search.js — Chargé depuis index.html uniquement
--------------------------------------------------------------*/

/**
 * Génère un slug depuis un texte (même algorithme que l'injection sur les <li>).
 */
function slugify(str) {
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

/**
 * Index statique de tous les jeux et items du site.
 * Basé sur les vrais noms extraits des pages HTML (<li><b>Nom</b>...).
 */
var GAMES_INDEX = (function () {
    var pages = [
        {
            page: 'pages/presentation.html', cat: 'Jeux présentation', emoji: '🤝',
            items: ['Acrostiches', 'Avis de tempête', 'Boule de neige', "Carte d'identité", "Chef d'orchestre",
                'Dans ma colo il y a...', 'Jeu du disparu', "Jeux de l'évolution", 'Killer', 'Le funambule',
                'Le signe', 'Lucky Luke', 'Point commun', 'Présentation théâtrale', 'Présente ton voisin', 'Qui est-ce ?']
        },
        {
            page: 'pages/semaine.html', cat: 'Jeux fil rouge', emoji: '📅',
            items: ['Secret Anim', 'Gorille Cacahuète / Ange Démon', 'Plaît-il ?', 'Secret Story',
                'Jeu de la pince à linge (version 1)', 'Jeu de la Pince à Linge (version 2)',
                'Le Killer', 'Passeport', 'Cacher 100 canards miniatures']
        },
        {
            page: 'pages/animateur.html', cat: 'Jeux animateurs', emoji: '🧢',
            items: ["C'est-à-dire ?", 'Contact', 'Jeu de la pince à linge', 'Grosse dinde',
                "Pan Pan c'est toi l'Élan", 'Le Chevreuil', "Pour un M&M's rouge",
                'Nouveau dans une colo', 'Devine le gateau']
        },
        {
            page: 'pages/quotidien.html', cat: 'Vie quotidienne', emoji: '🏠',
            items: ['Affichage', 'Appel papier', 'Bingo des émotions', 'Caméra cachée humoristique',
                'Check lapin à demain !', 'Échelle du bruit', 'Énigme journalière',
                'Faire la chenille / le petit train', 'Faire signer les règles de vie',
                'Gommette des râleurs', 'Je passe le téléphone à...', 'Jeu de la minute',
                'Jeu de liaison', "Jeu de l'écureuil", 'Jeu de logique', 'Jeu Intellectuels',
                'Musique de 2 min', 'Panneau principal', 'PPCC', 'Présentation journée',
                'Règle du silence', 'Snap Game', 'Trombinoscope des animateurs']
        },
        {
            page: 'pages/activites.html', cat: 'Activités', emoji: '⚽',
            items: ['Assiette de farine', 'Balle à 10', 'Balle Américaine', 'Ballon prisonnier',
                'La banquise', 'Bataille navale', 'Béret', 'Blind Bretz', 'Brookmaker',
                'La cabane au trésor', 'Cache-cache traditionnelle', 'Capture de drapeau',
                'Chasse Surprise', 'Chasseur-chassé', 'Le code', 'Cuisine', "Course d'orientation",
                'Course en sac', 'Dauphin dauphine', 'Dessin et coloriage en peinture avec des points',
                'La queue du diable', 'Le dessin magique', 'Douanier contrebandier', "L'emmêlage",
                'Épervier', 'Football indien', 'Gobelin chasseur', "L'horloge", 'Jeu de piste',
                'Jeu du dictionnaire', 'Jeu des 5 secondes', "Jeux de vente d'un produit",
                'Jeux du bazar', 'Jeux photographiques', 'Kim goût',
                'Kim goût spéciale marque VS sous marque', 'Koh-Lanta', 'Liste des défis',
                'Loto', 'La mouche', 'Mario Kart ballon', 'Olympiades',
                'Parcours du combattant avec mise', 'Poule Renard Vipère',
                'Puissance 4 grandeur nature', 'Le psychiatre', 'Renforcement musculaire',
                'Relais classique', 'Relais éponge', 'Sagamore', 'Sardine',
                'La savane silencieuse', 'Le sculpteur', 'Splatoon', 'Switch', 'Taureau',
                'La thèque', 'La tomate', 'Tomate ketchup', 'Vitamine', 'Le zombie',
                '1,2,3 Soleil', 'Jacques a dit / Faire ça', 'Les 5 sens', 'Béret soleil',
                'Chaise musicale', 'Chat perché', 'Colin-maillard', 'La corde à sauter collective',
                'La marelle', "L'Île aux requins", 'Loup touche-touche', 'Loup bougie',
                'Loup couleur', 'Loup glacé', 'Pizza loup touche-touche', 'Relai animaux',
                'Relai lilypad', 'Safari', 'Traversée de la rivière',
                "Jeux des empreintes d'animaux", 'Marin pêcheur',
                'Troc Patate', 'Rallye Photo', 'Quartier libre', 'Pékin Express', 'Pac Man']
        },
        {
            page: 'pages/veillees.html', cat: 'Veillées', emoji: '🌙',
            items: ['3 emojis → 1 série', '10/10', 'Audience télévisée', 'Bain de minuit',
                'Boom de fin de séjour', 'Carré magique', 'Concept YouTube',
                'Connaissez-vous vos anims ?', "Concours d'annecdote", 'Conte animé',
                'Conte & théâtre', 'Devine le bébé', 'Écureuil', 'Fureur', 'In the dark',
                'Karaoké', "L'empire", "L'homme en noir", 'La colo à un incroyable talent',
                'La vente aux enchères', 'Loup Garou classique', 'Loup Garou extension',
                'Loup Garou sans loup garou', 'Montée descente', 'Pyramide des défis',
                'Pyramide des défis version Mille Bornes', 'Quiz Event', 'Quiz Corse',
                'Quiz Kahoot sur le séjour', 'Quiz Français', 'Quiz Québécois',
                'Quiz Identité Célébrité', 'Soirée cabaret', 'Soirée casino', 'Soirée cinéma',
                'Spectacle', 'Tele Quiz', 'Timeline', 'Two Rooms and a Boom', 'Undercover',
                'Veillée cluedo/enquête', 'Veillée libre']
        },
        {
            page: 'pages/manuels.html', cat: 'Activités manuelles', emoji: '✂️',
            items: ['365 jours / jouets', 'Bâton boîte œuf fleur',
                'Bonhomme de neige avec bouchon blanc', 'Boule à neige avec pot laitière vanille',
                'Carte au trésor avec du café', 'Carte de vœux', "Carte avec de la 3D à l'intérieur",
                'Carte Pokémon', 'Chapeau mexicain (Land Art)', 'Comète',
                "Création d'un petit livre petite histoire", 'Dessins', 'Dessin pâtes dessins',
                'Dessin recto verso', 'Enveloppe avec mot secret porte-bonheur',
                'Faire un lion avec assiette en papier', 'Galette des rois en papier',
                'Grande roue en papier', 'Imprimer dessin Kapla', 'Imprimer une petite image',
                'Jeux de société personnalisé', 'Land Art', 'Maquillage', 'Origami', "P'tit bac",
                'Petit chevaux grandeur nature', 'Pâtes à modeler', 'Plâtre',
                'Pixel Art avec peinture', 'Pyrogravure', 'Puzzle', 'Puzzle sur un carton',
                'Tour feutre en 3D', 'Voiture en carton pour Mille Bornes', 'Chanson karaoke']
        },
        {
            page: 'pages/calme.html', cat: 'Retour au calme', emoji: '🧘',
            items: ['Around the world', 'Diamont', 'En feu', 'Harder Better Faster Stronger',
                'La scène', 'Le magicien (si -8 ans)', 'Papaoutai', 'Playlist', 'Simple basique', 'Statue']
        },
        {
            page: 'pages/gage.html', cat: 'Idées de gages', emoji: '🚫',
            items: ['Faire 150 pompes en 24h', 'Laver la popote de toute la colo',
                'Ne pas utiliser son téléphone toute la journée', 'Répondre en chantant pendant 2h',
                'Chanter Titanic a cappella', "Apprendre et réciter l'alphabet à l'envers",
                "Apprendre et réciter une poésie choisie par le groupe",
                "Expliquer des citations d'auteur philosophique", 'Exposer sur un thème donné',
                'Dire citron vert à la fin de chacune de ses phrases pendant 1h',
                'Animer un petit cours de yoga', 'Compter les fourmis', "Freeze quelqu'un",
                'Présenter 5 expressions canadiennes', 'Se faire laver sa popote',
                'Passer la journée avec un caillou ou un objet en plus avec lui',
                'Préparer un stock de blagues nulles et les dire sur demande',
                "Faire une déclaration d'amour humoristique à un arbre",
                "Écrire une lettre d'excuses... en rimes !",
                'Tenir une pancarte et rester immobile pendant 3 minutes']
        },
        {
            page: 'pages/regles.html', cat: 'Règles de vie', emoji: '📜',
            items: ["Présentation de l'équipe", 'Objectif du séjour', 'Boîte à idées',
                'Venez comme vous êtes', 'Respect', 'Hygiène', 'Alimentation', 'TADS',
                'Médicaments', 'Portables et réseaux sociaux', 'Blog et photos', 'Journée type',
                'Hygiène et besoins perso', 'Organisation des repas', 'Ponctualité', 'Questions']
        },
        {
            page: 'pages/nourriture.html', cat: 'Nourriture en camp', emoji: '🍽️',
            items: ['Salade de pâtes froides', 'Salade de pommes de terre', 'Salade tomates-mozzarella',
                'Salade de riz', 'Salade de lentilles', 'Salade verte classique', 'Pâtes chaudes',
                'Semoule / Couscous', 'Wraps/Burritos', 'Quiche', 'Omelettes géantes',
                'Croque-monsieur / paninis', 'Chili con carne', 'Riz sauté/ légumes',
                'Poisson pané', 'Hamburgers maison', 'Galettes de sarrasin',
                'Taboulé (industriel ou maison selon matos dispo)', 'Poêlée',
                'Salade de pois chiches', 'Quenelles', 'Yaourts', 'Fruits', 'Gâteaux maison',
                'Crêpes ou gaufres', 'Fromage blanc', 'Salade de fruits', 'Biscuits variés',
                'Gaufre', 'Barres de céréales', 'Pains au lait / brioche / tartines',
                'Fruits secs', 'Chocolat chaud maison', 'Chamalows grillés',
                'Banane chocolat/nutella au feu de camp', 'Popcorn', 'Brochettes sucrées']
        }
    ];

    var index = [];
    pages.forEach(function (p) {
        p.items.forEach(function (name) {
            index.push({ name: name, page: p.page, slug: slugify(name), cat: p.cat, emoji: p.emoji });
        });
    });
    return index;
})();

/**
 * Initialise la barre de recherche si l'utilisateur est connecté et non banni.
 * Appelé depuis main.js → loadFirebaseAndInit() sur index.html uniquement.
 */
function initGameSearch() {
    if (!window.auth || !window.db) return;

    auth.onAuthStateChanged(function (user) {
        if (!user) return; // non connecté : on ne montre rien

        db.collection('users').doc(user.uid).get().then(function (doc) {
            if (!doc.exists) return;
            var data = doc.data();
            if (data.banned === true) return; // banni : on ne montre rien

            // Utilisateur connecté et non banni : afficher la barre
            var container = document.getElementById('search-bar-container');
            if (container) container.style.display = 'block';

            setupGameSearchUI();
        }).catch(function (err) {
            console.error('Erreur vérification utilisateur (recherche):', err);
        });
    });
}

/**
 * Branche les événements sur le champ de recherche et le dropdown.
 */
function setupGameSearchUI() {
    var input = document.getElementById('game-search-input');
    var results = document.getElementById('game-search-results');
    if (!input || !results) return;

    var keyboardIndex = -1;

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function highlightMatch(name, query) {
        var q = query.trim();
        if (!q) return escapeHtml(name);
        var normalizedName = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        var normalizedQuery = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        var idx = normalizedName.indexOf(normalizedQuery);
        if (idx === -1) return escapeHtml(name);
        var before = escapeHtml(name.substring(0, idx));
        var match = escapeHtml(name.substring(idx, idx + q.length));
        var after = escapeHtml(name.substring(idx + q.length));
        return before + '<mark>' + match + '</mark>' + after;
    }

    function renderResults(query) {
        var q = query.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (!q) {
            results.classList.remove('active');
            results.innerHTML = '';
            keyboardIndex = -1;
            return;
        }

        var filtered = GAMES_INDEX.filter(function (item) {
            var n = item.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            var c = item.cat.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            return n.includes(q) || c.includes(q);
        }).slice(0, 30);

        keyboardIndex = -1;

        if (filtered.length === 0) {
            results.innerHTML = '<div class="search-no-results">Aucun résultat pour « <strong>' + escapeHtml(query.trim()) + '</strong> »</div>';
        } else {
            results.innerHTML = filtered.map(function (item, i) {
                return '<a class="search-result-item" href="' + item.page + '#' + item.slug + '" data-idx="' + i + '" role="option" tabindex="-1">'
                    + '<span class="search-result-cat">' + item.emoji + ' ' + escapeHtml(item.cat) + '</span>'
                    + '<span class="search-result-name">' + highlightMatch(item.name, query) + '</span>'
                    + '<i class="bi bi-arrow-right search-result-arrow"></i>'
                    + '</a>';
            }).join('');
        }

        results.classList.add('active');
    }

    function updateKeyboardFocus() {
        var items = results.querySelectorAll('.search-result-item');
        items.forEach(function (el, i) {
            el.classList.toggle('keyboard-focused', i === keyboardIndex);
        });
        if (keyboardIndex >= 0 && items[keyboardIndex]) {
            items[keyboardIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    input.addEventListener('input', function () { renderResults(input.value); });

    input.addEventListener('keydown', function (e) {
        var items = results.querySelectorAll('.search-result-item');
        if (!items.length) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            keyboardIndex = Math.min(keyboardIndex + 1, items.length - 1);
            updateKeyboardFocus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            keyboardIndex = Math.max(keyboardIndex - 1, -1);
            updateKeyboardFocus();
        } else if (e.key === 'Enter') {
            if (keyboardIndex >= 0 && items[keyboardIndex]) items[keyboardIndex].click();
        } else if (e.key === 'Escape') {
            results.classList.remove('active');
            results.innerHTML = '';
            keyboardIndex = -1;
        }
    });

    // Fermer au clic extérieur
    document.addEventListener('click', function (e) {
        if (!input.contains(e.target) && !results.contains(e.target)) {
            results.classList.remove('active');
            keyboardIndex = -1;
        }
    });

    // Rouvrir si refocus avec du texte
    input.addEventListener('focus', function () {
        if (input.value.trim()) renderResults(input.value);
    });
}

/*--------------------------------------------------------------
# Injection d'IDs sur les <li> de jeux (pages de contenu)
# Permet le défilement vers l'ancre après un clic sur un résultat de recherche
--------------------------------------------------------------*/
document.addEventListener('DOMContentLoaded', function () {
    var isContentPage = window.location.pathname.includes('/pages/');
    if (!isContentPage) return;

    // Injecter un id="slug-du-nom" sur chaque <li> qui commence par un <b>
    var listItems = document.querySelectorAll('.categories li');
    listItems.forEach(function (li) {
        var firstB = li.querySelector(':scope > b');
        if (!firstB) return;
        var rawName = firstB.textContent.trim();
        if (!rawName) return;
        var slug = rawName
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s-]/g, ' ')
            .trim()
            .replace(/[\s_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-+|-+$/g, '');
        if (slug && !li.id) {
            li.id = slug;
        }
    });

    // Si l'URL contient une ancre, faire défiler vers l'élément
    if (window.location.hash) {
        var targetId = window.location.hash.substring(1);
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
            setTimeout(function () {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash vert bref pour signaler l'élément
                targetEl.style.transition = 'background 0.3s ease';
                targetEl.style.background = 'rgba(39, 174, 96, 0.14)';
                setTimeout(function () {
                    targetEl.style.background = '';
                }, 2000);
            }, 350);
        }
    }
});
