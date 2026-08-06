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
 * Index statique et enrichi de tous les jeux et items du site.
 * Chaque objet comporte : { name, page, slug, cat, emoji, desc, keywords }
 */
var GAMES_INDEX = (function () {
    var rawData = [
        {
            page: 'pages/presentation.html', cat: 'Jeux présentation', emoji: '🤝',
            items: [
                { n: 'Acrostiches', d: 'Écrire son prénom verticalement et trouver des mots qualificatifs' },
                { n: 'Avis de tempête', d: 'Changer de place selon des critères annoncés (chaussures rouges, etc.)' },
                { n: 'Boule de neige', d: 'Répéter les prénoms de tous les participants précédents pour mémoriser' },
                { n: "Carte d'identité", d: 'Échanger en binôme puis dessiner le visage de l’autre' },
                { n: "Chef d'orchestre", d: 'Imiter le chef en rythme sans se faire démasquer par le devineur' },
                { n: 'Dans ma colo il y a...', d: 'Répéter le nom des participants dans l’ordre pour travailler la mémoire' },
                { n: 'Jeu du disparu', d: 'Une personne quitte le groupe discrètement, deviner qui manque' },
                { n: "Jeux de l'évolution", d: 'Mime œuf, poussin, poule, coq, dinosaure avec chifoumi' },
                { n: 'Killer', d: 'Jeu de rôle d’élimination secrète avec cible attribuée' },
                { n: 'Le funambule', d: 'Se classer selon des critères (taille, âge, frères et sœurs)' },
                { n: 'Le signe', d: 'Passer la balle virtuelle en reproduisant le signe d’un camarade' },
                { n: 'Lucky Luke', d: 'Jeu de réflexe et rapidité en duel au signal sonore' },
                { n: 'Point commun', d: 'En duo, trouver 7 points communs originaux entre vous' },
                { n: 'Présentation théâtrale', d: 'Mettre en scène son prénom de façon drôle et originale' },
                { n: 'Présente ton voisin', d: 'Présenter son binôme au groupe après 2 minutes d’échange' },
                { n: 'Qui est-ce ?', d: 'Devinettes basées sur les caractéristiques physiques ou goûts' }
            ]
        },
        {
            page: 'pages/semaine.html', cat: 'Jeux fil rouge', emoji: '📅',
            items: [
                { n: 'Secret Anim', d: 'Chaque participant reçoit un secret à garder pendant tout le séjour' },
                { n: 'Gorille Cacahuète / Ange Démon', d: 'Missions secrètes et bienveillantes à réaliser pour son filleul' },
                { n: 'Plaît-il ?', d: 'Jeu verbal d’attention à placer discrètement en conversation' },
                { n: 'Secret Story', d: 'Découvrir les secrets attribués aux animateurs ou jeunes' },
                { n: 'Jeu de la pince à linge (version 1)', d: 'Accrocher discrètement une pince à linge sur quelqu’un' },
                { n: 'Jeu de la Pince à Linge (version 2)', d: 'Variante avec missions et éliminations par pince à linge' },
                { n: 'Le Killer', d: 'Faire réaliser une action absurde à sa cible pour l’éliminer' },
                { n: 'Passeport', d: 'Faire tamponner ou valider son passeport de colo au fil des épreuves' },
                { n: 'Cacher 100 canards miniatures', d: 'Retrouver 100 petits canards dissimulés dans le centre' }
            ]
        },
        {
            page: 'pages/animateur.html', cat: 'Jeux animateurs', emoji: '🧢',
            items: [
                { n: "C'est-à-dire ?", d: 'Dire "c’est-à-dire" un maximum de fois sans se faire démasquer' },
                { n: 'Contact', d: 'Deviner un mot secret par association d’idées et réflexe' },
                { n: 'Jeu de la pince à linge', d: 'Piéger les autres animateurs avec une pince à linge dans le dos' },
                { n: 'Grosse dinde', d: 'Jeu de défi et de comédie entre anims' },
                { n: "Pan Pan c'est toi l'Élan", d: 'Jeu de mime et réflexes entre animateurs' },
                { n: 'Le Chevreuil', d: 'Jeu d’observation et de réflexe rapide' },
                { n: "Pour un M&M's rouge", d: 'Réaliser un gage en échange d’un bonbon M&M’s rouge' },
                { n: 'Nouveau dans une colo', d: 'Envoyer le nouvel anim chercher de la peinture écossaise' },
                { n: 'Devine le gateau', d: 'Décrire un autre anim sous forme de recette de pâtisserie' }
            ]
        },
        {
            page: 'pages/quotidien.html', cat: 'Vie quotidienne', emoji: '🏠',
            items: [
                { n: 'Affichage', d: 'Panneau décompte des jours avant le départ' },
                { n: 'Appel papier', d: 'Vérification quotidienne des présences le matin' },
                { n: 'Bingo des émotions', d: 'Exprimer et afficher son humeur du jour' },
                { n: 'Caméra cachée humoristique', d: 'Filmer des saynètes drôles pour la vie de groupe' },
                { n: 'Check lapin à demain !', d: 'Rituel du soir sympa avant le coucher' },
                { n: 'Échelle du bruit', d: 'Indicateur visuel du niveau sonore au réfectoire' },
                { n: 'Énigme journalière', d: 'Devinette quotidienne affichée au centre' },
                { n: 'Faire la chenille / le petit train', d: 'Déplacement joyeux en groupe pour aller manger' },
                { n: 'Faire signer les règles de vie', d: 'Faire adhérer les enfants à la charte du séjour' },
                { n: 'Gommette des râleurs', d: 'Gage amusant pour limiter les plaintes' },
                { n: 'Je passe le téléphone à...', d: 'Vidéo bilan amusante de fin de camp' },
                { n: 'Jeu de la minute', d: 'Petits défis de 60 secondes pour combler les temps morts' },
                { n: 'Jeu de liaison', d: 'Parler sans faire de liaisons sous peine de gage' },
                { n: "Jeu de l'écureuil", d: 'Protéger ses élastiques/noisettes durant la journée' },
                { n: 'Jeu de logique', d: 'Énigmes et devinettes à règles invisibles' },
                { n: 'Jeu Intellectuels', d: 'Passe-temps et casse-têtes imprimés' },
                { n: 'Musique de 2 min', d: 'Chanson chronomètre pour le brossage des dents' },
                { n: 'Panneau principal', d: 'Météo, programme et annonces du jour' },
                { n: 'PPCC', d: 'Pyjama, Pull, Chaussettes, Chaussons pour le coucher' },
                { n: 'Présentation journée', d: 'Météo, fête du jour et annonce du programme au petit-déj' },
                { n: 'Règle du silence', d: 'Heure calme à respecter après 22h30' },
                { n: 'Snap Game', d: 'Jeu de rapidité et d’observation quotidienne' },
                { n: 'Trombinoscope des animateurs', d: 'Affiche photos et prénoms de toute l’équipe d’animation' }
            ]
        },
        {
            page: 'pages/activites.html', cat: 'Activités', emoji: '⚽',
            items: [
                { n: 'Assiette de farine', d: 'Objet caché sous la farine à attraper sans les mains' },
                { n: 'Balle à 10', d: 'Attendre 10 passes consécutives en équipe sans perdre le ballon' },
                { n: 'Balle Américaine', d: 'Esquiver et toucher les adversaires avec le ballon' },
                { n: 'Ballon prisonnier', d: 'Délivrer ses coéquipiers en touchant le camp adverse' },
                { n: 'La banquise', d: 'Rester debout en groupe sur une nappe qu’on plie' },
                { n: 'Bataille navale', d: 'Jeu de grille géant par équipe (touché coulé)' },
                { n: 'Béret', d: 'Attraper le foulard au centre quand son numéro est appelé' },
                { n: 'Blind Bretz', d: 'Dégustation à l’aveugle de gâteaux apéro et chips' },
                { n: 'Brookmaker', d: 'Parier des points sur les champions de son équipe' },
                { n: 'La cabane au trésor', d: 'Protéger son camp et voler les trésors adverses' },
                { n: 'Cache-cache traditionnelle', d: 'Un chercheur et des joueurs cachés dans la zone' },
                { n: 'Capture de drapeau', d: 'Ramener le drapeau ennemi dans sa base sans se faire toucher' },
                { n: 'Chasse Surprise', d: 'Retrouver des objets cachés associés à des bonus/gages' },
                { n: 'Chasseur-chassé', d: 'Faire 5 pas avec le ballon pour viser les adversaires' },
                { n: 'Le code', d: 'Décoder des nombres grâce aux positions du corps' },
                { n: 'Cuisine', d: 'Atelier gâteaux, crêpes et recettes sucrées' },
                { n: "Course d'orientation", d: 'Retrouver des balises avec carte et boussole' },
                { n: 'Course en sac', d: 'Sauter dans un sac de jute jusqu’à la ligne d’arrivée' },
                { n: 'Dauphin dauphine', d: 'Lancer le ballon en criant un prénom' },
                { n: 'Dessin et coloriage en peinture avec des points', d: 'Pointillisme coton-tige' },
                { n: 'La queue du diable', d: 'Attraper les foulards accrochés dans le dos des autres' },
                { n: 'Le dessin magique', d: 'Reproduire un dessin fait sur le dos du voisin' },
                { n: 'Douanier contrebandier', d: 'Passer la frontière sans se faire fouiller par la douane' },
                { n: "L'emmêlage", d: 'Démêler une chaîne humaine en se tenant les mains' },
                { n: 'Épervier', d: 'Traverser le terrain sans se faire attraper par l’épervier' },
                { n: 'Football indien', d: 'Variante originale du football avec règles spéciales' },
                { n: 'Gobelin chasseur', d: 'Jeu de traque et de cache-cache dans la nature' },
                { n: "L'horloge", d: 'Faire tourner le ballon autour de l’équipe plus vite que le coureur' },
                { n: 'Jeu de piste', d: 'Enquête et énigmes à suivre d’indice en indice' },
                { n: 'Jeu du dictionnaire', d: 'Inventer de fausses définitions crédibles' },
                { n: 'Jeu des 5 secondes', d: 'Citer 3 réponses en moins de 5 secondes' },
                { n: "Jeux de vente d'un produit", d: 'Improviser un téléachat absurde sur un objet usuel' },
                { n: 'Jeux du bazar', d: 'Épreuves rapides de collecte d’objets insolites' },
                { n: 'Jeux photographiques', d: 'Reconstituer des angles de vue ou photos mystères' },
                { n: 'Kim goût', d: 'Deviner les aliments les yeux bandés' },
                { n: 'Kim goût spéciale marque VS sous marque', d: 'Comparer soda ou gâteaux' },
                { n: 'Koh-Lanta', d: 'Grand jeu d’aventure, totem, poteaux et dégustations' },
                { n: 'Liste des défis', d: 'Compléter un maximum de défis loufoques en équipe' },
                { n: 'Loto', d: 'Tirage de numéros et grilles avec lots sympas' },
                { n: 'La mouche', d: 'Jeu de réflexe et tape-mains collectif' },
                { n: 'Mario Kart ballon', d: 'Course avec ballons de baudruche accrochés aux chevilles' },
                { n: 'Olympiades', d: 'Tournoi multi-épreuves sportives et ludiques' },
                { n: 'Parcours du combattant avec mise', d: 'Parcours d’obstacles chronométré' },
                { n: 'Poule Renard Vipère', d: 'Jeu de poursuite en triangle avec foulards' },
                { n: 'Puissance 4 grandeur nature', d: 'Aligner 4 pions en courant poser des chasubles' },
                { n: 'Le psychiatre', d: 'Deviner la règle comportementale adoptée par le groupe' },
                { n: 'Renforcement musculaire', d: 'Séance de fitness drôle et dynamique' },
                { n: 'Relais classique', d: 'Course de vitesse par équipes avec témoin' },
                { n: 'Relais éponge', d: 'Remplir une bouteille en transportant de l’eau à l’éponge' },
                { n: 'Sagamore', d: 'Jeu de rôle en forêt avec chef, sorcier et cartes' },
                { n: 'Sardine', d: 'Cache-cache inversé : tout le monde rejoint la sardine' },
                { n: 'La savane silencieuse', d: 'Avancer en silence sans se faire repérer par le gardien' },
                { n: 'Le sculpteur', d: 'Placer ses camarades dans des poses artistiques' },
                { n: 'Splatoon', d: 'Bataille d’eau et de peinture colorée par équipes' },
                { n: 'Switch', d: 'Changer de place au signal sans se faire voler sa chaise' },
                { n: 'Taureau', d: 'Le taureau au centre tente de couper la trajectoire du ballon' },
                { n: 'La thèque', d: 'Baseball adapté avec batte et tours de terrain' },
                { n: 'La tomate', d: 'Faire passer la balle entre les jambes du cercle à deux mains' },
                { n: 'Tomate ketchup', d: 'Variante de la marelle et chase-poursuite' },
                { n: 'Vitamine', d: 'Jeu de réflexe et d’énergie matinale' },
                { n: 'Le zombie', d: 'Contamination progressive par les zombies en zone délimitée' },
                { n: '1,2,3 Soleil', d: 'Avancer vers le meneur et s’immobiliser quand il se retourne' },
                { n: 'Jacques a dit / Faire ça', d: 'Suivre les ordres seulement si précédés de "Jacques a dit"' },
                { n: 'Les 5 sens', d: 'Parcours d’éveil olfactif, tactile et sonore' },
                { n: 'Béret soleil', d: 'Béret simplifié adapté aux plus jeunes' },
                { n: 'Chaise musicale', d: 'Tourner en musique et trouver une chaise quand elle s’arrête' },
                { n: 'Chat perché', d: 'Ne pas se faire toucher si l’on est perché en hauteur' },
                { n: 'Colin-maillard', d: 'Attraper et reconnaître ses camarades les yeux bandés' },
                { n: 'La corde à sauter collective', d: 'Sauter ensemble sur une grande corde' },
                { n: 'La marelle', d: 'Jeu de lancer de caillou et parcours à cloche-pied' },
                { n: "L'Île aux requins", d: 'S’abriter sur les tapis avant l’attaque du requin' },
                { n: 'Loup touche-touche', d: 'Jeu de loup classique pour se dépenser' },
                { n: 'Loup bougie', d: 'Souffler la bougie virtuelle pour libérer les joueurs' },
                { n: 'Loup couleur', d: 'Se protéger en touchant la couleur annoncée' },
                { n: 'Loup glacé', d: 'Se figer une fois touché jusqu’à délivrance' },
                { n: 'Pizza loup touche-touche', d: 'Se coucher au sol en forme de part de pizza pour être sauvé' },
                { n: 'Relai animaux', d: 'Courir en imitant la démarche des animaux' },
                { n: 'Relai lilypad', d: 'Traverser le marais sur des nénuphars en carton' },
                { n: 'Safari', d: 'Observer et photographier les animaux cachés' },
                { n: 'Traversée de la rivière', d: 'Utiliser deux cerceaux pour traverser sans toucher le sol' },
                { n: "Jeux des empreintes d'animaux", d: 'Associer les empreintes aux bons animaux' },
                { n: 'Marin pêcheur', d: 'Attraper les poissons qui traversent le filet' },
                { n: 'Troc Patate', d: 'Échanger une pomme de terre en ville contre l’objet le plus précieux' },
                { n: 'Rallye Photo', d: 'Retrouver des détails architecturaux ou monuments en ville' },
                { n: 'Quartier libre', d: 'Temps shopping et balade encadré en ville' },
                { n: 'Pékin Express', d: 'Jeu de course et stop virtuel avec épreuves en ville' },
                { n: 'Pac Man', d: 'Parcours dans les rues comme sur le quadrillage de Pac-Man' }
            ]
        },
        {
            page: 'pages/veillees.html', cat: 'Veillées', emoji: '🌙',
            items: [
                { n: '3 emojis → 1 série', d: 'Deviner les films ou séries à partir de 3 emojis' },
                { n: '10/10', d: 'Jeu d’observation et d’association questions/visages' },
                { n: 'Audience télévisée', d: 'Émissions TV parodiques jouées par les équipes' },
                { n: 'Bain de minuit', d: 'Baignade nocturne encadrée en piscine pour ados' },
                { n: 'Boom de fin de séjour', d: 'Soirée dansante, musique, DJ et boissons' },
                { n: 'Carré magique', d: 'Reconstituer une grille de déguisements et couleurs' },
                { n: 'Concept YouTube', d: 'Alibi, imposteur, le pire du pire ou défis vidéo' },
                { n: 'Connaissez-vous vos anims ?', d: 'Deviner quelle anecdote appartient à quel animateur' },
                { n: "Concours d'annecdote", d: 'Découvrir le vrai du faux sur les anecdotes du groupe' },
                { n: 'Conte animé', d: 'Histoire racontée et jouée en direct par les jeunes' },
                { n: 'Conte & théâtre', d: 'Parodie théâtrale d’un conte traditionnel' },
                { n: 'Devine le bébé', d: 'Reconnaître les photos d’enfance des animateurs et jeunes' },
                { n: 'Écureuil', d: 'Protéger ses noisettes au centre avec les yeux bandés' },
                { n: 'Fureur', d: 'Blind test musical, karaoké et chansons à compléter' },
                { n: 'In the dark', d: 'Jeu de rôle et débat dans le noir pour 15 personnes' },
                { n: 'Karaoké', d: 'Chanter ses tubes préférés micro en main' },
                { n: "L'empire", d: 'Retrouver les identités secrètes des joueurs pour créer un empire' },
                { n: "L'homme en noir", d: 'Reconstituer une combinaison de couleurs mystères' },
                { n: 'La colo à un incroyable talent', d: 'Spectacle de talents (danse, magie, chant)' },
                { n: 'La vente aux enchères', d: 'Enchérir avec des jetons sur des objets mystères ou défis' },
                { n: 'Loup Garou classique', d: 'Jeu de déduction nocturne : villageois vs loups-garous' },
                { n: 'Loup Garou extension', d: 'Variante avec Cupidon, Corbeau, Salvador et Sorcière' },
                { n: 'Loup Garou sans loup garou', d: 'Le maître du jeu choisit secrètement les loups' },
                { n: 'Montée descente', d: 'Répondre aux questions de culture générale pour monter d’étage' },
                { n: 'Pyramide des défis', d: 'Gravir les échelons en réussissant des mini-épreuves' },
                { n: 'Pyramide des défis version Mille Bornes', d: 'Course automobile avec attaques et parades' },
                { n: 'Quiz Event', d: 'Reconnaître des événements historiques à partir d’audios' },
                { n: 'Quiz Corse', d: 'Quiz interactif avec classement évolutif' },
                { n: 'Quiz Kahoot sur le séjour', d: 'Questionnaire interactif sur smartphone/écran' },
                { n: 'Quiz Français', d: 'Retrouver la chanson d’origine traduite mot à mot en français' },
                { n: 'Quiz Québécois', d: 'Deviner les titres québécois des films célèbres' },
                { n: 'Quiz Identité Célébrité', d: 'Retrouver le vrai nom des stars et artistes' },
                { n: 'Soirée cabaret', d: 'Saynètes, impros, magie et serveur en tenue' },
                { n: 'Soirée casino', d: 'Blackjack, roulette, poker avec jetons factices' },
                { n: 'Soirée cinéma', d: 'Projection d’un film sur grand écran avec popcorn' },
                { n: 'Spectacle', d: 'Contes et représentations théâtrales d’animateurs' },
                { n: 'Tele Quiz', d: 'Affrontement entre deux équipes sur plateau TV' },
                { n: 'Timeline', d: 'Placer des découvertes ou événements dans l’ordre chronologique' },
                { n: 'Two Rooms and a Boom', d: 'Jeu de rôle secret et négociations entre deux salles' },
                { n: 'Undercover', d: 'Trouver l’intrus qui possède un mot légèrement différent' },
                { n: 'Veillée cluedo/enquête', d: 'Enquête policière grandeur nature avec suspects' },
                { n: 'Veillée libre', d: 'Choix libre d’ateliers et jeux de société en soirée' }
            ]
        },
        {
            page: 'pages/manuels.html', cat: 'Activités manuelles', emoji: '✂️',
            items: [
                { n: '365 jours / jouets', d: 'Créations en matériaux de récupération et carton' },
                { n: 'Bâton boîte œuf fleur', d: 'Bricolage fleurs avec boîtes d’œufs' },
                { n: 'Bonhomme de neige avec bouchon blanc', d: 'Déco hivernale zéro déchet' },
                { n: 'Boule à neige avec pot laitière vanille', d: 'Créer une boule à neige étanche avec paillettes' },
                { n: 'Carte au trésor avec du café', d: 'Vieillir du papier avec du jus de café' },
                { n: 'Carte de vœux', d: 'Fabrication de cartes personnalisées avec pliages' },
                { n: "Carte avec de la 3D à l'intérieur", d: 'Effet pop-up à l’ouverture' },
                { n: 'Carte Pokémon', d: 'Dessiner et créer ses propres cartes de jeu' },
                { n: 'Chapeau mexicain (Land Art)', d: 'Tressage végétal et assemblage naturel' },
                { n: 'Comète', d: 'Fabriquer une comète volante avec rubans et balle' },
                { n: "Création d'un petit livre petite histoire", d: 'Écrire et relier un mini-livre illustré' },
                { n: 'Dessins', d: 'Atelier dessin libre et techniques de coloriage' },
                { n: 'Dessin pâtes dessins', d: 'Collage de coquillettes et penne peintes' },
                { n: 'Dessin recto verso', d: 'Illusions d’optique et dessins animés à tourner' },
                { n: 'Enveloppe avec mot secret porte-bonheur', d: 'Pliage d’enveloppe personnalisée' },
                { n: 'Faire un lion avec assiette en papier', d: 'Masque d’animal avec franges en laine' },
                { n: 'Galette des rois en papier', d: 'Couronne et galette en papier crépon' },
                { n: 'Grande roue en papier', d: 'Maquette rotative en carton et piques' },
                { n: 'Imprimer dessin Kapla', d: 'Construire à partir de modèles de plan' },
                { n: 'Imprimer une petite image', d: 'Transfers et décalcomanies sur supports' },
                { n: 'Jeux de société personnalisé', d: 'Créer son plateau de jeu de l’oie ou petits chevaux' },
                { n: 'Land Art', d: 'Œuvres éphémères réalisées en forêt avec bois et feuilles' },
                { n: 'Maquillage', d: 'Atelier grimage pour grands jeux et fées' },
                { n: 'Origami', d: 'Pliages japonais traditionnels (grenouille, avion, cocotte)' },
                { n: "P'tit bac", d: 'Fabrication de grille personnalisée pour petit bac' },
                { n: 'Petit chevaux grandeur nature', d: 'Tracer un plateau de jeu géant à la craie' },
                { n: 'Pâtes à modeler', d: 'Sculpture colorée et pâte à sel' },
                { n: 'Plâtre', d: 'Moulages en plâtre et peinture de figurines' },
                { n: 'Pixel Art avec peinture', d: 'Reproduction de personnages rétro sur grille' },
                { n: 'Pyrogravure', d: 'Gravure au pyrograveur sur morceaux de bois' },
                { n: 'Puzzle', d: 'Créer son propre puzzle en découpant une peinture' },
                { n: 'Puzzle sur un carton', d: 'Découper des pièces de carton fort' },
                { n: 'Tour feutre en 3D', d: 'Dessiner avec effet de relief et ombrages' },
                { n: 'Voiture en carton pour Mille Bornes', d: 'Fabriquer des véhicules miniatures roulants' },
                { n: 'Chanson karaoke', d: 'Écriture de paroles personnalisées sur chanson connue' }
            ]
        },
        {
            page: 'pages/calme.html', cat: 'Retour au calme', emoji: '🧘',
            items: [
                { n: 'Around the world', d: 'Chanson douce pour temps calme et relaxation' },
                { n: 'Diamont', d: 'Musique apaisante pour accompagnement du sommeil' },
                { n: 'En feu', d: 'Retour au calme en musique de fin de journée' },
                { n: 'Harder Better Faster Stronger', d: 'Ecoute musicale posée' },
                { n: 'La scène', d: 'Exercice d’expression corporelle calme' },
                { n: 'Le magicien (si -8 ans)', d: 'Conte hypnotique et relaxation imaginaire' },
                { n: 'Papaoutai', d: 'Playlist d’écoute posée' },
                { n: 'Playlist', d: 'Sélection de morceaux zen pour la sieste ou temps calme' },
                { n: 'Simple basique', d: 'Ecoute et échanges tranquilles' },
                { n: 'Statue', d: 'Immobilisation corporelle et contrôle du souffle' }
            ]
        },
        {
            page: 'pages/gage.html', cat: 'Idées de gages', emoji: '🚫',
            items: [
                { n: 'Faire 150 pompes en 24h', d: 'Répartir 150 pompes sur toute une journée' },
                { n: 'Laver la popote de toute la colo', d: 'Gage vaisselle collective' },
                { n: 'Ne pas utiliser son téléphone toute la journée', d: 'Diète numérique 24h' },
                { n: 'Répondre en chantant pendant 2h', d: 'Chanter toutes ses interventions orales' },
                { n: 'Chanter Titanic a cappella', d: 'Interprétation solo sans musique déguisé' },
                { n: "Apprendre et réciter l'alphabet à l'envers", d: 'Réciter de Z à A sans faute' },
                { n: 'Apprendre et réciter une poésie choisie par le groupe', d: 'Mémorisation de texte' },
                { n: "Expliquer des citations d'auteur philosophique", d: 'Exposé court philosophique' },
                { n: 'Exposer sur un thème donné', d: 'Présentation sur la région ou sujet loufoque' },
                { n: 'Dire citron vert à la fin de chacune de ses phrases pendant 1h', d: 'Répétition de mot mystère' },
                { n: 'Animer un petit cours de yoga', d: 'Diriger une séance d’étirements pour le groupe' },
                { n: 'Compter les fourmis', d: 'Gage d’observation absurde' },
                { n: "Freeze quelqu'un", d: 'Immobiliser un camarade au toucher' },
                { n: 'Présenter 5 expressions canadiennes', d: 'Recherche linguistique québécoise drôle' },
                { n: 'Se faire laver sa popote', d: 'Bonus : laisser un camarade faire sa vaisselle' },
                { n: 'Passer la journée avec un caillou ou un objet en plus avec lui', d: 'Garder un caillou précieux' },
                { n: 'Préparer un stock de blagues nulles et les dire sur demande', d: 'Raconter des devinettes' },
                { n: "Faire une déclaration d'amour humoristique à un arbre", d: 'Plaidoirie passionnée théâtrale' },
                { n: "Écrire une lettre d'excuses... en rimes !", d: 'Rédiger un poème d’excuses' },
                { n: 'Tenir une pancarte et rester immobile pendant 3 minutes', d: 'Statue contemporaine' }
            ]
        },
        {
            page: 'pages/regles.html', cat: 'Règles de vie', emoji: '📜',
            items: [
                { n: "Présentation de l'équipe", d: 'Connaître les rôles de chaque animateur' },
                { n: 'Objectif du séjour', d: 'Passer les meilleures vacances ensemble' },
                { n: 'Boîte à idées', d: 'Proposer ses envies d’activités' },
                { n: 'Venez comme vous êtes', d: 'Inclusion, tolérance et respect de la diversité' },
                { n: 'Respect', d: 'Règles du vivre-ensemble et politesse' },
                { n: 'Hygiène', d: 'Douches, propreté et rangement des chambres' },
                { n: 'Alimentation', d: 'Goûter à tout, zéro gaspillage et tri' },
                { n: 'TADS', d: 'Tabac, Alcool, Drogue et Sexualité (prévention)' },
                { n: 'Médicaments', d: 'Stockage sécurisé à l’infirmerie' },
                { n: 'Portables et réseaux sociaux', d: 'Utilisation raisonnée hors activités' },
                { n: 'Blog et photos', d: 'Droit à l’image et nouvelles aux familles' },
                { n: 'Journée type', d: 'Horaires repas, veillées et coucher' },
                { n: 'Hygiène et besoins perso', d: 'Autonomie et hygiène quotidienne' },
                { n: 'Organisation des repas', d: 'Service, débarrassage et ambiance' },
                { n: 'Ponctualité', d: 'Respect des heures de rassemblement' },
                { n: 'Questions', d: 'Échanges ouverts avec l’équipe' }
            ]
        },
        {
            page: 'pages/nourriture.html', cat: 'Nourriture en camp', emoji: '🍽️',
            items: [
                { n: 'Salade de pâtes froides', d: 'Repas camp frais rapide pique-nique' },
                { n: 'Salade de pommes de terre', d: 'Salade composée idéale pour grands groupes' },
                { n: 'Salade tomates-mozzarella', d: 'Entrée fraîche d’été' },
                { n: 'Salade de riz', d: 'Riz, thon, maïs et dés de fromage' },
                { n: 'Salade de lentilles', d: 'Plat protéiné sain pour le camp' },
                { n: 'Salade verte classique', d: 'Vinaigrette maison' },
                { n: 'Pâtes chaudes', d: 'Pâtes bolognaise, pesto ou carbonara' },
                { n: 'Semoule / Couscous', d: 'Plat chaud complet pour la colo' },
                { n: 'Wraps/Burritos', d: 'Galettes garnies froides ou chaudes' },
                { n: 'Quiche', d: 'Quiche lorraine ou légumes maison' },
                { n: 'Omelettes géantes', d: 'Œufs brouillés ou omelette aux fines herbes' },
                { n: 'Croque-monsieur / paninis', d: 'Jambon fromage grillé au four' },
                { n: 'Chili con carne', d: 'Plat mexicain épicé en grande quantité' },
                { n: 'Riz sauté/ légumes', d: 'Riz cantonnais végétarien' },
                { n: 'Poisson pané', d: 'Filet de colin pané et purée' },
                { n: 'Hamburgers maison', d: 'Soirée burgers frites pour le groupe' },
                { n: 'Galettes de sarrasin', d: 'Soirée crêperie bretonne' },
                { n: 'Taboulé (industriel ou maison selon matos dispo)', d: 'Entrée fraîche' },
                { n: 'Poêlée', d: 'Légumes et pommes de terre rissolées' },
                { n: 'Salade de pois chiches', d: 'Salade fraîche et complète' },
                { n: 'Quenelles', d: 'Quenelles sauce tomate au four' },
                { n: 'Yaourts', d: 'Desserts produits laitiers' },
                { n: 'Fruits', d: 'Pommes, bananes, oranges et fruits de saison' },
                { n: 'Gâteaux maison', d: 'Gâteau au chocolat ou yaourt cuisiné par les enfants' },
                { n: 'Crêpes ou gaufres', d: 'Grand goûter fête de colo' },
                { n: 'Fromage blanc', d: 'Servi avec sucre ou coulis' },
                { n: 'Salade de fruits', d: 'Fruits frais découpés en dés' },
                { n: 'Biscuits variés', d: 'Goûter rapide en sortie' },
                { n: 'Gaufre', d: 'Goûter gourmand avec sucre glace' },
                { n: 'Barres de céréales', d: 'En-cas pour randonnée' },
                { n: 'Pains au lait / brioche / tartines', d: 'Petit-déjeuner et goûter' },
                { n: 'Fruits secs', d: 'Amandes et raisins pour le plein d’énergie' },
                { n: 'Chocolat chaud maison', d: 'Boisson réconfortante après veillée' },
                { n: 'Chamalows grillés', d: 'Guimauves dorées au feu de camp' },
                { n: 'Banane chocolat/nutella au feu de camp', d: 'Dessert fondant dans les braises' },
                { n: 'Popcorn', d: 'Soirée cinéma popcorn maison' },
                { n: 'Brochettes sucrées', d: 'Brochettes de bonbons ou fruits' }
            ]
        }
    ];

    var index = [];
    rawData.forEach(function (p) {
        p.items.forEach(function (itemObj) {
            index.push({
                name: itemObj.n,
                desc: itemObj.d || '',
                page: p.page,
                slug: slugify(itemObj.n),
                cat: p.cat,
                emoji: p.emoji,
                keywords: (itemObj.n + ' ' + (itemObj.d || '') + ' ' + p.cat)
                    .toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
            });
        });
    });
    return index;
})();

