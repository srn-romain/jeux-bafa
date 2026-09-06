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
                        <label class="es-field__label" for="coloNom">Nom de l'espace *</label>
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
                        <label class="es-field__label" for="coloBgInput">Image de fond (Card Anim & Bannière)</label>
                        <div class="es-input-wrap" id="coloBgInputWrap">
                            <i class="bi bi-image es-input-icon"></i>
                            <input class="es-input es-input--icon" type="file" id="coloBgInput" accept="image/*" style="padding-top:8px;">
                        </div>

                        <!-- Zone de cadrage interactif directement intégrée au formulaire -->
                        <div id="coloBgCropperSection" class="es-cropper-section hidden">
                            <div class="es-cropper-header">
                                <div class="es-cropper-ratios">
                                    <div class="es-cropper-ratios__group" id="formCropperRatioGroup">
                                        <span class="es-cropper-ratios__label"><i class="bi bi-aspect-ratio"></i> Format :</span>
                                        <button type="button" class="es-cropper-ratio-btn active" data-ratio="3">3:1 Bannière</button>
                                        <button type="button" class="es-cropper-ratio-btn" data-ratio="2.333">21:9</button>
                                        <button type="button" class="es-cropper-ratio-btn" data-ratio="1.777">16:9</button>
                                        <button type="button" class="es-cropper-ratio-btn" data-ratio="1.5">3:2</button>
                                        <button type="button" class="es-cropper-ratio-btn" data-ratio="free">Libre</button>
                                    </div>
                                </div>
                                <div class="es-cropper-header-actions">
                                    <button type="button" id="btnRemoveColoBg" class="es-btn es-btn--sm es-btn--danger" title="Supprimer l'image">
                                        <i class="bi bi-trash3"></i> Supprimer l'image
                                    </button>
                                </div>
                            </div>

                            <p class="es-cropper-hint">
                                <i class="bi bi-arrows-move"></i> <span><strong>Déplacez et ajustez le cadre</strong> ci-dessous pour choisir le rectangle affiché :</span>
                            </p>

                            <div class="es-cropper-warning">
                                <i class="bi bi-exclamation-triangle"></i>
                                <span><strong>Attention :</strong> Le zoom et le recadrage sont définitifs après enregistrement (aucun dézoom possible ultérieurement sans re-téléverser la photo originale).</span>
                            </div>

                            <!-- Scène de Recadrage -->
                            <div class="es-cropper-stage-container" id="formCropperStageContainer">
                                <div class="es-cropper-stage" id="formCropperStage">
                                    <img id="formCropperImg" class="es-cropper-img" alt="Photo à recadrer" draggable="false">
                                    <div id="formCropperBox" class="es-cropper-box">
                                        <div class="es-cropper-grid">
                                            <div class="es-cropper-grid-line v1"></div>
                                            <div class="es-cropper-grid-line v2"></div>
                                            <div class="es-cropper-grid-line h1"></div>
                                            <div class="es-cropper-grid-line h2"></div>
                                        </div>
                                        <div class="es-cropper-handle handle-nw" data-handle="nw"></div>
                                        <div class="es-cropper-handle handle-ne" data-handle="ne"></div>
                                        <div class="es-cropper-handle handle-se" data-handle="se"></div>
                                        <div class="es-cropper-handle handle-sw" data-handle="sw"></div>
                                        <div class="es-cropper-handle handle-n" data-handle="n"></div>
                                        <div class="es-cropper-handle handle-e" data-handle="e"></div>
                                        <div class="es-cropper-handle handle-s" data-handle="s"></div>
                                        <div class="es-cropper-handle handle-w" data-handle="w"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Outils de zoom & recentrage -->
                            <div class="es-cropper-tools">
                                <div class="es-cropper-tools__zoom">
                                    <i class="bi bi-zoom-in es-cropper-tools__zoom-icon"></i>
                                    <button type="button" class="es-btn es-btn--sm es-btn--ghost" id="btnFormCropperZoomOut" title="Dézoomer"><i class="bi bi-dash-lg"></i></button>
                                    <input type="range" id="formCropperZoomSlider" min="1" max="3" step="0.05" value="1" title="Niveau de zoom">
                                    <button type="button" class="es-btn es-btn--sm es-btn--ghost" id="btnFormCropperZoomIn" title="Zoomer"><i class="bi bi-plus-lg"></i></button>
                                </div>
                                <div class="es-cropper-tools__actions">
                                    <button type="button" class="es-btn es-btn--sm es-btn--secondary" id="btnFormCropperCenter" title="Centrer le cadre">
                                        <i class="bi bi-arrows-move"></i> Centrer
                                    </button>
                                    <button type="button" class="es-btn es-btn--sm es-btn--secondary" id="btnFormCropperMaximize" title="Plein cadre">
                                        <i class="bi bi-arrows-fullscreen"></i> Max
                                    </button>
                                </div>
                            </div>

                            <!-- Mini aperçu en temps réel de la carte Admin -->
                            <div class="es-cropper-preview-section">
                                <div class="es-cropper-preview-header">
                                    <i class="bi bi-eye"></i> Aperçu direct sur la carte Admin :
                                </div>
                                <div class="es-cropper-preview-card" id="formCropperPreviewCard">
                                    <canvas id="formCropperPreviewCanvas" style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;"></canvas>
                                    <div style="position: absolute; inset: 0; background: linear-gradient(to bottom, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.68) 100%); z-index: 2;"></div>
                                    <div class="es-cropper-preview-card-content">
                                        <div class="es-cropper-preview-title">
                                            <span class="es-cropper-preview-emoji-wrap" id="formCropperPreviewEmoji">🏕️</span>
                                            <div>
                                                <div id="formCropperPreviewName" style="line-height:1.2;">Nom de l'espace</div>
                                                <div class="es-cropper-preview-subtitle" id="formCropperPreviewDates">Séjour actif</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
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
            bgCropperSection: document.getElementById('coloBgCropperSection'),
            removeBgBtn: document.getElementById('btnRemoveColoBg'),
            emoji: document.getElementById('coloEmoji'),
            emojiSelector: document.getElementById('coloEmojiSelector'),
            errorWrap: document.getElementById('coloFormError'),
            errorMsg: document.getElementById('coloFormErrorMsg'),
            overlay: document.getElementById('overlayColoForm'),

            // Éléments du Recadreur Intégré
            cropperStageContainer: document.getElementById('formCropperStageContainer'),
            cropperStage: document.getElementById('formCropperStage'),
            cropperImg: document.getElementById('formCropperImg'),
            cropperBox: document.getElementById('formCropperBox'),
            zoomSlider: document.getElementById('formCropperZoomSlider'),
            previewCanvas: document.getElementById('formCropperPreviewCanvas'),
            previewEmoji: document.getElementById('formCropperPreviewEmoji'),
            previewName: document.getElementById('formCropperPreviewName'),
            previewDates: document.getElementById('formCropperPreviewDates')
        };
    },

    // État du recadreur intégré
    rawBgImage: '',
    sourceImg: null,
    aspectRatio: 3.0, // 3:1 par défaut
    zoom: 1.0,
    rx: 0,
    ry: 0,
    rw: 1,
    rh: 1,
    imgNaturalW: 1,
    imgNaturalH: 1,
    dispW: 1,
    dispH: 1,
    imgLeft: 0,
    imgTop: 0,
    activeDrag: null,

    // Initialisation et injection dynamique du formulaire HTML
    init(modeOrSaveSuccess, maybeSaveSuccess) {
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

        // 3. Initialiser les écouteurs du recadreur intégré
        this.initFormCropper();

        // 4. Écouteur de téléchargement de l'image de fond
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
                    this.loadFormCropperImage(reader.result);
                };
                reader.onerror = () => showToast("Erreur de lecture de l'image.", "error");
            });
        }

        // 5. Écouteur pour supprimer l'image de fond
        if (els.removeBgBtn) {
            els.removeBgBtn.addEventListener('click', () => {
                this.rawBgImage = '';
                this.sourceImg = null;
                if (els.bgInput) els.bgInput.value = '';
                if (els.bgBase64) els.bgBase64.value = '';
                if (els.bgCropperSection) els.bgCropperSection.classList.add('hidden');
            });
        }

        // Synchroniser le nom et les dates sur l'aperçu en direct
        const updateCardMeta = () => {
            if (els.previewName) els.previewName.textContent = els.nom?.value?.trim() || "Nom de l'espace";
            if (els.previewDates) {
                const dDeb = els.dateDebut?.value;
                const dFin = els.dateFin?.value;
                if (dDeb && dFin) {
                    els.previewDates.textContent = `${dDeb} → ${dFin}`;
                } else if (dDeb) {
                    els.previewDates.textContent = `Dès le ${dDeb}`;
                } else {
                    els.previewDates.textContent = 'Séjour actif';
                }
            }
        };

        if (els.nom) els.nom.addEventListener('input', updateCardMeta);
        if (els.dateDebut) els.dateDebut.addEventListener('change', updateCardMeta);
        if (els.dateFin) els.dateFin.addEventListener('change', updateCardMeta);

        // 6. Bouton Enregistrer
        const saveBtn = document.getElementById('btnSaveColoForm');
        if (saveBtn) {
            const newSaveBtn = saveBtn.cloneNode(true);
            saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
            newSaveBtn.addEventListener('click', () => this.handleSave(onSaveSuccess));
        }

        // 7. Boutons Annuler et Fermer
        document.getElementById('btnCloseColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));
        document.getElementById('btnCancelColoForm')?.addEventListener('click', () => closeModal('overlayColoForm'));
    },

    // Initialisation des écouteurs du recadreur intégré
    initFormCropper() {
        const els = this.getElements();

        // Boutons de ratio
        const ratioBtns = document.querySelectorAll('#formCropperRatioGroup .es-cropper-ratio-btn');
        ratioBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                ratioBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const raw = btn.dataset.ratio;
                this.aspectRatio = raw === 'free' ? 'free' : parseFloat(raw);
                this.resetCropBoxToRatio();
                this.updateFormCropperDOM();
            });
        });

        // Zoom Slider
        if (els.zoomSlider) {
            els.zoomSlider.addEventListener('input', (e) => {
                this.zoom = parseFloat(e.target.value);
                this.recalculateFormStage();
                this.updateFormCropperDOM();
            });
        }

        document.getElementById('btnFormCropperZoomIn')?.addEventListener('click', () => {
            if (els.zoomSlider) {
                this.zoom = Math.min(3, this.zoom + 0.2);
                els.zoomSlider.value = this.zoom;
                this.recalculateFormStage();
                this.updateFormCropperDOM();
            }
        });

        document.getElementById('btnFormCropperZoomOut')?.addEventListener('click', () => {
            if (els.zoomSlider) {
                this.zoom = Math.max(1, this.zoom - 0.2);
                els.zoomSlider.value = this.zoom;
                this.recalculateFormStage();
                this.updateFormCropperDOM();
            }
        });

        // Molette souris
        els.cropperStageContainer?.addEventListener('wheel', (e) => {
            if (!this.sourceImg) return;
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.1 : -0.1;
            this.zoom = Math.max(1, Math.min(3, this.zoom + delta));
            if (els.zoomSlider) els.zoomSlider.value = this.zoom;
            this.recalculateFormStage();
            this.updateFormCropperDOM();
        }, { passive: false });

        // Actions Centrer et Plein Cadre
        document.getElementById('btnFormCropperCenter')?.addEventListener('click', () => {
            this.rx = Math.max(0, (1 - this.rw) / 2);
            this.ry = Math.max(0, (1 - this.rh) / 2);
            this.updateFormCropperDOM();
        });

        document.getElementById('btnFormCropperMaximize')?.addEventListener('click', () => {
            this.resetCropBoxToRatio(true);
            this.updateFormCropperDOM();
        });

        // Pointer Events sur le cadre de sélection
        els.cropperBox?.addEventListener('pointerdown', (e) => this.onCropperPointerDown(e));
        window.addEventListener('pointermove', (e) => this.onCropperPointerMove(e));
        window.addEventListener('pointerup', (e) => this.onCropperPointerUp(e));
        window.addEventListener('pointercancel', (e) => this.onCropperPointerUp(e));
        window.addEventListener('resize', () => {
            if (this.sourceImg && !els.overlay?.classList.contains('hidden')) {
                this.recalculateFormStage();
                this.updateFormCropperDOM();
            }
        });
    },

    // Charge une image dans le recadreur intégré
    loadFormCropperImage(src) {
        const els = this.getElements();
        if (!src) {
            this.sourceImg = null;
            this.rawBgImage = '';
            if (els.bgCropperSection) els.bgCropperSection.classList.add('hidden');
            return;
        }

        this.rawBgImage = src;
        const img = new Image();
        img.onload = () => {
            this.sourceImg = img;
            this.imgNaturalW = img.naturalWidth || img.width;
            this.imgNaturalH = img.naturalHeight || img.height;
            this.zoom = 1.0;
            if (els.zoomSlider) els.zoomSlider.value = 1.0;

            if (els.cropperImg) els.cropperImg.src = src;
            if (els.bgCropperSection) els.bgCropperSection.classList.remove('hidden');

            if (els.previewName && els.nom) {
                els.previewName.textContent = els.nom.value.trim() || "Nom de l'espace";
            }
            if (els.previewEmoji && els.emoji) {
                els.previewEmoji.textContent = els.emoji.value || '🏕️';
            }

            requestAnimationFrame(() => {
                this.recalculateFormStage();
                this.resetCropBoxToRatio();
                this.updateFormCropperDOM();
            });
        };
        img.onerror = () => {
            showToast("Impossible de charger l'image.", "error");
        };
        img.src = src;
    },

    // Recalcule les dimensions d'affichage de l'image dans le stage
    recalculateFormStage() {
        const els = this.getElements();
        if (!els.cropperStage || !this.sourceImg) return;

        const rect = els.cropperStage.getBoundingClientRect();
        const stageW = rect.width || 480;
        const stageH = rect.height || 240;

        const baseScale = Math.min(stageW / this.imgNaturalW, stageH / this.imgNaturalH);
        const currentScale = baseScale * this.zoom;

        this.dispW = this.imgNaturalW * currentScale;
        this.dispH = this.imgNaturalH * currentScale;
        this.imgLeft = (stageW - this.dispW) / 2;
        this.imgTop = (stageH - this.dispH) / 2;

        if (els.cropperImg) {
            els.cropperImg.style.left = `${this.imgLeft}px`;
            els.cropperImg.style.top = `${this.imgTop}px`;
            els.cropperImg.style.width = `${this.dispW}px`;
            els.cropperImg.style.height = `${this.dispH}px`;
        }
    },

    // Réinitialise le cadre selon le ratio
    resetCropBoxToRatio(maximize = false) {
        if (this.aspectRatio === 'free') {
            this.rw = maximize ? 0.98 : 0.88;
            this.rh = maximize ? 0.98 : 0.88;
            this.rx = (1 - this.rw) / 2;
            this.ry = (1 - this.rh) / 2;
            return;
        }

        const targetRatio = this.aspectRatio;
        const imgAspect = this.dispW / this.dispH;

        if (imgAspect > targetRatio) {
            this.rh = maximize ? 0.98 : 0.90;
            this.rw = (this.rh * this.dispH * targetRatio) / this.dispW;
            if (this.rw > 0.98) {
                this.rw = 0.98;
                this.rh = (this.rw * this.dispW) / (targetRatio * this.dispH);
            }
        } else {
            this.rw = maximize ? 0.98 : 0.90;
            this.rh = (this.rw * this.dispW) / (targetRatio * this.dispH);
            if (this.rh > 0.98) {
                this.rh = 0.98;
                this.rw = (this.rh * this.dispH * targetRatio) / this.dispW;
            }
        }

        this.rx = (1 - this.rw) / 2;
        this.ry = (1 - this.rh) / 2;
    },

    // Met à jour la position du cadre et l'aperçu
    updateFormCropperDOM() {
        const els = this.getElements();
        if (!els.cropperBox) return;

        const left = this.imgLeft + this.rx * this.dispW;
        const top = this.imgTop + this.ry * this.dispH;
        const width = this.rw * this.dispW;
        const height = this.rh * this.dispH;

        els.cropperBox.style.left = `${left}px`;
        els.cropperBox.style.top = `${top}px`;
        els.cropperBox.style.width = `${width}px`;
        els.cropperBox.style.height = `${height}px`;

        this.updateFormPreviewCanvas();
    },

    // Dessine la portion cadrée dans le canvas de la mini carte
    updateFormPreviewCanvas() {
        const els = this.getElements();
        if (!els.previewCanvas || !this.sourceImg) return;

        const sx = Math.max(0, this.rx * this.imgNaturalW);
        const sy = Math.max(0, this.ry * this.imgNaturalH);
        const sw = Math.min(this.imgNaturalW - sx, this.rw * this.imgNaturalW);
        const sh = Math.min(this.imgNaturalH - sy, this.rh * this.imgNaturalH);

        if (sw <= 0 || sh <= 0) return;

        const cardRect = els.previewCanvas.parentElement?.getBoundingClientRect() || { width: 340, height: 75 };
        els.previewCanvas.width = Math.round(cardRect.width * (window.devicePixelRatio || 1)) || 400;
        els.previewCanvas.height = Math.round(cardRect.height * (window.devicePixelRatio || 1)) || 80;

        const ctx = els.previewCanvas.getContext('2d');
        if (!ctx) return;

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, els.previewCanvas.width, els.previewCanvas.height);
        ctx.drawImage(this.sourceImg, sx, sy, sw, sh, 0, 0, els.previewCanvas.width, els.previewCanvas.height);
    },

    // Gestion PointerDown (déplacement ou redimensionnement du cadre)
    onCropperPointerDown(e) {
        e.preventDefault();
        e.stopPropagation();

        const handle = e.target.closest('.es-cropper-handle')?.dataset.handle;
        this.activeDrag = {
            type: handle ? 'resize' : 'move',
            handle: handle || null,
            startX: e.clientX,
            startY: e.clientY,
            rx0: this.rx,
            ry0: this.ry,
            rw0: this.rw,
            rh0: this.rh
        };
    },

    // Gestion PointerMove
    onCropperPointerMove(e) {
        if (!this.activeDrag) return;
        e.preventDefault();

        const d = this.activeDrag;
        const dx = (e.clientX - d.startX) / this.dispW;
        const dy = (e.clientY - d.startY) / this.dispH;

        if (d.type === 'move') {
            this.rx = Math.max(0, Math.min(1 - this.rw, d.rx0 + dx));
            this.ry = Math.max(0, Math.min(1 - this.rh, d.ry0 + dy));
            this.updateFormCropperDOM();
            return;
        }

        if (d.type === 'resize') {
            const h = d.handle;
            const minW = 30 / this.dispW;
            const minH = 20 / this.dispH;

            if (this.aspectRatio === 'free') {
                let newRx = d.rx0;
                let newRy = d.ry0;
                let newRw = d.rw0;
                let newRh = d.rh0;

                if (h.includes('e')) newRw = Math.max(minW, Math.min(1 - d.rx0, d.rw0 + dx));
                if (h.includes('s')) newRh = Math.max(minH, Math.min(1 - d.ry0, d.rh0 + dy));
                if (h.includes('w')) {
                    newRx = Math.max(0, Math.min(d.rx0 + d.rw0 - minW, d.rx0 + dx));
                    newRw = d.rw0 - (newRx - d.rx0);
                }
                if (h.includes('n')) {
                    newRy = Math.max(0, Math.min(d.ry0 + d.rh0 - minH, d.ry0 + dy));
                    newRh = d.rh0 - (newRy - d.ry0);
                }

                this.rx = newRx;
                this.ry = newRy;
                this.rw = newRw;
                this.rh = newRh;
            } else {
                const targetRatio = this.aspectRatio;
                const ratioCoeff = (targetRatio * this.dispH) / this.dispW;

                let newRw = d.rw0;
                let newRh = d.rh0;
                let newRx = d.rx0;
                let newRy = d.ry0;

                if (h === 'se') {
                    newRw = Math.max(minW, Math.min(1 - d.rx0, d.rw0 + dx));
                    newRh = newRw / ratioCoeff;
                    if (d.ry0 + newRh > 1) {
                        newRh = 1 - d.ry0;
                        newRw = newRh * ratioCoeff;
                    }
                } else if (h === 'nw') {
                    newRw = Math.max(minW, Math.min(d.rx0 + d.rw0, d.rw0 - dx));
                    newRh = newRw / ratioCoeff;
                    if (d.ry0 + d.rh0 - newRh < 0) {
                        newRh = d.ry0 + d.rh0;
                        newRw = newRh * ratioCoeff;
                    }
                    newRx = d.rx0 + d.rw0 - newRw;
                    newRy = d.ry0 + d.rh0 - newRh;
                } else if (h === 'ne') {
                    newRw = Math.max(minW, Math.min(1 - d.rx0, d.rw0 + dx));
                    newRh = newRw / ratioCoeff;
                    if (d.ry0 + d.rh0 - newRh < 0) {
                        newRh = d.ry0 + d.rh0;
                        newRw = newRh * ratioCoeff;
                    }
                    newRy = d.ry0 + d.rh0 - newRh;
                } else if (h === 'sw') {
                    newRw = Math.max(minW, Math.min(d.rx0 + d.rw0, d.rw0 - dx));
                    newRh = newRw / ratioCoeff;
                    if (d.ry0 + newRh > 1) {
                        newRh = 1 - d.ry0;
                        newRw = newRh * ratioCoeff;
                    }
                    newRx = d.rx0 + d.rw0 - newRw;
                } else if (h === 'e' || h === 'w') {
                    if (h === 'e') newRw = Math.max(minW, Math.min(1 - d.rx0, d.rw0 + dx));
                    if (h === 'w') {
                        newRw = Math.max(minW, Math.min(d.rx0 + d.rw0, d.rw0 - dx));
                        newRx = d.rx0 + d.rw0 - newRw;
                    }
                    newRh = newRw / ratioCoeff;
                    if (newRy + newRh > 1) newRy = Math.max(0, 1 - newRh);
                } else if (h === 'n' || h === 's') {
                    if (h === 's') newRh = Math.max(minH, Math.min(1 - d.ry0, d.rh0 + dy));
                    if (h === 'n') {
                        newRh = Math.max(minH, Math.min(d.ry0 + d.rh0, d.rh0 - dy));
                        newRy = d.ry0 + d.rh0 - newRh;
                    }
                    newRw = newRh * ratioCoeff;
                    if (newRx + newRw > 1) newRx = Math.max(0, 1 - newRw);
                }

                this.rx = Math.max(0, newRx);
                this.ry = Math.max(0, newRy);
                this.rw = Math.min(1 - this.rx, newRw);
                this.rh = Math.min(1 - this.ry, newRh);
            }

            this.updateFormCropperDOM();
        }
    },

    // Relâchement PointerUp
    onCropperPointerUp() {
        this.activeDrag = null;
    },

    // Génère l'image recadrée finale en Base64 JPEG haute qualité
    getFinalCroppedBase64() {
        if (!this.sourceImg) return '';

        const sx = Math.max(0, this.rx * this.imgNaturalW);
        const sy = Math.max(0, this.ry * this.imgNaturalH);
        const sw = Math.min(this.imgNaturalW - sx, this.rw * this.imgNaturalW);
        const sh = Math.min(this.imgNaturalH - sy, this.rh * this.imgNaturalH);

        if (sw <= 0 || sh <= 0) return '';

        const targetWidth = Math.min(1280, Math.round(sw));
        const targetHeight = Math.round(targetWidth * (sh / sw));

        const canvas = document.createElement('canvas');
        canvas.width = targetWidth;
        canvas.height = targetHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) return '';

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(this.sourceImg, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight);

        return canvas.toDataURL('image/jpeg', 0.88);
    },

    // Ouverture et pré-remplissage du formulaire
    open(modeOrColo = null, maybeColo = null) {
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
        
        // Organismes
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

        const currentEmoji = colo?.emoji || '🏕️';
        if (els.emoji) els.emoji.value = currentEmoji;

        if (els.emojiSelector) {
            els.emojiSelector.innerHTML = this.AVAILABLE_EMOJIS.map(item =>
                `<button type="button" title="${item.desc}" class="${item.emoji === currentEmoji ? 'selected' : ''}" onclick="ColoFormManager.selectEmoji('${item.emoji}', this)">${item.emoji}</button>`
            ).join('');
        }

        const formTitle = document.getElementById('coloFormTitle');
        if (formTitle) formTitle.textContent = colo ? 'Modifier un espace' : 'Nouvelle espace';
        if (els.errorWrap) els.errorWrap.classList.add('hidden');
        
        if (els.previewName) els.previewName.textContent = colo?.nom || "Nom de l'espace";
        if (els.previewEmoji) els.previewEmoji.textContent = currentEmoji;
        if (els.previewDates) {
            if (colo?.dateDebut && colo?.dateFin) {
                els.previewDates.textContent = `${colo.dateDebut} → ${colo.dateFin}`;
            } else if (colo?.dateDebut) {
                els.previewDates.textContent = `Dès le ${colo.dateDebut}`;
            } else {
                els.previewDates.textContent = 'Séjour actif';
            }
        }

        openModal('overlayColoForm');

        // Charger l'image dans le recadreur intégré si présente
        if (colo?.bgImage) {
            this.loadFormCropperImage(colo.bgImage);
        } else {
            this.sourceImg = null;
            this.rawBgImage = '';
            if (els.bgCropperSection) els.bgCropperSection.classList.add('hidden');
        }
    },

    // Gestion du clic sur un Emoji
    selectEmoji(emojiOrMode, emojiOrBtn, maybeBtn) {
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
        if (els.previewEmoji) {
            els.previewEmoji.textContent = emoji;
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

    // Enregistrement Firestore avec le recadrage calculé
    async handleSave(onSaveSuccess) {
        const els = this.getElements();
        const btn = document.getElementById('btnSaveColoForm');
        
        const nomVal = els.nom?.value.trim();
        if (!nomVal) {
            els.errorMsg.textContent = 'Le nom de l\'espace est obligatoire.';
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

        // Obtenir le recadrage final
        let finalBgImage = '';
        if (this.sourceImg) {
            finalBgImage = this.getFinalCroppedBase64() || this.rawBgImage || '';
        }

        const data = {
            nom: nomVal,
            organisme: orgVal,
            dateDebut: dateDebutVal || '',
            dateFin: dateFinVal || '',
            driveId: els.driveId?.value.trim() || '',
            ppId: els.ppId?.value.trim() || '',
            isFormation: els.isFormation?.checked || false,
            bgImage: finalBgImage,
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


