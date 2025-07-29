// ==UserScript==
// @name         Leboncoin Search Helper
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Ajoute des liens de recherche Google et Argus sur les annonces Leboncoin
// @author       You
// @match        https://www.leboncoin.fr/ad/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leboncoin.fr
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Fonction pour créer un icône SVG
    function createSVGIcon(pathData, color = '#007bff') {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', color);
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.style.marginLeft = '8px';
        svg.style.cursor = 'pointer';
        svg.style.verticalAlign = 'middle';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);

        return svg;
    }

    // Fonction pour vérifier si c'est une annonce de voiture
    function isCarAd() {
        const url = window.location.href;
        const breadcrumbItems = document.querySelectorAll('[data-testid="breadcrumb-item"]');

        // Vérifier dans l'URL
        if (url.includes('/voitures/')) {
            return true;
        }

        // Vérifier dans le fil d'Ariane
        for (let item of breadcrumbItems) {
            if (item.textContent.toLowerCase().includes('voitures')) {
                return true;
            }
        }

        return false;
    }

    // Fonction pour extraire le titre de l'annonce
    function getAdTitle() {
        // Plusieurs sélecteurs possibles selon la version de la page
        const titleSelectors = [
            'h1[data-testid="ad-title"]',
            'h1[data-test-id="ad-title"]',
            'h1.text-headline-1',
            'h1.text-title-1',
            'h1._1KQme',
            'h1'
        ];

        for (let selector of titleSelectors) {
            const titleElement = document.querySelector(selector);
            if (titleElement && titleElement.textContent.trim()) {
                return titleElement.textContent.trim();
            }
        }

        return null;
    }

    // Fonction pour extraire une donnée spécifique de la fiche
    function extractDataFromLabel(labelText) {
        // Chercher tous les éléments p avec le texte du label
        const allParagraphs = document.querySelectorAll('p');

        for (let p of allParagraphs) {
            if (p.textContent.trim() === labelText) {
                // Chercher l'élément suivant qui contient la valeur
                let nextElement = p.nextElementSibling;

                // Parcourir les éléments suivants pour trouver la valeur
                while (nextElement) {
                    const valueElement = nextElement.querySelector('p.text-body-1, p[title]');
                    if (valueElement) {
                        return valueElement.textContent.trim() || valueElement.getAttribute('title');
                    }
                    nextElement = nextElement.nextElementSibling;
                }

                // Alternative: chercher dans le parent
                const parent = p.parentElement;
                if (parent) {
                    const valueInParent = parent.querySelector('p.text-body-1, p[title]');
                    if (valueInParent && valueInParent !== p) {
                        return valueInParent.textContent.trim() || valueInParent.getAttribute('title');
                    }
                }
            }
        }

        return null;
    }

    // Fonction pour extraire les données additionnelles pour les voitures
    function getAdditionalCarData() {
        const dataToExtract = [
            'Année modèle',
            'Finition Constructeur',
            'Version Constructeur',
            'Puissance DIN'
        ];

        const extractedData = [];

        for (let label of dataToExtract) {
            const value = extractDataFromLabel(label);
            if (value) {
                extractedData.push(value);
            }
        }

        return extractedData;
    }

    // Fonction pour vérifier si une donnée est déjà présente dans le titre
    function isDataInTitle(data, title) {
        const normalizedTitle = title.toLowerCase();
        const normalizedData = data.toLowerCase();

        // Recherche exacte et recherche par mots
        return normalizedTitle.includes(normalizedData) ||
               normalizedData.split(' ').some(word =>
                   word.length > 2 && normalizedTitle.includes(word)
               );
    }

    // Fonction pour créer la requête de recherche enrichie
    function createEnrichedSearchQuery(title) {
        if (!isCarAd()) {
            return title;
        }

        const additionalData = getAdditionalCarData();
        const newDataToAdd = [];

        // Filtrer les données qui ne sont pas déjà dans le titre
        for (let data of additionalData) {
            if (!isDataInTitle(data, title)) {
                newDataToAdd.push(data);
            }
        }

        // Construire la requête finale
        let searchQuery = title;
        if (newDataToAdd.length > 0) {
            searchQuery += ' ' + newDataToAdd.join(' ');
        }

        return searchQuery;
    }

    // Fonction pour trouver l'élément titre
    function getTitleElement() {
        const titleSelectors = [
            'h1[data-testid="ad-title"]',
            'h1[data-test-id="ad-title"]',
            'h1.text-headline-1',
            'h1.text-title-1',
            'h1._1KQme',
            'h1'
        ];

        for (let selector of titleSelectors) {
            const titleElement = document.querySelector(selector);
            if (titleElement && titleElement.textContent.trim()) {
                return titleElement;
            }
        }

        return null;
    }

    // Fonction pour créer le lien Google général
    function createGoogleSearchLink(title) {
        const googleIcon = createSVGIcon('m15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-5-4l5-5-5-5m-5 9h11', '#4285f4');

        googleIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // CORRIGÉ: Ajout des backticks pour template literal
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(title)}`;
            window.open(searchUrl, '_blank');
        });

        googleIcon.title = 'Rechercher sur Google';
        return googleIcon;
    }

    // Fonction pour créer le lien Argus
    function createArgusSearchLink(title) {
        const argusIcon = createSVGIcon('M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z', '#ff6b35');

        argusIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();

            // Créer la requête enrichie
            const enrichedQuery = createEnrichedSearchQuery(title);
            // CORRIGÉ: Ajout des backticks pour template literal
            const searchQuery = `${enrichedQuery} fiche argus`;
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;

            console.log('Recherche Argus:', searchQuery);
            window.open(searchUrl, '_blank');
        });

        argusIcon.title = 'Rechercher la fiche Argus';
        return argusIcon;
    }

    // Fonction pour vérifier si les icônes existent déjà
    function iconsAlreadyExist() {
        return document.querySelector('.search-helper-icon') !== null;
    }

    // Fonction principale pour ajouter les icônes
    function addSearchIcons() {
        if (iconsAlreadyExist()) {
            return;
        }

        const titleElement = getTitleElement();
        const adTitle = getAdTitle();

        if (!titleElement || !adTitle) {
            console.log('Titre de l\'annonce non trouvé');
            return;
        }

        // Créer un conteneur pour les icônes
        const iconContainer = document.createElement('span');
        iconContainer.className = 'search-helper-icon';
        iconContainer.style.marginRight = '10px';

        // Si c'est une annonce de voiture, afficher seulement l'icône Argus
        if (isCarAd()) {
            const argusIcon = createArgusSearchLink(adTitle);
            iconContainer.appendChild(argusIcon);
        } else {
            // Pour les autres catégories, afficher l'icône Google général
            const googleIcon = createGoogleSearchLink(adTitle);
            iconContainer.appendChild(googleIcon);
        }

        // Ajouter les icônes avant le titre
        titleElement.insertBefore(iconContainer, titleElement.firstChild);

        console.log('Icônes de recherche ajoutées');
    }

    // Fonction d'initialisation avec retry
    function initializeScript() {
        let attempts = 0;
        const maxAttempts = 10;

        function tryAddIcons() {
            attempts++;
            console.log(`Tentative ${attempts}/${maxAttempts}`);

            if (getTitleElement() && getAdTitle()) {
                addSearchIcons();
            } else if (attempts < maxAttempts) {
                setTimeout(tryAddIcons, 1000);
            } else {
                console.log('Script abandonné après', maxAttempts, 'tentatives');
            }
        }

        tryAddIcons();
    }

    // Observer les changements dans le DOM
    const observer = new MutationObserver(function(mutations) {
        let shouldCheck = false;

        mutations.forEach(function(mutation) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldCheck = true;
            }
        });

        if (shouldCheck && !iconsAlreadyExist()) {
            setTimeout(addSearchIcons, 500);
        }
    });

    // Démarrer l'observation
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    // Initialiser le script
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initializeScript);
    } else {
        initializeScript();
    }

})();