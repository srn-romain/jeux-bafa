// Configuration de l'ordre des pages selon index.html
const pageOrder = [
  { file: 'presentation.html', name: 'Jeux présentation' },
  { file: 'semaine.html', name: 'Jeux fil rouge' },
  { file: 'conversation.html', name: 'Conversations & débats' },
  { file: 'animateur.html', name: 'Jeux entre animateurs' },
  { file: 'quotidien.html', name: 'Vie quotidienne' },
  { file: 'activites.html', name: 'Activités' },
  { file: 'veillees.html', name: 'Veillées' },
  { file: 'manuels.html', name: 'Activités manuelles' },
  { file: 'calme.html', name: 'Idées de retour au calme' },
  { file: 'gage.html', name: 'Idées de gages' },
  { file: 'regles.html', name: 'Exemple règles de vie' },
  { file: 'musique.html', name: 'Musiques de colo' },
  { file: 'nourriture.html', name: 'Nourriture en camp' },
  { file: 'direction.html', name: 'Mémo direction' },
  { file: 'reglementation.html', name: 'Mémo réglementation' },
  { file: 'formation.html', name: 'Mémo formation' }
];

// Fonction pour obtenir le nom du fichier actuel
function getCurrentPageFile() {
  const path = window.location.pathname;
  const filename = path.split('/').pop();
  return filename || 'index.html';
}

// Fonction pour trouver l'index de la page actuelle
function getCurrentPageIndex() {
  const currentFile = getCurrentPageFile();
  return pageOrder.findIndex(page => page.file === currentFile);
}

// Fonction pour initialiser la navigation
function initNavigation() {
  const currentIndex = getCurrentPageIndex();
  
  // Si la page n'est pas dans la liste (ex: index.html, espace.html), ne pas afficher les chevrons
  if (currentIndex === -1) {
    return;
  }

  const prevIndex = currentIndex - 1;
  const nextIndex = currentIndex + 1;

  // Créer le chevron gauche (précédent)
  const leftNav = document.createElement('a');
  leftNav.className = 'page-navigation left';
  leftNav.href = prevIndex >= 0 ? `${pageOrder[prevIndex].file}` : '#';
  
  if (prevIndex >= 0) {
    leftNav.setAttribute('data-tooltip', pageOrder[prevIndex].name);
    leftNav.innerHTML = `
      <i class="bi bi-chevron-left"></i>
      <div class="page-name">${pageOrder[prevIndex].name}</div>
    `;
  } else {
    leftNav.classList.add('disabled');
    leftNav.href = '#';
    leftNav.onclick = (e) => e.preventDefault();
    leftNav.setAttribute('data-tooltip', 'Début');
    leftNav.innerHTML = `
      <i class="bi bi-chevron-left"></i>
      <div class="page-name">Début</div>
    `;
  }

  // Créer le chevron droit (suivant)
  const rightNav = document.createElement('a');
  rightNav.className = 'page-navigation right';
  rightNav.href = nextIndex < pageOrder.length ? `${pageOrder[nextIndex].file}` : '#';
  
  if (nextIndex < pageOrder.length) {
    rightNav.setAttribute('data-tooltip', pageOrder[nextIndex].name);
    rightNav.innerHTML = `
      <i class="bi bi-chevron-right"></i>
      <div class="page-name">${pageOrder[nextIndex].name}</div>
    `;
  } else {
    rightNav.classList.add('disabled');
    rightNav.href = '#';
    rightNav.onclick = (e) => e.preventDefault();
    rightNav.setAttribute('data-tooltip', 'Fin');
    rightNav.innerHTML = `
      <i class="bi bi-chevron-right"></i>
      <div class="page-name">Fin</div>
    `;
  }

  // Ajouter les chevrons au body
  document.body.appendChild(leftNav);
  document.body.appendChild(rightNav);
}

// Initialiser la navigation quand le DOM est chargé
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNavigation);
} else {
  initNavigation();
}

