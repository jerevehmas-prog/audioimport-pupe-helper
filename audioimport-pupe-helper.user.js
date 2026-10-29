// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      1.3
// @description  Audioimport Pupesoft keräyslistan automaattinen älykkäämpi järjestely ja pilvilataaja
// @author       Audioimport Oy
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @match        https://rahtilaskuri.audioimport.workers.dev/*
// @connect      raw.githubusercontent.com
// @connect      cdn.jsdelivr.net
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    const CLOUD_URL = 'https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/pupe-helper.js';
    const FALLBACK_CDN_URL = 'https://cdn.jsdelivr.net/gh/jerevehmas-prog/audioimport-pupe-helper@main/pupe-helper.js';
    const STORAGE_KEY = 'ai_pupe_helper_cloud_code';

    function execute(code) {
        try {
            const fn = new Function(code);
            fn();
            console.log('[Pupe Helper Loader] Skripti suoritettu onnistuneesti!');
        } catch (e) {
            console.error('[Pupe Helper Loader] Virhe suorituksessa:', e);
            try {
                (0, eval)(code);
            } catch (e2) {
                console.error('[Pupe Helper Loader] Myös eval epäonnistui:', e2);
            }
        }
    }

    function fetchWithGM(url) {
        return new Promise((resolve, reject) => {
            const gmReq = typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : (typeof GM !== 'undefined' && GM.xmlHttpRequest ? GM.xmlHttpRequest : null);
            if (!gmReq) {
                return reject(new Error('GM_xmlhttpRequest ei saatavilla'));
            }
            gmReq({
                method: 'GET',
                url: url,
                headers: { 'Cache-Control': 'no-cache' },
                onload: (res) => {
                    if (res.status >= 200 && res.status < 300) {
                        resolve(res.responseText);
                    } else {
                        reject(new Error('HTTP status ' + res.status));
                    }
                },
                onerror: (err) => reject(err),
                ontimeout: () => reject(new Error('Aikakatkaisu'))
            });
        });
    }

    async function loadCode() {
        const urlWithTs = `${CLOUD_URL}?t=${Date.now()}`;

        // 1. Ensisijainen: GM_xmlhttpRequest (ohittaa kaikki CORS- ja suojausrajoitukset)
        try {
            const code = await fetchWithGM(urlWithTs);
            if (code && code.includes('Audioimport Pupe Helper')) {
                localStorage.setItem(STORAGE_KEY, code);
                execute(code);
                return;
            }
        } catch (gmErr) {
            console.warn('[Pupe Helper Loader] GM_xmlhttpRequest epäonnistui:', gmErr);
        }

        // 2. Toissijainen: Normaali fetch
        try {
            const res = await fetch(urlWithTs);
            if (res.ok) {
                const code = await res.text();
                if (code && code.includes('Audioimport Pupe Helper')) {
                    localStorage.setItem(STORAGE_KEY, code);
                    execute(code);
                    return;
                }
            }
        } catch (fetchErr) {
            console.warn('[Pupe Helper Loader] Normaali fetch epäonnistui:', fetchErr);
        }

        // 3. Kolmassijainen: CDN-varayhteys
        try {
            const resCdn = await fetch(`${FALLBACK_CDN_URL}?t=${Date.now()}`);
            if (resCdn.ok) {
                const code = await resCdn.text();
                if (code && code.includes('Audioimport Pupe Helper')) {
                    localStorage.setItem(STORAGE_KEY, code);
                    execute(code);
                    return;
                }
            }
        } catch (cdnErr) {
            console.warn('[Pupe Helper Loader] CDN-varayhteys epäonnistui:', cdnErr);
        }

        // 4. Offline-varmistus
        const cachedCode = localStorage.getItem(STORAGE_KEY);
        if (cachedCode) {
            console.info('[Pupe Helper Loader] Suoritetaan tallennetusta välimuistista.');
            execute(cachedCode);
        } else {
            console.error('[Pupe Helper Loader] Ei saatu ladattua koodia mistään lähteestä.');
        }
    }

    loadCode();
})();
