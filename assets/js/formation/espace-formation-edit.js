/* ================================================================
   ESPACE-FORMATION-EDIT.JS
   Hub de gestion complet d'un module de formation :
   - Barre de navigation avec liste déroulante de tous les modules & système d'épinglage (synchronisé en BDD)
   - Onglet 1 : Éditeur du module & questionnaire interactif (QCM, Rédaction, Puzzle, Cloze avec leurres)
   - Onglet 2 : Suivi complet des réponses des stagiaires, notation interactive & exports (CSV/PDF)
   ================================================================ */

let currentUser = null;
let currentRole = 'stagiaire';
let actualUserData = null;
let currentEditingModuleId = null;
let currentEditingQuestions = [];
let allFormationModules = [];
let moduleSubmissions = [];
let filteredModuleSubmissions = [];
let currentFilterStatus = 'all';
let currentSearchQuery = '';
let activeInspectingSubmission = null;
let isTopbarDropdownOpen = false;

const AVAILABLE_FORMATION_ICONS = [
    { icon: 'bi-journal-bookmark', label: 'Livre & Étude', tags: 'cours bafa livre projet etude' },
    { icon: 'bi-mortarboard', label: 'Diplôme / BAFA', tags: 'bafa diplome brevet ecole reussite' },
    { icon: 'bi-diagram-3', label: 'Schéma & Repères', tags: 'schema projet equipe organisation psaadrafra' },
    { icon: 'bi-building', label: 'ACM & Structures', tags: 'acm centre batiment mairie caf ddcs sdjes' },
    { icon: 'bi-people', label: 'Enfants & Public', tags: 'enfants public groupe animateurs colos' },
    { icon: 'bi-shield-check', label: 'Réglementation', tags: 'regles securite loi conformite protection' },
    { icon: 'bi-bank', label: 'Responsabilité', tags: 'loi justice penale civile tribunal sanction' },
    { icon: 'bi-clock-history', label: 'Vie quotidienne', tags: 'quotidien rythme repas coucher lever douche temps' },
    { icon: 'bi-heart-half', label: 'Handicap & Inclusion', tags: 'handicap inclusion difference bienveillance accueil' },
    { icon: 'bi-shield-exclamation', label: 'Harcèlement & VSS', tags: 'harcelement maltraitance vss protection prevention' },
    { icon: 'bi-chat-heart', label: 'Relationnel & Équipe', tags: 'relations equipe conflits communication dialogue' },
    { icon: 'bi-peace', label: 'Laïcité & Valeurs', tags: 'laicite valeurs republique liberte vivre ensemble' },
    { icon: 'bi-signpost-split', label: 'Autorité & Cadre', tags: 'regles sanction autorite cadre limite' },
    { icon: 'bi-file-earmark-text', label: 'Contrats & Droits', tags: 'contrat cee droit travail salaire fiche' },
    { icon: 'bi-stars', label: 'Grands-Jeux & Veillées', tags: 'jeu veillée imaginaire fete spectacle animation' },
    { icon: 'bi-newspaper', label: 'Blog & Infos', tags: 'blog communication journal nouvelles photos' },
    { icon: 'bi-bus-front', label: 'Transport & Sorties', tags: 'transport bus car velo trajet deplacement' },
    { icon: 'bi-chat-dots', label: 'Réunion & Débrief', tags: 'reunion bilan debrief equipe point' },
    { icon: 'bi-palette', label: 'Activités manuelles', tags: 'activites brico dessin art creation atelier' },
    { icon: 'bi-tree', label: 'Nature & Forêt', tags: 'nature foret arbre sortie environnement' },
    { icon: 'bi-cup-hot', label: 'Temps Calme & Pause', tags: 'pause repos cafe sieste calme' },
    { icon: 'bi-award', label: 'Évaluation & Bilan', tags: 'bilan note appreciation validation grille' },
    { icon: 'bi-lightbulb', label: 'Créativité & Idées', tags: 'idee innovation projet animation creation' },
    { icon: 'bi-music-note-beamed', label: 'Chants & Musique', tags: 'chant danse musique guitare spectacle' }
];

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatDate(timestamp) {
    if (!timestamp) return 'Date inconnue';
    let date = null;
    if (timestamp.toDate) date = timestamp.toDate();
    else if (timestamp.seconds) date = new Date(timestamp.seconds * 1000);
    else if (typeof timestamp === 'string' || typeof timestamp === 'number') date = new Date(timestamp);
    if (!date || isNaN(date.getTime())) return 'Date inconnue';

    return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `es-toast es-toast--${type}`;
    let icon = 'bi-info-circle';
    if (type === 'success') icon = 'bi-check-circle-fill';
    if (type === 'error') icon = 'bi-exclamation-triangle-fill';
    if (type === 'warning') icon = 'bi-exclamation-circle';

    toast.innerHTML = `<i class="bi ${icon}"></i><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function btnLoading(btn, loading = true) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) btn.classList.add('loading');
    else btn.classList.remove('loading');
}

function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name) || null;
}

async function compressImageToBase64(file, maxWidth = 1200, maxHeight = 900, quality = 0.82) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error("Aucun fichier fourni."));
        if (!file.type.startsWith('image/')) return reject(new Error("Le fichier doit être une image."));

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                const base64 = canvas.toDataURL('image/jpeg', quality);
                resolve(base64);
            };
            img.onerror = () => reject(new Error("Impossible de charger l'image."));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Erreur lors de la lecture du fichier."));
        reader.readAsDataURL(file);
    });
}

// ----------------------------------------------------------------
// GESTION DU TOPBAR BRAND DROPDOWN & ÉPINGLES (PINNED MODULES BDD)
// ----------------------------------------------------------------
function initTopbarDropdown() {
    const trigger = document.getElementById('moduleNameTopbarTrigger');
    const dropdown = document.getElementById('modulesDropdown');
    const searchInput = document.getElementById('inputSearchModuleSwitch');

    if (!trigger || !dropdown) return;

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        isTopbarDropdownOpen = !isTopbarDropdownOpen;
        if (isTopbarDropdownOpen) {
            dropdown.classList.remove('hidden');
            renderModulesDropdownList(searchInput ? searchInput.value : '');
            if (searchInput) {
                searchInput.value = '';
                setTimeout(() => searchInput.focus(), 100);
            }
        } else {
            dropdown.classList.add('hidden');
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#topbarModuleDropdownWrap')) {
            dropdown.classList.add('hidden');
            isTopbarDropdownOpen = false;
        }
    });

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderModulesDropdownList(e.target.value);
        });
    }
}

function renderModulesDropdownList(query = '') {
    const listEl = document.getElementById('modulesDropdownList');
    if (!listEl) return;

    let pinnedIds = JSON.parse(localStorage.getItem('pinnedModules') || '[]');

    const q = query.toLowerCase().trim();
    const filtered = allFormationModules.filter(m => {
        if (!q) return true;
        const title = (m.title || '').toLowerCase();
        const subtitle = (m.subtitle || '').toLowerCase();
        const num = String(m.num || '');
        return title.includes(q) || subtitle.includes(q) || num.includes(q);
    });

    if (filtered.length === 0) {
        listEl.innerHTML = '<div style="padding:15px;text-align:center;opacity:0.5;font-size:0.8rem;">Aucun module trouvé.</div>';
        return;
    }

    // Trier : épinglés en haut, puis par numéro
    const sorted = [...filtered].sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id);
        const bPinned = pinnedIds.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
    });

    listEl.innerHTML = sorted.map(m => {
        const isPinned = pinnedIds.includes(m.id);
        const isCurrent = (m.id === currentEditingModuleId);
        const iconClass = m.icon || 'bi-journal-bookmark';

        return `
            <div class="es-topbar__colos-item-wrap" style="position:relative; display:flex; align-items:center;">
                <a href="formation-edit.html?id=${encodeURIComponent(m.id)}" class="es-topbar__colos-item ${isCurrent ? 'active' : ''}" style="flex:1;">
                    <span class="es-topbar__colos-item-emoji"><i class="bi ${iconClass}"></i></span>
                    <span style="flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        M.${m.num < 10 ? '0' + m.num : m.num} - ${escapeHtml(m.title)}
                    </span>
                    ${isCurrent ? '<i class="bi bi-check-lg" style="color:var(--clr-primary);"></i>' : ''}
                </a>
                <div class="es-topbar__colos-pin ${isPinned ? 'active' : ''}" 
                     data-module-id="${m.id}"
                     title="${isPinned ? 'Désépingler' : 'Épingler ce module'}">
                    <i class="bi bi-pin-angle${isPinned ? '-fill' : ''}"></i>
                </div>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.es-topbar__colos-pin').forEach(pinBtn => {
        pinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const modId = pinBtn.getAttribute('data-module-id');
            togglePinModule(modId);
        });
    });
}

async function togglePinModule(moduleId) {
    let pinnedIds = JSON.parse(localStorage.getItem('pinnedModules') || '[]');

    if (pinnedIds.includes(moduleId)) {
        pinnedIds = pinnedIds.filter(id => id !== moduleId);
    } else {
        if (pinnedIds.length >= 5) {
            showToast("Tu ne peux épingler que 5 modules maximum.", "warning");
            return;
        }
        pinnedIds.push(moduleId);
    }

    localStorage.setItem('pinnedModules', JSON.stringify(pinnedIds));

    // Sauvegarder dans Firestore BDD
    if (currentUser) {
        db.collection('users').doc(currentUser.uid).update({
            pinnedModules: pinnedIds
        }).catch(err => {
            console.error("Erreur lors de la sauvegarde des modules épinglés en BDD :", err);
        });
    }

    const searchInput = document.getElementById('inputSearchModuleSwitch');
    renderModulesDropdownList(searchInput ? searchInput.value : '');
}

// ----------------------------------------------------------------
// GESTION DU SÉLECTEUR D'ICÔNES & FOND DE CARTE
// ----------------------------------------------------------------
function updateIconPreview(iconClass) {
    const previewEl = document.getElementById('iconPreviewEl');
    const heroIconEl = document.getElementById('heroIconEl');
    const selectedIconPreview = document.getElementById('selectedIconPreview');
    const selectedIconLabel = document.getElementById('selectedIconLabel');
    if (previewEl) previewEl.className = `bi ${iconClass}`;
    if (heroIconEl) heroIconEl.className = `bi ${iconClass}`;
    if (selectedIconPreview) selectedIconPreview.className = `bi ${iconClass}`;

    const match = AVAILABLE_FORMATION_ICONS.find(item => item.icon === iconClass);
    if (selectedIconLabel) {
        selectedIconLabel.textContent = match ? match.label : 'Personnalisée';
    }
}

function renderIconPicker(selectedIcon = 'bi-journal-bookmark') {
    const grid = document.getElementById('iconPickerGrid');
    const filterInput = document.getElementById('iconFilterInput');
    if (!grid) return;

    function buildGrid(query = '') {
        const q = query.toLowerCase().trim();
        const filtered = AVAILABLE_FORMATION_ICONS.filter(item => {
            if (!q) return true;
            return item.label.toLowerCase().includes(q) || item.tags.toLowerCase().includes(q) || item.icon.toLowerCase().includes(q);
        });

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--clr-text-muted); font-size: 0.8rem; padding: 10px;">Aucune icône trouvée pour "${escapeHtml(query)}"</div>`;
            return;
        }

        grid.innerHTML = filtered.map(item => {
            const isSelected = item.icon === selectedIcon;
            return `
                <button type="button" class="es-icon-picker-btn ${isSelected ? 'active' : ''}" data-icon="${item.icon}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 6px 4px; background: ${isSelected ? 'rgba(166, 216, 102, 0.2)' : 'var(--clr-surface)'}; border: 1.5px solid ${isSelected ? 'var(--clr-primary)' : 'var(--clr-surface-3)'}; border-radius: var(--radius-sm); cursor: pointer; transition: all 0.2s;">
                    <i class="bi ${item.icon}" style="font-size: 1.25rem; color: ${isSelected ? 'var(--clr-primary-dark)' : 'var(--clr-text)'};"></i>
                    <span style="font-size: 0.68rem; font-weight: 600; color: var(--clr-text); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 95%;">${escapeHtml(item.label)}</span>
                </button>
            `;
        }).join('');

        grid.querySelectorAll('.es-icon-picker-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const icon = btn.getAttribute('data-icon');
                document.getElementById('editModuleIcon').value = icon;
                selectedIcon = icon;
                updateIconPreview(icon);
                buildGrid(filterInput ? filterInput.value : '');
            });
        });
    }

    buildGrid();

    if (filterInput) {
        filterInput.oninput = () => buildGrid(filterInput.value);
    }
}

// ----------------------------------------------------------------
// BANQUE & GÉNÉRATEUR D'IMAGES ALÉATOIRES (FOND DE CARTE DU MODULE)
// ----------------------------------------------------------------
const BG_IMAGE_PRESET_CATEGORIES = [
    { id: 'picsum', label: 'Aléatoire' },
    { id: 'societe', label: 'Société & Jeux' },
    { id: 'nature', label: 'Nature' },
    { id: 'veillee', label: 'Veillée & Feu' },
    { id: 'montagne', label: 'Montagne' },
    { id: 'mer', label: 'Mer' },
    { id: 'creativite', label: 'Arts & Brico' }
];