/*--------------------------------------------------------------
# Historique des Recherches Récentes (localStorage)
--------------------------------------------------------------*/
var RECENT_SEARCHES_KEY = 'bafa_recent_game_searches';

function getRecentSearches() {
    try {
        var data = localStorage.getItem(RECENT_SEARCHES_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveRecentSearch(item) {
    try {
        var recents = getRecentSearches();
        // Éviter les doublons par slug
        recents = recents.filter(function (r) { return r.slug !== item.slug || r.page !== item.page; });
        recents.unshift({
            name: item.name,
            page: item.page,
            slug: item.slug,
            cat: item.cat,
            emoji: item.emoji
        });
        if (recents.length > 5) recents = recents.slice(0, 5);
        localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(recents));
    } catch (e) { }
}

function clearRecentSearches() {
    try {
        localStorage.removeItem(RECENT_SEARCHES_KEY);
    } catch (e) { }
}

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
 * Branche les événements sur le champ de recherche, les filtres et le dropdown.
 */
function setupGameSearchUI() {
    var input = document.getElementById('game-search-input');
    var results = document.getElementById('game-search-results');
    var clearBtn = document.getElementById('search-clear-btn');
    if (!input || !results) return;

    var keyboardIndex = -1;
    var activeCategoryFilter = 'Tout';

    // Liste des catégories pour les chips de filtre
    var categoriesList = [
        { name: 'Tout', emoji: '🔍' },
        { name: 'Activités', emoji: '⚽' },
        { name: 'Veillées', emoji: '🌙' },
        { name: 'Jeux présentation', emoji: '🤝' },
        { name: 'Jeux fil rouge', emoji: '📅' },
        { name: 'Jeux animateurs', emoji: '🧢' },
        { name: 'Vie quotidienne', emoji: '🏠' },
        { name: 'Activités manuelles', emoji: '✂️' },
        { name: 'Retour au calme', emoji: '🧘' },
        { name: 'Idées de gages', emoji: '🚫' },
        { name: 'Règles de vie', emoji: '📜' },
        { name: 'Nourriture en camp', emoji: '🍽️' }
    ];

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function highlightMatch(text, queryTokens) {
        if (!text) return '';
        var safe = escapeHtml(text);
        if (!queryTokens || !queryTokens.length) return safe;

        // Construire une Regex accent-insensitive pour surligner tous les mots saisis
        try {
            var pattern = queryTokens.map(function (tok) {
                return tok.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }).join('|');
            var re = new RegExp('(' + pattern + ')', 'gi');
            return safe.replace(re, '<mark>$1</mark>');
        } catch (e) {
            return safe;
        }
    }

    function renderFilterChipsHTML() {
        return '<test class="search-chips-bar">' +
            categoriesList.map(function (c) {
                var isActive = (activeCategoryFilter === c.name) ? ' active' : '';
                return '<button type="button" class="search-chip' + isActive + '" data-cat="' + escapeHtml(c.name) + '">' +
                    c.emoji + ' ' + escapeHtml(c.name) +
                    '</button>';
            }).join('') +
            '</test>';
    }

    function renderRecentSearches() {
        var recents = getRecentSearches();
        keyboardIndex = -1;

        if (!recents || recents.length === 0) {
            results.classList.remove('active');
            results.innerHTML = '';
            return;
        }

        var html = '<test class="search-results-header">' +
            '<span>🕒 Recherches récentes</span>' +
            '<span class="search-clear-history" id="clear-search-history-btn">Effacer</span>' +
            '</test>';

        html += recents.map(function (item, i) {
            return '<a class="search-result-item" href="' + item.page + '#' + item.slug + '" data-idx="' + i + '" role="option" tabindex="-1">' +
                '<span class="search-result-cat">' + item.emoji + ' ' + escapeHtml(item.cat) + '</span>' +
                '<test class="search-result-content">' +
                '<span class="search-result-name">' + escapeHtml(item.name) + '</span>' +
                '</test>' +
                '<i class="bi bi-clock-history search-result-arrow"></i>' +
                '</a>';
        }).join('');

        results.innerHTML = html;
        results.classList.add('active');

        // Événement effacer historique
        var clearHistoryBtn = document.getElementById('clear-search-history-btn');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                clearRecentSearches();
                renderRecentSearches();
            });
        }

        // Ajouter écouteurs sur les items récents
        bindItemClickListeners();
    }

    function renderResults(query) {
        var rawQ = query.trim();
        if (!rawQ) {
            if (clearBtn) clearBtn.style.display = 'none';
            renderRecentSearches();
            return;
        }

        if (clearBtn) clearBtn.style.display = 'flex';

        // Découper la requête en mots-clés (tokens)
        var tokens = rawQ.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/\s+/).filter(Boolean);

        // Filtrer l'index
        var filtered = GAMES_INDEX.filter(function (item) {
            // Filtre par catégorie si sélectionné
            if (activeCategoryFilter !== 'Tout' && item.cat !== activeCategoryFilter) {
                return false;
            }
            // Vérifier si TOUS les mots saisis sont présents dans les mots-clés de l'item
            return tokens.every(function (tok) {
                return item.keywords.indexOf(tok) !== -1;
            });
        }).slice(0, 35);

        keyboardIndex = -1;

        var html = renderFilterChipsHTML();

        if (filtered.length === 0) {
            html += '<test class="search-no-results">Aucun résultat trouvé pour « <strong>' + escapeHtml(rawQ) + '</strong> » dans <em>' + escapeHtml(activeCategoryFilter) + '</em></test>';
        } else {
            html += '<test class="search-results-header">' +
                '<span>' + filtered.length + ' résultat' + (filtered.length > 1 ? 's' : '') + '</span>' +
                '<span>' + (activeCategoryFilter === 'Tout' ? 'Toutes catégories' : escapeHtml(activeCategoryFilter)) + '</span>' +
                '</test>';

            html += filtered.map(function (item, i) {
                var highlightedName = highlightMatch(item.name, tokens);
                var highlightedDesc = highlightMatch(item.desc, tokens);
                return '<a class="search-result-item" href="' + item.page + '#' + item.slug + '" data-idx="' + i + '" role="option" tabindex="-1" data-slug="' + item.slug + '" data-name="' + escapeHtml(item.name) + '" data-page="' + item.page + '" data-cat="' + escapeHtml(item.cat) + '" data-emoji="' + item.emoji + '">' +
                    '<span class="search-result-cat">' + item.emoji + ' ' + escapeHtml(item.cat) + '</span>' +
                    '<test class="search-result-content">' +
                    '<span class="search-result-name">' + highlightedName + '</span>' +
                    (item.desc ? '<span class="search-result-desc">' + highlightedDesc + '</span>' : '') +
                    '</test>' +
                    '<i class="bi bi-arrow-right search-result-arrow"></i>' +
                    '</a>';
            }).join('');
        }

        results.innerHTML = html;
        results.classList.add('active');

        bindChipClickListeners();
        bindItemClickListeners();
    }

    function bindChipClickListeners() {
        var chips = results.querySelectorAll('.search-chip');
        chips.forEach(function (chip) {
            chip.addEventListener('click', function (e) {
                e.stopPropagation();
                activeCategoryFilter = chip.getAttribute('data-cat') || 'Tout';
                renderResults(input.value);
                input.focus();
            });
        });
    }

    function bindItemClickListeners() {
        var items = results.querySelectorAll('.search-result-item');
        items.forEach(function (itemEl) {
            itemEl.addEventListener('click', function () {
                var slug = itemEl.getAttribute('data-slug');
                var name = itemEl.getAttribute('data-name');
                var page = itemEl.getAttribute('data-page');
                var cat = itemEl.getAttribute('data-cat');
                var emoji = itemEl.getAttribute('data-emoji');
                if (slug && name && page) {
                    saveRecentSearch({ slug: slug, name: name, page: page, cat: cat, emoji: emoji });
                }
            });
        });
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

    // Saisie utilisateur
    input.addEventListener('input', function () {
        renderResults(input.value);
    });

    // Effacer la recherche
    if (clearBtn) {
        clearBtn.addEventListener('click', function () {
            input.value = '';
            clearBtn.style.display = 'none';
            renderRecentSearches();
            input.focus();
        });
    }

    // Gestion du clavier (flèches, entrée, échap)
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
            if (keyboardIndex >= 0 && items[keyboardIndex]) {
                items[keyboardIndex].click();
                window.location.href = items[keyboardIndex].getAttribute('href');
            }
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

    // Réouvrir au clic / focus
    input.addEventListener('focus', function () {
        if (input.value.trim()) {
            renderResults(input.value);
        } else {
            renderRecentSearches();
        }
    });

    // Raccourci clavier global (Ctrl + K ou /) pour cibler la recherche
    document.addEventListener('keydown', function (e) {
        // Si l'utilisateur tape déjà dans un champ texte (input, textarea), ignorer
        var tag = (document.activeElement && document.activeElement.tagName) ? document.activeElement.tagName.toLowerCase() : '';
        if (tag === 'input' || tag === 'textarea') return;

        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            var searchContainer = document.getElementById('search-bar-container');
            if (searchContainer && searchContainer.style.display !== 'none') {
                input.focus();
                input.select();
            }
        } else if (e.key === '/') {
            e.preventDefault();
            var searchContainer = document.getElementById('search-bar-container');
            if (searchContainer && searchContainer.style.display !== 'none') {
                input.focus();
                input.select();
            }
        }
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
        var targetId = decodeURIComponent(window.location.hash.substring(1));
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
            setTimeout(function () {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Flash vert bref avec bords arrondis pour signaler l'élément
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
