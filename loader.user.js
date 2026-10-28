// ==UserScript==
// @name         Audioimport Pupe Helper (Cloud Loader)
// @namespace    https://audioimport.ahkio.com/
// @version      1.0
// @description  Lataa ja suorittaa automaattisesti aina uusimman version pilvestä
// @author       Audioimport Oy
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @updateURL    https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/loader.user.js
// @downloadURL  https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/loader.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(async function() {
    'use strict';

    // Suora pilvi-URL aina tuoreimpaan koodiin
    const CLOUD_URL = 'https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/pupe-helper.js';
    const STORAGE_KEY = 'ai_pupe_helper_cloud_code';

    function execute(code) {
        try {
            const fn = new Function(code);
            fn();
        } catch (e) {
            console.error('[Pupe Helper] Virhe koodin suorituksessa:', e);
        }
    }

    let loaded = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500);

    try {
        // Ohitetaan kaikki välimuistit aikaleimalla ja no-store -määrityksellä
        const response = await fetch(`${CLOUD_URL}?t=${Date.now()}`, {
            cache: 'no-store',
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const code = await response.text();
            localStorage.setItem(STORAGE_KEY, code);
            execute(code);
            loaded = true;
        } else {
            throw new Error('HTTP ' + response.status);
        }
    } catch (err) {
        clearTimeout(timeoutId);
        console.warn('[Pupe Helper] Pilvipalveluun ei saatu yhteyttä heti. Käytetään välimuistia.', err);
    }

    // Jos pilvihaku epäonnistui tai kesti yli 2,5 s, otetaan aiemmin tallennettu toimiva versio
    if (!loaded) {
        const cachedCode = localStorage.getItem(STORAGE_KEY);
        if (cachedCode) {
            console.info('[Pupe Helper] Suoritetaan tallennetusta välimuistista.');
            execute(cachedCode);
        }
    }
})();