const THEMED_BG_IMAGES = {
    societe: [
        { title: 'Jeux de plateau', url: 'https://images.unsplash.com/photo-1610890716171-6b1bb98ffd09?w=800&auto=format&fit=crop&q=80' },
        { title: 'Dés & Pions', url: 'https://images.unsplash.com/photo-1563941402622-4e7a488bcc57?w=800&auto=format&fit=crop&q=80' },
        { title: 'Cartes & Ambiance', url: 'https://images.unsplash.com/photo-1511193311914-0346f16efe90?w=800&auto=format&fit=crop&q=80' },
        { title: 'Échecs & Stratégie', url: 'https://images.unsplash.com/photo-1585504198199-20277593b94f?w=800&auto=format&fit=crop&q=80' },
        { title: 'Cartes de jeu', url: 'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=800&auto=format&fit=crop&q=80' },
        { title: 'Dés d’aventure', url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=800&auto=format&fit=crop&q=80' }
    ],
    nature: [
        { title: 'Forêt verdoyante', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&auto=format&fit=crop&q=80' },
        { title: 'Soleil sous-bois', url: 'https://images.unsplash.com/photo-1511497584788-87676104235f?w=800&auto=format&fit=crop&q=80' },
        { title: 'Brume & Pins', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&auto=format&fit=crop&q=80' },
        { title: 'Forêt dorée', url: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800&auto=format&fit=crop&q=80' },
        { title: 'Sous-bois moussu', url: 'https://images.unsplash.com/photo-1542273917363-3b1817f69a2d?w=800&auto=format&fit=crop&q=80' },
        { title: 'Canopée & Sentier', url: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=800&auto=format&fit=crop&q=80' }
    ],
    veillee: [
        { title: 'Feu de camp', url: 'https://images.unsplash.com/photo-1508873696983-2df5293cb395?w=800&auto=format&fit=crop&q=80' },
        { title: 'Marshmallows au feu', url: 'https://images.unsplash.com/photo-1517824806704-9040b037703b?w=800&auto=format&fit=crop&q=80' },
        { title: 'Flammes vives', url: 'https://images.unsplash.com/photo-1496545672447-f699b503d270?w=800&auto=format&fit=crop&q=80' },
        { title: 'Bivouac étoilé', url: 'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=800&auto=format&fit=crop&q=80' },
        { title: 'Coin du feu', url: 'https://images.unsplash.com/photo-1475483768296-6163e08872a1?w=800&auto=format&fit=crop&q=80' },
        { title: 'Feu sous les étoiles', url: 'https://images.unsplash.com/photo-1506535995048-638aa1b62b77?w=800&auto=format&fit=crop&q=80' }
    ],
    montagne: [
        { title: 'Lac de montagne', url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&auto=format&fit=crop&q=80' },
        { title: 'Sommets alpins', url: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&auto=format&fit=crop&q=80' },
        { title: 'Sentier de crête', url: 'https://images.unsplash.com/photo-1486870591958-9b9d0d1dda99?w=800&auto=format&fit=crop&q=80' },
        { title: 'Pics rocheux', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&auto=format&fit=crop&q=80' }
    ],
    mer: [
        { title: 'Mer turquoise', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80' },
        { title: 'Coucher de soleil', url: 'https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800&auto=format&fit=crop&q=80' },
        { title: 'Plage estivale', url: 'https://images.unsplash.com/photo-1519046904884-53103b34b206?w=800&auto=format&fit=crop&q=80' },
        { title: 'Littoral sauvage', url: 'https://images.unsplash.com/photo-1473496169904-658ba7c44d8a?w=800&auto=format&fit=crop&q=80' }
    ],
    creativite: [
        { title: 'Peinture & Pinceaux', url: 'https://images.unsplash.com/photo-1472162072942-cd5147eb3902?w=800&auto=format&fit=crop&q=80' },
        { title: 'Couleurs & Dessin', url: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=800&auto=format&fit=crop&q=80' },
        { title: 'Palette d’art', url: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=800&auto=format&fit=crop&q=80' },
        { title: 'Bricolage manuel', url: 'https://images.unsplash.com/photo-1501612780327-45045538702b?w=800&auto=format&fit=crop&q=80' }
    ]
};

let currentBgGalleryCategory = 'picsum';
let picsumSeedOffset = 1;
let themedOffset = 0;
let isBgGalleryInitialized = false;

function renderBgSuggestions(selectedUrl = '') {
    const grid = document.getElementById('bgGalleryGrid');
    const tabsContainer = document.getElementById('bgGalleryCategoryTabs');
    if (!grid) return;

    const currentSelected = (selectedUrl || document.getElementById('editModuleBgImage')?.value || '').trim();

    // Auto-détection de la catégorie correspondant à l'image courante
    if (currentSelected) {
        if (currentSelected.includes('random') || currentSelected === 'https://picsum.photos/800/500') {
            currentBgGalleryCategory = 'picsum';
        } else if (currentSelected.includes('picsum.photos/seed/bafa_')) {
            currentBgGalleryCategory = 'picsum';
            const match = currentSelected.match(/seed\/bafa_(\d+)/);
            if (match) {
                const seedNum = parseInt(match[1], 10);
                picsumSeedOffset = Math.max(1, seedNum - (seedNum % 4));
            }
        } else {
            for (const [catId, list] of Object.entries(THEMED_BG_IMAGES)) {
                const foundIdx = list.findIndex(it => it.url.trim() === currentSelected || (it.url.includes('unsplash.com') && currentSelected.includes(it.url.split('?')[0])));
                if (foundIdx !== -1) {
                    currentBgGalleryCategory = catId;
                    themedOffset = Math.floor(foundIdx / 4) * 4;
                    break;
                }
            }
        }
    }

    // Construction ou mise à jour des onglets de catégories
    if (tabsContainer) {
        if (tabsContainer.children.length === 0) {
            tabsContainer.innerHTML = BG_IMAGE_PRESET_CATEGORIES.map(cat => `
                <button type="button" class="es-bg-cat-btn ${cat.id === currentBgGalleryCategory ? 'active' : ''}" data-category="${cat.id}">
                    ${cat.label}
                </button>
            `).join('');

            tabsContainer.querySelectorAll('.es-bg-cat-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    currentBgGalleryCategory = btn.getAttribute('data-category') || 'picsum';
                    tabsContainer.querySelectorAll('.es-bg-cat-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    buildGalleryGrid();
                });
            });
        } else {
            tabsContainer.querySelectorAll('.es-bg-cat-btn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-category') === currentBgGalleryCategory);
            });
        }
    }

    function buildGalleryGrid() {
        const activeUrl = (document.getElementById('editModuleBgImage')?.value || currentSelected || '').trim();
        let items = [];

        if (currentBgGalleryCategory === 'picsum') {
            for (let i = 0; i < 4; i++) {
                const seed = picsumSeedOffset + i;
                items.push({
                    title: `Photo #${seed}`,
                    url: `https://picsum.photos/seed/bafa_${seed}/800/500`
                });
            }
        } else {
            const list = THEMED_BG_IMAGES[currentBgGalleryCategory] || [];
            if (list.length > 0) {
                for (let i = 0; i < Math.min(4, list.length); i++) {
                    const idx = (themedOffset + i) % list.length;
                    items.push(list[idx]);
                }
            }
        }

        grid.innerHTML = items.map(item => {
            const isSelected = item.url.trim() === activeUrl;
            return `
                <div class="es-bg-thumb-card ${isSelected ? 'selected' : ''}" data-url="${escapeHtml(item.url)}" title="${escapeHtml(item.title)}">
                    <img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.title)}" class="es-bg-thumb-img" loading="lazy" onerror="this.onerror=null; this.src='https://picsum.photos/600/400?random=42';">
                    <div class="es-bg-thumb-label">${escapeHtml(item.title)}</div>
                    ${isSelected ? `<div class="es-bg-thumb-check"><i class="bi bi-check-lg"></i></div>` : ''}
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.es-bg-thumb-card').forEach(card => {
            card.addEventListener('click', () => {
                const url = card.getAttribute('data-url');
                const input = document.getElementById('editModuleBgImage');
                if (input) {
                    input.value = url;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                }
                updateModuleBgPreview(url);
                showToast(`Image fixe appliquée : ${card.getAttribute('title')}`, 'success');
            });
        });
    }

    buildGalleryGrid();

    if (!isBgGalleryInitialized) {
        initBgGalleryEvents();
        isBgGalleryInitialized = true;
    }
}

function updateBgGallerySelection(url = '') {
    const grid = document.getElementById('bgGalleryGrid');
    const cleanUrl = (url || '').trim();

    // Détection si l'URL courante est le mode dynamique aléatoire
    const isDynamic = cleanUrl !== '' && (cleanUrl.includes('random') || cleanUrl === 'https://picsum.photos/800/500') && !cleanUrl.includes('/seed/');
    const btnDynamic = document.getElementById('btnDynamicRandomBg');
    if (btnDynamic) {
        btnDynamic.classList.toggle('active', isDynamic);
    }

    if (!grid) return;
    grid.querySelectorAll('.es-bg-thumb-card').forEach(card => {
        const cardUrl = (card.getAttribute('data-url') || '').trim();
        const isSelected = cleanUrl !== '' && !isDynamic && cardUrl === cleanUrl;
        if (isSelected) {
            card.classList.add('selected');
            if (!card.querySelector('.es-bg-thumb-check')) {
                const check = document.createElement('div');
                check.className = 'es-bg-thumb-check';
                check.innerHTML = '<i class="bi bi-check-lg"></i>';
                card.appendChild(check);
            }
        } else {
            card.classList.remove('selected');
            const check = card.querySelector('.es-bg-thumb-check');
            if (check) check.remove();
        }
    });
}

function initBgGalleryEvents() {
    // Bouton Toggle (?) discret
    const btnToggle = document.getElementById('btnToggleBgGallery');
    const galleryBox = document.getElementById('bgGalleryContainer');
    if (btnToggle && galleryBox) {
        btnToggle.addEventListener('click', (e) => {
            e.preventDefault();
            galleryBox.classList.toggle('collapsed');
        });
    }

    // Bouton "Toujours aléatoire" (URL dynamique)
    const btnDynamic = document.getElementById('btnDynamicRandomBg');
    if (btnDynamic) {
        btnDynamic.addEventListener('click', (e) => {
            e.preventDefault();
            const dynamicUrl = 'https://picsum.photos/800/500?random';
            const input = document.getElementById('editModuleBgImage');
            if (input) {
                input.value = dynamicUrl;
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }
            updateModuleBgPreview(dynamicUrl);
            showToast("🎲 Mode 'Toujours aléatoire' activé (l'image changera à chaque chargement) !", "info", 3500);
        });
    }

    // Bouton Nouveau lot / Régénérer
    const btnRandom = document.getElementById('btnRandomBgPreset');
    if (btnRandom) {
        btnRandom.addEventListener('click', (e) => {
            e.preventDefault();
            if (currentBgGalleryCategory === 'picsum') {
                picsumSeedOffset += 4;
            } else {
                themedOffset = (themedOffset + 2) % 10;
            }
            renderBgSuggestions();
            btnRandom.style.transition = 'transform 0.2s ease';
            btnRandom.style.transform = 'rotate(180deg)';
            setTimeout(() => { btnRandom.style.transform = ''; }, 200);
        });
    }
}

function updateModuleBgPreview(url) {
    const container = document.getElementById('moduleBgPreviewContainer');
    const img = document.getElementById('moduleBgPreviewImg');
    if (container && img) {
        if (url && url.trim() !== '') {
            img.src = url.trim();
            container.classList.remove('hidden');
        } else {
            img.src = '';
            container.classList.add('hidden');
        }
    }
    updateBgGallerySelection(url || '');
}

// ----------------------------------------------------------------
// RÉCUPÉRATION & CHARGEMENT DU MODULE
// ----------------------------------------------------------------
async function fetchModuleQuestions(moduleId) {
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('questions').orderBy('order', 'asc').get();
        if (!snap.empty) {
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        }
        return [];
    } catch (e) {
        console.warn("fetchModuleQuestions error:", e);
        return [];
    }
}

// ----------------------------------------------------------------
// GESTION DE LA PROTECTION CONTRE LA PERTE DE MODIFICATIONS NON ENREGISTRÉES
// ----------------------------------------------------------------
let initialModuleStateSnapshot = null;
let pendingNavigationAction = null;
let isBypassingUnsavedCheck = false;
let isUnsavedProtectionInitialized = false;

function getModuleStateSnapshot() {
    try {
        if (typeof syncQuestionsFromDOM === 'function') {
            syncQuestionsFromDOM();
        }
    } catch (e) {}

    const state = {
        num: document.getElementById('editModuleNum')?.value || '',
        title: (document.getElementById('editModuleTitle')?.value || '').trim(),
        subtitle: (document.getElementById('editModuleSubtitle')?.value || '').trim(),
        icon: document.getElementById('editModuleIcon')?.value || '',
        bgImage: (document.getElementById('editModuleBgImage')?.value || '').trim(),
        visible: document.getElementById('editModuleVisible') ? document.getElementById('editModuleVisible').checked : true,
        maxAttempts: document.getElementById('editMaxAttempts')?.value || '0',
        timerMinutes: document.getElementById('editQuizTimerMinutes')?.value || '0',
        timerSeconds: document.getElementById('editQuizTimerSeconds')?.value || '0',
        showResultsAtEnd: document.getElementById('editShowResultsAtEnd')?.checked || false,
        negativePoints: document.getElementById('editNegativePoints')?.checked || false,
        allowPreviousPage: document.getElementById('editQuizAllowPreviousPage')?.checked || false,
        requirePassword: document.getElementById('editQuizRequirePassword')?.checked || false,
        password: (document.getElementById('editQuizPassword')?.value || '').trim(),
        questions: currentEditingQuestions || []
    };
    return JSON.stringify(state);
}

function hasUnsavedChanges() {
    if (isBypassingUnsavedCheck) return false;
    if (!initialModuleStateSnapshot) return false;
    const current = getModuleStateSnapshot();
    return current !== initialModuleStateSnapshot;
}

function markModuleSaved() {
    initialModuleStateSnapshot = getModuleStateSnapshot();
}

function showUnsavedModal(onConfirmCallback) {
    pendingNavigationAction = onConfirmCallback;
    const modal = document.getElementById('overlayUnsavedChanges');
    if (modal) {
        modal.classList.remove('hidden');
    } else if (typeof onConfirmCallback === 'function') {
        if (confirm("Attention : vous avez des modifications non enregistrées. Voulez-vous vraiment quitter ?")) {
            onConfirmCallback();
        }
    }
}

function closeUnsavedModal() {
    pendingNavigationAction = null;
    const modal = document.getElementById('overlayUnsavedChanges');
    if (modal) modal.classList.add('hidden');
}

function initUnsavedChangesProtection() {
    if (isUnsavedProtectionInitialized) return;
    isUnsavedProtectionInitialized = true;

    // Boutons de la modale
    document.getElementById('btnCloseUnsavedModal')?.addEventListener('click', closeUnsavedModal);
    document.getElementById('btnStayOnPage')?.addEventListener('click', closeUnsavedModal);
    
    document.getElementById('btnDiscardAndLeave')?.addEventListener('click', () => {
        isBypassingUnsavedCheck = true;
        initialModuleStateSnapshot = null;
        const action = pendingNavigationAction;
        closeUnsavedModal();
        if (typeof action === 'function') {
            action();
        } else if (typeof action === 'string') {
            window.location.href = action;
        }
    });

    // Interception des clics sur TOUS les liens <a> (Navbar, dropdown de changement de module, boutons de navigation)
    document.addEventListener('click', (e) => {
        if (isBypassingUnsavedCheck) return;
        const link = e.target.closest('a[href]');
        if (!link) return;

        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:') || link.hasAttribute('download') || link.target === '_blank') {
            return;
        }

        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.stopPropagation();
            showUnsavedModal(() => {
                isBypassingUnsavedCheck = true;
                window.location.href = link.href;
            });
        }
    }, true);

    // Alerte native fermeture d'onglet / rechargement navigateur
    window.addEventListener('beforeunload', (e) => {
        if (isBypassingUnsavedCheck) return;
        if (hasUnsavedChanges()) {
            e.preventDefault();
            e.returnValue = 'Vous avez des modifications non enregistrées.';
            return 'Vous avez des modifications non enregistrées.';
        }
    });

    // Protection flèche retour du navigateur (popstate)
    try {
        window.history.pushState({ page: 'edit-module' }, '', window.location.href);
    } catch (e) {}

    window.addEventListener('popstate', (e) => {
        if (isBypassingUnsavedCheck) return;
        if (hasUnsavedChanges()) {
            window.history.pushState({ page: 'edit-module' }, '', window.location.href);
            showUnsavedModal(() => {
                isBypassingUnsavedCheck = true;
                window.history.back();
            });
        }
    });
}

async function loadModuleHubData() {
    const loader = document.getElementById('pageLoader');
    const navbar = document.getElementById('formationNavbar');
    const mainView = document.getElementById('moduleHubMain');
    const moduleId = getQueryParam('id') || getQueryParam('module');

    try {
        // Charger tous les modules pour le switch dropdown
        const allSnap = await db.collection('formation').orderBy('num', 'asc').get();
        if (!allSnap.empty) {
            allFormationModules = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        } else {
            allFormationModules = [];
        }

        let moduleData = null;
        if (moduleId) {
            moduleData = allFormationModules.find(m => m.id === moduleId);
            if (!moduleData) {
                const docSnap = await db.collection('formation').doc(moduleId).get();
                if (docSnap.exists) {
                    moduleData = { id: docSnap.id, ...docSnap.data() };
                }
            }

            if (moduleData) {
                const questions = await fetchModuleQuestions(moduleId);
                moduleData.questions = questions.length > 0 ? questions : (moduleData.questions || []);
            }
        }

        if (moduleData) {
            currentEditingModuleId = moduleData.id;
            document.getElementById('editModuleId').value = moduleData.id;
            document.getElementById('editModuleNum').value = moduleData.num || 1;
            document.getElementById('editModuleTitle').value = moduleData.title || '';
            document.getElementById('editModuleSubtitle').value = moduleData.subtitle || '';
            document.getElementById('editModuleIcon').value = moduleData.icon || 'bi-journal-bookmark';
            document.getElementById('editModuleBgImage').value = moduleData.bgImage || '';
            updateModuleBgPreview(moduleData.bgImage || '');
            
            const isVis = (moduleData.visible !== false);
            if (document.getElementById('editModuleVisible')) {
                document.getElementById('editModuleVisible').checked = isVis;
            }

            const qConfig = moduleData.quizConfig || {};
            document.getElementById('editMaxAttempts').value = (qConfig.maxAttempts !== undefined) ? qConfig.maxAttempts : 0;

            let initialMins = 0;
            let initialSecs = 0;
            if (qConfig.timerTotalSeconds !== undefined && qConfig.timerTotalSeconds !== null) {
                const tot = parseInt(qConfig.timerTotalSeconds, 10) || 0;
                initialMins = Math.floor(tot / 60);
                initialSecs = tot % 60;
            } else {
                initialMins = parseInt(qConfig.timerMinutes, 10) || 0;
                initialSecs = parseInt(qConfig.timerSeconds, 10) || 0;
            }
            document.getElementById('editQuizTimerMinutes').value = initialMins;
            document.getElementById('editQuizTimerSeconds').value = initialSecs;
            document.getElementById('editShowResultsAtEnd').checked = qConfig.showResultsAtEnd === true;
            if (document.getElementById('editNegativePoints')) {
                document.getElementById('editNegativePoints').checked = (qConfig.negativePoints === true || qConfig.negativePoints === 'true');
            }

            const chkAllowPrev = document.getElementById('editQuizAllowPreviousPage');
            if (chkAllowPrev) {
                chkAllowPrev.checked = (qConfig.allowPreviousPage !== false);
            }

            const hasPwd = Boolean(qConfig.requirePassword === true || (qConfig.password && String(qConfig.password).trim() !== ''));
            const pwdVal = qConfig.password || '';
            const chkRequirePassword = document.getElementById('editQuizRequirePassword');
            const inputPassword = document.getElementById('editQuizPassword');
            const wrapPassword = document.getElementById('quizPasswordInputWrap');
            if (chkRequirePassword) chkRequirePassword.checked = hasPwd;
            if (inputPassword) inputPassword.value = pwdVal;
            if (wrapPassword) {
                if (hasPwd) wrapPassword.classList.remove('hidden');
                else wrapPassword.classList.add('hidden');
            }

            currentEditingQuestions = JSON.parse(JSON.stringify(moduleData.questions || []));

            // Topbar Brand
            const topbarIcon = document.getElementById('moduleIconTopbar');
            const topbarTitle = document.getElementById('moduleNameTopbar');
            if (topbarIcon) topbarIcon.innerHTML = `<i class="bi ${moduleData.icon || 'bi-journal-bookmark'}"></i>`;
            if (topbarTitle) topbarTitle.textContent = `Module ${moduleData.num < 10 ? '0' + moduleData.num : moduleData.num} — ${moduleData.title}`;

            // Hero UI
            document.getElementById('heroModuleTitle').textContent = moduleData.title;
            document.getElementById('heroModuleSubtitle').textContent = moduleData.subtitle || '';
            document.getElementById('heroModuleBadge').textContent = `Module ${moduleData.num < 10 ? '0' + moduleData.num : moduleData.num}`;
            
            const visBadge = document.getElementById('heroVisibilityBadge');
            if (visBadge) {
                visBadge.textContent = isVis ? 'Visible' : 'Masqué';
                visBadge.className = `es-badge ${isVis ? 'es-badge--approved' : 'es-badge--pending'}`;
            }

            if (currentRole === 'admin') {
                document.getElementById('btnDeleteModule')?.classList.remove('hidden');
            }

            // Charger les soumissions de ce module
            await loadModuleSubmissions(moduleData.id);

        } else {
            // Nouveau module
            currentEditingModuleId = null;
            let nextNum = 1;
            if (allFormationModules.length > 0) {
                const nums = allFormationModules.map(d => parseInt(d.num, 10) || 0);
                nextNum = Math.max(...nums, 0) + 1;
            }

            document.getElementById('editModuleId').value = '';
            document.getElementById('editModuleNum').value = nextNum;
            document.getElementById('editModuleTitle').value = '';
            document.getElementById('editModuleSubtitle').value = '';
            document.getElementById('editModuleIcon').value = 'bi-journal-bookmark';
            document.getElementById('editModuleBgImage').value = '';
            updateModuleBgPreview('');
            
            if (document.getElementById('editModuleVisible')) {
                document.getElementById('editModuleVisible').checked = true;
            }

            document.getElementById('editMaxAttempts').value = 1;
            document.getElementById('editQuizTimerMinutes').value = 0;
            document.getElementById('editQuizTimerSeconds').value = 0;
            document.getElementById('editShowResultsAtEnd').checked = false;
            if (document.getElementById('editNegativePoints')) {
                document.getElementById('editNegativePoints').checked = false;
            }
            if (document.getElementById('editQuizAllowPreviousPage')) {
                document.getElementById('editQuizAllowPreviousPage').checked = true;
            }

            const chkRequirePassword = document.getElementById('editQuizRequirePassword');
            const inputPassword = document.getElementById('editQuizPassword');
            const wrapPassword = document.getElementById('quizPasswordInputWrap');
            if (chkRequirePassword) chkRequirePassword.checked = false;
            if (inputPassword) inputPassword.value = '';
            if (wrapPassword) wrapPassword.classList.add('hidden');

            currentEditingQuestions = [
                {
                    id: 'q_' + Date.now() + '_1',
                    type: 'qcm',
                    text: '',
                    options: ['Option 1', 'Option 2'],
                    correctIndex: 0,
                    hint: ''
                }
            ];

            document.getElementById('moduleNameTopbar').textContent = 'Nouveau Module de Formation';
            document.getElementById('heroModuleTitle').textContent = 'Nouveau Module & Quiz';
            document.getElementById('heroModuleSubtitle').textContent = 'Configuration et création des questions';
            document.getElementById('heroModuleBadge').textContent = 'Nouveau';
            document.getElementById('btnDeleteModule')?.classList.add('hidden');

            moduleSubmissions = [];
            updateModuleStats();
            applyModuleFiltersAndRender();
        }

        const chosenIcon = document.getElementById('editModuleIcon').value || 'bi-journal-bookmark';
        renderIconPicker(chosenIcon);
        updateIconPreview(chosenIcon);
        const currentBgUrl = document.getElementById('editModuleBgImage')?.value || '';
        renderBgSuggestions(currentBgUrl);
        renderQuestionsEditor();
        initTopbarDropdown();

        // Si l'URL demande directement l'onglet résultats (?tab=results)
        if (getQueryParam('tab') === 'results') {
            switchTab('results');
        }

        if (loader) loader.classList.add('hidden');
        if (navbar) navbar.style.display = 'block';
        if (mainView) mainView.style.display = 'block';

        // Initialiser la protection contre les modifications non enregistrées
        markModuleSaved();
        initUnsavedChangesProtection();

    } catch (err) {
        if (loader) loader.classList.add('hidden');
        console.error("loadModuleHubData error:", err);
        showToast("Erreur lors du chargement du module.", "error");
    }
}

// ----------------------------------------------------------------
// NAVIGATION PAR ONGLETS (TABS)
// ----------------------------------------------------------------
function switchTab(tabName) {
    const tabEditor = document.getElementById('tabContentEditor');
    const tabResults = document.getElementById('tabContentResults');
    const btnEditor = document.getElementById('tabBtnEditor');
    const btnResults = document.getElementById('tabBtnResults');

    if (tabName === 'results') {
        tabEditor?.classList.add('hidden');
        tabResults?.classList.remove('hidden');
        btnEditor?.classList.remove('active');
        btnResults?.classList.add('active');
    } else {
        tabEditor?.classList.remove('hidden');
        tabResults?.classList.add('hidden');
        btnEditor?.classList.add('active');
        btnResults?.classList.remove('active');
    }
}

document.getElementById('tabBtnEditor')?.addEventListener('click', () => switchTab('editor'));
document.getElementById('tabBtnResults')?.addEventListener('click', () => switchTab('results'));

// ----------------------------------------------------------------
// GESTION DES SOUMISSIONS DU MODULE (ONGLET 2)
// ----------------------------------------------------------------
async function loadModuleSubmissions(moduleId) {
    moduleSubmissions = [];
    try {
        const snap = await db.collection('formation').doc(moduleId).collection('submissions').get();
        if (!snap.empty) {
            moduleSubmissions = snap.docs.map(d => ({ id: d.id, moduleId: moduleId, ...d.data() }));
            moduleSubmissions.sort((a, b) => {
                const ta = a.submittedAt?.toMillis ? a.submittedAt.toMillis() : (a.submittedAt?.seconds ? a.submittedAt.seconds * 1000 : 0);
                const tb = b.submittedAt?.toMillis ? b.submittedAt.toMillis() : (b.submittedAt?.seconds ? b.submittedAt.seconds * 1000 : 0);
                return tb - ta;
            });
        }
    } catch (e) {
        console.warn("loadModuleSubmissions error:", e);
    }

    const badgeTabCount = document.getElementById('tabCountSubmissions');
    if (badgeTabCount) badgeTabCount.textContent = moduleSubmissions.length;

    updateModuleStats();
    applyModuleFiltersAndRender();
}

function updateModuleStats() {
    const total = moduleSubmissions.length;
    const uniqueUids = new Set(moduleSubmissions.map(s => s.userId).filter(Boolean));
    const uniqueCount = uniqueUids.size;

    let passed = 0;
    let sumScore = 0;
    let countToGrade = 0;

    moduleSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        sumScore += pct;
        if (pct >= 50) passed++;
        if (s.evaluations && Object.values(s.evaluations).some(ev => ev.status === 'auto_draft')) {
            countToGrade++;
        }
    });

    const avg = total > 0 ? Math.round(sumScore / total) : 0;
    const rate = total > 0 ? Math.round((passed / total) * 100) : 0;

    document.getElementById('statModuleTotalAttempts').textContent = total;
    document.getElementById('statModuleUniqueStagiaires').textContent = uniqueCount;
    document.getElementById('statModuleSuccessRate').textContent = `${rate}%`;
    document.getElementById('statModuleAverageScore').textContent = `${avg}%`;

    document.getElementById('countModuleFilterAll').textContent = total;
    document.getElementById('countModuleFilterPassed').textContent = passed;
    document.getElementById('countModuleFilterFailed').textContent = total - passed;
    document.getElementById('countModuleFilterToGrade').textContent = countToGrade;
}

function applyModuleFiltersAndRender() {
    const tableBody = document.getElementById('moduleSubmissionsTableBody');
    const emptyPlaceholder = document.getElementById('emptyModuleSubmissionsPlaceholder');
    if (!tableBody) return;

    filteredModuleSubmissions = moduleSubmissions.filter(sub => {
        if (currentSearchQuery) {
            const q = currentSearchQuery.toLowerCase();
            const name = (sub.userName || '').toLowerCase();
            const email = (sub.userEmail || '').toLowerCase();
            if (!name.includes(q) && !email.includes(q)) return false;
        }

        const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
        if (currentFilterStatus === 'passed' && pct < 50) return false;
        if (currentFilterStatus === 'failed' && pct >= 50) return false;
        if (currentFilterStatus === 'to_grade') {
            const hasDraft = sub.evaluations && Object.values(sub.evaluations).some(ev => ev.status === 'auto_draft');
            if (!hasDraft) return false;
        }

        return true;
    });

    if (filteredModuleSubmissions.length === 0) {
        tableBody.innerHTML = '';
        if (emptyPlaceholder) emptyPlaceholder.classList.remove('hidden');
        return;
    }

    if (emptyPlaceholder) emptyPlaceholder.classList.add('hidden');

    tableBody.innerHTML = filteredModuleSubmissions.map((sub, idx) => {
        const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
        const isPassed = pct >= 50;
        const scoreRatio = sub.score ? `${sub.score.correct}/${sub.score.total}` : '';
        const hasDraft = sub.evaluations && Object.values(sub.evaluations).some(ev => ev.status === 'auto_draft');

        let statusBadgeHtml = '';
        if (hasDraft) {
            statusBadgeHtml = `<span class="es-badge es-badge--pending" style="font-size:0.75rem;"><i class="bi bi-pencil"></i> Rédaction à noter</span>`;
        } else if (isPassed) {
            statusBadgeHtml = `<span class="es-badge es-badge--approved" style="font-size:0.75rem;"><i class="bi bi-check-circle-fill"></i> Validé (${pct}%)</span>`;
        } else {
            statusBadgeHtml = `<span class="es-badge es-badge--rejected" style="font-size:0.75rem;"><i class="bi bi-x-circle-fill"></i> À retravailler (${pct}%)</span>`;
        }

        return `
            <tr>
                <td>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div style="width:32px; height:32px; border-radius:50%; background:var(--clr-surface-3); display:flex; align-items:center; justify-content:center; font-weight:700; color:var(--clr-text); font-size:0.8rem; flex-shrink:0;">
                            ${escapeHtml((sub.userName || 'S')[0].toUpperCase())}
                        </div>
                        <div>
                            <div style="font-weight:700; color:var(--clr-text); font-size:0.92rem;">${escapeHtml(sub.userName || 'Stagiaire')}</div>
                            <div style="font-size:0.78rem; color:var(--clr-text-muted);">${escapeHtml(sub.userEmail || '')}</div>
                        </div>
                    </div>
                </td>
                <td style="text-align:center;">
                    <span style="font-size:0.82rem; font-weight:600; color:var(--clr-text);">Tentative #${sub.attemptNumber || 1}</span>
                    ${sub.timeExpired ? '<span style="font-size:0.72rem; color:var(--clr-danger); display:block;">⏰ Expiré</span>' : ''}
                </td>
                <td style="text-align:center;">
                    <span style="font-size:0.82rem; color:var(--clr-text-muted);">${formatDate(sub.submittedAt)}</span>
                </td>
                <td style="text-align:center;">
                    <span style="font-weight:800; font-size:0.95rem; color:${isPassed ? 'var(--clr-success)' : 'var(--clr-danger)'};">${pct}%</span>
                    <span style="font-size:0.78rem; color:var(--clr-text-muted); margin-left:4px;">(${scoreRatio})</span>
                </td>
                <td style="text-align:center;">${statusBadgeHtml}</td>
                <td style="text-align:center;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; gap:6px;">
                        <button type="button" class="es-btn es-btn--primary es-btn--sm btn-inspect-sub" data-sub-idx="${idx}" style="font-weight:600; padding:6px 12px; font-size:0.82rem;" title="Inspecter et noter la copie">
                            <i class="bi bi-eye-fill"></i> Inspecter
                        </button>
                        <button type="button" class="es-btn es-btn--danger es-btn--sm btn-delete-sub" data-sub-id="${sub.id}" data-sub-name="${escapeHtml(sub.userName || 'le stagiaire')}" style="padding:6px 10px; font-size:0.82rem;" title="Supprimer définitivement cette copie">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('.btn-inspect-sub').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.getAttribute('data-sub-idx'), 10);
            const sub = filteredModuleSubmissions[idx];
            if (sub) openSubmissionInspectionModal(sub);
        });
    });

    tableBody.querySelectorAll('.btn-delete-sub').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const subId = btn.getAttribute('data-sub-id');
            const subName = btn.getAttribute('data-sub-name') || 'ce stagiaire';
            if (subId) deleteSubmission(subId, subName);
        });
    });
}

