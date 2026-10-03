// ==UserScript==
// @name         Leboncoin Search Helper
// @namespace    http://tampermonkey.net/
// @version      2.3
// @description  Adds Google, Argus, Caradisiac, La Centrale and Google AI search links on Leboncoin car listings
// @author       You
// @match        https://www.leboncoin.fr/ad/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=leboncoin.fr
// @updateURL    https://raw.githubusercontent.com/sisichakal/Leboncoin-Search-Helper/main/Leboncoin%20Search%20Helper-1.2.user.js
// @downloadURL  https://raw.githubusercontent.com/sisichakal/Leboncoin-Search-Helper/main/Leboncoin%20Search%20Helper-1.2.user.js
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Criteria to extract: data-qa-id => value is in the SECOND column of the flex row
    const CAR_CRITERIA_IDS = [
        'criteria_item_u_car_model',
        'criteria_item_regdate',
        'criteria_item_gearbox',
        'criteria_item_u_car_finition',
        'criteria_item_u_car_version',
        'criteria_item_horsepower',
        'criteria_item_horse_power_din',
    ];

    // Patterns to strip from any query part (case-insensitive)
    const QUERY_BLACKLIST = [
        /\bct\s+ok\b/i,
        /garantie\s+\d+\s*mois/i,
        /très\s+bon\s+état/i,
    ];

    // Selectors used to locate the ad title, most specific first
    const TITLE_SELECTORS = [
        'h1[data-testid="ad-title"]',
        'h1[data-test-id="ad-title"]',
        'h1.text-headline-1',
        'h1.text-title-1',
        'h1._1KQme',
        'h1',
    ];

    // Spec-sheet search sources displayed on car ads (array order = display order).
    // Either "iconPath" (SVG icon) or "badge" (short text label) is used for rendering.
    const SPEC_SHEET_SOURCES = [
        {
            suffix:   'fiche argus',
            colour:   '#ff6b35',
            tooltip:  'Rechercher la fiche Argus',
            iconPath: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
        },
        {
            suffix:  'fiche technique caradisiac',
            colour:  '#e30613',
            tooltip: 'Rechercher la fiche Caradisiac',
            badge:   'CA',
        },
        {
            suffix:  'fiche technique la centrale',
            colour:  '#0a4a9f',
            tooltip: 'Rechercher la fiche La Centrale',
            badge:   'LC',
        },
    ];

    // Rows requested from Google AI Mode (same layout as the "Informations Techniques" panel)
    const AI_TABLE_ROWS = [
        'Longueur / Largeur (format : 4.42m - 1.83m)',
        'Poids à vide (kg)',
        'Volume de coffre + volume utile (format : 475L - 1600L, volume utile = banquette rabattue)',
        'Taille des roues avant (pouces)',
        'Puissance réelle maxi (ch)',
        'Vitesse maximale (km/h)',
        '0 à 100 km/h (secondes)',
        'Conso Urbain (format : L/100 km - kWh/100 km)',
        'Conso Mixte (format : L/100 km - kWh/100 km)',
        'Conso Extra (format : L/100 km - kWh/100 km)',
        'Réservoir (L)',
        'Architecture (type de motorisation / de moteur électrique)',
    ];

    // Google "udm" parameter value that opens AI Mode instead of the classic results page
    const GOOGLE_AI_MODE_UDM = '50';

    const SPARKLE_PATH = 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z';

    // Remove blacklisted strings from a value before adding it to the query
    function sanitiseQueryPart(value) {
        let result = value;
        for (const pattern of QUERY_BLACKLIST) {
            result = result.replace(pattern, '');
        }
        // Collapse multiple spaces left by removals
        return result.replace(/\s{2,}/g, ' ').trim();
    }

    // Flag to prevent concurrent injection attempts
    let injecting = false;

    // Create an SVG icon element
    function createSVGIcon(pathData, colour, size = 20) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', String(size));
        svg.setAttribute('height', String(size));
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', colour);
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.style.marginLeft = '8px';
        svg.style.cursor = 'pointer';
        svg.style.verticalAlign = 'middle';
        svg.style.flexShrink = '0';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);

        return svg;
    }

    // Create a small coloured text badge used as an icon (e.g. "CA", "LC")
    function createTextBadge(label, colour) {
        const badge = document.createElement('span');
        badge.textContent = label;
        badge.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'justify-content:center',
            'min-width:20px',
            'height:20px',
            'padding:0 4px',
            'margin-left:8px',
            'border-radius:4px',
            `background:${colour}`,
            'color:#fff',
            'font:bold 11px/1 Arial, sans-serif',
            'cursor:pointer',
            'flex-shrink:0',
            'user-select:none',
        ].join(';');
        return badge;
    }

    // Open a Google search in a new tab (classic results or AI Mode)
    function openGoogleSearch(query, aiMode = false) {
        const params = new URLSearchParams({ q: query });
        if (aiMode) {
            params.set('udm', GOOGLE_AI_MODE_UDM);
        }
        window.open(`https://www.google.com/search?${params.toString()}`, '_blank', 'noopener');
    }

    // Attach a click handler that blocks the default Leboncoin behaviour
    function bindClick(element, handler) {
        element.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            handler();
        });
    }

    // Check whether the current listing is a car ad
    function isCarAd() {
        if (window.location.href.includes('/voitures/')) {
            return true;
        }
        const breadcrumbItems = document.querySelectorAll('[data-testid="breadcrumb-item"]');
        for (const item of breadcrumbItems) {
            if (item.textContent.toLowerCase().includes('voitures')) {
                return true;
            }
        }
        return false;
    }

    // Find the title DOM element
    function getTitleElement() {
        for (const sel of TITLE_SELECTORS) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el;
            }
        }
        return null;
    }

    // Extract the ad title text
    function getAdTitle() {
        const el = getTitleElement();
        return el ? el.textContent.trim() : null;
    }

    // Extract the VALUE (right column) from a criteria block by its data-qa-id.
    // Structure: [data-qa-id="..."] contains two flex children:
    //   - first child  = label column  (icon + <p class="text-caption">Label</p>)
    //   - second child = value column  (<div> containing <p class="font-bold" title="VALUE">VALUE</p>)
    function extractCriteriaValue(qaId) {
        const container = document.querySelector(`[data-qa-id="${qaId}"]`);
        if (!container) {
            return null;
        }

        // The value column is the second direct child of the flex container
        const children = container.children;
        if (children.length < 2) {
            return null;
        }

        const valueColumn = children[1];

        // Prefer title attribute on any <p> (handles truncated text)
        const boldP = valueColumn.querySelector('p[title]');
        if (boldP) {
            const title = boldP.getAttribute('title').trim();
            if (title) {
                return title;
            }
        }

        // Fallback: raw text content of the value column
        const text = valueColumn.textContent.trim();
        return text || null;
    }

    // Click "Voir les X critères supplémentaires" if not yet expanded
    function expandCriteriaIfNeeded() {
        const btn = document.querySelector('button[data-qa-id="criteria_more"]');
        if (!btn) {
            return Promise.resolve();
        }
        if (btn.textContent.trim().toLowerCase().startsWith('voir moins')) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            btn.click();
            setTimeout(resolve, 700);
        });
    }

    // Check whether a value is already present in the title
    function isDataInTitle(data, title) {
        const normTitle = title.toLowerCase();
        const normData  = data.toLowerCase();
        if (normTitle.includes(normData)) {
            return true;
        }
        return normData.split(' ').some(
            word => word.length > 2 && normTitle.includes(word)
        );
    }

    // Build the enriched query from title + extracted criteria values
    function buildEnrichedQuery(title) {
        // Sanitise the title itself first
        const cleanTitle = sanitiseQueryPart(title);
        const extras = [];
        for (const qaId of CAR_CRITERIA_IDS) {
            const raw = extractCriteriaValue(qaId);
            console.log(`[SearchHelper] ${qaId} =>`, raw);
            if (!raw) {
                continue;
            }
            const value = sanitiseQueryPart(raw);
            if (value && !isDataInTitle(value, cleanTitle)) {
                extras.push(value);
            }
        }
        return extras.length > 0 ? `${cleanTitle} ${extras.join(' ')}` : cleanTitle;
    }

    // Build the prompt sent to Google AI Mode to obtain the technical table
    function buildAiPrompt(vehicle) {
        const rows = AI_TABLE_ROWS.map((row, index) => `${index + 1}. ${row}`).join('\n');
        return [
            `Fiche technique du véhicule suivant : ${vehicle}.`,
            'Réponds uniquement par un tableau à 2 colonnes (Caractéristique | Valeur) contenant exactement ces lignes, dans cet ordre :',
            rows,
            'Si une donnée est introuvable ou incertaine, écris N/A. Ne fais aucune phrase d’introduction.',
            'Indique tes sources sous le tableau.',
        ].join('\n');
    }

    // Create a spec-sheet search icon (Argus, Caradisiac, La Centrale...)
    function createSpecSheetIcon(source, title) {
        const icon = source.iconPath
            ? createSVGIcon(source.iconPath, source.colour)
            : createTextBadge(source.badge, source.colour);

        bindClick(icon, function() {
            const query = `${buildEnrichedQuery(title)} ${source.suffix}`;
            console.log(`[SearchHelper] ${source.tooltip}:`, query);
            openGoogleSearch(query);
        });

        // SVG elements do not support the "title" property: use a <title> child instead
        if (icon instanceof SVGElement) {
            const svgTitle = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            svgTitle.textContent = source.tooltip;
            icon.prepend(svgTitle);
        } else {
            icon.title = source.tooltip;
        }
        return icon;
    }

    // Create the Google AI Mode button returning a technical table
    function createAiButton(title) {
        const button = document.createElement('button');
        button.type = 'button';
        button.title = 'Demander la fiche technique à l’IA de Google';
        button.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:4px',
            'margin-left:8px',
            'padding:2px 8px',
            'border:1px solid #8e44ad',
            'border-radius:12px',
            'background:#fff',
            'color:#8e44ad',
            'font:bold 12px/1.4 Arial, sans-serif',
            'cursor:pointer',
            'flex-shrink:0',
        ].join(';');

        const icon = createSVGIcon(SPARKLE_PATH, '#8e44ad', 14);
        icon.style.marginLeft = '0';
        button.append(icon, document.createTextNode('Fiche IA'));

        bindClick(button, function() {
            const prompt = buildAiPrompt(buildEnrichedQuery(title));
            console.log('[SearchHelper] AI prompt:', prompt);
            openGoogleSearch(prompt, true);
        });
        return button;
    }

    // Create the generic Google search icon
    function createGoogleIcon(title) {
        const icon = createSVGIcon(
            'm15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-5-4l5-5-5-5m-5 9h11',
            '#4285f4'
        );
        bindClick(icon, () => openGoogleSearch(title));
        icon.title = 'Rechercher sur Google';
        return icon;
    }

    // Check whether icons have already been injected
    function iconsAlreadyExist() {
        return document.querySelector('.search-helper-icon') !== null;
    }

    // Main injection function
    async function addSearchIcons() {
        if (iconsAlreadyExist() || injecting) {
            return;
        }
        injecting = true;

        try {
            const titleElement = getTitleElement();
            const adTitle      = getAdTitle();

            if (!titleElement || !adTitle) {
                console.log('[SearchHelper] Title not found.');
                return;
            }

            const carAd = isCarAd();

            if (carAd) {
                await expandCriteriaIfNeeded();
            }

            // Double-check after async wait — another call may have injected in the meantime
            if (iconsAlreadyExist()) {
                return;
            }

            const container = document.createElement('span');
            container.className = 'search-helper-icon';
            container.style.cssText = 'display:inline-flex;align-items:center;margin-right:10px;vertical-align:middle;';

            if (carAd) {
                for (const source of SPEC_SHEET_SOURCES) {
                    container.appendChild(createSpecSheetIcon(source, adTitle));
                }
                container.appendChild(createAiButton(adTitle));
            } else {
                container.appendChild(createGoogleIcon(adTitle));
            }

            titleElement.insertBefore(container, titleElement.firstChild);
            console.log('[SearchHelper] Icons injected.');
        } finally {
            injecting = false;
        }
    }

    // Retry loop until the title is available
    function initScript() {
        let attempts = 0;
        const maxAttempts = 15;

        function tryInject() {
            attempts++;
            if (getTitleElement() && getAdTitle()) {
                addSearchIcons();
            } else if (attempts < maxAttempts) {
                setTimeout(tryInject, 800);
            } else {
                console.log('[SearchHelper] Giving up after', maxAttempts, 'attempts.');
            }
        }

        tryInject();
    }

    // MutationObserver for SPA navigation (debounced)
    let observerTimer = null;
    const observer = new MutationObserver(function(mutations) {
        let hasNewNodes = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                hasNewNodes = true;
                break;
            }
        }
        if (hasNewNodes && !iconsAlreadyExist() && !injecting) {
            clearTimeout(observerTimer);
            observerTimer = setTimeout(addSearchIcons, 600);
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initScript);
    } else {
        initScript();
    }

})();
