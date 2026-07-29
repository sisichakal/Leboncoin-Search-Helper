// ==UserScript==
// @name         Leboncoin Search Helper
// @namespace    http://tampermonkey.net/
// @version      2.2
// @description  Adds Google and Argus search links on Leboncoin car listings
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
    function createSVGIcon(pathData, color) {
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
        svg.style.flexShrink = '0';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);

        return svg;
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

    // Extract the ad title text
    function getAdTitle() {
        const selectors = [
            'h1[data-testid="ad-title"]',
            'h1[data-test-id="ad-title"]',
            'h1.text-headline-1',
            'h1.text-title-1',
            'h1._1KQme',
            'h1',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el.textContent.trim();
            }
        }
        return null;
    }

    // Find the title DOM element
    function getTitleElement() {
        const selectors = [
            'h1[data-testid="ad-title"]',
            'h1[data-test-id="ad-title"]',
            'h1.text-headline-1',
            'h1.text-title-1',
            'h1._1KQme',
            'h1',
        ];
        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el && el.textContent.trim()) {
                return el;
            }
        }
        return null;
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

    // Create the Argus search icon
    function createArgusIcon(title) {
        const icon = createSVGIcon(
            'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
            '#ff6b35'
        );
        icon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            const query = `${buildEnrichedQuery(title)} fiche argus`;
            console.log('[SearchHelper] Argus query:', query);
            window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
        });
        icon.title = 'Rechercher la fiche Argus';
        return icon;
    }

    // Create the generic Google search icon
    function createGoogleIcon(title) {
        const icon = createSVGIcon(
            'm15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4m-5-4l5-5-5-5m-5 9h11',
            '#4285f4'
        );
        icon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            window.open(`https://www.google.com/search?q=${encodeURIComponent(title)}`, '_blank');
        });
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

            if (isCarAd()) {
                await expandCriteriaIfNeeded();
            }

            // Double-check after async wait — another call may have injected in the meantime
            if (iconsAlreadyExist()) {
                return;
            }

            const container = document.createElement('span');
            container.className = 'search-helper-icon';
            container.style.cssText = 'display:inline-flex;align-items:center;margin-right:10px;vertical-align:middle;';

            if (isCarAd()) {
                container.appendChild(createArgusIcon(adTitle));
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