// ----------------------------------------------------------------
// SUPPRESSION D'UNE COPIE / RÉPONSE DE STAGIAIRE
// ----------------------------------------------------------------
async function deleteSubmission(submissionId, candidateName = 'ce stagiaire') {
    if (!currentEditingModuleId || !submissionId) return;
    if (!confirm(`⚠️ Supprimer définitivement la copie de ${candidateName} ? Cette action est irréversible.`)) {
        return;
    }

    try {
        await db.collection('formation').doc(currentEditingModuleId).collection('submissions').doc(submissionId).delete();
        showToast("Copie supprimée avec succès.", "success");
        await loadModuleSubmissions(currentEditingModuleId);
        const modal = document.getElementById('overlayReviewSubmission');
        if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
        }
    } catch (err) {
        console.error("Delete submission error:", err);
        showToast("Erreur lors de la suppression de la copie.", "error");
    }
}

// ----------------------------------------------------------------
// MODAL D'INSPECTION & NOTATION
// ----------------------------------------------------------------
async function openSubmissionInspectionModal(sub) {
    activeInspectingSubmission = JSON.parse(JSON.stringify(sub));
    const modal = document.getElementById('overlayReviewSubmission');
    const nameEl = document.getElementById('reviewCandidateName');
    const metaEl = document.getElementById('reviewCandidateMeta');
    const scoreHeader = document.getElementById('reviewScoreHeader');
    const questionsContainer = document.getElementById('reviewQuestionsContainer');

    if (!modal) return;

    if (nameEl) nameEl.textContent = sub.userName || sub.userEmail || 'Stagiaire';
    if (metaEl) {
        metaEl.textContent = `Tentative #${sub.attemptNumber || 1} • Transmise le ${formatDate(sub.submittedAt)}`;
    }

    const pct = sub.score?.percent !== undefined ? sub.score.percent : 0;
    const isPassed = pct >= 50;

    if (scoreHeader) {
        scoreHeader.innerHTML = `
            <div style="display:flex; align-items:center; gap:16px;">
                <div style="width:52px; height:52px; border-radius:50%; background:${isPassed ? 'rgba(39, 174, 96, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; color:${isPassed ? 'var(--clr-success)' : 'var(--clr-danger)'}; display:flex; align-items:center; justify-content:center; font-weight:800; font-size:1.15rem; flex-shrink:0;">
                    ${pct}%
                </div>
                <div>
                    <div style="font-weight:700; font-size:1rem; color:var(--clr-text);">
                        Score QCM : ${sub.score ? `${sub.score.correct} / ${sub.score.total} corrects` : ''}
                    </div>
                    <div style="font-size:0.82rem; color:var(--clr-text-muted); margin-top:2px;">
                        ${isPassed ? '✅ Épreuve validée' : '❌ Objectif non atteint (< 50%)'}
                    </div>
                </div>
            </div>
            <div style="font-size:0.82rem; color:var(--clr-text-muted);">
                Email : <strong style="color:var(--clr-text);">${escapeHtml(sub.userEmail || '')}</strong>
            </div>
        `;
    }

    modal.classList.remove('hidden');

    const questions = currentEditingQuestions.length > 0 ? currentEditingQuestions : await fetchModuleQuestions(sub.moduleId);
    renderInspectionQuestions(questions, activeInspectingSubmission);
}

