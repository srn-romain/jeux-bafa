/* ================================================================
   ESPACE-COLO-FORM.JS — Gestionnaire Partagé des Formulaires de Colonies
   Centralise à la fois le code HTML du formulaire et toute la logique JS.
   ================================================================ */

const ColoFormManager = {
    // 1. Template HTML partagé premium injecté dynamiquement au chargement
    TEMPLATE: `
        <div class="es-modal" style="max-width:560px;">
            <div class="es-modal__header">
                <h2 class="es-modal__title" id="coloFormTitle">Toto</h2>
                <button class="es-modal__close" id="btnCloseColoForm"><i class="bi bi-x"></i></button>
            </div>
            <div class="es-modal__body">
                <form id="coloForm" novalidate>
                    <input type="hidden" id="coloId">
                    <div class="es-field">
                        <label class="es-field__label" for="coloNom">Nom de la colonie *</label>
                        <input class="es-input" type="text" id="coloNom" required placeholder="Colo des Loups">
                    </div>
                    <div class="es-field es-combobox">
                        <label class="es-field__label" for="coloOrganisme">Organisme</label>
                        <div class="es-combobox__wrap">
                            <input class="es-input es-combobox__input" type="text" id="coloOrganisme" placeholder="Ex: UFCV, IFAC..." autocomplete="off">
                            <div class="es-combobox__dropdown hidden" id="coloOrganismeDropdown"></div>
                        </div>
                    </div>
                    <div class="es-field hidden" id="coloOrganismeAutreWrap">
                        <label class="es-field__label" for="coloOrganismeAutre">Préciser l'organisme *</label>
                        <input class="es-input" type="text" id="coloOrganismeAutre" placeholder="Saisissez le nom de l'organisme">
                    </div>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                        <div class="es-field">
                            <label class="es-field__label" for="coloDateDebut">Date de début</label>
                            <input class="es-input" type="date" id="coloDateDebut">
                        </div>
                        <div class="es-field">
                            <label class="es-field__label" for="coloDateFin">Date de fin</label>
                            <input class="es-input" type="date" id="coloDateFin">
                        </div>
                    </div>
                    <div class="es-field">
                        <label class="es-field__label" for="coloDriveId">ID Dossier Google Drive</label>
                        <div class="es-input-wrap">
                            <i class="bi bi-google es-input-icon" style="color:#4285F4;"></i>
                            <input class="es-input es-input--icon" type="text" id="coloDriveId" placeholder="1BxiM...dPNv">
                        </div>
                        <p style="font-size:0.77rem;color:var(--clr-text-light);margin-top:4px;">
                            L'ID se trouve dans l'URL du dossier Drive :
                            drive.google.com/drive/folders/<strong>ID</strong>
                        </p>
                    </div>
                    <div class="es-field">
                        <label class="es-field__label" for="coloPPId">ID du fichier Drive (Projet Pédagogique)</label>
                        <div class="es-input-wrap">
                            <i class="bi bi-file-earmark-pdf es-input-icon" style="color:var(--clr-danger);"></i>
                            <input class="es-input es-input--icon" type="text" id="coloPPId" placeholder="Ex: 1A2B3C4D5E6F7G8H9I0J">
                        </div>
                        <p style="font-size:0.77rem;color:var(--clr-text-light);margin-top:4px;">
                            Obtenez l'ID via : <strong>Clic droit > Partager > Copier le lien</strong> (récupérez la partie entre /d/ et /view).
                        </p>
                    </div>

                    <div class="es-field">
                        <label class="es-field__label" for="coloBgInput">Image de fond (Card Anim)</label>
                        <div class="es-input-wrap">
                            <i class="bi bi-image es-input-icon"></i>
                            <input class="es-input es-input--icon" type="file" id="coloBgInput" accept="image/*" style="padding-top:8px;">
                        </div>
                        <div id="coloBgPreviewContainer" class="hidden" style="position: relative; display: inline-block; margin-top: 10px;">
                            <img id="coloBgPreview" style="max-width: 100%; border-radius: 8px; max-height: 150px; object-fit: cover; display: block;">
                            <button type="button" id="btnRemoveColoBg" class="es-btn es-btn--danger" style="position: absolute; top: 6px; right: 6px; padding: 4px; width: 28px; height: 28px; border-radius: 50%;">
                                <i class="bi bi-trash3"></i>
                            </button>
                        </div>
                        <input type="hidden" id="coloBgBase64">
                    </div>
                    <div class="es-field">
                        <label class="es-field__label">Emoji</label>
                        <input type="hidden" id="coloEmoji" value="🏕️">
                        <div id="coloEmojiSelector" class="es-emoji-selector">
                            <!-- Rempli par le script -->
                        </div>
                    </div>
                    <div class="es-field" style="margin-top: 15px;">
                        <label class="es-checkbox-label" style="display:flex; align-items:center; gap:8px; cursor:pointer;" title="Ajoute une section d'appréciation pour chaque participant.">
                            <input type="checkbox" id="coloIsFormation">
                            <span style="font-size:0.9rem; color:var(--clr-text); font-weight: 500;">Cette session est une formation</span>
                        </label>
                    </div>
                </form>
                <div class="es-alert es-alert--error hidden mt-3" id="coloFormError">
                    <i class="bi bi-exclamation-circle"></i><span id="coloFormErrorMsg"></span>
                </div>
            </div>
            <div class="es-modal__footer">
                <button class="es-btn es-btn--ghost" id="btnCancelColoForm">Annuler</button>
                <button class="es-btn es-btn--primary" id="btnSaveColoForm">
                    <i class="bi bi-check-lg"></i>
                    <span class="es-btn__text">Enregistrer</span>
                    <span class="es-btn__spinner"></span>
                </button>
            </div>
        </div>
    `,

    // Liste des Emojis de séjours
    AVAILABLE_EMOJIS: [
        { emoji: '🏖️', desc: 'plage' }, { emoji: '🏔️', desc: 'montagne' },
        { emoji: '🚲', desc: 'vélo' }, { emoji: '🌳', desc: 'campagne' },
        { emoji: '🌊', desc: 'mer' }, { emoji: '🏕️', desc: 'camping' },
        { emoji: '🏞️', desc: 'randonnée' }, { emoji: '⛷️', desc: 'ski' },
        { emoji: '🏄', desc: 'surf' }, { emoji: '🧗', desc: 'escalade' },
        { emoji: '🚣', desc: 'kayak' }, { emoji: '🏹', desc: 'tir à l\'arc' },
        { emoji: '⚽', desc: 'football' }, { emoji: '🏀', desc: 'basket' },
        { emoji: '🏐', desc: 'volley' }, { emoji: '🎨', desc: 'peinture' },
        { emoji: '🎢', desc: 'parc d\'attraction' }, { emoji: '🎓', desc: 'formation' },
        { emoji: '🎤', desc: 'musique' }, { emoji: '💃', desc: 'danse' },
        { emoji: '🐴', desc: 'équitation' }, { emoji: '🐾', desc: 'animaux' },
        { emoji: '🦉', desc: 'observation nocturne' }, { emoji: '🐟', desc: 'pêche' },
        { emoji: '✈️', desc: 'voyage' }, { emoji: '🌍', desc: 'culture' },
        { emoji: '🏛️', desc: 'visite culturelle' }, { emoji: '🍳', desc: 'cuisine' },
        { emoji: '🧩', desc: 'jeux' }, { emoji: '🎒', desc: 'itinérance' },
        { emoji: '🗣️', desc: 'linguistique' }, { emoji: '⚜️', desc: 'scoutisme' },
        { emoji: '🏫', desc: 'centre de loisirs / ALSH' }, { emoji: '🏎️', desc: 'karting' },
        { emoji: '🚂', desc: 'train' }, { emoji: '🎭', desc: 'Théâtre / spectacle' }
    ],

    // Liste des Organismes prédéfinis
    predefinedOrganisms: [
        { value: "ALEF", label: "ALEF" },
        { value: "Afocal", label: "Afocal" },
        { value: "Agence Nature", label: "Agence Nature" },
        { value: "Association Regards", label: "Association Regards" },
        { value: "Avea", label: "Avea" },
        { value: "Cap Juniors", label: "Cap Juniors" },
        { value: "Cap Monde", label: "Cap Monde" },
        { value: "CE Air France", label: "CE Air France" },
        { value: "CE SNCF", label: "CE SNCF" },
        { value: "CGCV", label: "CGCV" },
        { value: "Chemins du Monde", label: "Chemins du Monde" },
        { value: "Chic Planet", label: "Chic Planet" },
        { value: "CIE Thales", label: "CIE Thales" },
        { value: "Cemea", label: "Cemea" },
        { value: "Compagnons Des Jours Heureux", label: "Compagnons Des Jours Heureux" },
        { value: "Croq Vacances", label: "Croq Vacances" },
        { value: "Djuringa", label: "Djuringa" },
        { value: "FFSS", label: "FFSS" },
        { value: "GoColo", label: "GoColo" },
        { value: "Haute Pyrénées Sport & Nature", label: "Haute Pyrénées Sport & Nature" },
        { value: "IFAC", label: "IFAC" },
        { value: "Léo Lagrange", label: "Léo Lagrange" },
        { value: "Le Temps des Copains", label: "Le Temps des Copains" },
        { value: "Le Zèbre", label: "Le Zèbre" },
        { value: "Les Francas", label: "Les Francas" },
        { value: "Les séjours de l'AJD", label: "Les séjours de l'AJD" },
        { value: "Mondiale Junior", label: "Mondiale Junior" },
        { value: "Nouvelles Aventures Junior", label: "Nouvelles Aventures Junior" },
        { value: "Nouvelles Vagues", label: "Nouvelles Vagues" },
        { value: "Passion Aventure Junior", label: "Passion Aventure Junior" },
        { value: "Sans Frontières", label: "Sans Frontières" },
        { value: "SILC", label: "SILC" },
        { value: "SNU", label: "SNU" },
        { value: "Sports Elite Jeunes", label: "Sports Elite Jeunes" },
        { value: "Temps Jeunes", label: "Temps Jeunes" },
        { value: "Telligo", label: "Telligo" },
        { value: "UCPA", label: "UCPA" },
        { value: "UFCV", label: "UFCV" },
        { value: "Visas Loisirs", label: "Visas Loisirs" },
        { value: "Zigo", label: "Zigo" },
        
        // Group FSF (Scout groups)
        { value: "Guides et scouts de France (SGDF)", label: "Guides et scouts de France (SGDF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs de France (EEDF)", label: "Éclaireuses et éclaireurs de France (EEDF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses éclaireurs unionistes de France (EEUF)", label: "Éclaireuses éclaireurs unionistes de France (EEUF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs israélites de France (EEIF)", label: "Éclaireuses et éclaireurs israélites de France (EEIF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Scouts musulmans de France (SMF)", label: "Scouts musulmans de France (SMF)", group: "Fédération du scoutisme français (FSF)" },
        { value: "Éclaireuses et éclaireurs de la nature (EEDLN)", label: "Éclaireuses et éclaireurs de la nature (EEDLN)", group: "Fédération du scoutisme français (FSF)" },
        
        // Group CSF
        { value: "Association des guides et scouts d'Europe (AGSE)", label: "Association des guides et scouts d'Europe (AGSE)", group: "Conférence française du scoutisme (CSF)" },
        { value: "Éclaireurs neutres de France (ENF)", label: "Éclaireurs neutres de France (ENF)", group: "Conférence française du scoutisme (CSF)" },
        
        // Group Indépendant
        { value: "Fédération des éclaireurs et éclaireuses (FEE)", label: "Fédération des éclaireurs et éclaireuses (FEE)", group: "Indépendant" },
        { value: "Scouts unitaires de France (SUF)", label: "Scouts unitaires de France (SUF)", group: "Indépendant" },
        
        { value: "Autre", label: "Autre (préciser)" }
    ],

    // Mappage statique unique des éléments du DOM
    getElements() {
        return {
            id: document.getElementById('coloId'),
            nom: document.getElementById('coloNom'),
            organisme: document.getElementById('coloOrganisme'),
            organismeAutre: document.getElementById('coloOrganismeAutre'),
            organismeAutreWrap: document.getElementById('coloOrganismeAutreWrap'),
            organismeDropdown: document.getElementById('coloOrganismeDropdown'),
            dateDebut: document.getElementById('coloDateDebut'),
            dateFin: document.getElementById('coloDateFin'),
            driveId: document.getElementById('coloDriveId'),
            ppId: document.getElementById('coloPPId'),
            isFormation: document.getElementById('coloIsFormation'),
            bgInput: document.getElementById('coloBgInput'),
            bgBase64: document.getElementById('coloBgBase64'),
            bgPreview: document.getElementById('coloBgPreview'),
            bgPreviewContainer: document.getElementById('coloBgPreviewContainer'),
            removeBgBtn: document.getElementById('btnRemoveColoBg'),
            emoji: document.getElementById('coloEmoji'),
            emojiSelector: document.getElementById('coloEmojiSelector'),
            errorWrap: document.getElementById('coloFormError'),
            errorMsg: document.getElementById('coloFormErrorMsg'),
            overlay: document.getElementById('overlayColoForm')
        };
    },

    // Initialisation et injection dynamique du formulaire HTML
    init(modeOrSaveSuccess, maybeSaveSuccess) {
        // Résolution rétrocompatible des arguments
        let onSaveSuccess = maybeSaveSuccess;
        if (typeof modeOrSaveSuccess === 'function') {
            onSaveSuccess = modeOrSaveSuccess;
        }

        // 1. Injecter l'overlay HTML si non présent
        if (!document.getElementById('overlayColoForm')) {
            const overlayDiv = document.createElement('div');
            overlayDiv.id = 'overlayColoForm';
            overlayDiv.className = 'es-overlay hidden';
            overlayDiv.role = 'dialog';
            overlayDiv.setAttribute('aria-modal', 'true');
            overlayDiv.innerHTML = this.TEMPLATE;
            document.body.appendChild(overlayDiv);
        }

        const els = this.getElements();
        if (!els.organisme) return;

        // 2. Initialiser le composant Combobox recherchable
        this.initOrganismeCombobox(els);

        // 3. Écouteur de téléchargement de l'image de fond
        if (els.bgInput) {
            els.bgInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (!file.type.startsWith('image/')) {
                    showToast("Seules les images sont acceptées.", "error");
                    return;
                }
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => {
                    let base64 = reader.result;
                    if (base64.length > 5500000) {
                        showToast("L'image est trop lourde (max ~4Mo).", "error");
                        return;
                    }
                    if (els.bgBase64) els.bgBase64.value = base64;
                    if (els.bgPreview && els.bgPreviewContainer) {
                        els.bgPreview.src = base64;
                        els.bgPreviewContainer.classList.remove('hidden');
                    }
                };
                reader.onerror = () => showToast("Erreur de lecture de l'image.", "error");
            });
        }

        // Écouteur pour supprimer l'image de fond
        if (els.removeBgBtn) {
            els.removeBgBtn.addEventListener('click', () => {
                if (els.bgInput) els.bgInput.value = '';
                if (els.bgBase64) els.bgBase64.value = '';
                if (els.bgPreview) els.bgPreview.src = '';
                if (els.bgPreviewContainer) els.bgPreviewContainer.classList.add('hidden');
            });
        }

        // 4. Bouton Enregistrer (remplacé pour éviter les doublons d'écouteurs)
        const saveBtn = document.getElementById('btnSaveColoForm');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', () => this.handleSave(onSaveSuccess));
        }

        // 5. Boutons Annuler et Fermer
        document.getElementById('btnCloseColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));
        document.getElementById('btnCancelColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));
    },

    // Ouverture et pré-remplissage du formulaire
    open(modeOrColo = null, maybeColo = null) {
        // Résolution rétrocompatible des arguments
        let colo = null;
        if (typeof modeOrColo === 'object' && modeOrColo !== null) {
            colo = modeOrColo;
        } else if (typeof maybeColo === 'object' && maybeColo !== null) {
            colo = maybeColo;
        }

        const els = this.getElements();
        if (!els.id) return;

        els.id.value = colo?.id || '';
        els.nom.value = colo?.nom || '';
        
        // Gérer "Autre" et rétrocompatibilité des organismes libres
        const predefinedValues = this.predefinedOrganisms.map(org => org.value);
        if (colo?.organisme && !predefinedValues.includes(colo.organisme)) {
            els.organisme.value = 'Autre';
            if (els.organismeAutre) els.organismeAutre.value = colo.organisme;
            if (els.organismeAutreWrap) els.organismeAutreWrap.classList.remove('hidden');
        } else {
            els.organisme.value = colo?.organisme || '';
            if (els.organismeAutre) els.organismeAutre.value = '';
            if (els.organismeAutreWrap) els.organismeAutreWrap.classList.add('hidden');
        }

        els.dateDebut.value = colo?.dateDebut || '';
        els.dateFin.value = colo?.dateFin || '';
        els.driveId.value = colo?.driveId || '';
        els.ppId.value = colo?.ppId || '';
        
        if (els.isFormation) els.isFormation.checked = colo?.isFormation === true;

        if (els.bgInput) els.bgInput.value = '';
        if (els.bgBase64) els.bgBase64.value = colo?.bgImage || '';
        if (els.bgPreview && els.bgPreviewContainer) {
            if (colo?.bgImage) {
                els.bgPreview.src = colo.bgImage;
                els.bgPreviewContainer.classList.remove('hidden');
            } else {
                els.bgPreview.src = '';
                els.bgPreviewContainer.classList.add('hidden');
            }
        }

        const currentEmoji = colo?.emoji || '🏕️';
        if (els.emoji) els.emoji.value = currentEmoji;

        if (els.emojiSelector) {
            els.emojiSelector.innerHTML = this.AVAILABLE_EMOJIS.map(item =>
                `<button type="button" title="${item.desc}" class="${item.emoji === currentEmoji ? 'selected' : ''}" onclick="ColoFormManager.selectEmoji('${item.emoji}', this)">${item.emoji}</button>`
            ).join('');
        }

        const formTitle = document.getElementById('coloFormTitle');
        if (formTitle) formTitle.textContent = colo ? 'Modifier la colonie' : 'Nouvelle colonie';
        if (els.errorWrap) els.errorWrap.classList.add('hidden');
        
        openModal('overlayColoForm');
    },

    // Gestion du clic sur un Emoji
    selectEmoji(emojiOrMode, emojiOrBtn, maybeBtn) {
        // Résolution rétrocompatible des arguments (prend en charge (emoji, btn) et (mode, emoji, btn))
        let emoji = emojiOrMode;
        let btnEl = emojiOrBtn;
        if (typeof emojiOrBtn === 'string') {
            emoji = emojiOrBtn;
            btnEl = maybeBtn;
        }

        const els = this.getElements();
        if (els.emoji) els.emoji.value = emoji;
        if (els.emojiSelector) {
            els.emojiSelector.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
            btnEl.classList.add('selected');
        }
    },

    // Composant Combobox recherchable
    initOrganismeCombobox(els) {
        const input = els.organisme;
        const dropdown = els.organismeDropdown;
        const organisms = this.predefinedOrganisms;
        
        let highlightedIndex = -1;
        const wrap = input.parentElement;

        if (wrap) {
            wrap.classList.add('es-combobox__wrap');
            if (!wrap.querySelector('.es-combobox__toggle')) {
                const toggle = document.createElement('i');
                toggle.className = 'bi bi-chevron-down es-combobox__toggle';
                wrap.appendChild(toggle);
            }
        }

        const renderList = (filterText = '') => {
            const query = filterText.toLowerCase().trim();
            const filtered = organisms.filter(org => 
                org.label.toLowerCase().includes(query) || 
                (org.group && org.group.toLowerCase().includes(query))
            );
            
            dropdown.innerHTML = '';
            highlightedIndex = -1;

            if (filtered.length === 0) {
                const emptyItem = document.createElement('div');
                emptyItem.className = 'es-combobox__item es-combobox__item--empty';
                emptyItem.textContent = 'Aucun organisme trouvé';
                dropdown.appendChild(emptyItem);
                return;
            }

            let currentGroup = null;
            let itemIndex = 0;

            filtered.forEach((org) => {
                if (org.group && org.group !== currentGroup) {
                    currentGroup = org.group;
                    const header = document.createElement('div');
                    header.className = 'es-combobox__header';
                    header.textContent = currentGroup;
                    dropdown.appendChild(header);
                } else if (!org.group && currentGroup !== null) {
                    currentGroup = null;
                }

                const item = document.createElement('div');
                item.className = 'es-combobox__item';
                item.dataset.index = itemIndex;
                itemIndex++;

                if (org.value === input.value) {
                    item.classList.add('active');
                }
                
                item.innerHTML = `<i class="bi bi-building"></i> <span>${org.label}</span>`;
                
                item.addEventListener('click', () => {
                    input.value = org.value;
                    if (org.value === 'Autre') {
                        if (els.organismeAutreWrap && els.organismeAutre) {
                            els.organismeAutreWrap.classList.remove('hidden');
                            els.organismeAutre.value = '';
                            els.organismeAutre.focus();
                        }
                    } else {
                        if (els.organismeAutreWrap && els.organismeAutre) {
                            els.organismeAutreWrap.classList.add('hidden');
                            els.organismeAutre.value = '';
                        }
                    }
                    closeDropdown();
                    input.dispatchEvent(new Event('change'));
                });
                dropdown.appendChild(item);
            });
        };

        const showDropdown = () => {
            renderList(input.value);
            dropdown.classList.remove('hidden');
            dropdown.classList.add('show');
            if (wrap) wrap.classList.add('open');
        };

        const closeDropdown = () => {
            dropdown.classList.remove('show');
            dropdown.classList.add('hidden');
            if (wrap) wrap.classList.remove('open');
            highlightedIndex = -1;
        };

        input.addEventListener('focus', showDropdown);
        input.addEventListener('input', showDropdown);

        input.addEventListener('change', () => {
            if (els.organismeAutreWrap && els.organismeAutre) {
                if (input.value === 'Autre') {
                    els.organismeAutreWrap.classList.remove('hidden');
                    els.organismeAutre.focus();
                } else {
                    els.organismeAutreWrap.classList.add('hidden');
                }
            }
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !dropdown.contains(e.target)) {
                closeDropdown();
            }
        });

        input.addEventListener('keydown', (e) => {
            const items = dropdown.querySelectorAll('.es-combobox__item:not(.es-combobox__item--empty)');
            if (!dropdown.classList.contains('show')) {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    showDropdown();
                    e.preventDefault();
                }
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightedIndex = (highlightedIndex + 1) % items.length;
                updateHighlight(items);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
                updateHighlight(items);
            } else if (e.key === 'Enter') {
                if (highlightedIndex >= 0 && highlightedIndex < items.length) {
                    e.preventDefault();
                    items[highlightedIndex].click();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeDropdown();
                input.blur();
            }
        });

        const updateHighlight = (items) => {
            items.forEach((item, idx) => {
                if (idx === highlightedIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        };
    },

    // Enregistrement Firestore
    async handleSave(onSaveSuccess) {
        const els = this.getElements();
        const btn = document.getElementById('btnSaveColoForm');
        
        const nomVal = els.nom?.value.trim();
        if (!nomVal) {
            els.errorMsg.textContent = 'Le nom de la colonie est obligatoire.';
            els.errorWrap.classList.remove('hidden');
            return;
        }

        const dateDebutVal = els.dateDebut?.value;
        const dateFinVal = els.dateFin?.value;
        if (dateDebutVal && dateFinVal && new Date(dateFinVal) <= new Date(dateDebutVal)) {
            els.errorMsg.textContent = 'La date de fin doit être après la date de début.';
            els.errorWrap.classList.remove('hidden');
            return;
        }

        let orgVal = els.organisme?.value.trim() || '';
        if (orgVal === 'Autre') {
            orgVal = els.organismeAutre?.value.trim() || '';
            if (!orgVal) {
                els.errorMsg.textContent = "Veuillez préciser le nom de l'organisme.";
                els.errorWrap.classList.remove('hidden');
                return;
            }
        }

        els.errorWrap.classList.add('hidden');
        btnLoading(btn, true);

        const data = {
            nom: nomVal,
            organisme: orgVal,
            dateDebut: dateDebutVal || '',
            dateFin: dateFinVal || '',
            driveId: els.driveId?.value.trim() || '',
            ppId: els.ppId?.value.trim() || '',
            isFormation: els.isFormation?.checked || false,
            bgImage: els.bgBase64?.value || '',
            emoji: els.emoji?.value.trim() || '🏕️',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        const idVal = els.id?.value;

        try {
            if (idVal) {
                data.description = firebase.firestore.FieldValue.delete();
                await db.collection('espaces').doc(idVal).update(data);
                showToast('Colonie mise à jour.', 'success');
            } else {
                data.createdBy = auth.currentUser.uid;
                data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
                await db.collection('espaces').add(data);
                showToast('Colonie créée !', 'success');
            }
            closeModal('overlayColoForm');
            if (onSaveSuccess) onSaveSuccess();
        } catch (err) {
            console.error('Save error:', err);
            els.errorMsg.textContent = 'Erreur lors de l\'enregistrement.';
            els.errorWrap.classList.remove('hidden');
        } finally {
            btnLoading(btn, false);
        }
    }
};
