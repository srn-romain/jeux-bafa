/* ================================================================
   ESPACE-FORMATION-DATA.JS
   Banque des 16 modules officiels de Formation BAFA
   Questions QCM et Réponses Longues
   ================================================================ */

const FORMATION_MODULES = [
    {
        id: 'psaadrafra',
        num: 1,
        title: 'PSAADRAFRA',
        subtitle: 'Sigles et repères fondamentaux en animation',
        icon: 'bi-diagram-3',
        description: 'Maîtrise des sigles incontournables : Projet Éducatif, Pédagogique, Sécurité, Activités, Accueil, Droits, Réglementation, Affectif, Familles, Relations...',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Que signifie le 'P' initial et le 'S' dans la démarche PSAADRAFRA ?",
                options: [
                    "Projet (Éducatif / Pédagogique) et Sécurité",
                    "Planning et Surveillance",
                    "Plaisir et Sanction",
                    "Pédagogie et Sortie"
                ],
                correctIndex: 0
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Parmi ces éléments, lequel illustre directement la prise en compte de la dimension 'Affectif' et 'Famille' ?",
                options: [
                    "L'application stricte des horaires de coucher sans discussion",
                    "L'écoute des craintes lors de l'accueil du premier jour et la communication bienveillante",
                    "La signature de la feuille de présence",
                    "Le calcul du budget des activités"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Explique concrètement comment tu mobilises les repères PSAADRAFRA pour préparer une journée type en ACM.",
                hint: "Détaille la sécurité physique et morale, les objectifs péda, l'accueil du public et la relation avec l'équipe."
            }
        ]
    },
    {
        id: 'projets-acm',
        num: 2,
        title: 'Différents projets, ACM, acteurs',
        subtitle: 'Cadre institutionnel, organisateurs et projets',
        icon: 'bi-building',
        description: 'Comprendre l’articulation entre Projet Éducatif et Projet Pédagogique, les types d’ACM (séjours, accueils de loisirs) et le rôle des institutions (SDJES, CAF).',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Qui rédige le Projet Éducatif (PE) d'un séjour ou centre de loisirs ?",
                options: [
                    "L'équipe d'animation le premier jour",
                    "L'organisateur (association, mairie, organisme de vacances)",
                    "Les enfants réunis en conseil",
                    "La SDJES / Jeunesse et Sports"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quel est le document rédigé par l'équipe de direction et d'animation pour traduire les intentions éducatives en actions concrètes ?",
                options: [
                    "Le Projet Pédagogique",
                    "Le Règlement Sanitaire Départemental",
                    "La déclaration préalable de séjour",
                    "La convention collective"
                ],
                correctIndex: 0
            },
            {
                id: 'q3',
                type: 'text',
                text: "Présente les principaux acteurs institutionnels qui gravitent autour d'un ACM et décris leur rôle respectif (Organisateur, Direction, Animateurs, SDJES, Familles).",
                hint: "Insiste sur la hiérarchie, les contrôles et les obligations légales de chacun."
            }
        ]
    },
    {
        id: 'public',
        num: 3,
        title: 'Connaissance du public',
        subtitle: 'Besoins, rythmes et développement de l’enfant',
        icon: 'bi-people',
        description: 'Étude des besoins physiques, affectifs et intellectuels de l’enfant et de l’adolescent selon les tranches d’âges (3-6 ans, 6-12 ans, ados).',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quel est le temps de sommeil moyen recommandé pour un enfant de 6 à 8 ans en séjour de vacances ?",
                options: [
                    "7 à 8 heures par nuit",
                    "10 à 11 heures par nuit avec respect du rythme individuel",
                    "13 à 14 heures obligatoirement",
                    "Peu importe tant que l'enfant ne dort pas pendant les activités"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Chez les 3-6 ans (petite enfance), quel besoin fondamental doit prioritairement guider l'aménagement de la journée ?",
                options: [
                    "La compétition sportive et les grands classements",
                    "L'alternance régulière temps forts / temps calmes, l'affectif et l'apprentissage de l'autonomie",
                    "Des activités intellectuelles soutenues de plus d'une heure",
                    "L'organisation de débats d'opinion"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Comment adaptes-tu ta posture et tes propositions d'activités face à un groupe d'adolescents (13-17 ans) en recherche d'autonomie et d'affirmation ?",
                hint: "Aborde la co-construction de projets, la responsabilisation, le respect de l'intimité et la gestion des limites."
            }
        ]
    },
    {
        id: 'reglementation',
        num: 4,
        title: 'Réglementation',
        subtitle: 'Taux, diplômes, déclarations et sécurité légale',
        icon: 'bi-file-earmark-ruled',
        description: 'Règles du Code de l’action sociale et des familles : taux d’encadrement légaux, qualification minimale de l’équipe, baignades et activités physiques.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quel est le taux légal d'encadrement en Accueil de Loisirs sans hébergement pour les enfants de plus de 6 ans (accueil de plus de 80 jours) ?",
                options: [
                    "1 animateur pour 8 enfants",
                    "1 animateur pour 12 enfants",
                    "1 animateur pour 14 enfants",
                    "1 animateur pour 20 enfants"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quelle doit être la composition minimale de l'équipe d'animation en terme de qualifications ?",
                options: [
                    "Au moins 50% de diplômés (BAFA), max 50% de stagiaires, max 20% de non diplômés",
                    "100% de diplômés obligatoirement",
                    "80% de stagiaires autorisés",
                    "Aucune obligation si le directeur est diplômé"
                ],
                correctIndex: 0
            },
            {
                id: 'q3',
                type: 'text',
                text: "Décris précisément les règles obligatoires et la chaîne de sécurité à mettre en place lors d'une sortie baignade en milieu naturel (mer ou lac).",
                hint: "Mentionne le surveillant de baignade (BS/BNSSA), les animateurs dans et hors de l'eau, le périmètre et le comptage."
            }
        ]
    },
    {
        id: 'responsabilite',
        num: 5,
        title: 'Responsabilité civile et pénale',
        subtitle: 'Obligation de moyens, fautes et cadre juridique',
        icon: 'bi-shield-check',
        description: 'Comprendre la distinction essentielle entre responsabilité civile (réparation de préjudice) et responsabilité pénale (sanction d’une infraction).',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quelle est la nature de l'obligation de sécurité pesant sur l'animateur en ACM ?",
                options: [
                    "Une obligation de résultat absolu (zéro bobo possible)",
                    "Une obligation de moyens renforcée (faire tout ce qui est humainement et professionnellement possible pour prévenir le risque)",
                    "Une simple obligation morale sans valeur juridique",
                    "Aucune obligation tant que les parents ont signé une décharge"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Dans quel cas la responsabilité pénale personnelle de l'animateur est-elle engagée ?",
                options: [
                    "En cas de maladresse involontaire sans gravité",
                    "En cas de faute grave, mise en danger délibérée de la vie d'autrui ou non-respect flagrant de la loi",
                    "Automatiquement dès qu'un enfant trébuche",
                    "Uniquement si l'assurance refuse de payer"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Donne un exemple concret illustrant la différence entre un accident relevant de la responsabilité civile et une faute engageant la responsabilité pénale.",
                hint: "Développe la notion de prévisibilité, de prudence professionnelle et de non-assistance à personne en péril."
            }
        ]
    },
    {
        id: 'vie-quotidienne',
        num: 6,
        title: 'Vie Quotidienne',
        subtitle: 'Repas, hygiène, sommeil, rangement et autonomie',
        icon: 'bi-cup-hot',
        description: 'Organisation des temps de vie collective : levé et couché échelonnés, repas équilibrés et conviviaux, hygiène corporelle et gestion des affaires.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Comment doit être pensé le moment du repas en ACM pour être un véritable temps éducatif ?",
                options: [
                    "Un temps de silence strict pour manger le plus vite possible",
                    "Un moment convivial favorisant la découverte gustative, l'autonomie et le partage",
                    "Un moment où les animateurs mangent à part sans s'occuper des jeunes",
                    "Un moment de punition pour les enfants turbulents"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quelle pratique favorise le mieux le respect du rythme biologique lors du réveil ?",
                options: [
                    "Un réveil au clairon imposé à tous à 7h00 pile",
                    "Un réveil et petit-déjeuner échelonnés avec activités calmes pour les premiers levés",
                    "Laisser dormir les jeunes jusqu'à midi sans encadrement",
                    "Interdire de sortir du lit avant le signal du directeur"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Explique comment tu transformes la corvée de rangement des chambres ou de la douche en un rituel ludique et éducatif pour des 7-10 ans.",
                hint: "Évoque l'imaginaire, la valorisation positive, le tableau de répartition et la responsabilisation."
            }
        ]
    },
    {
        id: 'handicap',
        num: 7,
        title: 'Handicap et inclusion',
        subtitle: 'Accueil de tous, adaptation et PAI',
        icon: 'bi-universal-access',
        description: 'Sensibilisation aux différents types de handicaps (moteur, sensoriel, mental, troubles DYS/TSA), mise en œuvre du PAI et aménagement d’activités.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Qu'est-ce qu'un PAI (Projet d'Accueil Individualisé) en collectivité ?",
                options: [
                    "Un diplôme délivré aux enfants sportifs",
                    "Un document formalisant les besoins médicaux, alimentaires ou spécifiques d'un enfant avec accord médical",
                    "Une assurance complémentaire obligatoire",
                    "Un planning des repas de la semaine"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quelle est la meilleure démarche pour inclure un enfant porteur de handicap dans un grand jeu collectif ?",
                options: [
                    "L'écarter du jeu et le faire dessiner seul",
                    "Adapter les règles, les rôles ou l'espace pour lui permettre de participer activement avec ses pairs",
                    "Annuler le grand jeu pour tout le monde",
                    "Faire semblant qu'il n'a aucune difficulté sans rien aménager"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Face à un groupe de jeunes qui rejette ou stigmatise un camarade présentant un handicap ou une différence, quelle intervention mets-tu en place ?",
                hint: "Détaille la sensibilisation sans mise à l'index, le rôle de médiateur, et les jeux coopératifs favorisant l'empathie."
            }
        ]
    },
    {
        id: 'harcelement',
        num: 8,
        title: 'Harcèlement, maltraitance, VSS',
        subtitle: 'Prévention, repérage et protection de l’enfance',
        icon: 'bi-exclamation-triangle',
        description: 'Identification des signaux d’alerte, lutte contre le harcèlement et les violences sexistes et sexuelles (VSS), posture et protocole de signalement.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quels sont les 3 critères cumulatifs qui caractérisent une situation de harcèlement ?",
                options: [
                    "La violence (physique ou verbale), la répétition et l'isolement/asymétrie de pouvoir",
                    "La dispute ponctuelle, le cri et le jeu",
                    "La mauvaise note, la fatigue et le désaccord",
                    "L'accident, l'absence et le retard"
                ],
                correctIndex: 0
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Si un enfant se confie à toi sur des violences ou attouchements subis, quelle est ta première obligation ?",
                options: [
                    "Lui promettre de garder le secret absolu et ne rien dire",
                    "Écouter avec bienveillance, consigner les faits objectivement et alerter immédiatement la direction sans mener d'enquête soi-même",
                    "Aller confronter directement la personne accusée",
                    "Publier l'histoire sur les réseaux sociaux"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Quels sont les signaux faibles (comportementaux, physiques, relationnels) qui doivent t'alerter sur un éventuel mal-être ou cas de maltraitance chez un mineur ?",
                hint: "Évoque le repli sur soi, les changements brusques d'humeur, les troubles du sommeil/alimentation, l'évitement de certains contacts."
            }
        ]
    },
    {
        id: 'relationnel',
        num: 9,
        title: 'Relationnel en ACM',
        subtitle: 'Communication, équipe et relation aux familles',
        icon: 'bi-chat-heart',
        description: 'Construire une communication bienveillante, savoir gérer les tensions d’équipe, coopérer avec la direction et instaurer la confiance avec les parents.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "En cas de désaccord pédagogique avec un autre animateur pendant le déroulement d'une activité devant les enfants, que dois-tu faire ?",
                options: [
                    "Hausser le ton pour montrer qui a raison",
                    "Maintenir la cohérence devant les jeunes et débriefer calmement à l'écart ou en réunion du soir",
                    "Prendre les enfants à témoin pour qu'ils votent",
                    "Abandonner immédiatement l'activité"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Comment accueillir un parent inquiet qui arrive le matin avec des reproches agressifs ?",
                options: [
                    "L'ignorer et lui fermer la porte au nez",
                    "L'écouter sans agressivité, reformuler son inquiétude, le rassurer et proposer un échange avec la direction si besoin",
                    "L'accuser d'être un mauvais parent",
                    "Lui crier dessus pour s'imposer"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Quels outils et attitudes favorisent la cohésion et la solidarité au sein d'une équipe d'animation tout au long d'un séjour ?",
                hint: "Évoque l'entraide sur les tâches pénibles, l'écoute en réunion, la valorisation des compétences de chacun et la gestion positive des conflits."
            }
        ]
    },
    {
        id: 'laicite',
        num: 10,
        title: 'Laïcité',
        subtitle: 'Valeurs républicaines et vivre-ensemble',
        icon: 'bi-bank',
        description: 'Comprendre l’application de la Charte de la Laïcité en ACM : neutralité de l’encadrement, respect des convictions individuelles et cohésion du groupe.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Dans un ACM assurant une mission de service public, quelle est la règle concernant le port de signes religieux pour les animateurs ?",
                options: [
                    "Liberté totale de prosélytisme",
                    "Obligation de neutralité et interdiction de porter des signes religieux ostensibles",
                    "Chaque animateur choisit un jour sur deux",
                    "Seul le directeur a une obligation de réserve"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Comment aborder la question des repas confessionnels ou habitudes alimentaires lors des menus en centre de vacances ?",
                options: [
                    "Imposer un seul plat unique sans alternative",
                    "Proposer des menus équilibrés avec des alternatives (ex: sans porc, végétarien) sans stigmatisation",
                    "Refuser l'accès à la cantine aux enfants ayant des demandes spécifiques",
                    "Obliger tout le monde à jeûner"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Comment la laïcité permet-elle de garantir la liberté de conscience tout en renforçant le vivre-ensemble en ACM ?",
                hint: "Explique l'importance de l'égalité de traitement, du refus des discriminations et de l'espace commun d'émancipation pour les mineurs."
            }
        ]
    },
    {
        id: 'autorite',
        num: 11,
        title: 'Liberté, autorité, sanction',
        subtitle: 'Cadre sécurisant, règles de vie et sanction éducative',
        icon: 'bi-balance',
        description: 'Poser un cadre rassurant sans tomber dans l’autoritarisme : co-construction des règles, gestion des transgressions et sanction éducative.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quelle est la caractéristique fondamentale d'une sanction éducative par rapport à une punition arbitraire ?",
                options: [
                    "Elle est humiliante et publique",
                    "Elle a du sens, est proportionnée, personnalisée, tournée vers la réparation et expliquée à l'enfant",
                    "Elle prive l'enfant de son repas ou de son sommeil",
                    "Elle est systématiquement collective"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Les punitions collectives ou privatives de repas sont-elles autorisées en ACM ?",
                options: [
                    "Oui si le groupe a été trop bruyant",
                    "Non, elles sont strictement interdites par la loi et contraires aux principes pédagogiques",
                    "Oui avec l'accord écrit du directeur",
                    "Uniquement pour les adolescents de plus de 14 ans"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Un enfant de 9 ans transgresse délibérément une règle de sécurité majeure (ex: quitter le périmètre de jeu sans prévenir). Décris ta démarche éducative de A à Z.",
                hint: "Rappelle l'interruption immédiate du danger, l'isolement calme, l'explication du sens de la règle, la sanction réparatrice et la réintégration dans le groupe."
            }
        ]
    },
    {
        id: 'contrats',
        num: 12,
        title: 'Les contrats',
        subtitle: 'CEE, droits, devoirs et droit du travail en ACM',
        icon: 'bi-file-earmark-text',
        description: 'Le Contrat d’Engagement Éducatif (CEE) : statut spécifique, durée légale, repos quotidien et hebdomadaire, rémunération et engagements réciproques.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quel est le nombre maximum de jours travaillés par an sous Contrat d'Engagement Éducatif (CEE) pour un animateur ?",
                options: [
                    "80 jours par an",
                    "100 jours par an",
                    "150 jours par an",
                    "Illimité"
                ],
                correctIndex: 0
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quel est le repos quotidien obligatoire accordé à un animateur en séjour de vacances selon la réglementation CEE ?",
                options: [
                    "2 heures par jour",
                    "11 heures consécutives (ou 8h consécutives + 3h de repos compensateur fractionné)",
                    "Aucun repos tant que le séjour n'est pas terminé",
                    "24 heures toutes les 48 heures"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Quels sont les engagements mutuels pris par l'organisme employeur et par l'animateur lors de la signature d'un contrat en ACM ?",
                hint: "Mentionne la rémunération, la nourriture/logement, la protection sociale, l'assiduité, le respect du projet péda et l'obligation de réserve."
            }
        ]
    },
    {
        id: 'grands-jeux',
        num: 13,
        title: 'Grands-jeux & veillées des stagiaires',
        subtitle: 'Imaginaire, scénarisation et gestion du rythme',
        icon: 'bi-stars',
        description: 'Méthodologie de conception d’une veillée ou d’un grand jeu : univers immersif, courbe d’intensité, rôles d’animation et sécurité du public.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Qu'appelle-t-on la 'courbe de vie' ou courbe d'intensité dans le déroulement d'une veillée ?",
                options: [
                    "La vitesse à laquelle les enfants courent",
                    "La progression chronologique : accueil immersif, montée en énergie, temps fort, puis retour au calme progressif vers le coucher",
                    "Le graphique des dépenses budgétaires de la soirée",
                    "Le temps passé à préparer les décors"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Quel élément est indispensable lors de l'explication des règles d'un grand jeu ?",
                options: [
                    "Lire un texte complexe de 20 pages sans bouger",
                    "Donner un nom aux équipes sans expliquer le but",
                    "Faire court, dynamique, illustrer par une démonstration et vérifier la compréhension des jeunes",
                    "Interdire aux enfants de poser des questions"
                ],
                correctIndex: 2
            },
            {
                id: 'q3',
                type: 'text',
                text: "Rédige la trame complète d'une veillée originale (thème imaginaire, lancement, 3 temps d'activités/épreuves progressives, dénouement et retour au calme).",
                hint: "Précise la tranche d'âge ciblée, la gestion des lumières et l'ambiance sonore."
            }
        ]
    },
    {
        id: 'blog',
        num: 14,
        title: 'Blog',
        subtitle: 'Communication numérique et droit à l’image',
        icon: 'bi-journal-richtext',
        description: 'Tenue du blog du séjour : respect strict du droit à l’image, protection des données des mineurs, rédaction captivante et valorisation des activités.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quelle autorisation est légalement requise pour diffuser la photo d'un enfant sur le blog privé ou public d'un centre ?",
                options: [
                    "L'accord oral de l'enfant suffit",
                    "L'autorisation écrite préalable et explicite des responsables légaux (droit à l'image)",
                    "Aucune autorisation n'est nécessaire si l'enfant sourit",
                    "Uniquement l'autorisation de la mairie"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Parmi ces informations, laquelle ne doit JAMAIS apparaître publiquement sur un blog ou réseau social en ACM ?",
                options: [
                    "Le nom de famille complet des enfants, leur adresse, ou des photos dégradantes / en maillot de bain non cadrées",
                    "Le prénom seul de l'enfant",
                    "La météo de la journée",
                    "Le menu du déjeuner"
                ],
                correctIndex: 0
            },
            {
                id: 'q3',
                type: 'text',
                text: "Rédige un article type pour le blog du soir (150-250 mots) racontant avec enthousiasme une journée de découverte nature tout en respectant l'anonymat et la bienveillance.",
                hint: "Mets en valeur l'aventure, les apprentissages des enfants et rassure les familles sur l'ambiance du groupe."
            }
        ]
    },
    {
        id: 'transport',
        num: 15,
        title: 'Transport',
        subtitle: 'Déplacements pédestres, car, train et sécurité routière',
        icon: 'bi-bus-front',
        description: 'Organisation rigoureuse des convois : règles de circulation à pied, consignes en car/train, répartition des animateurs et gestion des urgences.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Lors d'un déplacement pédestre sur une route de campagne sans trottoir en plein jour, de quel côté le groupe doit-il marcher ?",
                options: [
                    "Sur le côté gauche de la chaussée (face aux véhicules) en colonne par un, sauf si la configuration impose la droite en groupe compact",
                    "Au milieu de la route pour être bien vu",
                    "En zigzaguant librement",
                    "Uniquement sur le côté droit sans surveillance"
                ],
                correctIndex: 0
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Dans un autocar de grand tourisme transportant des mineurs, où doivent impérativement se positionner les animateurs ?",
                options: [
                    "Tous regroupés au fond du car pour discuter",
                    "Répartis stratégiquement : près des portes de secours/milieu et à l'arrière, tout en surveillant le port de la ceinture de sécurité",
                    "À côté du chauffeur pour regarder la route",
                    "En bas dans la soute à bagages"
                ],
                correctIndex: 1
            },
            {
                id: 'q3',
                type: 'text',
                text: "Détaille la procédure de sécurité complète lors d'une correspondance ferroviaire dans une grande gare parisienne bondée avec 25 enfants.",
                hint: "Évoque le comptage avant/pendant/après, les binômes d'enfants, l'animateur de tête et de queue (serre-file) et la consigne en cas d'égarement."
            }
        ]
    },
    {
        id: 'reunion',
        num: 16,
        title: 'Réunion',
        subtitle: 'Bilan de journée, animation d’équipe et prises de parole',
        icon: 'bi-clock-history',
        description: 'Participer efficacement à la réunion du soir : faire remonter les observations sur les jeunes, préparer le planning du lendemain et préserver son énergie.',
        questions: [
            {
                id: 'q1',
                type: 'qcm',
                text: "Quel est l'objectif principal de la réunion quotidienne d'équipe en séjour de vacances ?",
                options: [
                    "Se plaindre des enfants et prolonger la nuit jusqu'à 3h du matin",
                    "Faire le bilan de la journée (enfants, vie quot, activités), ajuster le lendemain, coordonner l'équipe et veiller au bien-être de chacun",
                    "Regarder un film ensemble",
                    "Organiser un concours de chant entre animateurs"
                ],
                correctIndex: 1
            },
            {
                id: 'q2',
                type: 'qcm',
                text: "Pour qu'une réunion soit productive et respecte le sommeil de l'équipe, quelle bonne pratique adopter ?",
                options: [
                    "Avoir un ordre du jour clair, un animateur de séance, un gardien du temps (timekeeper) et synthétiser ses prises de parole",
                    "Attendre minuit pour commencer à parler du planning",
                    "Ne donner la parole qu'à une seule personne",
                    "Ne prendre aucune note"
                ],
                correctIndex: 0
            },
            {
                id: 'q3',
                type: 'text',
                text: "Comment prépares-tu ton intervention en réunion pour présenter un bilan d'activité qui n'a pas fonctionné comme prévu, de manière constructive et sans rejet de faute ?",
                hint: "Aborde l'auto-évaluation honnête, l'analyse des causes (météo, consignes, fatigue) et les pistes d'amélioration pour la prochaine fois."
            }
        ]
    }
];

// Helper global
window.FORMATION_MODULES = FORMATION_MODULES;