function renderInspectionQuestions(questions, sub) {
    const container = document.getElementById('reviewQuestionsContainer');
    if (!container) return;

    if (!questions || questions.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--clr-text-muted);">Aucune question enregistrée.</div>`;
        return;
    }

    const answers = sub.answers || {};
    const evaluations = sub.evaluations || {};

    container.innerHTML = questions.map((q, idx) => {
        const ans = answers[q.id];
        const type = q.type || 'qcm';

        if (type === 'section') {
            return `
                <div style="background:var(--clr-surface-2); border-left:4px solid var(--clr-primary); border-radius:var(--radius-sm); padding:12px 16px; margin-top:12px; margin-bottom:4px;">
                    <div style="font-size:0.82rem; font-weight:800; color:var(--clr-primary-dark); text-transform:uppercase; display:flex; align-items:center; gap:6px;">
                        <i class="bi bi-bookmark-fill"></i> ${escapeHtml(q.title || q.text || 'Section')}
                    </div>
                    ${q.description ? `<div style="font-size:0.8rem; color:var(--clr-text-muted); margin-top:4px;">${escapeHtml(q.description)}</div>` : ''}
                </div>
            `;
        }

        let contentHtml = '';

        if (type === 'qcm') {
            const userIndices = Array.isArray(ans)
                ? ans.map(n => parseInt(n, 10))
                : (ans !== undefined && ans !== null && ans !== '' ? [parseInt(ans, 10)] : []);
            const correctIndexes = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                ? q.correctIndexes.map(n => parseInt(n, 10))
                : [(q.correctIndex !== undefined ? q.correctIndex : 0)];

            const optionsHtml = (q.options || []).map((opt, oIdx) => {
                const isSelected = userIndices.includes(oIdx);
                const isExpected = correctIndexes.includes(oIdx);
                let optStyle = 'background:var(--clr-surface); border:1px solid var(--clr-surface-3); color:var(--clr-text);';
                let icon = '<i class="bi bi-square"></i>';

                if (isSelected && isExpected) {
                    optStyle = 'background:rgba(39, 174, 96, 0.12); border:1.5px solid var(--clr-success); color:var(--clr-success); font-weight:700;';
                    icon = '<i class="bi bi-check-square-fill"></i>';
                } else if (isSelected && !isExpected) {
                    optStyle = 'background:rgba(231, 76, 60, 0.12); border:1.5px solid var(--clr-danger); color:var(--clr-danger); font-weight:700;';
                    icon = '<i class="bi bi-x-square-fill"></i>';
                } else if (isExpected) {
                    optStyle = 'background:rgba(39, 174, 96, 0.08); border:1.5px dashed var(--clr-success); color:var(--clr-success);';
                    icon = '<i class="bi bi-check-square"></i>';
                }

                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.85rem; ${optStyle}">
                        ${icon}
                        <span>${escapeHtml(opt)}</span>
                        ${isSelected ? '<span style="font-size:0.72rem; margin-left:auto; opacity:0.85;">(Réponse choisie)</span>' : ''}
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${optionsHtml}
                </div>
            `;
        } else if (type === 'image_choice') {
            const chosenIdx = ans !== undefined && ans !== null && ans !== '' ? parseInt(ans, 10) : -1;
            const correctIdx = q.correctIndex !== undefined ? q.correctIndex : 0;
            const isCorrect = (chosenIdx === correctIdx);
            const options = q.imageOptions || [];

            const optionsHtml = options.map((opt, oIdx) => {
                const isSelected = (chosenIdx === oIdx);
                const isExpected = (correctIdx === oIdx);
                let borderStyle = 'border:1.5px solid var(--clr-surface-3); background:var(--clr-surface);';
                let badge = '';

                if (isSelected && isExpected) {
                    borderStyle = 'border:2px solid var(--clr-success); background:rgba(39, 174, 96, 0.08);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-success); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-check-circle-fill"></i> Choisie & Correcte</span>`;
                } else if (isSelected && !isExpected) {
                    borderStyle = 'border:2px solid var(--clr-danger); background:rgba(231, 76, 60, 0.08);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-danger); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-x-circle-fill"></i> Réponse choisie</span>`;
                } else if (isExpected) {
                    borderStyle = 'border:2px dashed var(--clr-success); background:rgba(39, 174, 96, 0.05);';
                    badge = `<span style="position:absolute; top:6px; right:6px; background:var(--clr-success); color:#fff; font-size:0.7rem; font-weight:800; padding:2px 6px; border-radius:4px;"><i class="bi bi-check"></i> Attendu</span>`;
                }

                return `
                    <div style="position:relative; border-radius:var(--radius-sm); padding:10px; display:flex; flex-direction:column; gap:6px; ${borderStyle}">
                        ${badge}
                        <div style="width:100%; height:110px; background:#181c19; border-radius:4px; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                            <img src="${escapeHtml(opt.imageUrl || '')}" alt="Option ${oIdx + 1}" style="max-width:100%; max-height:100%; object-fit:contain;">
                        </div>
                        <div style="font-size:0.82rem; font-weight:700; color:var(--clr-text); text-align:center;">
                            ${escapeHtml(opt.label || ('Option ' + (oIdx + 1)))}
                        </div>
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px;">
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); gap:10px;">
                        ${optionsHtml}
                    </div>
                </div>
            `;
        } else if (type === 'table_choice') {
            const col1 = q.col1Label || 'VRAI';
            const col2 = q.col2Label || 'FAUX';
            const rows = q.tableRows || [];
            const userAnsObj = (ans && typeof ans === 'object') ? ans : {};

            const tableRowsHtml = rows.map((row, rIdx) => {
                const userRow = userAnsObj[rIdx] || {};
                const uCol1 = !!userRow.col1;
                const uCol2 = !!userRow.col2;
                const expCol1 = !!row.correctCol1;
                const expCol2 = !!row.correctCol2;
                const isRowCorrect = (uCol1 === expCol1 && uCol2 === expCol2);

                const getCellState = (uSelected, expSelected) => {
                    if (uSelected && expSelected) {
                        return { icon: '<i class="bi bi-check-circle-fill" style="color:var(--clr-success); font-size:1.1rem;"></i>', style: 'background:rgba(39,174,96,0.12);' };
                    } else if (uSelected && !expSelected) {
                        return { icon: '<i class="bi bi-x-circle-fill" style="color:var(--clr-danger); font-size:1.1rem;"></i>', style: 'background:rgba(231,76,60,0.12);' };
                    } else if (!uSelected && expSelected) {
                        return { icon: '<i class="bi bi-arrow-right-circle" style="color:var(--clr-success); font-size:1rem;" title="Attendu"></i>', style: 'background:rgba(39,174,96,0.05);' };
                    }
                    return { icon: '<span style="color:var(--clr-surface-3); font-size:1.1rem;">○</span>', style: '' };
                };

                const cell1 = getCellState(uCol1, expCol1);
                const cell2 = getCellState(uCol2, expCol2);

                return `
                    <tr style="border-bottom:1px solid var(--clr-surface-3); ${isRowCorrect ? '' : 'background:rgba(231,76,60,0.03);'}">
                        <td style="padding:10px 14px; font-size:0.85rem; font-weight:600; color:var(--clr-text);">
                            <span style="font-weight:800; color:var(--clr-text-muted); margin-right:6px;">${rIdx + 1}.</span>
                            ${escapeHtml(row.text || '')}
                        </td>
                        <td style="text-align:center; padding:8px; ${cell1.style}">
                            ${cell1.icon}
                        </td>
                        <td style="text-align:center; padding:8px; ${cell2.style}">
                            ${cell2.icon}
                        </td>
                    </tr>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); overflow:hidden;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background:var(--clr-surface-2); border-bottom:2px solid var(--clr-surface-3);">
                                <th style="padding:10px 14px; font-size:0.8rem; font-weight:800; text-align:left;">Affirmation</th>
                                <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col1)}</th>
                                <th style="padding:10px; font-size:0.8rem; font-weight:800; text-align:center; width:110px;">${escapeHtml(col2)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tableRowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
        } else if (type === 'classification') {
            const categories = q.categories || [];
            const items = q.items || [];
            const userPlacements = (ans && typeof ans === 'object') ? ans : {};

            const catBoxesHtml = categories.map(cat => {
                const placedItems = items.filter(it => userPlacements[it.id] === cat.id);
                const itemsBadges = placedItems.map(it => {
                    const isCorrect = (it.categoryId === cat.id);
                    const expectedCat = categories.find(c => c.id === it.categoryId);
                    return `
                        <span class="es-badge" style="background:${isCorrect ? 'rgba(39, 174, 96, 0.15)' : 'rgba(231, 76, 60, 0.15)'}; color:${isCorrect ? '#27ae60' : '#e74c3c'}; border:1px solid ${isCorrect ? 'rgba(39, 174, 96, 0.3)' : 'rgba(231, 76, 60, 0.3)'}; padding:4px 8px; font-size:0.8rem; font-weight:700;">
                            <i class="bi ${isCorrect ? 'bi-check-circle-fill' : 'bi-x-circle-fill'}"></i>
                            ${escapeHtml(it.text || '')}
                            ${!isCorrect ? `<small style="font-size:0.7rem; opacity:0.85; margin-left:4px;">(attendu : ${escapeHtml(expectedCat?.title || 'autre')})</small>` : ''}
                        </span>
                    `;
                }).join('');

                const unplacedExpected = items.filter(it => it.categoryId === cat.id && userPlacements[it.id] !== cat.id);
                const missingBadges = unplacedExpected.map(it => `
                    <span class="es-badge" style="background:rgba(243, 156, 18, 0.1); color:#d68910; border:1px dashed rgba(243, 156, 18, 0.4); padding:4px 8px; font-size:0.75rem;">
                        <i class="bi bi-dash-circle"></i> Non placé : ${escapeHtml(it.text || '')}
                    </span>
                `).join('');

                return `
                    <div style="background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-sm); padding:12px; display:flex; flex-direction:column; gap:8px;">
                        <div style="font-size:0.85rem; font-weight:800; color:var(--clr-text); border-bottom:1px solid var(--clr-surface-3); padding-bottom:6px;">
                            📁 ${escapeHtml(cat.title || 'Catégorie')}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px; min-height:36px; align-items:center;">
                            ${itemsBadges || '<span style="font-size:0.75rem; color:var(--clr-text-muted); font-style:italic;">Aucune étiquette placée</span>'}
                            ${missingBadges}
                        </div>
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="margin-top:10px; display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px;">
                    ${catBoxesHtml}
                </div>
            `;
        } else if (type === 'cloze') {
            const rawCloze = q.clozeText || '';
            const rawMatches = rawCloze.match(/\[([^\]]+)\]/g) || [];
            const expectedBlanks = rawMatches.map(m => m.slice(1, -1).trim()).filter(Boolean);
            const userPlaced = Array.isArray(ans) ? ans : [];

            let filledIndex = 0;
            const parsedCloze = escapeHtml(rawCloze).replace(/\[([^\]]+)\]/g, (match, p1) => {
                const curIndex = filledIndex++;
                const expected = expectedBlanks[curIndex] || p1;
                const placed = userPlaced[curIndex] || '';
                const isBlankCorrect = (placed.trim().toLowerCase() === expected.trim().toLowerCase());

                return `<span style="display:inline-flex; align-items:center; padding:2px 8px; border-radius:4px; font-weight:700; font-size:0.82rem; margin:0 3px; ${isBlankCorrect ? 'background:rgba(39,174,96,0.18); border:1.5px solid var(--clr-success); color:var(--clr-success);' : 'background:rgba(231,76,60,0.18); border:1.5px solid var(--clr-danger); color:var(--clr-danger);'}">
                    ${escapeHtml(placed || '—')} ${!isBlankCorrect ? `<small style="font-size:0.7rem; opacity:0.85; margin-left:4px;">(attendu : ${escapeHtml(expected)})</small>` : '✓'}
                </span>`;
            });

            contentHtml = `
                <div style="margin-top:10px; padding:12px 14px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.88rem; line-height:1.7;">
                    ${parsedCloze}
                </div>
            `;
        } else if (type === 'puzzle') {
            const expectedItems = q.items || [];
            const userSeq = Array.isArray(ans) ? ans : [];

            const seqHtml = userSeq.map((it, pIdx) => {
                const isCorrectPos = (it === expectedItems[pIdx]);
                return `
                    <div style="display:flex; align-items:center; gap:8px; padding:6px 10px; border-radius:var(--radius-sm); font-size:0.84rem; background:var(--clr-surface); border:1px solid ${isCorrectPos ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                        <span style="font-weight:700; color:var(--clr-text-muted);">${pIdx + 1}.</span>
                        <span style="font-weight:600; color:var(--clr-text); flex:1;">${escapeHtml(it)}</span>
                        ${isCorrectPos ? '<i class="bi bi-check-circle-fill" style="color:var(--clr-success);"></i>' : `<span style="font-size:0.72rem; color:var(--clr-danger);">(attendu : ${escapeHtml(expectedItems[pIdx] || '')})</span>`}
                    </div>
                `;
            }).join('');

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${seqHtml || '<div style="font-size:0.82rem; color:var(--clr-text-muted);">Aucun ordre renseigné.</div>'}
                </div>
            `;
        } else if (type === 'boolean') {
            const expectedBool = (q.correctAnswer === true || q.correctAnswer === 'true');
            const userBool = (ans === true || ans === 'true' || ans === 1);
            const hasAnswered = (ans !== null && ans !== undefined && ans !== '');
            const isCorrect = (hasAnswered && userBool === expectedBool);

            contentHtml = `
                <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
                    <div style="display:flex; align-items:center; gap:8px; padding:8px 14px; border-radius:var(--radius-sm); font-size:0.88rem; font-weight:700; ${isCorrect ? 'background:rgba(39,174,96,0.12); border:1.5px solid var(--clr-success); color:var(--clr-success);' : 'background:rgba(231,76,60,0.12); border:1.5px solid var(--clr-danger); color:var(--clr-danger);'}">
                        ${isCorrect ? '<i class="bi bi-check-circle-fill"></i>' : '<i class="bi bi-x-circle-fill"></i>'}
                        <span>Réponse choisie : ${hasAnswered ? (userBool ? '👍 VRAI' : '👎 FAUX') : '— (Non répondu)'}</span>
                        ${!isCorrect ? `<span style="font-size:0.75rem; opacity:0.85; margin-left:6px;">(Attendu : ${expectedBool ? 'VRAI' : 'FAUX'})</span>` : ''}
                    </div>
                </div>
            `;
        } else if (type === 'pinpoint') {
            const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
            const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
            const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
            const userCoords = ans && typeof ans === 'object' ? ans : (ans ? (()=>{ try { return JSON.parse(ans); } catch(e){ return null; } })() : null);

            let isCorrect = false;
            if (userCoords && userCoords.x !== undefined && userCoords.y !== undefined) {
                const dx = userCoords.x - targetX;
                const dy = userCoords.y - targetY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                isCorrect = (dist <= radius);
            }

            contentHtml = `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.82rem; font-weight:700;">
                        <span>${isCorrect ? '<span style="color:var(--clr-success);"><i class="bi bi-check-circle-fill"></i> Repère dans la zone tolérée</span>' : '<span style="color:var(--clr-danger);"><i class="bi bi-x-circle-fill"></i> Repère hors zone</span>'}</span>
                        <span style="color:var(--clr-text-muted);">Cible : (${targetX}%, ${targetY}%) ± ${radius}%</span>
                    </div>
                    ${q.pinImage ? `
                        <div class="es-pinpoint-result-zone" style="max-width:440px; margin:0 auto; position:relative; border-radius:6px; overflow:hidden; border:1px solid var(--clr-surface-3); text-align:center;">
                            <img src="${escapeHtml(q.pinImage)}" alt="Résultat repère" style="display:block; margin:0 auto; max-width:100%; height:auto;">
                            <div class="es-pinpoint-target-zone" style="position:absolute; left:${targetX}%; top:${targetY}%; width:${radius * 2}%; aspect-ratio:1 / 1; height:auto; transform:translate(-50%, -50%); border-radius:50%; border:2px dashed #2ecc71; background:rgba(46, 204, 113, 0.25); pointer-events:none;"></div>
                            <div style="position:absolute; left:${targetX}%; top:${targetY}%; transform:translate(-50%, -50%); color:#27ae60; font-size:1.2rem; pointer-events:none;" title="Cible attendue"><i class="bi bi-bullseye"></i></div>
                            ${userCoords ? `
                                <div style="position:absolute; left:${userCoords.x}%; top:${userCoords.y}%; transform:translate(-50%, -50%); color:${isCorrect ? '#27ae60' : '#e74c3c'}; font-size:1.4rem; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));" title="Position stagiaire"><i class="bi bi-geo-alt-fill"></i></div>
                            ` : ''}
                        </div>
                    ` : '<div style="font-size:0.8rem; color:var(--clr-text-muted);">Aucune image configurée.</div>'}
                </div>
            `;
        } else if (type === 'range') {
            const val = (ans !== undefined && ans !== null) ? parseFloat(ans) : null;
            const targetVal = (q.correctValue !== undefined && q.correctValue !== '' && q.correctValue !== null) ? parseFloat(q.correctValue) : null;
            const tol = parseFloat(q.tolerance) || 0;
            const unit = q.unit || '';
            let isCorrect = false;

            if (val !== null && targetVal !== null) {
                isCorrect = Math.abs(val - targetVal) <= tol;
            }

            contentHtml = `
                <div style="margin-top:10px; background:var(--clr-surface); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid ${targetVal !== null ? (isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)') : 'var(--clr-surface-3)'};">
                    <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.85rem;">
                        <span style="font-weight:700;">Curseur positionné à : <strong style="color:var(--clr-primary-dark); font-size:0.95rem;">${val !== null ? `${val} ${escapeHtml(unit)}` : '—'}</strong></span>
                        ${targetVal !== null ? `
                            <span style="font-weight:700; color:${isCorrect ? 'var(--clr-success)' : 'var(--clr-danger)'}; font-size:0.8rem;">
                                ${isCorrect ? '<i class="bi bi-check-circle-fill"></i> Conforme' : `<i class="bi bi-x-circle-fill"></i> Attendu : ${targetVal} ${escapeHtml(unit)} (±${tol})`}
                            </span>
                        ` : '<span style="font-size:0.75rem; color:var(--clr-text-muted);">Pas de correction auto</span>'}
                    </div>
                </div>
            `;
        } else if (type === 'matching') {
            const pairs = q.pairs || [];
            const userMatches = (ans && typeof ans === 'object') ? ans : {};

            const matchesHtml = pairs.map((pair, pIdx) => {
                const userRight = userMatches[pair.left] || userMatches[(pair.left || '').trim()];
                const isMatchedCorrectly = userRight && (userRight.trim().toLowerCase() === (pair.right || '').trim().toLowerCase());

                return `
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:8px 12px; border-radius:var(--radius-sm); font-size:0.85rem; background:var(--clr-surface); border:1px solid ${isMatchedCorrectly ? 'var(--clr-success)' : 'var(--clr-danger)'};">
                        <div style="display:flex; align-items:center; gap:8px; flex:1; min-width:200px;">
                            <span style="font-weight:700; color:var(--clr-primary-dark);">${escapeHtml(pair.left)}</span>
                            <i class="bi bi-arrow-right" style="color:var(--clr-text-muted);"></i>
                            <span style="font-weight:600; color:${userRight ? 'var(--clr-text)' : 'var(--clr-danger)'};">${escapeHtml(userRight || '— (Non relié)')}</span>
                        </div>
                        ${isMatchedCorrectly ?
                            '<span style="color:var(--clr-success); font-weight:700; font-size:0.8rem;"><i class="bi bi-check-circle-fill"></i> Correct</span>' :
                            `<span style="color:var(--clr-danger); font-size:0.75rem; font-weight:600;"><i class="bi bi-x-circle-fill"></i> Attendu : <strong>${escapeHtml(pair.right)}</strong></span>`
                        }
                    </div>
                `;
            }).join('');

            let distractorsHtml = '';
            let distractors = [];
            if (typeof q.rightDistractors === 'string') {
                distractors = q.rightDistractors.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(q.rightDistractors)) {
                distractors = q.rightDistractors.map(s => String(s).trim()).filter(Boolean);
            }
            if (distractors.length > 0) {
                distractorsHtml = `
                    <div style="margin-top:6px; font-size:0.78rem; color:var(--clr-text-muted);">
                        <em>Options pièges / non reliées présentes :</em> ${distractors.map(d => `<span style="background:var(--clr-surface-3); padding:2px 8px; border-radius:4px; margin-left:4px; font-weight:600;">${escapeHtml(d)}</span>`).join('')}
                    </div>
                `;
            }

            contentHtml = `
                <div style="display:flex; flex-direction:column; gap:6px; margin-top:10px;">
                    ${matchesHtml || '<div style="font-size:0.82rem; color:var(--clr-text-muted);">Aucune association définie.</div>'}
                    ${distractorsHtml}
                </div>
            `;
        } else if (type === 'text') {
            const rawUserText = typeof ans === 'string' ? ans : '';
            const userText = rawUserText.trim();
            const evalObj = evaluations[q.id] || {};
            const isAwarded = (evalObj.isCorrect === true);

            contentHtml = `
                <div style="margin-top:10px; display:flex; flex-direction:column; gap:10px;">
                    <div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-text-muted); text-transform:uppercase; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
                            <i class="bi bi-chat-square-text-fill" style="color:var(--clr-primary);"></i> Réponse rédigée du candidat :
                        </div>
                        ${userText ? `<div style="padding:12px 14px; background:var(--clr-surface); border:1.5px solid var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.88rem; color:var(--clr-text); line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(userText)}</div>` : `<div style="padding:12px 14px; background:var(--clr-surface); border:1.5px dashed var(--clr-surface-3); border-radius:var(--radius-sm); font-size:0.85rem; color:var(--clr-text-muted); font-style:italic; text-align:center;">Aucune réponse rédigée.</div>`}
                    </div>

                    ${q.hint ? `
                        <div style="font-size:0.78rem; color:var(--clr-text-muted); background:var(--clr-surface-2); padding:8px 12px; border-radius:6px; border:1px solid var(--clr-surface-3);">
                            💡 <strong>Piste pédagogique :</strong> ${escapeHtml(q.hint)}
                        </div>
                    ` : ''}

                    <div style="background:var(--clr-surface-2); border:1.5px solid rgba(52, 152, 219, 0.3); border-radius:var(--radius-sm); padding:12px 14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
                            <span style="font-size:0.82rem; font-weight:700; color:var(--clr-text);">
                                👨‍🏫 Évaluation Formateur :
                            </span>
                            <div style="display:flex; gap:8px;">
                                <button type="button" class="es-btn es-btn--sm btn-toggle-eval-award ${isAwarded ? 'es-btn--primary' : 'es-btn--ghost'}" data-qid="${q.id}" data-award="true" style="font-size:0.78rem; padding:4px 10px;">
                                    <i class="bi bi-check2"></i> Valider (1 pt)
                                </button>
                                <button type="button" class="es-btn es-btn--sm btn-toggle-eval-award ${!isAwarded ? 'es-btn--danger' : 'es-btn--ghost'}" data-qid="${q.id}" data-award="false" style="font-size:0.78rem; padding:4px 10px;">
                                    <i class="bi bi-x"></i> Refuser (0 pt)
                                </button>
                            </div>
                        </div>
                        <input type="text" class="es-input input-eval-comment" data-qid="${q.id}" value="${escapeHtml(evalObj.comment || '')}" placeholder="Commentaire du formateur..." style="font-size:0.82rem; padding:6px 10px;">
                    </div>
                </div>
            `;
        }

        return `
            <div style="background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:var(--radius-md); padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px;">
                    <span style="font-weight:700; font-size:0.85rem; color:var(--clr-primary-xdark);">Question ${idx + 1}</span>
                    <span class="es-badge es-badge--stagiaire" style="font-size:0.68rem;">${type.toUpperCase()}</span>
                </div>
                <div style="font-weight:700; font-size:0.92rem; color:var(--clr-text);">${escapeHtml(q.text || '')}</div>
                ${contentHtml}
            </div>
        `;
    }).join('');

    container.querySelectorAll('.btn-toggle-eval-award').forEach(btn => {
        btn.addEventListener('click', () => {
            const qid = btn.getAttribute('data-qid');
            const award = btn.getAttribute('data-award') === 'true';
            if (!activeInspectingSubmission.evaluations) activeInspectingSubmission.evaluations = {};
            if (!activeInspectingSubmission.evaluations[qid]) activeInspectingSubmission.evaluations[qid] = {};
            activeInspectingSubmission.evaluations[qid].isCorrect = award;
            activeInspectingSubmission.evaluations[qid].status = 'graded';
            activeInspectingSubmission.evaluations[qid].gradedByName = actualUserData?.displayName || 'Formateur';
            activeInspectingSubmission.evaluations[qid].gradedAt = new Date().toISOString();

            renderInspectionQuestions(questions, activeInspectingSubmission);
        });
    });

    container.querySelectorAll('.input-eval-comment').forEach(input => {
        input.addEventListener('input', (e) => {
            const qid = input.getAttribute('data-qid');
            if (!activeInspectingSubmission.evaluations) activeInspectingSubmission.evaluations = {};
            if (!activeInspectingSubmission.evaluations[qid]) activeInspectingSubmission.evaluations[qid] = {};
            activeInspectingSubmission.evaluations[qid].comment = e.target.value;
        });
    });
}

document.getElementById('btnSaveGradingChanges')?.addEventListener('click', async function() {
    if (!activeInspectingSubmission) return;
    btnLoading(this, true);

    try {
        await db.collection('formation').doc(activeInspectingSubmission.moduleId)
            .collection('submissions').doc(activeInspectingSubmission.id)
            .update({
                evaluations: activeInspectingSubmission.evaluations || {},
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

        const matchIdx = moduleSubmissions.findIndex(s => s.id === activeInspectingSubmission.id);
        if (matchIdx !== -1) {
            moduleSubmissions[matchIdx].evaluations = activeInspectingSubmission.evaluations;
        }

        btnLoading(this, false);
        showToast("✅ Notes formateur enregistrées !", "success");
        updateModuleStats();
        applyModuleFiltersAndRender();
        document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
    } catch (err) {
        btnLoading(this, false);
        console.error("Save grading error:", err);
        showToast("Erreur lors de l'enregistrement des notes.", "error");
    }
});

document.getElementById('btnCloseReviewModal')?.addEventListener('click', () => {
    document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
});
document.getElementById('btnCloseReviewBottom')?.addEventListener('click', () => {
    document.getElementById('overlayReviewSubmission')?.classList.add('hidden');
});
document.getElementById('btnDeleteInspectedSubmission')?.addEventListener('click', () => {
    if (!activeInspectingSubmission || !activeInspectingSubmission.id) return;
    deleteSubmission(activeInspectingSubmission.id, activeInspectingSubmission.userName || 'ce stagiaire');
});

// Filtres et recherche onglet 2
document.getElementById('searchModuleSubmissionsInput')?.addEventListener('input', (e) => {
    currentSearchQuery = e.target.value.trim();
    applyModuleFiltersAndRender();
});

document.querySelectorAll('.module-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.module-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilterStatus = btn.getAttribute('data-filter');
        applyModuleFiltersAndRender();
    });
});

// Export CSV & PDF pour ce module
document.getElementById('btnExportModuleCsv')?.addEventListener('click', () => {
    if (moduleSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }
    const modTitle = document.getElementById('editModuleTitle').value || 'module';
    let csvContent = "\uFEFF";
    csvContent += "Stagiaire;Email;Tentative;Score Correct;Score Total;Score Pourcentage;Date\r\n";

    moduleSubmissions.forEach(s => {
        const pct = s.score?.percent !== undefined ? s.score.percent : 0;
        const correct = s.score?.correct !== undefined ? s.score.correct : 0;
        const total = s.score?.total !== undefined ? s.score.total : 0;
        csvContent += `"${(s.userName || '').replace(/"/g, '""')}";"${(s.userEmail || '').replace(/"/g, '""')}";${s.attemptNumber || 1};${correct};${total};${pct}%;"${formatDate(s.submittedAt)}"\r\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `resultats_${modTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Export CSV téléchargé avec succès !", "success");
});

document.getElementById('btnExportModulePdf')?.addEventListener('click', () => {
    if (moduleSubmissions.length === 0) {
        showToast("Aucune donnée à exporter.", "warning");
        return;
    }
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const modTitle = document.getElementById('editModuleTitle').value || 'Module';
        const modNum = document.getElementById('editModuleNum').value || '1';

        doc.setFontSize(16);
        doc.text(`Procès-Verbal : Module ${modNum} - ${modTitle}`, 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} • ${moduleSubmissions.length} copies enregistrées`, 14, 25);

        const tableData = moduleSubmissions.map(s => [
            s.userName || s.userEmail || 'Stagiaire',
            `#${s.attemptNumber || 1}`,
            `${s.score?.percent !== undefined ? s.score.percent : 0}% (${s.score?.correct || 0}/${s.score?.total || 0})`,
            (s.score?.percent >= 50) ? 'Validé' : 'À revoir',
            formatDate(s.submittedAt)
        ]);

        doc.autoTable({
            head: [['Stagiaire', 'Tentative', 'Score', 'Résultat', 'Date']],
            body: tableData,
            startY: 32,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 3 },
            headStyles: { fillColor: [78, 122, 29], textColor: [255, 255, 255] }
        });

        doc.save(`bilan_module_${modNum}_${Date.now()}.pdf`);
        showToast("Rapport PDF généré !", "success");
    } catch (err) {
        console.error("PDF export error:", err);
        showToast("Erreur lors de la génération du PDF.", "error");
    }
});

// ----------------------------------------------------------------
// GESTION DU BUILDER DE QUESTIONS (ONGLET 1)
// ----------------------------------------------------------------
function syncQuestionsFromDOM() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    const cards = container.querySelectorAll('.es-qcard');
    cards.forEach(card => {
        const idx = parseInt(card.getAttribute('data-qidx'), 10);
        if (isNaN(idx) || !currentEditingQuestions[idx]) return;

        const q = currentEditingQuestions[idx];

        if (q.type === 'section') {
            const titleInput = card.querySelector('.q-section-title-input');
            const descInput = card.querySelector('.q-section-desc-input');
            if (titleInput) {
                q.title = titleInput.value;
                q.text = titleInput.value;
            }
            if (descInput) {
                q.description = descInput.value;
            }
            return;
        }

        // Énoncé
        const textInput = card.querySelector('.q-text-input');
        if (textInput) q.text = textInput.value;

        // Image
        const imgInput = card.querySelector('.q-image-input');
        if (imgInput) q.imageUrl = imgInput.value.trim();

        // Indice
        const hintInput = card.querySelector('.q-hint-input');
        if (hintInput) q.hint = hintInput.value;

        // Type
        const typeSelect = card.querySelector('.q-type-select');
        if (typeSelect) q.type = typeSelect.value;

        // Champs spécifiques selon le type
        if (q.type === 'qcm') {
            const optInputs = card.querySelectorAll('.qcm-opt-input');
            const opts = [];
            optInputs.forEach(optInput => {
                opts.push(optInput.value);
            });
            if (opts.length > 0) q.options = opts;

            const checkedBoxes = card.querySelectorAll('input[name^="q_correct_"]:checked');
            const cIdxs = Array.from(checkedBoxes).map(cb => parseInt(cb.value, 10)).filter(n => !isNaN(n));
            q.correctIndexes = cIdxs.length > 0 ? cIdxs : [0];
            q.correctIndex = q.correctIndexes[0];
        } else if (q.type === 'image_choice') {
            const optCards = card.querySelectorAll('.image-choice-opt-card');
            const imgOpts = [];
            optCards.forEach(optCard => {
                const imgData = optCard.getAttribute('data-img-src') || '';
                const urlInp = optCard.querySelector('.q-imagechoice-url-input');
                const labelInp = optCard.querySelector('.q-imagechoice-label-input');
                const finalImg = imgData || (urlInp ? urlInp.value.trim() : '');
                imgOpts.push({
                    imageUrl: finalImg,
                    label: labelInp ? labelInp.value.trim() : ''
                });
            });
            if (imgOpts.length > 0) q.imageOptions = imgOpts;

            const checkedRadio = card.querySelector('input[name^="q_imgchoice_correct_"]:checked');
            if (checkedRadio) {
                q.correctIndex = parseInt(checkedRadio.value, 10);
            }
        } else if (q.type === 'table_choice') {
            const col1Inp = card.querySelector('.q-tablechoice-col1-label');
            const col2Inp = card.querySelector('.q-tablechoice-col2-label');
            q.col1Label = col1Inp ? col1Inp.value.trim() : (q.col1Label || 'VRAI');
            q.col2Label = col2Inp ? col2Inp.value.trim() : (q.col2Label || 'FAUX');

            const rowCards = card.querySelectorAll('.table-choice-row-item');
            const rows = [];
            rowCards.forEach(rowEl => {
                const textInp = rowEl.querySelector('.table-choice-row-text');
                const col1Cb = rowEl.querySelector('.table-choice-cb-col1');
                const col2Cb = rowEl.querySelector('.table-choice-cb-col2');
                rows.push({
                    text: textInp ? textInp.value : '',
                    correctCol1: col1Cb ? col1Cb.checked : false,
                    correctCol2: col2Cb ? col2Cb.checked : false
                });
            });
            if (rows.length > 0) q.tableRows = rows;
        } else if (q.type === 'classification') {
            const catCards = card.querySelectorAll('.classification-cat-item');
            const categories = [];
            catCards.forEach(cEl => {
                const catId = cEl.getAttribute('data-catid');
                const titleInp = cEl.querySelector('.classification-cat-title-input');
                categories.push({
                    id: catId,
                    title: titleInp ? titleInp.value : ''
                });
            });
            if (categories.length > 0) q.categories = categories;

            const itemCards = card.querySelectorAll('.classification-tag-item');
            const items = [];
            itemCards.forEach(iEl => {
                const itemId = iEl.getAttribute('data-itemid');
                const textInp = iEl.querySelector('.classification-item-text-input');
                const selCat = iEl.querySelector('.classification-item-cat-select');
                items.push({
                    id: itemId,
                    text: textInp ? textInp.value : '',
                    categoryId: selCat ? selCat.value : (categories[0]?.id || '')
                });
            });
            if (items.length > 0) q.items = items;
        } else if (q.type === 'boolean') {
            const checkedBoolRadio = card.querySelector('.q-boolean-radio:checked');
            if (checkedBoolRadio) {
                q.correctAnswer = (checkedBoolRadio.value === 'true');
            }
        } else if (q.type === 'pinpoint') {
            const radiusInput = card.querySelector('.q-pinpoint-radius-slider');
            if (radiusInput) q.radius = parseFloat(radiusInput.value) || 12;

            const targetLabelInput = card.querySelector('.q-pinpoint-target-label');
            if (targetLabelInput) q.targetLabel = targetLabelInput.value.trim();
        } else if (q.type === 'range') {
            const minInp = card.querySelector('.q-range-min');
            const maxInp = card.querySelector('.q-range-max');
            const stepInp = card.querySelector('.q-range-step');
            const unitInp = card.querySelector('.q-range-unit');
            const minLblInp = card.querySelector('.q-range-min-label');
            const maxLblInp = card.querySelector('.q-range-max-label');
            const targetValInp = card.querySelector('.q-range-target-val');
            const tolInp = card.querySelector('.q-range-tolerance');

            if (minInp && minInp.value !== '') q.min = parseFloat(minInp.value);
            if (maxInp && maxInp.value !== '') q.max = parseFloat(maxInp.value);
            if (stepInp && stepInp.value !== '') q.step = parseFloat(stepInp.value);
            if (unitInp) q.unit = unitInp.value;
            if (minLblInp) q.minLabel = minLblInp.value;
            if (maxLblInp) q.maxLabel = maxLblInp.value;
            if (targetValInp) q.correctValue = targetValInp.value !== '' ? parseFloat(targetValInp.value) : '';
            if (tolInp && tolInp.value !== '') q.tolerance = parseFloat(tolInp.value);
        } else if (q.type === 'cloze') {
            const clozeInput = card.querySelector('.q-cloze-text-input');
            if (clozeInput) q.clozeText = clozeInput.value;

            const distractorsInput = card.querySelector('.q-distractors-input');
            if (distractorsInput) q.distractors = distractorsInput.value;
        } else if (q.type === 'puzzle') {
            const puzzleInputs = card.querySelectorAll('.puzzle-item-input');
            const items = [];
            puzzleInputs.forEach(pInput => {
                items.push(pInput.value);
            });
            if (items.length > 0) q.items = items;
        } else if (q.type === 'matching') {
            const pairRows = card.querySelectorAll('.matching-pair-row');
            const pairs = [];
            pairRows.forEach(row => {
                const leftInp = row.querySelector('.matching-left-input');
                const rightInp = row.querySelector('.matching-right-input');
                if (leftInp && rightInp) {
                    pairs.push({
                        left: leftInp.value,
                        right: rightInp.value
                    });
                }
            });
            if (pairs.length > 0) q.pairs = pairs;
            const distInp = card.querySelector('.matching-distractors-input');
            if (distInp) {
                q.rightDistractors = distInp.value;
            }
        }
    });
}

function moveQuestion(fromIdx, toIdx) {
    if (toIdx < 0 || toIdx >= currentEditingQuestions.length || fromIdx === toIdx) return;
    syncQuestionsFromDOM();
    const [movedItem] = currentEditingQuestions.splice(fromIdx, 1);
    currentEditingQuestions.splice(toIdx, 0, movedItem);
    renderQuestionsEditor();

    setTimeout(() => {
        const targetCard = document.querySelector(`.es-qcard[data-qidx="${toIdx}"]`);
        if (targetCard) {
            targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            targetCard.style.boxShadow = '0 0 0 3px var(--clr-primary)';
            setTimeout(() => {
                targetCard.style.boxShadow = '';
            }, 1200);
        }
    }, 40);
}

function renderQuestionsEditor() {
    const container = document.getElementById('questionsContainer');
    const badgeCount = document.getElementById('badgeQuestionsTotalCount');
    if (!container) return;

    const nonSectionQuestions = currentEditingQuestions.filter(q => q.type !== 'section');
    const sectionsCount = currentEditingQuestions.filter(q => q.type === 'section').length;

    if (badgeCount) {
        let badgeStr = `${nonSectionQuestions.length} question${nonSectionQuestions.length > 1 ? 's' : ''}`;
        if (sectionsCount > 0) {
            badgeStr += ` • ${sectionsCount} section${sectionsCount > 1 ? 's' : ''} (page${sectionsCount > 1 ? 's' : ''})`;
        }
        badgeCount.textContent = badgeStr;
    }

    if (currentEditingQuestions.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:32px 16px; background:var(--clr-surface-2); border-radius:var(--radius-md); border:1.5px dashed var(--clr-surface-3);">
                <i class="bi bi-patch-question" style="font-size:2.2rem; color:var(--clr-text-light);"></i>
                <div style="font-weight:700; margin-top:8px; color:var(--clr-text);">Aucune question pour le moment</div>
                <div style="font-size:0.83rem; color:var(--clr-text-muted); margin-top:4px;">Cliquez sur « Ajouter une question » ou « Ajouter une section / page » ci-dessous.</div>
            </div>
        `;
        return;
    }

    let runningQuestionNum = 0;
    let runningSectionNum = 0;

    container.innerHTML = currentEditingQuestions.map((q, idx) => {
        const type = q.type || 'qcm';
        const isFirst = (idx === 0);
        const isLast = (idx === currentEditingQuestions.length - 1);

        if (type === 'section') {
            runningSectionNum++;
            const sTitle = q.title || q.text || `Section ${runningSectionNum}`;
            const sDesc = q.description || '';
            return `
                <div class="es-qcard es-qcard--section" data-qidx="${idx}">
                    <div class="es-qcard__header">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <span style="display:inline-flex; align-items:center; justify-content:center; width:28px; height:28px; border-radius:6px; background:var(--clr-primary); color:var(--clr-bg-deep); font-size:0.95rem; flex-shrink:0;">
                                <i class="bi bi-bookmark-fill"></i>
                            </span>
                            <div style="display:flex; align-items:baseline; gap:8px; flex-wrap:wrap;">
                                <span style="font-size:0.95rem; font-weight:800; color:var(--clr-primary-dark);">
                                    Section ${runningSectionNum} (Page ${runningSectionNum})
                                </span>
                                <span style="font-size:0.8rem; font-weight:600; color:var(--clr-text-muted);">— Nouvelle page</span>
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:4px;">
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-up" data-qidx="${idx}" ${isFirst ? 'disabled' : ''} style="padding:6px 10px; ${isFirst ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isFirst ? 'Première position' : 'Monter d\'un rang'}">
                                <i class="bi bi-arrow-up" style="font-weight:800; font-size:1rem;"></i>
                            </button>
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-down" data-qidx="${idx}" ${isLast ? 'disabled' : ''} style="padding:6px 10px; ${isLast ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isLast ? 'Dernière position' : 'Descendre d\'un rang'}">
                                <i class="bi bi-arrow-down" style="font-weight:800; font-size:1rem;"></i>
                            </button>
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-duplicate-q" data-qidx="${idx}" title="Dupliquer la section" style="padding:6px 10px;">
                                <i class="bi bi-copy"></i>
                            </button>
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-delete-q" data-qidx="${idx}" title="Supprimer la section" style="padding:6px 10px; color:var(--clr-danger);">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:14px; padding:18px;">
                        <div class="es-field">
                            <label class="es-field__label" style="color:var(--clr-primary-dark); font-weight:800;">🏷️ Titre de la section / page :</label>
                            <input class="es-input q-section-title-input" type="text" data-qidx="${idx}" value="${escapeHtml(sTitle)}" placeholder="Ex: Section 1 : Petite enfance (3-6 ans)" required style="font-weight:700; font-size:0.95rem; border-color:var(--clr-primary);">
                        </div>
                        <div class="es-field">
                            <label class="es-field__label">📝 Consignes ou description de cette section (optionnel) :</label>
                            <textarea class="es-input q-section-desc-input" data-qidx="${idx}" rows="2" placeholder="Ex: Répondez attentivement aux questions ci-dessous sur le développement de l'enfant..." style="font-size:0.85rem;">${escapeHtml(sDesc)}</textarea>
                        </div>
                    </div>
                </div>
            `;
        }

        runningQuestionNum++;
        const currentQNum = runningQuestionNum;
        let specificFields = '';

        if (type === 'qcm') {
            const options = q.options || ['Option 1', 'Option 2'];
            const correctIndexes = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                ? q.correctIndexes.map(n => parseInt(n, 10))
                : [(q.correctIndex !== undefined ? parseInt(q.correctIndex, 10) : 0)];

            const optionsHtml = options.map((opt, oIdx) => {
                const isChecked = correctIndexes.includes(oIdx);
                return `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <input type="checkbox" name="q_correct_${idx}" class="qcm-correct-cb" value="${oIdx}" ${isChecked ? 'checked' : ''} style="accent-color:var(--clr-primary); width:18px; height:18px; cursor:pointer;" title="Cocher pour définir comme bonne réponse">
                    <input class="es-input qcm-opt-input" type="text" data-qidx="${idx}" data-oidx="${oIdx}" value="${escapeHtml(opt)}" placeholder="Option ${oIdx + 1}" required style="font-size:0.88rem; padding:8px 12px;">
                    ${options.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-option" data-qidx="${idx}" data-oidx="${oIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer cette option">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `;
            }).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">Options de réponse (Cochez la ou les bonnes réponses) :</label>
                    <div class="qcm-options-wrap">${optionsHtml}</div>
                    ${options.length < 6 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-option" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus"></i> Ajouter une option
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (type === 'image_choice') {
            const options = q.imageOptions && q.imageOptions.length > 0 ? q.imageOptions : [
                { imageUrl: '', label: 'Option 1' },
                { imageUrl: '', label: 'Option 2' }
            ];
            const correctIdx = q.correctIndex !== undefined ? q.correctIndex : 0;
            const optionsHtml = options.map((opt, oIdx) => {
                const optImg = opt.imageUrl || '';
                const isChecked = (correctIdx === oIdx);
                return `
                    <div class="image-choice-opt-card" data-qidx="${idx}" data-oidx="${oIdx}" data-img-src="${escapeHtml(optImg)}" style="background:var(--clr-surface); border:2px solid ${isChecked ? 'var(--clr-primary)' : 'var(--clr-surface-3)'}; border-radius:var(--radius-sm); padding:12px; display:flex; flex-direction:column; gap:8px; position:relative; box-shadow:0 2px 6px rgba(0,0,0,0.03);">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                            <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-weight:700; font-size:0.85rem; color:${isChecked ? 'var(--clr-primary)' : 'var(--clr-text)'};">
                                <input type="radio" name="q_imgchoice_correct_${idx}" value="${oIdx}" ${isChecked ? 'checked' : ''} style="accent-color:var(--clr-primary); width:18px; height:18px; cursor:pointer;">
                                <span>Bonne réponse (${oIdx + 1})</span>
                            </label>
                            ${options.length > 2 ? `
                                <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-imagechoice-option" data-qidx="${idx}" data-oidx="${oIdx}" style="padding:4px 8px; color:var(--clr-danger);" title="Supprimer cette option">
                                    <i class="bi bi-trash"></i>
                                </button>
                            ` : ''}
                        </div>

                        ${optImg ? `
                            <div class="imagechoice-preview-box" style="position:relative; width:100%; height:140px; border-radius:6px; overflow:hidden; background:#181c19; display:flex; align-items:center; justify-content:center; border:1px solid var(--clr-surface-3);">
                                <img src="${escapeHtml(optImg)}" alt="Option ${oIdx + 1}" style="max-width:100%; max-height:100%; object-fit:contain;">
                                <div style="position:absolute; top:6px; right:6px; display:flex; gap:4px;">
                                    <label class="es-btn es-btn--secondary es-btn--sm" style="padding:4px 8px; font-size:0.75rem; cursor:pointer; backdrop-filter:blur(4px); background:rgba(0,0,0,0.6); color:#fff;" title="Changer l'image">
                                        <i class="bi bi-arrow-repeat"></i>
                                        <input type="file" class="q-imagechoice-file-input hidden" data-qidx="${idx}" data-oidx="${oIdx}" accept="image/*">
                                    </label>
                                    <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-clear-imagechoice-img" data-qidx="${idx}" data-oidx="${oIdx}" style="padding:4px 8px; font-size:0.75rem; background:rgba(231,76,60,0.8); color:#fff;" title="Retirer l'image">
                                        <i class="bi bi-x"></i>
                                    </button>
                                </div>
                            </div>
                        ` : `
                            <label class="es-imagechoice-dropzone" data-qidx="${idx}" data-oidx="${oIdx}" tabindex="0" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:18px 10px; background:var(--clr-surface-2); border:2px dashed var(--clr-primary); border-radius:6px; cursor:pointer; text-align:center; min-height:110px; transition:var(--transition); outline:none;">
                                <input type="file" class="q-imagechoice-file-input hidden" data-qidx="${idx}" data-oidx="${oIdx}" accept="image/*">
                                <i class="bi bi-cloud-arrow-up" style="font-size:1.6rem; color:var(--clr-primary); margin-bottom:4px;"></i>
                                <span style="font-size:0.8rem; font-weight:700; color:var(--clr-text);">Importer une image</span>
                                <span style="font-size:0.72rem; color:var(--clr-text-muted);">Glisser, clic ou Ctrl+V</span>
                            </label>
                            <input class="es-input q-imagechoice-url-input" type="text" data-qidx="${idx}" data-oidx="${oIdx}" value="" placeholder="Ou coller une URL https://..." style="font-size:0.78rem; padding:6px 8px;">
                        `}

                        <input class="es-input q-imagechoice-label-input" type="text" data-qidx="${idx}" data-oidx="${oIdx}" value="${escapeHtml(opt.label || '')}" placeholder="Légende optionnelle (ex: Option ${oIdx + 1})" style="font-size:0.85rem; padding:6px 10px;">
                    </div>
                `;
            }).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">🖼️ Options sous forme d'images (Cochez l'image correcte) :</label>
                    <div style="font-size:0.78rem; color:var(--clr-text-muted); margin-bottom:10px;">
                        💡 Vous pouvez glisser-déposer des images ou faire Ctrl+V directement sur les cartes d'options.
                    </div>
                    <div class="image-choice-options-grid" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:12px; margin-bottom:10px;">
                        ${optionsHtml}
                    </div>
                    ${options.length < 8 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-imagechoice-option" data-qidx="${idx}" style="font-size:0.82rem;">
                            <i class="bi bi-plus-circle"></i> Ajouter une image-réponse
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (type === 'table_choice') {
            const col1 = q.col1Label || 'VRAI';
            const col2 = q.col2Label || 'FAUX';
            const rows = q.tableRows && q.tableRows.length > 0 ? q.tableRows : [
                { text: 'Affirmation 1...', correctCol1: true, correctCol2: false },
                { text: 'Affirmation 2...', correctCol1: false, correctCol2: true }
            ];

            const hasMulti = rows.some(r => r.correctCol1 && r.correctCol2);

            const rowsHtml = rows.map((row, rIdx) => `
                <div class="table-choice-row-item" data-qidx="${idx}" data-ridx="${rIdx}" style="display:flex; align-items:center; gap:10px; background:var(--clr-surface); padding:10px 12px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); margin-bottom:8px;">
                    <span style="font-weight:800; color:var(--clr-text-muted); font-size:0.85rem; min-width:24px;">${rIdx + 1}.</span>
                    <input class="es-input table-choice-row-text" type="text" data-qidx="${idx}" data-ridx="${rIdx}" value="${escapeHtml(row.text || '')}" placeholder="Énoncé de l'affirmation ${rIdx + 1}" required style="flex:1; font-size:0.88rem; padding:8px 12px;">
                    
                    <div style="display:flex; align-items:center; gap:12px; padding:0 8px;">
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.82rem; font-weight:700;" title="Cocher si '${escapeHtml(col1)}' est une bonne réponse">
                            <input type="checkbox" class="table-choice-cb-col1" data-qidx="${idx}" data-ridx="${rIdx}" ${row.correctCol1 ? 'checked' : ''} style="accent-color:var(--clr-primary); width:18px; height:18px; cursor:pointer;">
                            <span class="col1-preview-text" style="color:var(--clr-primary-dark);">${escapeHtml(col1 || 'Col 1')}</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; cursor:pointer; font-size:0.82rem; font-weight:700;" title="Cocher si '${escapeHtml(col2)}' est une bonne réponse">
                            <input type="checkbox" class="table-choice-cb-col2" data-qidx="${idx}" data-ridx="${rIdx}" ${row.correctCol2 ? 'checked' : ''} style="accent-color:var(--clr-primary); width:18px; height:18px; cursor:pointer;">
                            <span class="col2-preview-text" style="color:var(--clr-primary-dark);">${escapeHtml(col2 || 'Col 2')}</span>
                        </label>
                    </div>

                    ${rows.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-tablechoice-row" data-qidx="${idx}" data-ridx="${rIdx}" style="padding:4px 8px; color:var(--clr-danger);" title="Supprimer cette ligne">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; background:var(--clr-surface-2); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--clr-surface-3);">
                        <div>
                            <label class="es-field__label" style="font-size:0.8rem; margin-bottom:4px;">🏷️ Intitulé Colonne 1 :</label>
                            <input class="es-input q-tablechoice-col1-label" type="text" data-qidx="${idx}" value="${escapeHtml(col1)}" placeholder="Ex: VRAI, OUI, Autorisé..." style="font-weight:700; font-size:0.85rem; padding:6px 10px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.8rem; margin-bottom:4px;">🏷️ Intitulé Colonne 2 :</label>
                            <input class="es-input q-tablechoice-col2-label" type="text" data-qidx="${idx}" value="${escapeHtml(col2)}" placeholder="Ex: FAUX, NON, Interdit..." style="font-weight:700; font-size:0.85rem; padding:6px 10px;">
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <label class="es-field__label" style="margin:0;">Lignes d'affirmations & Réponses attendues :</label>
                        <span class="es-badge ${hasMulti ? 'es-badge--warning' : 'es-badge--approved'}" style="font-size:0.75rem; font-weight:800; padding:4px 8px;">
                            <i class="bi ${hasMulti ? 'bi-check2-square' : 'bi-ui-radios'}"></i>
                            ${hasMulti ? 'Mode Boîtes à cocher (plusieurs réponses possibles)' : 'Mode Boutons Radio (1 seule réponse par ligne)'}
                        </span>
                    </div>

                    <div class="table-choice-rows-wrap">${rowsHtml}</div>

                    ${rows.length < 12 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-tablechoice-row" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus-circle"></i> Ajouter une affirmation
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (type === 'classification') {
            const categories = q.categories || [
                { id: 'cat_1', title: 'Petite enfance (3 - 5 ans)' },
                { id: 'cat_2', title: 'Enfance (6 - 11 ans)' },
                { id: 'cat_3', title: 'Préadolescence (12 - 14 ans)' },
                { id: 'cat_4', title: 'Adolescence (15 - 17 ans)' }
            ];
            const items = q.items || [
                { id: 'item_1', text: 'Besoin de sieste et rituels rassurants', categoryId: 'cat_1' },
                { id: 'item_2', text: 'Jeux de règles et développement moteur', categoryId: 'cat_2' },
                { id: 'item_3', text: 'Importance du groupe de pairs et pudeur', categoryId: 'cat_3' },
                { id: 'item_4', text: 'Co-construction des projets et émancipation', categoryId: 'cat_4' }
            ];

            const catListHtml = categories.map((cat, cIdx) => `
                <div class="classification-cat-item" data-qidx="${idx}" data-cidx="${cIdx}" data-catid="${escapeHtml(cat.id)}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; background:var(--clr-surface); padding:8px 12px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm);">
                    <span style="font-weight:700; font-size:0.8rem; color:var(--clr-primary-dark); display:flex; align-items:center; gap:4px; min-width:85px;">
                        📁 Cat. ${cIdx + 1} :
                    </span>
                    <input class="es-input classification-cat-title-input" type="text" data-qidx="${idx}" data-cidx="${cIdx}" value="${escapeHtml(cat.title || '')}" placeholder="Nom de la catégorie (ex: Petite enfance, Adolescence...)" required style="flex:1; font-weight:700; font-size:0.88rem; padding:6px 10px;">
                    ${categories.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-classification-cat" data-qidx="${idx}" data-cidx="${cIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer cette catégorie">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            const itemsListHtml = items.map((item, iIdx) => `
                <div class="classification-tag-item" data-qidx="${idx}" data-iidx="${iIdx}" data-itemid="${escapeHtml(item.id)}" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; background:var(--clr-surface); padding:8px 12px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm);">
                    <span style="width:24px; height:24px; border-radius:50%; background:var(--clr-surface-3); font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; color:var(--clr-text); flex-shrink:0;">${iIdx + 1}</span>
                    <input class="es-input classification-item-text-input" type="text" data-qidx="${idx}" data-iidx="${iIdx}" value="${escapeHtml(item.text || '')}" placeholder="Texte de l'étiquette / tag (ex: Besoin de sieste, Sorties autonomes...)" required style="flex:1; font-size:0.88rem; padding:6px 10px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-size:0.75rem; font-weight:700; color:var(--clr-text-muted);"><i class="bi bi-arrow-right"></i> Ranger dans :</span>
                        <select class="es-select classification-item-cat-select" data-qidx="${idx}" data-iidx="${iIdx}" style="font-size:0.82rem; font-weight:700; padding:6px 10px; width:auto;">
                            ${categories.map((c, cIdx) => `
                                <option value="${escapeHtml(c.id)}" ${item.categoryId === c.id ? 'selected' : ''}>${escapeHtml(c.title || `Catégorie ${cIdx + 1}`)}</option>
                            `).join('')}
                        </select>
                    </div>
                    ${items.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-classification-item" data-qidx="${idx}" data-iidx="${iIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer cette étiquette">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            specificFields = `
                <div style="margin-top:12px; display:flex; flex-direction:column; gap:16px;">
                    <!-- Bloc Catégories -->
                    <div style="background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); padding:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <label class="es-field__label" style="margin:0; font-weight:800; color:var(--clr-text);">📁 1. Catégories réceptrices (Boîtes / Colonnes) :</label>
                            <span class="es-badge es-badge--approved" style="font-size:0.75rem; font-weight:800; padding:3px 8px;">
                                ${categories.length} catégorie${categories.length > 1 ? 's' : ''}
                            </span>
                        </div>
                        <div class="classification-cats-wrap">${catListHtml}</div>
                        ${categories.length < 6 ? `
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-classification-cat" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                                <i class="bi bi-plus-circle"></i> Ajouter une catégorie
                            </button>
                        ` : ''}
                    </div>

                    <!-- Bloc Étiquettes -->
                    <div style="background:var(--clr-surface-2); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); padding:12px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <label class="es-field__label" style="margin:0; font-weight:800; color:var(--clr-text);">🏷️ 2. Étiquettes (Tags) et catégorie attendue :</label>
                            <span class="es-badge es-badge--stagiaire" style="font-size:0.75rem; font-weight:800; padding:3px 8px;">
                                ${items.length} étiquette${items.length > 1 ? 's' : ''} à classer
                            </span>
                        </div>
                        <div class="classification-items-wrap">${itemsListHtml}</div>
                        ${items.length < 20 ? `
                            <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-classification-item" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                                <i class="bi bi-plus-circle"></i> Ajouter une étiquette
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        } else if (type === 'boolean') {
            const isTrue = (q.correctAnswer === true || q.correctAnswer === 'true');
            specificFields = `
                <div style="margin-top:12px; background:var(--clr-surface); padding:12px 14px; border-radius:var(--radius-sm); border:1px solid var(--clr-surface-3);">
                    <label class="es-field__label" style="margin-bottom:8px;">Bonne réponse attendue pour ce Vrai/Faux :</label>
                    <div style="display:flex; gap:20px; align-items:center;">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.92rem; font-weight:700; color:var(--clr-success);">
                            <input type="radio" class="q-boolean-radio" name="bool_correct_${idx}" data-qidx="${idx}" value="true" ${isTrue ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--clr-success); cursor:pointer;">
                            <span>👍 VRAI</span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:0.92rem; font-weight:700; color:var(--clr-danger);">
                            <input type="radio" class="q-boolean-radio" name="bool_correct_${idx}" data-qidx="${idx}" value="false" ${!isTrue ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--clr-danger); cursor:pointer;">
                            <span>👎 FAUX</span>
                        </label>
                    </div>
                </div>
            `;
        } else if (type === 'pinpoint') {
            const targetX = (q.targetX !== undefined) ? parseFloat(q.targetX) : 50;
            const targetY = (q.targetY !== undefined) ? parseFloat(q.targetY) : 50;
            const radius = (q.radius !== undefined) ? parseFloat(q.radius) : 12;
            const sizeKB = q.pinImage ? Math.round((q.pinImage.length * 3 / 4) / 1024) : 0;

            if (q.pinImage) {
                specificFields = `
                    <div style="margin-top:12px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm); padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:12px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="es-badge es-badge--stagiaire" style="font-size:0.75rem; padding:3px 8px;">
                                    <i class="bi bi-check-circle-fill" style="color:var(--clr-success);"></i> Image ${sizeKB} Ko
                                </span>
                                <span class="pinpoint-coords-display" style="font-size:0.78rem; font-weight:700; color:var(--clr-primary-dark);">
                                    Cible : X: ${targetX.toFixed(1)}%, Y: ${targetY.toFixed(1)}%
                                </span>
                            </div>
                            <div style="display:flex; gap:6px;">
                                <label class="es-btn es-btn--ghost es-btn--sm" style="cursor:pointer; padding:4px 8px; font-size:0.78rem;">
                                    <i class="bi bi-arrow-repeat"></i> Remplacer l'image
                                    <input type="file" class="q-pinpoint-file-input hidden" data-qidx="${idx}" accept="image/*">
                                </label>
                                <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-pinpoint-img" data-qidx="${idx}" style="color:var(--clr-danger); padding:4px 8px; font-size:0.78rem;">
                                    <i class="bi bi-trash"></i> Supprimer
                                </button>
                            </div>
                        </div>

                        <div style="text-align:center; display:flex; flex-direction:column; align-items:center; justify-content:center;">
                            <div class="es-pinpoint-setter" data-qidx="${idx}" style="position:relative; display:inline-block; margin:0 auto; max-width:100%; cursor:crosshair; border-radius:6px; overflow:hidden; border:1.5px solid var(--clr-surface-3);">
                                <img src="${escapeHtml(q.pinImage)}" alt="Image repère" style="display:block; margin:0 auto; max-width:100%; max-height:420px; user-select:none; pointer-events:none;">
                                <div id="pin_target_zone_${idx}" class="es-pinpoint-target-zone" style="position:absolute; left:${targetX}%; top:${targetY}%; width:${radius * 2}%; aspect-ratio:1 / 1; height:auto; transform:translate(-50%, -50%); border-radius:50%; border:2px dashed #2ecc71; background:rgba(46,204,113,0.25); pointer-events:none;"></div>
                                <div id="pin_marker_${idx}" class="es-pinpoint-target-marker" style="position:absolute; left:${targetX}%; top:${targetY}%; transform:translate(-50%, -50%); color:#27ae60; font-size:1.6rem; pointer-events:none; filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));">
                                    <i class="bi bi-geo-alt-fill"></i>
                                </div>
                            </div>
                            <p style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:6px;">
                                👆 <strong>Cliquez sur l'image</strong> pour positionner le repère de la réponse attendue.
                            </p>
                        </div>

                        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:12px; margin-top:12px; padding-top:10px; border-top:1px dashed var(--clr-surface-3);">
                            <div>
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                                    <label class="es-field__label">Rayon de tolérance :</label>
                                    <span class="pinpoint-radius-val" style="font-size:0.8rem; font-weight:800; color:var(--clr-primary-dark);" id="pin_radius_val_${idx}">±${radius}%</span>
                                </div>
                                <input type="range" class="es-input q-pinpoint-radius-slider" data-qidx="${idx}" min="3" max="30" step="1" value="${radius}" style="padding:0;">
                                <div style="font-size:0.72rem; color:var(--clr-text-muted); margin-top:2px;">Marge acceptée autour du repère (zone verte).</div>
                            </div>
                            <div>
                                <label class="es-field__label">Description de la zone cible (optionnel) :</label>
                                <input type="text" class="es-input q-pinpoint-target-label" data-qidx="${idx}" value="${escapeHtml(q.targetLabel || '')}" placeholder="Ex: Sortie de secours, extincteur..." style="font-size:0.85rem; padding:6px 10px;">
                            </div>
                        </div>
                    </div>
                `;
            } else {
                specificFields = `
                    <div style="margin-top:12px;">
                        <label class="es-pinpoint-dropzone" data-qidx="${idx}" tabindex="0" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:32px 16px; background:var(--clr-surface); border:2px dashed var(--clr-primary); border-radius:var(--radius-sm); cursor:pointer; text-align:center; transition:var(--transition); outline:none;">
                            <input type="file" class="q-pinpoint-file-input hidden" data-qidx="${idx}" accept="image/*">
                            <i class="bi bi-cloud-arrow-up-fill" style="font-size:2.4rem; color:var(--clr-primary); margin-bottom:8px;"></i>
                            <div style="font-weight:700; font-size:0.95rem; color:var(--clr-text);">Cliquez, glissez-déposez ou collez (Ctrl+V) une image ici</div>
                            <div style="font-size:0.78rem; color:var(--clr-text-muted); margin-top:4px;">Compression automatique & encodage direct (JPG, PNG, WebP)</div>
                        </label>
                    </div>
                `;
            }
        } else if (type === 'range') {
            const minVal = (q.min !== undefined && q.min !== null) ? q.min : 0;
            const maxVal = (q.max !== undefined && q.max !== null) ? q.max : 10;
            const stepVal = (q.step !== undefined && q.step !== null) ? q.step : 1;
            const unit = q.unit || '';
            const minLabel = q.minLabel || '';
            const maxLabel = q.maxLabel || '';
            const targetVal = (q.correctValue !== undefined && q.correctValue !== null) ? q.correctValue : '';
            const tolVal = (q.tolerance !== undefined && q.tolerance !== null) ? q.tolerance : 0;

            specificFields = `
                <div style="margin-top:12px; background:var(--clr-surface); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--clr-surface-3);">
                    <div style="font-size:0.82rem; font-weight:700; color:var(--clr-primary-dark); margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                        <i class="bi bi-sliders"></i> Configuration du curseur horizontal (Slider)
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(130px, 1fr)); gap:10px;">
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Valeur Min</label>
                            <input type="number" class="es-input q-range-min" data-qidx="${idx}" value="${minVal}" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Valeur Max</label>
                            <input type="number" class="es-input q-range-max" data-qidx="${idx}" value="${maxVal}" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Pas (Step)</label>
                            <input type="number" class="es-input q-range-step" data-qidx="${idx}" value="${stepVal}" step="any" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Unité (ex: ans, %, h)</label>
                            <input type="text" class="es-input q-range-unit" data-qidx="${idx}" value="${escapeHtml(unit)}" placeholder="ex: enfants" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Libellé côté gauche (Min)</label>
                            <input type="text" class="es-input q-range-min-label" data-qidx="${idx}" value="${escapeHtml(minLabel)}" placeholder="ex: Pas du tout" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Libellé côté droit (Max)</label>
                            <input type="text" class="es-input q-range-max-label" data-qidx="${idx}" value="${escapeHtml(maxLabel)}" placeholder="ex: Absolument" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                    </div>
                    <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:10px; margin-top:10px; padding-top:10px; border-top:1px dashed var(--clr-surface-3);">
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem; color:var(--clr-success);">Cible attendue (Auto-notation, optionnel)</label>
                            <input type="number" class="es-input q-range-target-val" data-qidx="${idx}" value="${targetVal}" placeholder="Laisser vide si pas de note" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                        <div>
                            <label class="es-field__label" style="font-size:0.75rem;">Tolérance autorisée (±)</label>
                            <input type="number" class="es-input q-range-tolerance" data-qidx="${idx}" value="${tolVal}" placeholder="0" style="font-size:0.85rem; padding:6px 8px;">
                        </div>
                    </div>
                </div>
            `;
        } else if (type === 'text') {
            specificFields = `
                <div style="margin-top:12px;">
                    <div class="es-field">
                        <label class="es-field__label">💡 Piste / Mots-clés attendus (pour guider la réponse et l'évaluation) :</label>
                        <textarea class="es-input q-hint-input" data-qidx="${idx}" rows="2" placeholder="Ex: Doit mentionner la sécurité, le projet pédagogique et la déclaration SDJES...">${escapeHtml(q.hint || '')}</textarea>
                    </div>
                </div>
            `;
        } else if (type === 'cloze') {
            const clozeText = q.clozeText || '';
            const distractors = Array.isArray(q.distractors) ? q.distractors.join(', ') : (q.distractors || '');
            const rawMatches = clozeText.match(/\[([^\]]+)\]/g) || [];
            const blanksDetected = rawMatches.map(m => m.slice(1, -1).trim()).filter(Boolean);
            const distractorList = distractors.split(',').map(s => s.trim()).filter(Boolean);
            const totalBankCount = blanksDetected.length + distractorList.length;

            let previewHtml = '';
            if (clozeText.trim()) {
                const formattedPreview = escapeHtml(clozeText).replace(/\[([^\]]+)\]/g, (match, p1) => {
                    return `<span class="es-cloze-dropzone" style="display:inline-flex; align-items:center; justify-content:center; min-width:80px; height:26px; padding:0 8px; border:1.5px dashed var(--clr-primary); border-radius:6px; background:rgba(166,216,102,0.12); font-weight:700; color:var(--clr-primary-dark); font-size:0.82rem;">[ ${escapeHtml(p1)} ]</span>`;
                });

                const allTags = [...blanksDetected, ...distractorList];
                const bankTagsHtml = allTags.map(tag => `
                    <span class="es-cloze-tag" style="display:inline-flex; align-items:center; gap:4px; background:var(--clr-surface); border:1.5px solid var(--clr-primary); color:var(--clr-text); font-weight:700; font-size:0.8rem; padding:4px 10px; border-radius:8px;">
                        🏷️ ${escapeHtml(tag)}
                    </span>
                `).join('');

                previewHtml = `
                    <div style="margin-top:10px; padding:12px; background:var(--clr-surface); border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm);">
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-primary); text-transform:uppercase; margin-bottom:6px;">Aperçu du texte avec les trous :</div>
                        <div style="font-size:0.88rem; line-height:1.7; color:var(--clr-text); margin-bottom:10px;">${formattedPreview}</div>
                        <div style="font-size:0.75rem; font-weight:700; color:var(--clr-text-muted); margin-bottom:6px;">Banque d'étiquettes distribuée (${totalBankCount}) :</div>
                        <div style="display:flex; flex-wrap:wrap; gap:6px;">${bankTagsHtml || '<span style="font-size:0.78rem; color:var(--clr-text-muted);">Aucune étiquette</span>'}</div>
                    </div>
                `;
            }

            specificFields = `
                <div style="margin-top:12px; display:flex; flex-direction:column; gap:12px;">
                    <div class="es-field">
                        <label class="es-field__label">📝 Texte à trous (Entourez les mots à deviner avec des [crochets]) :</label>
                        <textarea class="es-input q-cloze-text-input" data-qidx="${idx}" rows="4" placeholder="Ex: Le projet [pédagogique] est rédigé par le [directeur]." required style="font-size:0.9rem; line-height:1.5;">${escapeHtml(clozeText)}</textarea>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; font-size:0.78rem; color:var(--clr-text-muted);">
                            <span>Tapez [mot] pour créer un trou interactif.</span>
                            <span style="font-weight:700; color:var(--clr-primary-dark);">${blanksDetected.length} trou(s) détecté(s)</span>
                        </div>
                    </div>

                    <div class="es-field">
                        <label class="es-field__label">🏷️ Étiquettes leurres supplémentaires (Optionnel) :</label>
                        <input class="es-input q-distractors-input" type="text" data-qidx="${idx}" value="${escapeHtml(distractors)}" placeholder="Ex: animateur, sanitaire (séparés par virgules)" style="font-size:0.85rem;">
                    </div>

                    ${previewHtml}
                </div>
            `;
        } else if (type === 'puzzle') {
            const items = q.items || ['Étape 1', 'Étape 2', 'Étape 3'];
            const itemsHtml = items.map((it, pIdx) => `
                <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
                    <span style="width:24px; height:24px; border-radius:50%; background:var(--clr-surface-3); font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; color:var(--clr-text); flex-shrink:0;">${pIdx + 1}</span>
                    <input class="es-input puzzle-item-input" type="text" data-qidx="${idx}" data-pidx="${pIdx}" value="${escapeHtml(it)}" placeholder="Étape ${pIdx + 1}" required style="font-size:0.88rem; padding:8px 12px;">
                    ${items.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-puzzle-item" data-qidx="${idx}" data-pidx="${pIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">Éléments dans le BON ORDRE chronologique :</label>
                    <div class="puzzle-items-wrap">${itemsHtml}</div>
                    ${items.length < 8 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-puzzle-item" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus"></i> Ajouter un élément
                        </button>
                    ` : ''}
                </div>
            `;
        } else if (type === 'matching') {
            const pairs = q.pairs || [
                { left: 'Élément A', right: 'Correspondance A' },
                { left: 'Élément B', right: 'Correspondance B' },
                { left: 'Élément C', right: 'Correspondance C' }
            ];
            const pairsHtml = pairs.map((p, pIdx) => `
                <div class="matching-pair-row" style="display:flex; align-items:center; gap:8px; margin-bottom:8px; background:var(--clr-surface); padding:8px 10px; border:1px solid var(--clr-surface-3); border-radius:var(--radius-sm);">
                    <span style="width:24px; height:24px; border-radius:50%; background:var(--clr-surface-3); font-size:0.75rem; font-weight:700; display:flex; align-items:center; justify-content:center; color:var(--clr-text); flex-shrink:0;">${pIdx + 1}</span>
                    <input class="es-input matching-left-input" type="text" data-qidx="${idx}" data-pidx="${pIdx}" value="${escapeHtml(p.left || '')}" placeholder="Élément gauche (ex: Chien)" required style="flex:1; font-size:0.88rem; padding:8px 12px;">
                    <div style="color:var(--clr-primary-dark); font-weight:800; font-size:1.1rem; flex-shrink:0;" title="Relié à">
                        <i class="bi bi-arrow-right"></i>
                    </div>
                    <input class="es-input matching-right-input" type="text" data-qidx="${idx}" data-pidx="${pIdx}" value="${escapeHtml(p.right || '')}" placeholder="Élément droite (ex: Mammifère)" required style="flex:1; font-size:0.88rem; padding:8px 12px;">
                    ${pairs.length > 2 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-remove-matching-pair" data-qidx="${idx}" data-pidx="${pIdx}" style="padding:6px 10px; color:var(--clr-danger);" title="Supprimer cette paire">
                            <i class="bi bi-trash"></i>
                        </button>
                    ` : ''}
                </div>
            `).join('');

            const rightDistractorsVal = typeof q.rightDistractors === 'string' ? q.rightDistractors : (Array.isArray(q.rightDistractors) ? q.rightDistractors.join(', ') : '');

            specificFields = `
                <div style="margin-top:12px;">
                    <label class="es-field__label">Paires à relier (Colonne de gauche ➔ Colonne de droite) :</label>
                    <div style="font-size:0.78rem; color:var(--clr-text-muted); margin-bottom:8px; line-height:1.45;">
                        💡 <strong>Flexibilité d'association (N vers 1) :</strong> Vous pouvez attribuer la <em>même correspondance à droite</em> à plusieurs éléments de gauche différents (ex: « Chien » ➔ « Mammifère », « Chat » ➔ « Mammifère »). L'élément n'apparaîtra qu'une seule fois dans la colonne de droite du quiz.
                    </div>
                    <div class="matching-pairs-wrap">${pairsHtml}</div>
                    ${pairs.length < 12 ? `
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-add-matching-pair" data-qidx="${idx}" style="margin-top:4px; font-size:0.82rem;">
                            <i class="bi bi-plus"></i> Ajouter une paire
                        </button>
                    ` : ''}

                    <div style="margin-top:14px; padding:12px 14px; background:var(--clr-surface-2); border:1px dashed var(--clr-surface-3); border-radius:var(--radius-sm);">
                        <label class="es-field__label" style="display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:0.84rem;">
                            <i class="bi bi-shuffle" style="color:var(--clr-warning);"></i> Options pièges / distracteurs à droite (facultatif) :
                        </label>
                        <div style="font-size:0.76rem; color:var(--clr-text-muted); margin-bottom:8px; line-height:1.4;">
                            Ajoutez des options supplémentaires qui apparaîtront dans la colonne de droite mais ne devront être reliées à aucun élément de gauche (séparées par des virgules).
                        </div>
                        <input class="es-input matching-distractors-input" type="text" data-qidx="${idx}" value="${escapeHtml(rightDistractorsVal)}" placeholder="Ex: Poisson, Reptile (séparés par des virgules)" style="font-size:0.88rem; padding:8px 12px; background:var(--clr-surface);">
                    </div>
                </div>
            `;
        }

        return `
            <div class="es-qcard" data-qidx="${idx}">
                <div class="es-qcard__header">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="es-qcard__num">${currentQNum}</span>
                        <select class="es-select q-type-select" data-qidx="${idx}" style="font-weight:700; font-size:0.85rem; padding:6px 12px; width:auto;">
                            <option value="qcm" ${type === 'qcm' ? 'selected' : ''}>1- ☑️ QCM (Choix multiple)</option>
                            <option value="image_choice" ${type === 'image_choice' ? 'selected' : ''}>2- 🖼️ QCM Choix d'images</option>
                            <option value="table_choice" ${type === 'table_choice' ? 'selected' : ''}>3- 📋 Tableau à 2 colonnes (Affirmations)</option>
                            <option value="classification" ${type === 'classification' ? 'selected' : ''}>4- 🗂️ Classement par catégories (Glisser-déposer de tags)</option>
                            <option value="boolean" ${type === 'boolean' ? 'selected' : ''}>5- ⚖️ Vrai / Faux</option>
                            <option value="pinpoint" ${type === 'pinpoint' ? 'selected' : ''}>6- 📍 Repère sur image (Pin)</option>
                            <option value="range" ${type === 'range' ? 'selected' : ''}>7- 📏 Curseur horizontal (Slider)</option>
                            <option value="matching" ${type === 'matching' ? 'selected' : ''}>8- 🔗 Relier les colonnes (Association)</option>
                            <option value="puzzle" ${type === 'puzzle' ? 'selected' : ''}>9- 🧩 Puzzle chronologique</option>
                            <option value="cloze" ${type === 'cloze' ? 'selected' : ''}>10- 📝 Texte à trous (Glisser-déposer)</option>
                            <option value="text" ${type === 'text' ? 'selected' : ''}>11- ✍️ Rédaction libre</option>
                        </select>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-up" data-qidx="${idx}" ${isFirst ? 'disabled' : ''} style="padding:6px 10px; ${isFirst ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isFirst ? 'Première position' : 'Monter d\'un rang (flèche haut)'}">
                            <i class="bi bi-arrow-up" style="font-weight:800; font-size:1rem;"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-move-q-down" data-qidx="${idx}" ${isLast ? 'disabled' : ''} style="padding:6px 10px; ${isLast ? 'opacity:0.3; cursor:not-allowed;' : ''}" title="${isLast ? 'Dernière position' : 'Descendre d\'un rang (flèche bas)'}">
                            <i class="bi bi-arrow-down" style="font-weight:800; font-size:1rem;"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-duplicate-q" data-qidx="${idx}" title="Dupliquer la question" style="padding:6px 10px;">
                            <i class="bi bi-copy"></i>
                        </button>
                        <button type="button" class="es-btn es-btn--ghost es-btn--sm btn-delete-q" data-qidx="${idx}" title="Supprimer la question" style="padding:6px 10px; color:var(--clr-danger);">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>

                <div class="es-field" style="margin-bottom:10px;">
                    <label class="es-field__label">Énoncé de la question :</label>
                    <input class="es-input q-text-input" type="text" data-qidx="${idx}" value="${escapeHtml(q.text || '')}" placeholder="Ex: Que signifie le sigle PSAADRAFRA ?" required style="font-weight:600; font-size:0.92rem;">
                </div>

                <div class="es-field" style="margin-bottom:10px;">
                    <label class="es-field__label">🖼️ Image illustrative (URL optionnelle) :</label>
                    <input class="es-input q-image-input" type="text" data-qidx="${idx}" value="${escapeHtml(q.imageUrl || '')}" placeholder="https://..." style="font-size:0.85rem;">
                </div>

                ${specificFields}
            </div>
        `;
    }).join('');

    bindQuestionsEvents();
}

async function processAndSetImageChoiceOption(qidx, oidx, file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
        showToast("Veuillez déposer ou coller un fichier image valide.", "warning");
        return;
    }
    syncQuestionsFromDOM();
    if (!currentEditingQuestions[qidx]) return;
    if (!currentEditingQuestions[qidx].imageOptions) {
        currentEditingQuestions[qidx].imageOptions = [
            { imageUrl: '', label: 'Option 1' },
            { imageUrl: '', label: 'Option 2' }
        ];
    }
    if (!currentEditingQuestions[qidx].imageOptions[oidx]) {
        currentEditingQuestions[qidx].imageOptions[oidx] = { imageUrl: '', label: `Option ${oidx + 1}` };
    }
    try {
        const base64 = await compressImageToBase64(file, 800, 600, 0.82);
        currentEditingQuestions[qidx].imageOptions[oidx].imageUrl = base64;
        renderQuestionsEditor();
        showToast(`Image de l'option ${oidx + 1} chargée !`, "success");
    } catch (err) {
        console.error("Erreur compression image option:", err);
        showToast("Erreur lors du traitement de l'image de l'option.", "error");
    }
}

async function processAndSetPinpointImage(qidx, file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
        showToast("Veuillez déposer ou coller un fichier image valide.", "warning");
        return;
    }
    syncQuestionsFromDOM();
    if (!currentEditingQuestions[qidx]) return;
    try {
        const base64 = await compressImageToBase64(file, 1200, 900, 0.82);
        currentEditingQuestions[qidx].pinImage = base64;
        if (currentEditingQuestions[qidx].targetX === undefined) currentEditingQuestions[qidx].targetX = 50;
        if (currentEditingQuestions[qidx].targetY === undefined) currentEditingQuestions[qidx].targetY = 50;
        if (currentEditingQuestions[qidx].radius === undefined) currentEditingQuestions[qidx].radius = 12;
        renderQuestionsEditor();
        showToast("Image repère chargée avec succès !", "success");
    } catch (err) {
        console.error("Erreur compression image pinpoint:", err);
        showToast("Erreur lors du traitement de l'image.", "error");
    }
}

function bindQuestionsEvents() {
    const container = document.getElementById('questionsContainer');
    if (!container) return;

    container.querySelectorAll('.q-type-select').forEach(select => {
        select.addEventListener('change', (e) => {
            syncQuestionsFromDOM();
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const newType = e.target.value;
            currentEditingQuestions[idx].type = newType;
            if (newType === 'qcm' && !currentEditingQuestions[idx].options) {
                currentEditingQuestions[idx].options = ['Option 1', 'Option 2'];
                currentEditingQuestions[idx].correctIndexes = [0];
                currentEditingQuestions[idx].correctIndex = 0;
            } else if (newType === 'image_choice' && (!currentEditingQuestions[idx].imageOptions || currentEditingQuestions[idx].imageOptions.length === 0)) {
                currentEditingQuestions[idx].imageOptions = [
                    { imageUrl: '', label: 'Option 1' },
                    { imageUrl: '', label: 'Option 2' }
                ];
                currentEditingQuestions[idx].correctIndex = 0;
            } else if (newType === 'table_choice' && (!currentEditingQuestions[idx].tableRows || currentEditingQuestions[idx].tableRows.length === 0)) {
                currentEditingQuestions[idx].col1Label = 'VRAI';
                currentEditingQuestions[idx].col2Label = 'FAUX';
                currentEditingQuestions[idx].tableRows = [
                    { text: 'Affirmation 1...', correctCol1: true, correctCol2: false },
                    { text: 'Affirmation 2...', correctCol1: false, correctCol2: true }
                ];
            } else if (newType === 'classification' && (!currentEditingQuestions[idx].categories || currentEditingQuestions[idx].categories.length === 0)) {
                if (!currentEditingQuestions[idx].text) {
                    currentEditingQuestions[idx].text = "Classez les caractéristiques et besoins selon la tranche d'âge correspondante :";
                }
                currentEditingQuestions[idx].categories = [
                    { id: 'cat_1', title: 'Petite enfance (3 - 5 ans)' },
                    { id: 'cat_2', title: 'Enfance (6 - 11 ans)' },
                    { id: 'cat_3', title: 'Préadolescence (12 - 14 ans)' },
                    { id: 'cat_4', title: 'Adolescence (15 - 17 ans)' }
                ];
                currentEditingQuestions[idx].items = [
                    { id: 'item_1', text: 'Besoin de sieste et rituels rassurants', categoryId: 'cat_1' },
                    { id: 'item_2', text: 'Jeux de règles et développement moteur', categoryId: 'cat_2' },
                    { id: 'item_3', text: 'Importance du groupe de pairs et pudeur', categoryId: 'cat_3' },
                    { id: 'item_4', text: 'Co-construction des projets et émancipation', categoryId: 'cat_4' }
                ];
            } else if (newType === 'boolean' && currentEditingQuestions[idx].correctAnswer === undefined) {
                currentEditingQuestions[idx].correctAnswer = true;
            } else if (newType === 'pinpoint') {
                if (currentEditingQuestions[idx].targetX === undefined) currentEditingQuestions[idx].targetX = 50;
                if (currentEditingQuestions[idx].targetY === undefined) currentEditingQuestions[idx].targetY = 50;
                if (currentEditingQuestions[idx].radius === undefined) currentEditingQuestions[idx].radius = 12;
                if (currentEditingQuestions[idx].targetLabel === undefined) currentEditingQuestions[idx].targetLabel = 'Cible';
            } else if (newType === 'range') {
                if (currentEditingQuestions[idx].min === undefined) currentEditingQuestions[idx].min = 0;
                if (currentEditingQuestions[idx].max === undefined) currentEditingQuestions[idx].max = 100;
                if (currentEditingQuestions[idx].step === undefined) currentEditingQuestions[idx].step = 1;
                if (currentEditingQuestions[idx].unit === undefined) currentEditingQuestions[idx].unit = '';
                if (currentEditingQuestions[idx].tolerance === undefined) currentEditingQuestions[idx].tolerance = 0;
                if (currentEditingQuestions[idx].correctValue === undefined) currentEditingQuestions[idx].correctValue = 50;
            } else if (newType === 'puzzle' && !currentEditingQuestions[idx].items) {
                currentEditingQuestions[idx].items = ['Étape 1', 'Étape 2', 'Étape 3'];
            } else if (newType === 'cloze' && !currentEditingQuestions[idx].clozeText) {
                currentEditingQuestions[idx].clozeText = currentEditingQuestions[idx].text || 'Texte avec un [mot-clé] à compléter.';
                currentEditingQuestions[idx].distractors = '';
            } else if (newType === 'matching' && (!currentEditingQuestions[idx].pairs || currentEditingQuestions[idx].pairs.length === 0)) {
                currentEditingQuestions[idx].pairs = [
                    { left: 'Élément A', right: 'Correspondance A' },
                    { left: 'Élément B', right: 'Correspondance B' },
                    { left: 'Élément C', right: 'Correspondance C' }
                ];
            }
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('.q-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-image-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].imageUrl = e.target.value.trim();
            }
        });
    });

    container.querySelectorAll('.q-hint-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].hint = e.target.value;
            }
        });
    });

    // Boolean radio
    container.querySelectorAll('.q-boolean-radio').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].correctAnswer = (e.target.value === 'true');
            }
        });
    });

    // Pinpoint interactions
    container.querySelectorAll('.es-pinpoint-setter').forEach(setter => {
        setter.addEventListener('click', (e) => {
            const qidx = parseInt(setter.getAttribute('data-qidx'), 10);
            if (!currentEditingQuestions[qidx]) return;
            const rect = setter.getBoundingClientRect();
            const x = Math.round(Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)) * 10) / 10;
            const y = Math.round(Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)) * 10) / 10;
            currentEditingQuestions[qidx].targetX = x;
            currentEditingQuestions[qidx].targetY = y;
            
            const marker = setter.querySelector('.es-pinpoint-target-marker');
            if (marker) {
                marker.style.left = `${x}%`;
                marker.style.top = `${y}%`;
            }
            const zone = setter.querySelector('.es-pinpoint-target-zone');
            if (zone) {
                zone.style.left = `${x}%`;
                zone.style.top = `${y}%`;
            }
            const card = setter.closest('.es-qcard');
            const infoCoords = card?.querySelector('.pinpoint-coords-display');
            if (infoCoords) {
                infoCoords.textContent = `Cible : X: ${x.toFixed(1)}%, Y: ${y.toFixed(1)}%`;
            }
        });
    });

    container.querySelectorAll('.q-pinpoint-radius-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const val = parseFloat(e.target.value);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].radius = val;
            }
            const card = slider.closest('.es-qcard');
            const radValDisplay = card?.querySelector('.pinpoint-radius-val');
            if (radValDisplay) radValDisplay.textContent = `±${val}%`;
            const zone = card?.querySelector('.es-pinpoint-target-zone');
            if (zone) {
                zone.style.width = `${val * 2}%`;
                zone.style.aspectRatio = '1 / 1';
                zone.style.height = 'auto';
            }
        });
    });

    container.querySelectorAll('.q-pinpoint-target-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].targetLabel = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-pinpoint-file-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const file = e.target.files[0];
            if (file) await processAndSetPinpointImage(qidx, file);
        });
    });

    // Drag & drop on dropzone
    container.querySelectorAll('.es-pinpoint-dropzone').forEach(dropzone => {
        const qidx = parseInt(dropzone.getAttribute('data-qidx'), 10);

        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = 'var(--clr-success)';
            dropzone.style.backgroundColor = 'rgba(46, 204, 113, 0.1)';
        });
        dropzone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '';
            dropzone.style.backgroundColor = '';
        });
        dropzone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.style.borderColor = '';
            dropzone.style.backgroundColor = '';
            const file = e.dataTransfer?.files?.[0];
            if (file) await processAndSetPinpointImage(qidx, file);
        });

        // Paste (Ctrl + V) when dropzone is focused
        dropzone.addEventListener('paste', async (e) => {
            const items = (e.clipboardData || window.clipboardData)?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        e.stopPropagation();
                        await processAndSetPinpointImage(qidx, file);
                        break;
                    }
                }
            }
        });
    });

    // Drag & Drop / Paste on the whole pinpoint question card
    container.querySelectorAll('.es-qcard').forEach(card => {
        const qidx = parseInt(card.getAttribute('data-qidx'), 10);
        const q = currentEditingQuestions[qidx];
        if (q && q.type === 'pinpoint') {
            card.addEventListener('dragover', (e) => {
                if (e.dataTransfer?.types?.includes('Files')) {
                    e.preventDefault();
                }
            });
            card.addEventListener('drop', async (e) => {
                const file = e.dataTransfer?.files?.[0];
                if (file && file.type?.startsWith('image/')) {
                    e.preventDefault();
                    e.stopPropagation();
                    await processAndSetPinpointImage(qidx, file);
                }
            });
            card.addEventListener('paste', async (e) => {
                // If user is pasting in a text input (like question title), do not hijack text paste
                const targetTag = e.target?.tagName?.toLowerCase();
                const items = (e.clipboardData || window.clipboardData)?.items;
                if (!items) return;
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type && items[i].type.indexOf('image') !== -1) {
                        const file = items[i].getAsFile();
                        if (file) {
                            e.preventDefault();
                            e.stopPropagation();
                            await processAndSetPinpointImage(qidx, file);
                            break;
                        }
                    }
                }
            });
        }
    });

    container.querySelectorAll('.btn-remove-pinpoint-img').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                delete currentEditingQuestions[qidx].pinImage;
                renderQuestionsEditor();
            }
        });
    });

    // Range interactions
    container.querySelectorAll('.q-range-min').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].min = parseFloat(e.target.value) || 0;
        });
    });
    container.querySelectorAll('.q-range-max').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].max = parseFloat(e.target.value) || 100;
        });
    });
    container.querySelectorAll('.q-range-step').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].step = parseFloat(e.target.value) || 1;
        });
    });
    container.querySelectorAll('.q-range-unit').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].unit = e.target.value;
        });
    });
    container.querySelectorAll('.q-range-min-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].minLabel = e.target.value;
        });
    });
    container.querySelectorAll('.q-range-max-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].maxLabel = e.target.value;
        });
    });
    container.querySelectorAll('.q-range-target-val').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].correctValue = e.target.value !== '' ? parseFloat(e.target.value) : '';
        });
    });
    container.querySelectorAll('.q-range-tolerance').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) currentEditingQuestions[qidx].tolerance = parseFloat(e.target.value) || 0;
        });
    });

    container.querySelectorAll('.q-cloze-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].clozeText = e.target.value;
            }
        });
        input.addEventListener('blur', () => {
            syncQuestionsFromDOM();
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('.q-distractors-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].distractors = e.target.value;
            }
        });
        input.addEventListener('blur', () => {
            syncQuestionsFromDOM();
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('input[name^="q_correct_"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const name = e.target.name;
            const qidx = parseInt(name.replace('q_correct_', ''), 10);
            if (currentEditingQuestions[qidx]) {
                const checkedBoxes = container.querySelectorAll(`input[name="q_correct_${qidx}"]:checked`);
                const indexes = Array.from(checkedBoxes).map(b => parseInt(b.value, 10)).filter(n => !isNaN(n));
                currentEditingQuestions[qidx].correctIndexes = indexes.length > 0 ? indexes : [0];
                currentEditingQuestions[qidx].correctIndex = currentEditingQuestions[qidx].correctIndexes[0];
            }
        });
    });

    // Image choice events
    container.querySelectorAll('input[name^="q_imgchoice_correct_"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const name = e.target.name;
            const qidx = parseInt(name.replace('q_imgchoice_correct_', ''), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].correctIndex = parseInt(e.target.value, 10);
                // Update active borders
                const card = radio.closest('.es-qcard');
                if (card) {
                    card.querySelectorAll('.image-choice-opt-card').forEach((optCard, oIdx) => {
                        const isMatch = (oIdx === parseInt(e.target.value, 10));
                        optCard.style.borderColor = isMatch ? 'var(--clr-primary)' : 'var(--clr-surface-3)';
                    });
                }
            }
        });
    });

    container.querySelectorAll('.q-imagechoice-file-input').forEach(input => {
        input.addEventListener('change', async (e) => {
            const qidx = parseInt(input.getAttribute('data-qidx'), 10);
            const oidx = parseInt(input.getAttribute('data-oidx'), 10);
            const file = e.target.files && e.target.files[0];
            if (file) {
                await processAndSetImageChoiceOption(qidx, oidx, file);
            }
        });
    });

    container.querySelectorAll('.q-imagechoice-url-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const oidx = parseInt(e.target.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].imageOptions && currentEditingQuestions[qidx].imageOptions[oidx]) {
                currentEditingQuestions[qidx].imageOptions[oidx].imageUrl = e.target.value.trim();
            }
        });
        input.addEventListener('blur', () => {
            syncQuestionsFromDOM();
            renderQuestionsEditor();
        });
    });

    container.querySelectorAll('.q-imagechoice-label-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const oidx = parseInt(e.target.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].imageOptions && currentEditingQuestions[qidx].imageOptions[oidx]) {
                currentEditingQuestions[qidx].imageOptions[oidx].label = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-imagechoice-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                if (!currentEditingQuestions[qidx].imageOptions) currentEditingQuestions[qidx].imageOptions = [];
                currentEditingQuestions[qidx].imageOptions.push({
                    imageUrl: '',
                    label: `Option ${currentEditingQuestions[qidx].imageOptions.length + 1}`
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-imagechoice-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const oidx = parseInt(btn.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].imageOptions) {
                currentEditingQuestions[qidx].imageOptions.splice(oidx, 1);
                if (currentEditingQuestions[qidx].correctIndex >= currentEditingQuestions[qidx].imageOptions.length) {
                    currentEditingQuestions[qidx].correctIndex = 0;
                }
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-clear-imagechoice-img').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const oidx = parseInt(btn.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].imageOptions && currentEditingQuestions[qidx].imageOptions[oidx]) {
                currentEditingQuestions[qidx].imageOptions[oidx].imageUrl = '';
                renderQuestionsEditor();
            }
        });
    });

    // Drag & Drop / Paste on image choice option cards
    container.querySelectorAll('.image-choice-opt-card').forEach(card => {
        const qidx = parseInt(card.getAttribute('data-qidx'), 10);
        const oidx = parseInt(card.getAttribute('data-oidx'), 10);
        const dropzone = card.querySelector('.es-imagechoice-dropzone');

        if (dropzone) {
            ['dragenter', 'dragover'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.style.background = 'rgba(46, 204, 113, 0.15)';
                    dropzone.style.borderColor = '#2ecc71';
                }, false);
            });

            ['dragleave', 'drop'].forEach(eventName => {
                dropzone.addEventListener(eventName, (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    dropzone.style.background = 'var(--clr-surface-2)';
                    dropzone.style.borderColor = 'var(--clr-primary)';
                }, false);
            });

            dropzone.addEventListener('drop', async (e) => {
                const dt = e.dataTransfer;
                const file = dt && dt.files && dt.files[0];
                if (file) {
                    await processAndSetImageChoiceOption(qidx, oidx, file);
                }
            }, false);
        }

        // Paste support on card
        card.addEventListener('paste', async (e) => {
            const targetTag = e.target?.tagName?.toLowerCase();
            if (targetTag === 'input' && e.target.type === 'text') return; // Don't hijack text fields
            const items = (e.clipboardData || window.clipboardData)?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type && items[i].type.indexOf('image') !== -1) {
                    const file = items[i].getAsFile();
                    if (file) {
                        e.preventDefault();
                        e.stopPropagation();
                        await processAndSetImageChoiceOption(qidx, oidx, file);
                        break;
                    }
                }
            }
        });
    });

    // Table choice event bindings
    container.querySelectorAll('.q-tablechoice-col1-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].col1Label = e.target.value;
                const card = input.closest('.es-qcard');
                if (card) {
                    card.querySelectorAll('.col1-preview-text').forEach(el => el.textContent = e.target.value || 'Col 1');
                }
            }
        });
    });

    container.querySelectorAll('.q-tablechoice-col2-label').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].col2Label = e.target.value;
                const card = input.closest('.es-qcard');
                if (card) {
                    card.querySelectorAll('.col2-preview-text').forEach(el => el.textContent = e.target.value || 'Col 2');
                }
            }
        });
    });

    container.querySelectorAll('.table-choice-row-text').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const ridx = parseInt(e.target.getAttribute('data-ridx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].tableRows && currentEditingQuestions[qidx].tableRows[ridx]) {
                currentEditingQuestions[qidx].tableRows[ridx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.table-choice-cb-col1').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const qidx = parseInt(cb.getAttribute('data-qidx'), 10);
            const ridx = parseInt(cb.getAttribute('data-ridx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].tableRows && currentEditingQuestions[qidx].tableRows[ridx]) {
                currentEditingQuestions[qidx].tableRows[ridx].correctCol1 = cb.checked;
                syncQuestionsFromDOM();
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.table-choice-cb-col2').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const qidx = parseInt(cb.getAttribute('data-qidx'), 10);
            const ridx = parseInt(cb.getAttribute('data-ridx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].tableRows && currentEditingQuestions[qidx].tableRows[ridx]) {
                currentEditingQuestions[qidx].tableRows[ridx].correctCol2 = cb.checked;
                syncQuestionsFromDOM();
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-add-tablechoice-row').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                if (!currentEditingQuestions[qidx].tableRows) currentEditingQuestions[qidx].tableRows = [];
                currentEditingQuestions[qidx].tableRows.push({
                    text: `Affirmation ${currentEditingQuestions[qidx].tableRows.length + 1}...`,
                    correctCol1: true,
                    correctCol2: false
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-tablechoice-row').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const ridx = parseInt(btn.getAttribute('data-ridx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].tableRows) {
                currentEditingQuestions[qidx].tableRows.splice(ridx, 1);
                renderQuestionsEditor();
            }
        });
    });

    // Classification events
    container.querySelectorAll('.classification-cat-title-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const cidx = parseInt(e.target.getAttribute('data-cidx'), 10);
            if (currentEditingQuestions[qidx]?.categories?.[cidx]) {
                currentEditingQuestions[qidx].categories[cidx].title = e.target.value;
                // Live update option texts in item selects
                const card = input.closest('.es-qcard');
                if (card) {
                    const catId = currentEditingQuestions[qidx].categories[cidx].id;
                    card.querySelectorAll(`.classification-item-cat-select option[value="${catId}"]`).forEach(opt => {
                        opt.textContent = e.target.value || `Catégorie ${cidx + 1}`;
                    });
                }
            }
        });
    });

    container.querySelectorAll('.classification-item-text-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const iidx = parseInt(e.target.getAttribute('data-iidx'), 10);
            if (currentEditingQuestions[qidx]?.items?.[iidx]) {
                currentEditingQuestions[qidx].items[iidx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.classification-item-cat-select').forEach(select => {
        select.addEventListener('change', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const iidx = parseInt(e.target.getAttribute('data-iidx'), 10);
            if (currentEditingQuestions[qidx]?.items?.[iidx]) {
                currentEditingQuestions[qidx].items[iidx].categoryId = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-classification-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                if (!currentEditingQuestions[qidx].categories) currentEditingQuestions[qidx].categories = [];
                const newCatId = `cat_${Date.now()}_${currentEditingQuestions[qidx].categories.length + 1}`;
                currentEditingQuestions[qidx].categories.push({
                    id: newCatId,
                    title: `Catégorie ${currentEditingQuestions[qidx].categories.length + 1}`
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-classification-cat').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const cidx = parseInt(btn.getAttribute('data-cidx'), 10);
            if (currentEditingQuestions[qidx]?.categories) {
                const removedId = currentEditingQuestions[qidx].categories[cidx].id;
                currentEditingQuestions[qidx].categories.splice(cidx, 1);
                // Reassign items that belonged to this category to the first available category
                const firstCatId = currentEditingQuestions[qidx].categories[0]?.id || '';
                (currentEditingQuestions[qidx].items || []).forEach(it => {
                    if (it.categoryId === removedId) it.categoryId = firstCatId;
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-add-classification-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                if (!currentEditingQuestions[qidx].items) currentEditingQuestions[qidx].items = [];
                const firstCatId = currentEditingQuestions[qidx].categories?.[0]?.id || 'cat_1';
                const newItemId = `item_${Date.now()}_${currentEditingQuestions[qidx].items.length + 1}`;
                currentEditingQuestions[qidx].items.push({
                    id: newItemId,
                    text: `Étiquette ${currentEditingQuestions[qidx].items.length + 1}`,
                    categoryId: firstCatId
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-classification-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const iidx = parseInt(btn.getAttribute('data-iidx'), 10);
            if (currentEditingQuestions[qidx]?.items) {
                currentEditingQuestions[qidx].items.splice(iidx, 1);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.qcm-opt-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const oidx = parseInt(e.target.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].options) {
                currentEditingQuestions[qidx].options[oidx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].options.push(`Option ${currentEditingQuestions[qidx].options.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-option').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const oidx = parseInt(btn.getAttribute('data-oidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].options) {
                currentEditingQuestions[qidx].options.splice(oidx, 1);
                if (Array.isArray(currentEditingQuestions[qidx].correctIndexes)) {
                    currentEditingQuestions[qidx].correctIndexes = currentEditingQuestions[qidx].correctIndexes
                        .filter(i => i !== oidx)
                        .map(i => i > oidx ? i - 1 : i);
                    if (currentEditingQuestions[qidx].correctIndexes.length === 0) {
                        currentEditingQuestions[qidx].correctIndexes = [0];
                    }
                    currentEditingQuestions[qidx].correctIndex = currentEditingQuestions[qidx].correctIndexes[0];
                } else if (currentEditingQuestions[qidx].correctIndex >= currentEditingQuestions[qidx].options.length) {
                    currentEditingQuestions[qidx].correctIndex = 0;
                }
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.puzzle-item-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const pidx = parseInt(e.target.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].items) {
                currentEditingQuestions[qidx].items[pidx] = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].items.push(`Étape ${currentEditingQuestions[qidx].items.length + 1}`);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-puzzle-item').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const pidx = parseInt(btn.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].items) {
                currentEditingQuestions[qidx].items.splice(pidx, 1);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.matching-left-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const pidx = parseInt(e.target.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].pairs && currentEditingQuestions[qidx].pairs[pidx]) {
                currentEditingQuestions[qidx].pairs[pidx].left = e.target.value;
            }
        });
    });

    container.querySelectorAll('.matching-right-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            const pidx = parseInt(e.target.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].pairs && currentEditingQuestions[qidx].pairs[pidx]) {
                currentEditingQuestions[qidx].pairs[pidx].right = e.target.value;
            }
        });
    });

    container.querySelectorAll('.btn-add-matching-pair').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                if (!currentEditingQuestions[qidx].pairs) currentEditingQuestions[qidx].pairs = [];
                const pNum = currentEditingQuestions[qidx].pairs.length + 1;
                currentEditingQuestions[qidx].pairs.push({
                    left: `Élément ${pNum}`,
                    right: `Correspondance ${pNum}`
                });
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.btn-remove-matching-pair').forEach(btn => {
        btn.addEventListener('click', () => {
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const pidx = parseInt(btn.getAttribute('data-pidx'), 10);
            if (currentEditingQuestions[qidx] && currentEditingQuestions[qidx].pairs) {
                currentEditingQuestions[qidx].pairs.splice(pidx, 1);
                renderQuestionsEditor();
            }
        });
    });

    container.querySelectorAll('.matching-distractors-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const qidx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[qidx]) {
                currentEditingQuestions[qidx].rightDistractors = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-section-title-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].title = e.target.value;
                currentEditingQuestions[idx].text = e.target.value;
            }
        });
    });

    container.querySelectorAll('.q-section-desc-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const idx = parseInt(e.target.getAttribute('data-qidx'), 10);
            if (currentEditingQuestions[idx]) {
                currentEditingQuestions[idx].description = e.target.value;
            }
        });
    });

    // Flèches Haut et Bas pour réorganiser l'ordre des questions
    container.querySelectorAll('.btn-move-q-up:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (qidx > 0) {
                moveQuestion(qidx, qidx - 1);
            }
        });
    });

    container.querySelectorAll('.btn-move-q-down:not([disabled])').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            if (qidx < currentEditingQuestions.length - 1) {
                moveQuestion(qidx, qidx + 1);
            }
        });
    });

    container.querySelectorAll('.btn-duplicate-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const copy = JSON.parse(JSON.stringify(currentEditingQuestions[qidx]));
            const isSec = (copy.type === 'section');
            copy.id = (isSec ? 'sec_' : 'q_') + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            if (isSec) {
                copy.title = (copy.title || 'Section') + ' (Copie)';
                copy.text = copy.title;
            } else {
                copy.text = (copy.text || '') + ' (Copie)';
            }
            currentEditingQuestions.splice(qidx + 1, 0, copy);
            renderQuestionsEditor();
            showToast(isSec ? "Section dupliquée." : "Question dupliquée.", "info");
        });
    });

    container.querySelectorAll('.btn-delete-q').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            syncQuestionsFromDOM();
            const qidx = parseInt(btn.getAttribute('data-qidx'), 10);
            const q = currentEditingQuestions[qidx];
            const confirmMsg = (q && q.type === 'section') ? "Supprimer cette section / page ? Les questions situées en dessous ne seront pas supprimées mais intégrées à la section précédente." : "Supprimer cette question ?";
            if (confirm(confirmMsg)) {
                currentEditingQuestions.splice(qidx, 1);
                renderQuestionsEditor();
            }
        });
    });
}

// ----------------------------------------------------------------
// GESTION IMPORT / EXPORT JSON
// ----------------------------------------------------------------
document.getElementById('btnExportQuestionsJson')?.addEventListener('click', () => {
    if (currentEditingQuestions.length === 0) {
        showToast("Aucune question à exporter.", "warning");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentEditingQuestions, null, 2));
    const modTitle = document.getElementById('editModuleTitle').value || 'module';
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `questions_${modTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast("Export JSON téléchargé !", "success");
});

document.getElementById('btnImportQuestionsJson')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            if (Array.isArray(parsed) && parsed.length > 0) {
                currentEditingQuestions = parsed.map((q, idx) => ({
                    id: q.id || ((q.type === 'section' ? 'sec_' : 'q_') + Date.now() + '_' + idx),
                    type: q.type || 'qcm',
                    title: q.title || (q.type === 'section' ? q.text : undefined),
                    description: q.description || '',
                    text: q.text || q.title || '',
                    options: q.options || (q.type === 'qcm' ? ['Option 1', 'Option 2'] : undefined),
                    imageOptions: q.imageOptions || (q.type === 'image_choice' ? [{ imageUrl: '', label: 'Option 1' }, { imageUrl: '', label: 'Option 2' }] : undefined),
                    tableRows: q.tableRows || (q.type === 'table_choice' ? [{ text: 'Affirmation 1...', correctCol1: true, correctCol2: false }, { text: 'Affirmation 2...', correctCol1: false, correctCol2: true }] : undefined),
                    categories: q.categories || (q.type === 'classification' ? [{ id: 'cat_1', title: 'Petite enfance (3 - 5 ans)' }, { id: 'cat_2', title: 'Enfance (6 - 11 ans)' }, { id: 'cat_3', title: 'Préadolescence (12 - 14 ans)' }, { id: 'cat_4', title: 'Adolescence (15 - 17 ans)' }] : undefined),
                    col1Label: q.col1Label || 'VRAI',
                    col2Label: q.col2Label || 'FAUX',
                    correctIndex: q.correctIndex !== undefined ? q.correctIndex : 0,
                    correctAnswer: q.correctAnswer !== undefined ? q.correctAnswer : true,
                    pinImage: q.pinImage || '',
                    targetX: q.targetX !== undefined ? q.targetX : 50,
                    targetY: q.targetY !== undefined ? q.targetY : 50,
                    radius: q.radius !== undefined ? q.radius : 10,
                    targetLabel: q.targetLabel || '',
                    min: q.min !== undefined ? q.min : 0,
                    max: q.max !== undefined ? q.max : 100,
                    step: q.step !== undefined ? q.step : 1,
                    unit: q.unit || '',
                    minLabel: q.minLabel || '',
                    maxLabel: q.maxLabel || '',
                    correctValue: q.correctValue !== undefined ? q.correctValue : 50,
                    tolerance: q.tolerance !== undefined ? q.tolerance : 0,
                    clozeText: q.clozeText || '',
                    distractors: q.distractors || '',
                    items: q.items || (q.type === 'classification' ? [{ id: 'item_1', text: 'Besoin de sieste et rituels rassurants', categoryId: 'cat_1' }, { id: 'item_2', text: 'Jeux de règles et développement moteur', categoryId: 'cat_2' }, { id: 'item_3', text: 'Importance du groupe de pairs et pudeur', categoryId: 'cat_3' }, { id: 'item_4', text: 'Co-construction des projets et émancipation', categoryId: 'cat_4' }] : (q.type === 'puzzle' ? ['Étape 1', 'Étape 2'] : undefined)),
                    pairs: q.pairs || (q.type === 'matching' ? [{ left: 'A', right: '1' }, { left: 'B', right: '2' }] : undefined),
                    hint: q.hint || '',
                    imageUrl: q.imageUrl || ''
                }));
                renderQuestionsEditor();
                showToast(`🎉 ${currentEditingQuestions.length} éléments importés !`, "success");
            } else {
                showToast("Fichier JSON invalide.", "error");
            }
        } catch (err) {
            console.error("JSON parse error:", err);
            showToast("Erreur lors de la lecture du JSON.", "error");
        }
    };
    reader.readAsText(file);
    e.target.value = '';
});

// ----------------------------------------------------------------
// ENREGISTREMENT DU MODULE DANS FIRESTORE
// ----------------------------------------------------------------
async function saveModuleData(btnEl) {
    syncQuestionsFromDOM();
    const errorAlert = document.getElementById('moduleEditErrorAlert');
    const errorMsg = document.getElementById('moduleEditErrorMsg');
    const successAlert = document.getElementById('moduleEditSuccessAlert');
    if (errorAlert) errorAlert.classList.add('hidden');
    if (successAlert) successAlert.classList.add('hidden');

    const rawId = document.getElementById('editModuleId').value.trim();
    const num = parseInt(document.getElementById('editModuleNum').value, 10);
    const title = document.getElementById('editModuleTitle').value.trim();
    const subtitle = document.getElementById('editModuleSubtitle').value.trim();
    const icon = document.getElementById('editModuleIcon').value.trim() || 'bi-journal-bookmark';
    const bgImage = document.getElementById('editModuleBgImage').value.trim();
    const isVisible = document.getElementById('editModuleVisible') ? document.getElementById('editModuleVisible').checked : true;

    const maxAttempts = parseInt(document.getElementById('editMaxAttempts').value, 10) || 0;
    const timerMinutes = parseInt(document.getElementById('editQuizTimerMinutes').value, 10) || 0;
    const timerSeconds = parseInt(document.getElementById('editQuizTimerSeconds').value, 10) || 0;
    const timerTotalSeconds = (timerMinutes * 60) + timerSeconds;
    const showResultsAtEnd = document.getElementById('editShowResultsAtEnd').checked;
    const negativePoints = document.getElementById('editNegativePoints') ? document.getElementById('editNegativePoints').checked : false;
    const allowPreviousPage = document.getElementById('editQuizAllowPreviousPage') ? document.getElementById('editQuizAllowPreviousPage').checked : true;

    const isRequirePassword = document.getElementById('editQuizRequirePassword').checked;
    const quizPassword = document.getElementById('editQuizPassword').value.trim();

    if (isNaN(num) || num < 1) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Numéro de module invalide (> 0).";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    if (!title) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Veuillez renseigner le titre du module.";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    if (isRequirePassword && !quizPassword) {
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Veuillez définir un mot de passe ou décocher l'option.";
            errorAlert.classList.remove('hidden');
        }
        return;
    }

    // Validation questions
    let validQuestionNum = 0;
    let validSectionNum = 0;

    for (let i = 0; i < currentEditingQuestions.length; i++) {
        const q = currentEditingQuestions[i];

        if (q.type === 'section') {
            validSectionNum++;
            if (!q.title || !q.title.trim()) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `Le titre de la section ${validSectionNum} est vide.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            continue;
        }

        validQuestionNum++;
        const qNum = validQuestionNum;

        if (!q.text || !q.text.trim()) {
            if (errorAlert && errorMsg) {
                errorMsg.textContent = `L'énoncé de la question ${qNum} est vide.`;
                errorAlert.classList.remove('hidden');
            }
            return;
        }

        if (q.type === 'qcm') {
            if (!q.options || q.options.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (QCM) doit comporter au moins 2 options.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.options.length; j++) {
                if (!q.options[j] || !q.options[j].trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'option ${j + 1} de la question ${qNum} est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'image_choice') {
            if (!q.imageOptions || q.imageOptions.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (QCM Choix d'images) doit comporter au moins 2 options.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.imageOptions.length; j++) {
                const opt = q.imageOptions[j];
                if (!opt || !opt.imageUrl || !opt.imageUrl.trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'option ${j + 1} de la question ${qNum} (QCM Choix d'images) n'a pas d'image.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'table_choice') {
            if (!q.tableRows || q.tableRows.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Tableau à 2 colonnes) doit comporter au moins 2 affirmations.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.tableRows.length; j++) {
                const row = q.tableRows[j];
                if (!row || !row.text || !row.text.trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'affirmation ${j + 1} de la question ${qNum} (Tableau à 2 colonnes) est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
                if (!row.correctCol1 && !row.correctCol2) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'affirmation ${j + 1} de la question ${qNum} doit avoir au moins une réponse cochée (${q.col1Label || 'Col 1'} ou ${q.col2Label || 'Col 2'}).`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'classification') {
            if (!q.categories || q.categories.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Classement par catégories) doit comporter au moins 2 catégories.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.categories.length; j++) {
                const cat = q.categories[j];
                if (!cat || !cat.title || !cat.title.trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `La catégorie ${j + 1} de la question ${qNum} (Classement par catégories) a un titre vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
            if (!q.items || q.items.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Classement par catégories) doit comporter au moins 2 étiquettes.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.items.length; j++) {
                const it = q.items[j];
                if (!it || !it.text || !it.text.trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'étiquette ${j + 1} de la question ${qNum} (Classement par catégories) est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'pinpoint') {
            if (!q.pinImage) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Repère sur image) nécessite une image support.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
        } else if (q.type === 'range') {
            const min = parseFloat(q.min) || 0;
            const max = parseFloat(q.max) || 100;
            if (min >= max) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Curseur) a une valeur minimale supérieure ou égale au maximum.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
        } else if (q.type === 'cloze') {
            if (!q.clozeText || !q.clozeText.trim()) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Texte à trous) nécessite un texte avec [mot].`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            const clozeMatches = q.clozeText.match(/\[([^\]]+)\]/g);
            if (!clozeMatches || clozeMatches.length === 0) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Texte à trous) ne comporte aucun trou valide [mot].`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
        } else if (q.type === 'puzzle') {
            if (!q.items || q.items.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Puzzle) doit comporter au moins 2 éléments à ordonner.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.items.length; j++) {
                if (!q.items[j] || !q.items[j].trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `L'élément ${j + 1} de la question ${qNum} (Puzzle) est vide.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        } else if (q.type === 'matching') {
            if (!q.pairs || q.pairs.length < 2) {
                if (errorAlert && errorMsg) {
                    errorMsg.textContent = `La question ${qNum} (Relier les colonnes) doit comporter au moins 2 paires.`;
                    errorAlert.classList.remove('hidden');
                }
                return;
            }
            for (let j = 0; j < q.pairs.length; j++) {
                const pair = q.pairs[j];
                if (!pair || !pair.left || !pair.left.trim() || !pair.right || !pair.right.trim()) {
                    if (errorAlert && errorMsg) {
                        errorMsg.textContent = `La paire ${j + 1} de la question ${qNum} (Relier les colonnes) est incomplète.`;
                        errorAlert.classList.remove('hidden');
                    }
                    return;
                }
            }
        }
    }

    btnLoading(btnEl, true);

    try {
        const id = rawId || `mod_${Date.now()}`;
        const modulePayload = {
            id: id,
            num: num,
            title: title,
            subtitle: subtitle,
            icon: icon,
            bgImage: bgImage,
            description: subtitle,
            visible: isVisible,
            questionsCount: currentEditingQuestions.filter(q => q.type !== 'section').length,
            quizConfig: {
                quizTitle: title,
                maxAttempts: maxAttempts,
                timerMinutes: timerMinutes,
                timerSeconds: timerSeconds,
                timerTotalSeconds: timerTotalSeconds,
                showResultsAtEnd: showResultsAtEnd,
                negativePoints: negativePoints,
                allowPreviousPage: allowPreviousPage,
                requirePassword: isRequirePassword,
                password: isRequirePassword ? quizPassword : ''
            },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (!rawId) {
            modulePayload.enabled = false;
            modulePayload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        }

        await db.collection('formation').doc(id).set(modulePayload, { merge: true });

        const oldSnap = await db.collection('formation').doc(id).collection('questions').get();
        const batch = db.batch();

        oldSnap.docs.forEach(d => batch.delete(d.ref));

        currentEditingQuestions.forEach((q, idx) => {
            const isSec = (q.type === 'section');
            const qId = q.id || ((isSec ? 'sec_' : 'q_') + Date.now() + '_' + (idx + 1));
            const qRef = db.collection('formation').doc(id).collection('questions').doc(qId);
            
            let distractorArray = [];
            if (typeof q.distractors === 'string') {
                distractorArray = q.distractors.split(',').map(s => s.trim()).filter(Boolean);
            } else if (Array.isArray(q.distractors)) {
                distractorArray = q.distractors;
            }

            const qData = {
                id: qId,
                order: idx + 1,
                type: q.type || 'qcm',
                text: q.text || q.title || '',
                imageUrl: q.imageUrl || '',
                hint: q.hint || ''
            };

            if (q.type === 'section') {
                qData.title = q.title || q.text || `Section ${idx + 1}`;
                qData.description = q.description || '';
                qData.text = qData.title;
            } else if (q.type === 'qcm') {
                qData.options = q.options || ['Option 1', 'Option 2'];
                const cIdxs = (Array.isArray(q.correctIndexes) && q.correctIndexes.length > 0)
                    ? q.correctIndexes.map(n => parseInt(n, 10))
                    : [(q.correctIndex !== undefined ? parseInt(q.correctIndex, 10) : 0)];
                qData.correctIndexes = cIdxs;
                qData.correctIndex = cIdxs[0];
            } else if (q.type === 'image_choice') {
                qData.imageOptions = q.imageOptions || [];
                qData.correctIndex = q.correctIndex !== undefined ? q.correctIndex : 0;
            } else if (q.type === 'table_choice') {
                qData.col1Label = q.col1Label || 'VRAI';
                qData.col2Label = q.col2Label || 'FAUX';
                qData.tableRows = q.tableRows || [];
            } else if (q.type === 'classification') {
                qData.categories = q.categories || [];
                qData.items = q.items || [];
            } else if (q.type === 'boolean') {
                qData.correctAnswer = q.correctAnswer !== undefined ? (q.correctAnswer === true || q.correctAnswer === 'true') : true;
            } else if (q.type === 'pinpoint') {
                qData.pinImage = q.pinImage || '';
                qData.targetX = q.targetX !== undefined ? parseFloat(q.targetX) : 50;
                qData.targetY = q.targetY !== undefined ? parseFloat(q.targetY) : 50;
                qData.radius = q.radius !== undefined ? parseFloat(q.radius) : 10;
                qData.targetLabel = q.targetLabel || '';
            } else if (q.type === 'range') {
                qData.min = q.min !== undefined ? parseFloat(q.min) : 0;
                qData.max = q.max !== undefined ? parseFloat(q.max) : 100;
                qData.step = q.step !== undefined ? parseFloat(q.step) : 1;
                qData.unit = q.unit || '';
                qData.minLabel = q.minLabel || '';
                qData.maxLabel = q.maxLabel || '';
                qData.correctValue = q.correctValue !== undefined && q.correctValue !== '' ? parseFloat(q.correctValue) : '';
                qData.tolerance = q.tolerance !== undefined ? parseFloat(q.tolerance) : 0;
            } else if (q.type === 'cloze') {
                qData.clozeText = q.clozeText || '';
                qData.distractors = distractorArray;
            } else if (q.type === 'puzzle') {
                qData.items = q.items || [];
            } else if (q.type === 'matching') {
                qData.pairs = q.pairs || [];
                qData.rightDistractors = q.rightDistractors || '';
            }

            batch.set(qRef, qData);
        });

        await batch.commit();

        // Mettre à jour le snapshot pour marquer comme enregistré
        markModuleSaved();

        try {
            sessionStorage.removeItem('cached_formation_modules');
            sessionStorage.removeItem('cached_formation_modules_ts');
            localStorage.removeItem('offline_formation_modules');
        } catch (cErr) {}

        btnLoading(btnEl, false);
        showToast("🎉 Module et questions enregistrés !", "success", 4000);

        if (successAlert) {
            successAlert.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        if (!rawId) {
            currentEditingModuleId = id;
            document.getElementById('editModuleId').value = id;
            window.history.replaceState({}, '', `formation-edit.html?id=${encodeURIComponent(id)}`);
            if (currentRole === 'admin') {
                document.getElementById('btnDeleteModule')?.classList.remove('hidden');
            }
        }

        // Mettre à jour les hero badges
        document.getElementById('heroModuleTitle').textContent = title;
        document.getElementById('heroModuleSubtitle').textContent = subtitle;
        document.getElementById('heroModuleBadge').textContent = `Module ${num < 10 ? '0' + num : num}`;
        const visBadge = document.getElementById('heroVisibilityBadge');
        if (visBadge) {
            visBadge.textContent = isVisible ? 'Visible' : 'Masqué';
            visBadge.className = `es-badge ${isVisible ? 'es-badge--approved' : 'es-badge--pending'}`;
        }

    } catch (err) {
        btnLoading(btnEl, false);
        console.error("Save module error:", err);
        if (errorAlert && errorMsg) {
            errorMsg.textContent = "Erreur lors de l'enregistrement : " + err.message;
            errorAlert.classList.remove('hidden');
        }
        showToast("Erreur lors de l'enregistrement.", "error");
    }
}

// ----------------------------------------------------------------
// SUPPRESSION DU MODULE (ADMIN)
// ----------------------------------------------------------------
document.getElementById('btnDeleteModule')?.addEventListener('click', async () => {
    if (!currentEditingModuleId) return;
    if (!confirm("⚠️ Supprimer définitivement ce module et toutes ses questions ? Action irréversible.")) {
        return;
    }

    try {
        const qSnap = await db.collection('formation').doc(currentEditingModuleId).collection('questions').get();
        const batch = db.batch();
        qSnap.docs.forEach(d => batch.delete(d.ref));
        batch.delete(db.collection('formation').doc(currentEditingModuleId));
        await batch.commit();

        isBypassingUnsavedCheck = true;

        try {
            sessionStorage.removeItem('cached_formation_modules');
            sessionStorage.removeItem('cached_formation_modules_ts');
            localStorage.removeItem('offline_formation_modules');
        } catch (c) {}

        showToast("Module supprimé.", "info");
        setTimeout(() => {
            window.location.href = 'formation.html';
        }, 800);
    } catch (err) {
        console.error("Delete error:", err);
        showToast("Erreur lors de la suppression.", "error");
    }
});

// ----------------------------------------------------------------
// LISTENERS GLOBAUX
// ----------------------------------------------------------------
document.getElementById('btnAddQuestion')?.addEventListener('click', () => {
    currentEditingQuestions.push({
        id: 'q_' + Date.now() + '_' + (currentEditingQuestions.length + 1),
        type: 'qcm',
        text: '',
        options: ['Option 1', 'Option 2'],
        correctIndex: 0,
        hint: ''
    });
    renderQuestionsEditor();
    const container = document.getElementById('questionsContainer');
    if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

document.getElementById('btnAddSectionHeader')?.addEventListener('click', () => {
    syncQuestionsFromDOM();
    const existingSections = currentEditingQuestions.filter(q => q.type === 'section');

    if (existingSections.length === 0) {
        if (currentEditingQuestions.length === 0) {
            // Quiz vide : on place Section 1 au sommet
            currentEditingQuestions.push({
                id: 'sec_' + Date.now() + '_1',
                type: 'section',
                title: 'Section 1',
                description: '',
                text: 'Section 1'
            });
            showToast("Section 1 créée en haut du quiz.", "success");
        } else {
            // Quiz avec des questions existantes : Section 1 est automatiquement placée tout en haut
            // et la nouvelle section créée devient Section 2
            currentEditingQuestions.unshift({
                id: 'sec_' + Date.now() + '_1',
                type: 'section',
                title: 'Section 1',
                description: '',
                text: 'Section 1'
            });
            currentEditingQuestions.push({
                id: 'sec_' + (Date.now() + 50) + '_2',
                type: 'section',
                title: 'Section 2',
                description: '',
                text: 'Section 2'
            });
            showToast("Section 1 insérée tout en haut du quiz et Section 2 ajoutée.", "success");
        }
    } else {
        // Des sections existent déjà : si la première n'est pas tout en haut, on s'assure que Section 1 est au sommet
        if (currentEditingQuestions[0]?.type !== 'section') {
            currentEditingQuestions.unshift({
                id: 'sec_' + Date.now() + '_top',
                type: 'section',
                title: 'Section 1',
                description: '',
                text: 'Section 1'
            });
        }
        const updatedSecCount = currentEditingQuestions.filter(q => q.type === 'section').length + 1;
        currentEditingQuestions.push({
            id: 'sec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            type: 'section',
            title: `Section ${updatedSecCount}`,
            description: '',
            text: `Section ${updatedSecCount}`
        });
        showToast(`Section ${updatedSecCount} ajoutée.`, "info");
    }

    renderQuestionsEditor();
    const container = document.getElementById('questionsContainer');
    if (container && container.lastElementChild) {
        container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});

document.getElementById('btnSaveModuleHeader')?.addEventListener('click', function() {
    saveModuleData(this);
});

document.getElementById('btnSaveModuleBottom')?.addEventListener('click', function() {
    saveModuleData(this);
});

document.getElementById('editQuizRequirePassword')?.addEventListener('change', (e) => {
    const wrap = document.getElementById('quizPasswordInputWrap');
    if (wrap) {
        if (e.target.checked) wrap.classList.remove('hidden');
        else wrap.classList.add('hidden');
    }
});

document.getElementById('editModuleBgImage')?.addEventListener('input', (e) => {
    updateModuleBgPreview(e.target.value);
});

document.getElementById('btnRemoveBgImage')?.addEventListener('click', () => {
    document.getElementById('editModuleBgImage').value = '';
    updateModuleBgPreview('');
});

document.getElementById('editModuleBgUpload')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast("Veuillez sélectionner une image valide.", "warning");
        return;
    }

    showToast("Upload de l'image de fond…", "info");
    try {
        const storageRef = firebase.storage().ref(`formation/covers/${Date.now()}_${file.name}`);
        const snapshot = await storageRef.put(file);
        const downloadUrl = await snapshot.ref.getDownloadURL();
        document.getElementById('editModuleBgImage').value = downloadUrl;
        updateModuleBgPreview(downloadUrl);
        showToast("Image uploadée avec succès !", "success");
    } catch (err) {
        console.error("Upload bg image error:", err);
        showToast("Erreur lors de l'upload.", "error");
    }
});

// Auth listener
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.replace('index.html');
        return;
    }

    currentUser = user;
    try {
        const userDoc = await db.collection('users').doc(user.uid).get();
        if (userDoc.exists) {
            actualUserData = userDoc.data();
            currentRole = actualUserData.role || 'stagiaire';

            // Synchroniser les modules épinglés depuis Firestore BDD
            if (actualUserData.pinnedModules) {
                localStorage.setItem('pinnedModules', JSON.stringify(actualUserData.pinnedModules));
            } else {
                const localPinned = localStorage.getItem('pinnedModules');
                if (localPinned) {
                    db.collection('users').doc(user.uid).update({
                        pinnedModules: JSON.parse(localPinned)
                    }).catch(() => {});
                }
            }
        }
    } catch (err) {
        console.warn("User profile fetch error:", err);
    }

    if (currentRole !== 'admin' && currentRole !== 'formateur') {
        alert("Accès réservé aux formateurs et administrateurs.");
        window.location.replace('formation.html');
        return;
    }

    // Topbar User info
    const nameEl = document.getElementById('userDisplayName');
    if (nameEl) nameEl.textContent = actualUserData?.displayName || `${actualUserData?.firstName || ''} ${actualUserData?.lastName || ''}`.trim() || user.email;

    const badgeEl = document.getElementById('userBadge');
    const btnAdminLink = document.getElementById('btnAdminLink');
    const btnFormationLink = document.getElementById('btnFormationLink');
    const linkAdminInDropdown = document.getElementById('linkAdmin');

    if (currentRole === 'admin') {
        if (badgeEl) {
            badgeEl.className = 'es-badge es-badge--admin';
            badgeEl.textContent = '⚡ Admin';
        }
        btnAdminLink?.classList.remove('hidden');
        btnFormationLink?.classList.add('hidden');
        linkAdminInDropdown?.classList.remove('hidden');
    } else {
        // Formateur ou autre rôle autorisé
        if (badgeEl) {
            badgeEl.className = 'es-badge es-badge--formateur';
            badgeEl.textContent = '👨‍🏫 Formateur';
        }
        btnAdminLink?.classList.add('hidden');
        btnFormationLink?.classList.remove('hidden');
        linkAdminInDropdown?.classList.add('hidden');
    }

    const avatarEl = document.getElementById('userAvatar');
    if (avatarEl && (actualUserData?.photoURL || user.photoURL)) {
        avatarEl.innerHTML = `<img src="${actualUserData?.photoURL || user.photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }

    // Menu utilisateur
    document.getElementById('btnUserMenu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        document.getElementById('userDropdown')?.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.es-user-dropdown-wrap')) {
            document.getElementById('userDropdown')?.classList.add('hidden');
        }
    });

    document.getElementById('btnLogout')?.addEventListener('click', async () => {
        await auth.signOut();
        window.location.replace('index.html');
    });

    loadModuleHubData();
});
