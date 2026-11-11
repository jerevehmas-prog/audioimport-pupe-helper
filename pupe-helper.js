// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      7.3
// @description  Pupesoft keräyslistan priorisointi, keräilysivun riviväritykset, skannauskeräys viivakoodilla, ennustava pikahaku (Alt+F), varastopaikkasiirrot oletuspaikalla, yhtenäistetyt Pupesoft-napit, siistitty saapumisen viivakoodiskannaus ja suora varastopaikkavalinta, työnjako, tuotekortin pikanäkymä (hover/touch) ja tilausten yhdistäminen Rahtilaskuriin
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @match        https://*.ahkio.com/*
// @match        http://*.ahkio.com/*
// @match        https://rahtilaskuri.audioimport.workers.dev/*
// @match        http://localhost:5173/*
// @updateURL    https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/pupe-helper.js
// @downloadURL  https://raw.githubusercontent.com/jerevehmas-prog/audioimport-pupe-helper/main/pupe-helper.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const isRahtilaskuri = location.hostname.includes('workers.dev') || location.hostname.includes('localhost:5173');
    const isPupesoft = location.hostname.includes('ahkio.com') || location.hostname.includes('127.0.0.1') || location.hostname.includes('localhost');

    // =========================================================================
    // OSA 1: RAHTILASKURIN VASTAANOTIN (workers.dev)
    // =========================================================================
    if (isRahtilaskuri) {
        let isHandlingImport = false;

        // Anturi pää-window'n tarkistukseen myös Tampermonkeyn hiekkalaatikosta käsin
        function probeNativeImportFlag() {
            try {
                if (document.documentElement && document.documentElement.getAttribute('data-rahtilaskuri-native-import')) {
                    return true;
                }
                if (window.__RAHTILASKURI_NATIVE_IMPORT__) return true;
                if (typeof unsafeWindow !== 'undefined' && unsafeWindow && unsafeWindow.__RAHTILASKURI_NATIVE_IMPORT__) {
                    return true;
                }
                const probe = document.createElement('script');
                probe.textContent = 'try{if(window.__RAHTILASKURI_NATIVE_IMPORT__&&document.documentElement){document.documentElement.setAttribute("data-rahtilaskuri-native-import","1");}}catch(e){}';
                (document.head || document.documentElement).appendChild(probe);
                probe.remove();
                if (document.documentElement && document.documentElement.getAttribute('data-rahtilaskuri-native-import')) {
                    return true;
                }
            } catch (e) {}
            return false;
        }

        probeNativeImportFlag();
        setTimeout(probeNativeImportFlag, 300);
        setTimeout(probeNativeImportFlag, 1000);

        function showRahtilaskuriToast(orders) {
            let toast = document.getElementById('ai-rahti-import-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.id = 'ai-rahti-import-toast';
                toast.style.position = 'fixed';
                toast.style.top = '16px';
                toast.style.left = '50%';
                toast.style.transform = 'translateX(-50%)';
                toast.style.zIndex = '999999';
                toast.style.padding = '12px 20px';
                toast.style.borderRadius = '8px';
                toast.style.background = '#0f172a';
                toast.style.color = '#ffffff';
                toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
                toast.style.fontFamily = 'system-ui, sans-serif';
                toast.style.fontSize = '14px';
                toast.style.fontWeight = 'bold';
                toast.style.display = 'flex';
                toast.style.alignItems = 'center';
                toast.style.gap = '10px';
                toast.style.border = '1px solid #38bdf8';
                document.body.appendChild(toast);
            }

            const nums = orders.map(o => '#' + o.tilausNumero).join(', ');
            toast.innerHTML = `
                <span style="font-size:18px;">📦</span>
                <div>
                    <div>Tuotu Pupesoftista: <b>${nums}</b></div>
                    <div style="font-size:11px; font-weight:normal; color:#94a3b8; margin-top:2px;">
                        ${orders.length} tilaus(ta) yhdistetty ja rahti laskettu automaattisesti!
                    </div>
                </div>
            `;

            setTimeout(() => {
                if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
            }, 6000);
        }

        async function injectOrdersIntoRahtilaskuri(orders) {
            console.log('[Pupe-Helper] Fallback-tuonti: käsitellään ' + orders.length + ' tilausta Rahtilaskuriin...');

            let fileInput = document.querySelector('input[type="file"]');

            if (!fileInput) {
                for (let i = 0; i < 40; i++) {
                    if (probeNativeImportFlag()) return 'NATIVE';
                    const buttons = Array.from(document.querySelectorAll('button'));
                    const importBtn = buttons.find(b =>
                        b.textContent && (b.textContent.includes('Tuo tilaus') || b.textContent.includes('lähete') || b.textContent.includes('Import'))
                    );
                    if (importBtn) {
                        importBtn.click();
                        break;
                    }
                    await new Promise(r => setTimeout(r, 150));
                }
            }

            if (!fileInput) {
                for (let i = 0; i < 30; i++) {
                    fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) break;
                    await new Promise(r => setTimeout(r, 150));
                }
            }

            if (!fileInput) {
                console.error('[Pupe-Helper] Tiedostosyötettä ei löytynyt');
                return 'EMPTY';
            }

            try {
                const dt = new DataTransfer();
                for (const ord of orders) {
                    if (!ord.html || !ord.html.trim()) continue;
                    const blob = new Blob([ord.html], { type: 'text/html;charset=utf-8' });
                    const file = new File([blob], `tilaus_${ord.tilausNumero}.html`, { type: 'text/html' });
                    dt.items.add(file);
                }

                if (dt.files.length === 0) {
                    return 'EMPTY';
                }

                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 200));
                    const isSpinning = !!document.querySelector('.animate-spin');
                    const modalOverlay = document.querySelector('.fixed.inset-0');
                    if (!isSpinning && modalOverlay) {
                        await new Promise(r => setTimeout(r, 300));
                        const closeBtn = modalOverlay.querySelector('button');
                        if (closeBtn) closeBtn.click();
                        break;
                    }
                }

                // Tarkistetaan että tuoterivejä oikeasti ilmestyi laskuriin ennen onnistumiskuittausta
                await new Promise(r => setTimeout(r, 150));
                const qtyInputs = document.querySelectorAll('input[type="number"]');
                if (!qtyInputs || qtyInputs.length === 0) {
                    return 'EMPTY';
                }

                showRahtilaskuriToast(orders);
                return 'OK';
            } catch (err) {
                console.error('[Pupe-Helper] Virhe tiedostojen syötössä:', err);
                return 'EMPTY';
            }
        }

        window.addEventListener('message', async (event) => {
            if (probeNativeImportFlag()) {
                return;
            }

            if (event.data && event.data.type === 'CHECK_RAHTILASKURI_READY') {
                if (event.source && typeof event.source.postMessage === 'function') {
                    try {
                        event.source.postMessage({ type: 'RAHTILASKURI_READY' }, '*');
                    } catch {}
                }
                return;
            }

            if (event.data && event.data.type === 'IMPORT_PUPESOFT_ORDERS' && Array.isArray(event.data.orders)) {
                if (probeNativeImportFlag()) return;
                if (isHandlingImport) return;
                isHandlingImport = true;

                try {
                    // Odotetaan hetki, jotta Reactin natiivi OrderPanel ehtii käynnistyä ja merkitä itsensä aktiiviseksi
                    for (let w = 0; w < 5; w++) {
                        if (probeNativeImportFlag()) return;
                        await new Promise(r => setTimeout(r, 120));
                    }

                    // Jos natiivi OrderPanel ehti jo tuoda tilauksen DOMiin (esim. tiukan CSP:n alla), ei kosketa modaaliin
                    const qtyInputsNow = document.querySelectorAll('input[type="number"]');
                    const bodyTxtNow = document.body ? (document.body.textContent || '') : '';
                    const alreadyImportedByReact = qtyInputsNow.length > 0 && event.data.orders.some(
                        o => o.tilausNumero && bodyTxtNow.includes(String(o.tilausNumero))
                    );
                    if (alreadyImportedByReact) {
                        return;
                    }

                    try {
                        if (event.source && typeof event.source.postMessage === 'function') {
                            event.source.postMessage({ type: 'IMPORT_PUPESOFT_ACK' }, '*');
                        }
                    } catch {}

                    const status = await injectOrdersIntoRahtilaskuri(event.data.orders);
                    if (status === 'OK' && event.source && typeof event.source.postMessage === 'function') {
                        try {
                            event.source.postMessage({ type: 'IMPORT_PUPESOFT_SUCCESS', count: event.data.orders.length }, '*');
                        } catch {}
                    } else if (status === 'EMPTY' && event.source && typeof event.source.postMessage === 'function') {
                        try {
                            event.source.postMessage({ type: 'IMPORT_PUPESOFT_EMPTY', count: event.data.orders.length }, '*');
                        } catch {}
                    }
                } finally {
                    isHandlingImport = false;
                }
            }
        });

        function notifyOpenerReady() {
            if (window.opener && typeof window.opener.postMessage === 'function') {
                try {
                    window.opener.postMessage({ type: 'RAHTILASKURI_READY' }, '*');
                } catch {}
            }
        }
        notifyOpenerReady();
        setTimeout(notifyOpenerReady, 400);
        setTimeout(notifyOpenerReady, 1200);

        return;
    }

    if (!isPupesoft) return;

    // =========================================================================
    // PIKATILAUS- JA PALVELURIVITUNNISTUS (FI + EN, ILMAN TOIMITUSTAPAVIRHEITÄ)
    // =========================================================================

    // Tuoterivillä oleva lisäpalvelu tai pikatilaustuote (esim. EXTRA DELIVERY COST)
    const EXTRA_REGEX = /\b(?:extra[\s_\-&;%20]*delivery(?:[\s_\-&;%20]*cost\w*)?|express[\s_\-&;%20]*delivery[\s_\-&;%20]*cost\w*|pikarahti\w*|pikatoimitus\w*|pikatilaus\w*|(?:rush|urgent|express|priority)[\s_\-]+order\w*)\b/i;

    // Lisätiedoissa / kommenteissa oleva pikatilausmerkintä suomeksi tai englanniksi
    // Huom: /i tekee hausta kirjainkoosta riippumattoman (pikatilaus, Pikatilaus, PIKATILAUS jne.)
    // Vaatii AINA tilaus/toimitus/rahti/keräys -sanayhdistelmän (EI irrallisia sanoja kuten "express" tai "priority",
    // jotka esiintyvät toimitustapojen nimissä ja aiheuttavat vääriä hälytyksiä).
    const PIKA_COMMENT_REGEX = /\b(?:pikatilaus\w*|pika[\s_\-]+tilaus\w*|pikatilauksena|pikatoimitus\w*|pika[\s_\-]+toimitus\w*|pikarahti\w*|pika[\s_\-]+rahti\w*|pikakeräys\w*|pika[\s_\-]+keräys\w*|kiireellinen[\s_\-]+tilaus\w*|rush[\s_\-]*order\w*|rush[\s_\-]*delivery|rush[\s_\-]*shipping|urgent[\s_\-]*order\w*|urgent[\s_\-]*delivery|urgent[\s_\-]*shipping|express[\s_\-]*order\w*|express[\s_\-]*delivery|express[\s_\-]*shipping|priority[\s_\-]*order\w*|priority[\s_\-]*delivery|fast[\s_\-]*order\w*|fast[\s_\-]*delivery|quick[\s_\-]*order\w*|quick[\s_\-]*delivery|expedited[\s_\-]*order\w*|expedited[\s_\-]*delivery|same[\s_\-]*day[\s_\-]*order\w*|same[\s_\-]*day[\s_\-]*delivery)\b/i;

    // Ei-fyysiset palvelu- ja rahtirivit, joita ei pakata Rahtilaskurin kolleihin
    const NON_PHYSICAL_SERVICE_REGEX = /^(?:extra[\s_\-]*delivery(?:[\s_\-]*cost\w*)?|express[\s_\-]*delivery(?:[\s_\-]*cost\w*)?|pikarahti\w*|pikatoimitus\w*|pikatilaus\w*|rahti|rahtikulu\w*|rahtimaksu\w*|toimituskulu\w*|toimitusmaksu\w*|laskutuslisä\w*|pientoimituslisä\w*|käsittelykulu\w*|lavaveloitus\w*|huolintakulu\w*|freight(?:\s*(?:cost|charge|fee))?|shipping(?:\s*(?:cost|charge|fee))?|delivery(?:\s*(?:cost|charge|fee))?|handling(?:\s*fee)?)$/i;

    // Siivotaan vanhat väärät tallennukset selaimesta
    try {
        localStorage.removeItem('ai_pika_orders_v5');
        localStorage.removeItem('ai_pika_orders_v4');
        localStorage.removeItem('ai_pika_orders_v3');
        localStorage.removeItem('ai_pika_orders_v2');
        localStorage.removeItem('ai_pika_orders');
    } catch (e) {}

    const PIKA_STORAGE_KEY = 'ai_pika_orders_v5_1';
    const PIKA_TTL_MS = 24 * 60 * 60 * 1000; // 24 tuntia riittää keräysjonolle

    function loadPikaStore() {
        try {
            const raw = localStorage.getItem(PIKA_STORAGE_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (e) {
            return {};
        }
    }

    function markOrderPika(tilausNumero, isPika) {
        if (!tilausNumero) return;
        const key = String(tilausNumero).trim();
        try {
            if (isPika) {
                sessionStorage.setItem('ai_extra_' + key, '1');
            } else {
                sessionStorage.removeItem('ai_extra_' + key);
            }
        } catch (e) {}

        try {
            const store = loadPikaStore();
            const now = Date.now();
            // Siivotaan vanhentuneet merkinnät
            for (const k of Object.keys(store)) {
                if (!store[k] || now - store[k] > PIKA_TTL_MS) {
                    delete store[k];
                }
            }
            if (isPika) {
                store[key] = now;
            } else {
                delete store[key];
            }
            localStorage.setItem(PIKA_STORAGE_KEY, JSON.stringify(store));
        } catch (e) {}
    }

    function isOrderMarkedPika(tilausNumero) {
        if (!tilausNumero) return false;
        const key = String(tilausNumero).trim();
        try {
            if (sessionStorage.getItem('ai_extra_' + key) === '1') return true;
        } catch (e) {}
        try {
            const store = loadPikaStore();
            const ts = store[key];
            if (ts && Date.now() - ts <= PIKA_TTL_MS) return true;
        } catch (e) {}
        return false;
    }

    /**
     * Poistaa kuljetusliikkeiden vakiotuotenimet (esim. "Express-paketti", "Express Business Day pallet",
     * "DHL Express", "FedEx Express"), jotta toimitustapojen nimet eivät aiheuta vääriä hälytyksiä.
     */
    function stripCarrierShippingTerms(text) {
        if (!text) return '';
        return String(text)
            .replace(/\bexpress[\s\-]*paketti\w*/gi, ' ')
            .replace(/\bexpress\s+business\s+day(?:\s+pallet)?\b/gi, ' ')
            .replace(/\b(?:posti|itella|dhl|tnt|gls|db\s*schenker|schenker|ups|fedex|dpd|postnord|matkahuolto|kaukokiito|wakkanet|bring)\s+(?:express|priority)\b/gi, ' ')
            .replace(/\b(?:express|priority)\s+(?:pallet|paketti|parcel|pakket)\b/gi, ' ');
    }

    function isCommentTextPika(text) {
        if (!text) return false;
        if (EXTRA_REGEX.test(text)) return true;
        const cleaned = stripCarrierShippingTerms(text);
        return PIKA_COMMENT_REGEX.test(cleaned);
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Laskee HTML-rivin (<tr>) solut ja niiden visuaaliset sarakeindeksit colspan huomioiden.
     */
    function getRowVisualCells(tr) {
        const result = [];
        if (!tr || !tr.children) return result;
        let colCursor = 0;
        for (let i = 0; i < tr.children.length; i++) {
            const el = tr.children[i];
            const tag = el.tagName ? el.tagName.toLowerCase() : '';
            if (tag !== 'td' && tag !== 'th') continue;
            const span = Math.max(1, parseInt(el.getAttribute('colspan') || '1', 10) || 1);
            result.push({
                el,
                tag,
                colStart: colCursor,
                colSpan: span,
                text: (el.textContent || '').replace(/\s+/g, ' ').trim()
            });
            colCursor += span;
        }
        return result;
    }

    function findVisualCell(visualCells, targetCol) {
        for (let i = 0; i < visualCells.length; i++) {
            const c = visualCells[i];
            if (targetCol >= c.colStart && targetCol < c.colStart + c.colSpan) {
                return c;
            }
        }
        return null;
    }

    /**
     * Tarkistaa jonorivin (.niputettava_rivi) lisätieto-popupit (#div_<tilaus>_1, #div_<tilaus>_2 sekä rivin sisäiset .popup-elementit).
     * Ei koskaan lue Toimitustapa-saraketta!
     */
    function checkQueueRowPopupsIsPika(row, tilausNumero) {
        const texts = [];
        if (row) {
            row.querySelectorAll('.popup, [class*="popup"]').forEach(p => {
                texts.push(p.textContent || '');
            });
            // Tarkistetaan myös mahdolliset lisätieto-ikonien title/alt-tekstit (ohittaen toimitustapasolun)
            row.querySelectorAll('img.tooltip, .tooltip').forEach(el => {
                if (el.getAttribute('title')) texts.push(el.getAttribute('title'));
                if (el.getAttribute('alt')) texts.push(el.getAttribute('alt'));
                const refId = el.getAttribute('id');
                if (refId) {
                    const popupDiv = document.getElementById('div_' + refId);
                    if (popupDiv) texts.push(popupDiv.textContent || '');
                }
            });
        }
        if (tilausNumero) {
            const p1 = document.getElementById(`div_${tilausNumero}_1`);
            const p2 = document.getElementById(`div_${tilausNumero}_2`);
            if (p1) texts.push(p1.textContent || '');
            if (p2) texts.push(p2.textContent || '');
        }
        return texts.some(t => isCommentTextPika(t));
    }

    /**
     * Jäsentää tilauksen HTML-dokumentin (NAYTATILAUS tai keraa.php) DOMParserilla ja tarkistaa:
     * 1) Sisältääkö tuoterivit EXTRA DELIVERY COST / pikatilaustuotteen
     * 2) Sisältääkö tilauksen lisätiedot tai kommenttirivit sanan pikatilaus (FI/EN)
     * Ei koskaan lue keräyslistan muita rivejä, suodatinvalikoita, Ostaja-nimeä tai Toimitustapa-kenttää.
     */
    function checkParsedOrderIsPika(rawHtml, targetTilausNumero) {
        if (!rawHtml) return false;
        try {
            const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

            // Tarkistetaan ensin tilauksen omat popup-lisätiedot, jos ne ovat dokumentissa ennen siivousta
            if (targetTilausNumero) {
                const p1 = doc.getElementById(`div_${targetTilausNumero}_1`);
                const p2 = doc.getElementById(`div_${targetTilausNumero}_2`);
                if ((p1 && isCommentTextPika(p1.textContent)) || (p2 && isCommentTextPika(p2.textContent))) {
                    return true;
                }
            }

            // Poistetaan kaikki sivun ulkopuoliset häiriölähteet
            doc.querySelectorAll(
                'script, style, noscript, iframe, #kerayslistat_table, form[name="find"], form[name="sanakirjaform"], select[name="tutoimtapa"], select[name^="filtteri_"], .popup, [class*="popup"]'
            ).forEach(el => el.remove());

            // Poistetaan tulostusjonon hakusuodattimien ja massatulostuksen isäntätaulukot
            doc.querySelectorAll('table').forEach(tbl => {
                if (tbl.querySelector('form[name="find"], select[name="valittu_tulostin"], input[name="tulostukseen_kaikki"], select[name="tuvarasto"], button[type="submit"]')) {
                    tbl.remove();
                }
            });

            // 1. Tarkistetaan keraa.php (#maintable)
            const mainTable = doc.getElementById('maintable');
            if (mainTable) {
                const rows = Array.from(mainTable.querySelectorAll('tbody tr, tr'));
                for (const tr of rows) {
                    if (tr.classList.contains('keraysrivi')) {
                        const codeInput = tr.querySelector('input.tuoteno_input, input[name^="rivin_puhdas_tuoteno"]');
                        const codeVal = codeInput ? codeInput.value : '';
                        const cells = getRowVisualCells(tr);
                        const rowProductText = [codeVal, cells[1]?.text || '', cells[2]?.text || ''].join(' ');
                        if (EXTRA_REGEX.test(rowProductText)) return true;
                    } else {
                        const txt = (tr.textContent || '').trim();
                        if (/kommentti|lisätiedot|viesti|ohje|huom/i.test(txt) && isCommentTextPika(txt)) {
                            return true;
                        }
                    }
                }
            }

            // 2. Tarkistetaan NAYTATILAUS-sivun ja keraa.php:n taulukot
            const tables = Array.from(doc.querySelectorAll('table'));
            const NON_COMMENT_HEADERS = /^(?:ytunnus|y-tunnus|ostaja|asiakas|toimitusosoite|laskutusosoite|tilaus|tilausnumero|tila|vienti|alv|erikoisalennus|laskunro|laskun\s*pvm|eräpäivä|maksupäivä|toimitusaika|toimitustapa(?:\s*\/\s*rahtikirjanro)?|rahtikirjanro|toimitusehto|maksuehto|luontiaika|keräykseen|tulostettu|kerätty|toimitettu|laskutettu|myyjä|kerääjä|järjestä\s*painon\s*mukaan|valitse\s+.*)$/i;

            for (const tbl of tables) {
                if (tbl.id === 'maintable' || tbl.id === 'kerayslistat_table') continue;
                const trs = Array.from(tbl.querySelectorAll('tr'));
                if (trs.length === 0) continue;

                // Tarkistetaan onko tämä Tilausrivit-taulukko
                let isProductTable = false;
                let codeCol = -1;
                let nameCol = -1;

                for (let r = 0; r < Math.min(trs.length, 4); r++) {
                    const hCells = getRowVisualCells(trs[r]);
                    let cCode = -1;
                    let cName = -1;
                    let cQty = -1;
                    for (const hc of hCells) {
                        const cleanH = hc.text.replace(/[:#*]/g, '').trim();
                        if (/^(?:tuotenumero|tuoteno|tuotekoodi)$/i.test(cleanH)) cCode = hc.colStart;
                        else if (/^(?:nimitys|tuotenimi|kuvaus)$/i.test(cleanH)) cName = hc.colStart;
                        else if (/^(?:määrä|til\.\s*määrä|kpl|varattu)$/i.test(cleanH)) cQty = hc.colStart;
                    }
                    if (cCode !== -1 && cQty !== -1) {
                        isProductTable = true;
                        codeCol = cCode;
                        nameCol = cName;
                        break;
                    }
                }

                if (isProductTable) {
                    for (const tr of trs) {
                        const cells = getRowVisualCells(tr);
                        if (cells.length === 0 || cells.every(c => c.tag === 'th')) continue;

                        const hasWideColspan = cells.some(c => c.colSpan >= 4);
                        const fullRowTxt = cells.map(c => c.text).join(' ');

                        if (hasWideColspan || /\b(?:kommentti|keräyskommentti)\s*:/i.test(fullRowTxt)) {
                            if (isCommentTextPika(fullRowTxt)) return true;
                            continue;
                        }

                        const codeTxt = codeCol !== -1 ? (findVisualCell(cells, codeCol)?.text || '') : '';
                        const nameTxt = nameCol !== -1 ? (findVisualCell(cells, nameCol)?.text || '') : '';
                        if (EXTRA_REGEX.test(codeTxt) || EXTRA_REGEX.test(nameTxt)) {
                            return true;
                        }
                    }
                } else {
                    // Tilauksen otsikkotaulukko: tarkistetaan kaikki lisätieto-, viesti-, viite- ja kommenttirivit
                    for (let r = 0; r < trs.length; r++) {
                        const cells = getRowVisualCells(trs[r]);
                        if (cells.length === 0) continue;

                        // Muoto A: <tr><th>Kommentti 2:</th><td>...</td></tr>
                        if (cells[0].tag === 'th' && cells.length >= 2 && cells.some(c => c.tag === 'td')) {
                            const labelClean = cells[0].text.replace(/[:]/g, '').trim();
                            if (!NON_COMMENT_HEADERS.test(labelClean)) {
                                const valText = cells.slice(1).map(c => c.text).join(' ');
                                if (isCommentTextPika(valText)) return true;
                            }
                            continue;
                        }

                        // Muoto B: otsikkorivi <th>Lisätiedot</th><th>Tilausviite</th> ja arvot seuraavalla rivillä
                        if (cells.every(c => c.tag === 'th') && r + 1 < trs.length) {
                            const nextCells = getRowVisualCells(trs[r + 1]);
                            if (nextCells.some(c => c.tag === 'td')) {
                                for (const hc of cells) {
                                    const labelClean = hc.text.replace(/[:]/g, '').trim();
                                    if (labelClean && !NON_COMMENT_HEADERS.test(labelClean)) {
                                        const dataCell = findVisualCell(nextCells, hc.colStart);
                                        if (dataCell && isCommentTextPika(dataCell.text)) {
                                            return true;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[Pupe-Helper] Virhe pikatilauksen jäsennyksessä:', err);
        }
        return false;
    }

    // =========================================================================
    // TURVALLINEN VAIN-LUKU NAYTATILAUS-NOUTO JA PUHDAS HTML RAHTILASKURILLE
    // =========================================================================

    const SAFE_NAYTATILAUS_FILTER_KEYS = [
        'toim', 'jarj', 'tuvarasto', 'tumaa', 'tutyyppi', 'tutoimtapa', 'karajaus',
        'tuoteno', 'karajaushyllyssa', 'filtteri_toimipaikka', 'filtteri_tuotemerkki',
        'filtteri_tuoterivit', 'filtteri_tuoterivit_min', 'filtteri_tuoterivit_max',
        'filtteri_painot', 'filtteri_painot_min', 'filtteri_painot_max',
        'filtteri_aika_jonossa', 'filtteri_poimintakorkeus', 'filtteri_vienti',
        'filtteri_aaltokeraily', 'filtteri_aaltokeraily_min', 'filtteri_aaltokeraily_max',
        'vva', 'kka', 'ppa', 'vvl', 'kkl', 'ppl', 'etsi'
    ];

    /**
     * Rakentaa täysin puhtaan URLSearchParams-olion VAIN NAYTATILAUS-esikatselua varten.
     * EI KOSKAAN lue <form>-lomakkeita FormData-oliolla eikä koskaan sisällä TULOSTA-,
     * tulostukseen[]- tai valittu_tulostin-parametreja.
     */
    function buildSafeNaytaTilausParams(tilausNumero, optionalRow) {
        const cleanId = String(tilausNumero || '').trim();
        if (!/^\d+$/.test(cleanId)) {
            throw new Error('[Pupe-Helper] Virheellinen tilausnumero: ' + tilausNumero);
        }

        const params = new URLSearchParams();
        const findForm = document.querySelector('form[name="find"]');

        for (const key of SAFE_NAYTATILAUS_FILTER_KEYS) {
            let val = '';
            if (findForm) {
                const field = findForm.querySelector(`[name="${key}"]`);
                if (field && typeof field.value === 'string') {
                    val = field.value;
                }
            }
            if (!val && key === 'karajaus') val = '3';
            if (!val && (key === 'tuvarasto' || key === 'tutyyppi' || key === 'tutoimtapa')) val = 'KAIKKI';
            params.set(key, val);
        }

        let laskuYhtio = '';
        if (optionalRow) {
            const rowYhtio = optionalRow.querySelector('input[name="lasku_yhtio"]');
            if (rowYhtio && rowYhtio.value) laskuYhtio = rowYhtio.value.trim();
        }
        if (!laskuYhtio) {
            const anyYhtio = document.querySelector('input[name="lasku_yhtio"]');
            if (anyYhtio && anyYhtio.value) laskuYhtio = anyYhtio.value.trim();
        }
        if (!laskuYhtio) {
            laskuYhtio = 'audio';
        }
        params.set('lasku_yhtio', laskuYhtio);

        params.set('vanha_tee2', '');
        params.set('tee2', 'NAYTATILAUS');
        params.set('tunnus', cleanId);

        const serialized = params.toString();
        if (
            params.get('tee2') !== 'NAYTATILAUS' ||
            params.get('tunnus') !== cleanId ||
            /tulosta|valittu_tulostin/i.test(serialized)
        ) {
            throw new Error('[Pupe-Helper] Turvaesto: estetty muu kuin NAYTATILAUS-pyyntö!');
        }

        return params;
    }

    const orderCleanHtmlCache = new Map();
    const inflightNaytaTilaus = new Map();

    async function fetchSafeNaytaTilausRaw(tilausNumero, optionalRow) {
        const cleanId = String(tilausNumero || '').trim();
        if (!cleanId) return '';

        if (inflightNaytaTilaus.has(cleanId)) {
            return inflightNaytaTilaus.get(cleanId);
        }

        const promise = (async () => {
            try {
                const params = buildSafeNaytaTilausParams(cleanId, optionalRow);
                const endpoint = location.pathname.includes('lahetteen_tulostusjono.php')
                    ? location.pathname
                    : '/tilauskasittely/lahetteen_tulostusjono.php';

                const res = await fetch(endpoint, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
                    },
                    body: params.toString()
                });

                if (!res.ok) return '';
                const buffer = await res.arrayBuffer();
                const contentType = res.headers.get('content-type') || '';
                let html = '';
                if (/iso-8859-1|latin1|windows-1252/i.test(contentType)) {
                    html = new TextDecoder('iso-8859-1').decode(buffer);
                } else {
                    html = new TextDecoder('utf-8').decode(buffer);
                    if (html.includes('\uFFFD')) {
                        html = new TextDecoder('iso-8859-1').decode(buffer);
                    }
                }
                return html;
            } catch (err) {
                console.warn('[Pupe-Helper] NAYTATILAUS-luku epäonnistui tilaukselle #' + cleanId + ':', err);
                return '';
            } finally {
                inflightNaytaTilaus.delete(cleanId);
            }
        })();

        inflightNaytaTilaus.set(cleanId, promise);
        return promise;
    }

    /**
     * Poimii solusta monirivisen tekstin säilyttäen <br>-rivinvaihdot.
     */
    function extractLinesFromCellElement(cellEl) {
        if (!cellEl) return [];
        const clone = cellEl.cloneNode(true);
        clone.querySelectorAll('script, style, select, input, button, .popup').forEach(el => el.remove());
        clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
        clone.querySelectorAll('p, div').forEach(blk => {
            blk.prepend('\n');
            blk.append('\n');
        });
        return (clone.textContent || '')
            .split(/\r?\n/)
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(Boolean);
    }

    /**
     * Poimii tilauksen HTML-dokumentista VAIN Toimitusosoite-kentän rivit (ei koskaan Ostaja- tai Laskutusosoite-kenttiä!).
     */
    function extractStrictToimitusosoiteLines(doc) {
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const tbl of tables) {
            if (tbl.id === 'maintable' || tbl.id === 'kerayslistat_table') continue;
            const trs = Array.from(tbl.querySelectorAll('tr'));
            for (let r = 0; r < trs.length - 1; r++) {
                const hCells = getRowVisualCells(trs[r]);
                const toimHeader = hCells.find(c =>
                    /^(?:toimitusosoite|delivery\s*address|shipping\s*address|leveransadress)$/i.test(c.text.replace(/[:]/g, '').trim())
                );
                if (!toimHeader) continue;

                const dCells = getRowVisualCells(trs[r + 1]);
                const targetCell = findVisualCell(dCells, toimHeader.colStart);
                if (targetCell && targetCell.el) {
                    const lines = extractLinesFromCellElement(targetCell.el);
                    if (lines.length > 0) return lines;
                }
            }
        }
        return [];
    }

    /**
     * Muuntaa Pupesoftin raakadokumentin (NAYTATILAUS tai keraa.php) puhtaaksi, häiriöttömäksi HTML-tilaukseksi Rahtilaskuria varten:
     * - Sisältää VAIN Toimitusosoite-kentän (ei Ostaja / Laskutusosoite)
     * - Sisältää VAIN tilauksen fyysiset tuoterivit tarkkoine määrineen (ei EXTRA DELIVERY COST / kommenttirivejä / suodatinvalikoita)
     * - Sisältää VAIN oikean tilausnumeron
     */
    function buildCleanOrderHtmlForRahtilaskuri(rawHtml, tilausNumero) {
        if (!rawHtml) return '';
        const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

        // Poistetaan kaikki sivun häiriöelementit
        doc.querySelectorAll(
            'script, style, noscript, iframe, #kerayslistat_table, form[name="find"], form[name="sanakirjaform"], .popup, [class*="popup"], tfoot'
        ).forEach(el => el.remove());

        // Poistetaan tulostusjonon hakusuodattimien ja massatulostuksen isäntätaulukot
        doc.querySelectorAll('table').forEach(tbl => {
            if (tbl.querySelector('form[name="find"], select[name="valittu_tulostin"], input[name="tulostukseen_kaikki"], select[name="tuvarasto"]')) {
                tbl.remove();
            }
        });

        // 1. Varmistetaan tilausnumero
        let resolvedOrderNo = String(tilausNumero || '').trim();
        if (!resolvedOrderNo) {
            const tilausIdInput = doc.getElementById('tilaus_id');
            if (tilausIdInput && tilausIdInput.value) {
                resolvedOrderNo = tilausIdInput.value.trim();
            }
        }
        if (!resolvedOrderNo) {
            const heads = Array.from(doc.querySelectorAll('.head, font.head, h1, h2'));
            for (const h of heads) {
                const m = (h.textContent || '').trim().match(/^Tilaus\s+(\d{5,8})\b/i);
                if (m) {
                    resolvedOrderNo = m[1];
                    break;
                }
            }
        }

        // 2. Poimitaan tiukasti VAIN Toimitusosoite
        const deliveryLines = extractStrictToimitusosoiteLines(doc);

        // 3. Poimitaan tuoterivit
        const extractedRows = [];

        // Vaihtoehto A: keraa.php (#maintable ja tr.keraysrivi)
        const keraysRows = Array.from(doc.querySelectorAll('#maintable tbody tr.keraysrivi, tr.keraysrivi'));
        if (keraysRows.length > 0) {
            for (const tr of keraysRows) {
                const cells = getRowVisualCells(tr);
                const codeInput = tr.querySelector('input.tuoteno_input, input[name^="rivin_puhdas_tuoteno"]');
                let code = codeInput && codeInput.value ? codeInput.value.trim() : '';
                if (!code && cells[1]) {
                    const link = cells[1].el.querySelector('a');
                    code = (link ? link.textContent : cells[1].text).replace(/\s+/g, ' ').trim();
                }
                if (!code) continue;

                const name = cells[2] ? cells[2].text : code;
                if (NON_PHYSICAL_SERVICE_REGEX.test(code) || NON_PHYSICAL_SERVICE_REGEX.test(name)) {
                    continue;
                }

                // Luetaan poikkeava määrä, jos kerääjä on syöttänyt sellaisen; muuten rivin_varattu
                let qty = null;
                const altInput = tr.querySelector('input.poikkeava_maara, input[name^="maara["]');
                if (altInput) {
                    const rawAlt = (altInput.value || altInput.getAttribute('value') || '').trim();
                    if (rawAlt !== '') {
                        const n = parseFloat(rawAlt.replace(',', '.'));
                        if (!isNaN(n)) qty = Math.round(n);
                    }
                }
                let origQty = null;
                const varattuInput = tr.querySelector('input[name^="rivin_varattu"]');
                if (varattuInput) {
                    const rawVar = (varattuInput.value || varattuInput.getAttribute('value') || '').trim();
                    if (rawVar !== '') {
                        const n = parseFloat(rawVar.replace(',', '.'));
                        if (!isNaN(n)) origQty = Math.round(n);
                    }
                }
                if (origQty === null) {
                    const varTd = tr.querySelector('td[id$="_varattu"]') || cells[3]?.el;
                    if (varTd) {
                        const clone = varTd.cloneNode(true);
                        clone.querySelectorAll('input, select').forEach(e => e.remove());
                        const m = (clone.textContent || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/);
                        if (m) origQty = Math.round(parseFloat(m[0]));
                    }
                }

                const effectiveQty = qty !== null ? qty : origQty;
                if (effectiveQty === null) continue;

                let isBO = false;
                const poikSel = tr.querySelector('select[name^="poikkeama_kasittely"]');
                if (poikSel) {
                    const selOpt = poikSel.querySelector('option[selected]') || poikSel.options[poikSel.selectedIndex];
                    const val = (poikSel.value || (selOpt ? selOpt.value : '') || '').toUpperCase();
                    if (val === 'JT' || val === 'PU' || val === 'MI') {
                        isBO = true;
                    }
                }

                if (effectiveQty <= 0 && origQty && origQty > 0) {
                    isBO = true;
                }
                const outQty = isBO ? (origQty || effectiveQty) : effectiveQty;
                if (!outQty || outQty <= 0) continue;

                extractedRows.push({ code, name, qty: outQty, isBO });
            }
        } else {
            // Vaihtoehto B: NAYTATILAUS Tilausrivit-taulukko
            const tables = Array.from(doc.querySelectorAll('table'));
            for (const tbl of tables) {
                const trs = Array.from(tbl.querySelectorAll('tr'));
                if (trs.length < 2) continue;

                let headerIdx = -1;
                let codeCol = -1;
                let nameCol = -1;
                let qtyCol = -1;
                let ordQtyCol = -1;
                let stateCol = -1;

                for (let r = 0; r < Math.min(trs.length, 5); r++) {
                    const hCells = getRowVisualCells(trs[r]);
                    if (hCells.length < 2) continue;

                    let cCode = -1, cName = -1, cQty = -1, cOrdQty = -1, cState = -1;
                    for (const hc of hCells) {
                        const h = hc.text.replace(/[:#*]/g, '').trim();
                        if (/^(?:tuotenumero|tuoteno|tuotekoodi|sku)$/i.test(h)) cCode = hc.colStart;
                        else if (/^(?:nimitys|tuotenimi|kuvaus)$/i.test(h)) cName = hc.colStart;
                        else if (/^(?:määrä|toimitetaan|varattu|kerättävä|kpl)$/i.test(h)) cQty = hc.colStart;
                        else if (/^(?:til\.\s*määrä|tilattu(?:\s*määrä)?)$/i.test(h)) cOrdQty = hc.colStart;
                        else if (/^(?:tila|status)$/i.test(h)) cState = hc.colStart;
                    }

                    if (cCode !== -1 && (cQty !== -1 || cOrdQty !== -1)) {
                        headerIdx = r;
                        codeCol = cCode;
                        nameCol = cName;
                        qtyCol = cQty;
                        ordQtyCol = cOrdQty;
                        stateCol = cState;
                        break;
                    }
                }

                if (headerIdx === -1) continue;

                for (let r = headerIdx + 1; r < trs.length; r++) {
                    const cells = getRowVisualCells(trs[r]);
                    if (cells.length < 2) continue;
                    if (cells.every(c => c.tag === 'th')) continue;
                    if (cells.some(c => c.colSpan >= 4)) continue;

                    const codeCell = findVisualCell(cells, codeCol);
                    if (!codeCell) continue;

                    const linkEl = codeCell.el.querySelector('a');
                    const code = ((linkEl ? linkEl.textContent : codeCell.text) || '').replace(/\s+/g, ' ').trim();
                    if (!code) continue;

                    if (/^(?:kommentti|keräyskommentti|viesti|yhteensä|veroton|arvonlisävero|verollinen)\b/i.test(code)) {
                        continue;
                    }

                    const nameCell = nameCol !== -1 ? findVisualCell(cells, nameCol) : null;
                    const name = nameCell ? nameCell.text : code;
                    if (/^(?:kommentti|keräyskommentti)\s*:/i.test(name)) continue;

                    if (NON_PHYSICAL_SERVICE_REGEX.test(code) || NON_PHYSICAL_SERVICE_REGEX.test(name)) {
                        continue;
                    }

                    const parseCellNum = (cellObj) => {
                        if (!cellObj) return null;
                        const clean = cellObj.text.replace(/\s*(?:pcs|kpl|st|pr|pk)\b.*$/i, '').replace(',', '.').trim();
                        if (!clean) return null;
                        const m = clean.match(/-?\d+(?:\.\d+)?/);
                        return m ? Math.round(parseFloat(m[0])) : null;
                    };

                    const delivQty = qtyCol !== -1 ? parseCellNum(findVisualCell(cells, qtyCol)) : null;
                    const ordQty = ordQtyCol !== -1 ? parseCellNum(findVisualCell(cells, ordQtyCol)) : null;
                    const stateTxt = stateCol !== -1 ? (findVisualCell(cells, stateCol)?.text || '') : '';

                    let isBO = /^(?:jt|jälkitoimitus|puute|b\.o\.|backorder)$/i.test(stateTxt.trim());
                    if (delivQty === 0 && ordQty !== null && ordQty > 0) {
                        isBO = true;
                    }

                    const finalQty = isBO ? (ordQty || delivQty || 0) : (delivQty !== null ? delivQty : ordQty);
                    if (!finalQty || finalQty <= 0) continue;

                    extractedRows.push({ code, name, qty: finalQty, isBO });
                }

                if (extractedRows.length > 0) break;
            }
        }

        if (extractedRows.length === 0 && deliveryLines.length === 0) {
            return '';
        }

        const deliveryHtml = deliveryLines.map(l => escapeHtml(l)).join('<br>\n');
        const rowsHtml = extractedRows.map(item => {
            if (item.isBO) {
                return `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${item.qty} pcs **B.O.**</td><td>pcs</td><td>JT</td></tr>`;
            }
            return `<tr><td>${escapeHtml(item.code)}</td><td>${escapeHtml(item.name)}</td><td>${item.qty} pcs</td><td>pcs</td><td></td></tr>`;
        }).join('\n');

        return [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"><title>Tilaus ' + escapeHtml(resolvedOrderNo) + '</title></head><body>',
            '<h1>Tilaus ' + escapeHtml(resolvedOrderNo) + ':</h1>',
            '<table id="ai-clean-header">',
            '  <tr><th>Tilausnumero</th><th>Toimitusosoite</th></tr>',
            '  <tr><td>' + escapeHtml(resolvedOrderNo) + '</td><td>' + deliveryHtml + '</td></tr>',
            '</table>',
            '<table id="ai-clean-lines">',
            '  <thead><tr><th>Tuotenumero</th><th>Nimitys</th><th>Määrä</th><th>Yksikkö</th><th>Tila</th></tr></thead>',
            '  <tbody>',
            rowsHtml,
            '  </tbody>',
            '</table>',
            '</body></html>'
        ].join('\n');
    }

    /**
     * Synkronoi keraa.php-sivun live-lomakekenttien arvot DOM-attribuutteihin ennen outerHTML-lukua.
     */
    function serializeLiveKeraaDom() {
        try {
            document.querySelectorAll('#maintable input.poikkeava_maara, #maintable input[name^="maara["]').forEach(inp => {
                inp.setAttribute('value', inp.value || '');
            });
            document.querySelectorAll('#maintable select[name^="poikkeama_kasittely"]').forEach(sel => {
                Array.from(sel.options).forEach(opt => {
                    if (opt.value === sel.value) opt.setAttribute('selected', 'selected');
                    else opt.removeAttribute('selected');
                });
            });
        } catch (e) {}
        return document.documentElement.outerHTML;
    }

    /**
     * Tarkistaa onko nykyisellä lahetteen_tulostusjono.php-sivulla avattuna tietyn tilauksen NAYTATILAUS-esikatselu.
     * Huom: EI lue .popup-laatikoita (esim. "Alkuperäinen tilaus: 493364"), vaan etsii vain varsinaisen Tilaus XXXXX: -otsikon!
     */
    function findOpenPreviewOrderNumberOnPage() {
        const heads = Array.from(document.querySelectorAll('.head, font.head, h1, h2'));
        for (const h of heads) {
            if (h.closest('#kerayslistat_table') || h.closest('.popup')) continue;
            const m = (h.textContent || '').trim().match(/^Tilaus\s+(\d{5,8})\s*:?$/i);
            if (m) return m[1];
        }
        return null;
    }

    async function fetchOrderHtml(tilausNumero, optionalRow) {
        const cleanId = String(tilausNumero || '').trim();
        if (!cleanId) return '';

        // 1. Jos ollaan keraa.php-sivulla ja kyseessä on avoinna oleva keräilytilaus
        if (location.pathname.includes('keraa.php') || document.getElementById('maintable')) {
            const pageTilausId = document.getElementById('tilaus_id')?.value?.trim() ||
                new URLSearchParams(location.search).get('id')?.trim() || '';
            if (pageTilausId === cleanId) {
                const liveHtml = serializeLiveKeraaDom();
                const cleaned = buildCleanOrderHtmlForRahtilaskuri(liveHtml, cleanId);
                if (cleaned) return cleaned;
            }
        }

        // 2. Jos lahetteen_tulostusjono.php-sivulla on jo avattuna TÄMÄN tilauksen NAYTATILAUS-esikatselu
        const openPreviewId = findOpenPreviewOrderNumberOnPage();
        if (openPreviewId === cleanId) {
            const cleanedFromPage = buildCleanOrderHtmlForRahtilaskuri(document.documentElement.outerHTML, cleanId);
            if (cleanedFromPage) {
                orderCleanHtmlCache.set(cleanId, cleanedFromPage);
                return cleanedFromPage;
            }
        }

        // 3. Noudetaan tuore tilaus turvallisella vain-luku NAYTATILAUS-pyynnöllä
        const rawNayta = await fetchSafeNaytaTilausRaw(cleanId, optionalRow);
        if (rawNayta) {
            // Päivitetään samalla pikatilausmerkintä tuoreen sisällön perusteella
            const isPikaFromDetail = checkParsedOrderIsPika(rawNayta, cleanId);
            const isPikaFromPopup = checkQueueRowPopupsIsPika(optionalRow, cleanId);
            markOrderPika(cleanId, isPikaFromDetail || isPikaFromPopup);

            const cleaned = buildCleanOrderHtmlForRahtilaskuri(rawNayta, cleanId);
            if (cleaned) {
                orderCleanHtmlCache.set(cleanId, cleaned);
                return cleaned;
            }
        }

        // 4. Varalla taustaskannauksessa valmiiksi jäsennetty puhdas HTML
        if (orderCleanHtmlCache.has(cleanId)) {
            return orderCleanHtmlCache.get(cleanId);
        }

        return '';
    }

    // =========================================================================
    // OSA 2: KERÄÄ TILAUS -SIVUN PARANNUKSET (keraa.php)
    // =========================================================================
    function paivitaKeraaRivit() {
        const table = document.getElementById('maintable');
        if (!table) return;

        // Poistetaan aiemmat "Huomio alla!" -merkit
        document.querySelectorAll('.ai-comment-attached-badge').forEach(b => b.remove());

        const tbody = table.querySelector('tbody') || table;
        const rows = Array.from(tbody.querySelectorAll('tr'));
        let productIndex = 0;
        let lastProductRow = null;

        rows.forEach((tr, idx) => {
            const isProductRow = tr.classList.contains('keraysrivi');
            const rawText = tr.textContent.trim();
            const lowerText = rawText.toLowerCase();
            const isCommentRow = !isProductRow && (
                lowerText.includes('keräyskommentti') ||
                lowerText.includes('kommentti:') ||
                lowerText.startsWith('kommentti')
            );

            if (isCommentRow) {
                tr.classList.add('ai-keraa-kommentti');
                tr.classList.remove('ai-keraa-even', 'ai-keraa-odd', 'ai-keraa-comment-even', 'ai-keraa-comment-odd');

                const parentRow = lastProductRow || rows[idx - 1];
                let parentIsEven = false;

                if (parentRow && parentRow.classList.contains('keraysrivi')) {
                    parentRow.classList.add('ai-has-comment');
                    parentIsEven = parentRow.classList.contains('ai-keraa-even');
                }

                if (parentIsEven) {
                    tr.classList.add('ai-keraa-comment-even');
                } else {
                    tr.classList.add('ai-keraa-comment-odd');
                }

                // Muotoillaan kommenttilaatikko solun sisälle: vain sisennys, nuoli ja kolmio ilman ylimääräisiä tekstejä
                const commentTd = tr.querySelector('td');
                if (commentTd) {
                    if (!tr.dataset.aiOrigText) {
                        tr.dataset.aiOrigText = rawText;
                    }
                    const textToShow = tr.dataset.aiOrigText || rawText;

                    commentTd.innerHTML = `
                        <div class="ai-kommentti-box">
                            <span class="ai-kommentti-icon">↳ ⚠️</span>
                            <span class="ai-kommentti-text">${escapeHtml(textToShow)}</span>
                        </div>
                    `;
                }
                return;
            }

            if (isProductRow) {
                tr.classList.remove('ai-keraa-even', 'ai-keraa-odd');
                lastProductRow = tr;

                if (productIndex % 2 === 0) {
                    tr.classList.add('ai-keraa-odd');
                } else {
                    tr.classList.add('ai-keraa-even');
                }
                productIndex++;

                const isCollected = tr.classList.contains('yksittainenrivikeruu_keratytrivit');
                if (isCollected) {
                    const btn = tr.querySelector('button.kerattavatrivit');
                    if (btn && !btn.textContent.includes('✓')) {
                        btn.innerHTML = '✓ Päivitä';
                    }
                }
            }
        });
    }

    function alustaKeraaRivit() {
        const table = document.getElementById('maintable');
        if (!table) return;

        if (!document.getElementById('ai-keraa-styles')) {
            const style = document.createElement('style');
            style.id = 'ai-keraa-styles';
            style.textContent = `
                /* Keräilytaulukon selkeys ja erottelu */
                #maintable {
                    border-collapse: separate !important;
                    border-spacing: 0 !important;
                    width: 100% !important;
                    background-color: #ffffff !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 6px !important;
                    overflow: hidden !important;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
                }

                /* Otsikkorivi */
                #maintable thead th {
                    background-color: #f1f5f9 !important;
                    color: #1e293b !important;
                    font-weight: 700 !important;
                    padding: 10px 10px !important;
                    border-bottom: 2px solid #cbd5e1 !important;
                    border-right: 1px solid #e2e8f0 !important;
                    font-size: 10pt !important;
                }
                #maintable thead th:last-child {
                    border-right: none !important;
                }
                #maintable thead th a {
                    color: #1e293b !important;
                    text-decoration: underline !important;
                }

                /* Tuoterivien perussolut */
                #maintable tbody tr.keraysrivi > td {
                    padding: 8px 10px !important;
                    border-bottom: 1px solid #cbd5e1 !important;
                    border-right: 1px solid #e2e8f0 !important;
                    vertical-align: middle !important;
                    color: #0f172a !important;
                    font-size: 10pt !important;
                    transition: background-color 0.12s ease !important;
                }
                #maintable tbody tr.keraysrivi > td:last-child {
                    border-right: none !important;
                }

                /* 1. PARITTOMAT TUOTERIVIT (KERÄÄMÄTTÄ): Puhdas valkoinen */
                #maintable tbody tr.keraysrivi.ai-keraa-odd:not(.yksittainenrivikeruu_keratytrivit) > td,
                #maintable tbody tr.ai-keraa-comment-odd > td {
                    background-color: #ffffff !important;
                }

                /* 2. PARILLISET TUOTERIVIT (KERÄÄMÄTTÄ): Neutraali pehmeä harmaa/liuskekivi */
                #maintable tbody tr.keraysrivi.ai-keraa-even:not(.yksittainenrivikeruu_keratytrivit) > td,
                #maintable tbody tr.ai-keraa-comment-even > td {
                    background-color: #f3f4f6 !important;
                }

                /* Hover-korostus riville (hiiri tai sormikosketus) */
                #maintable tbody tr.keraysrivi.aktiivi:hover > td {
                    background-color: #e5e7eb !important;
                }

                /* ========================================================================= */
                /* KERÄTYT RIVIT - Maksimaalinen erottuvuus ja vahva vihreä kuittaus */
                /* ========================================================================= */
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit,
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit > td {
                    background-color: #d1fae5 !important;
                    color: #064e3b !important;
                    border-bottom: 2px solid #a7f3d0 !important;
                }

                #maintable tbody tr.yksittainenrivikeruu_keratytrivit > td:first-child {
                    border-left: 8px solid #059669 !important;
                }

                #maintable tbody tr.yksittainenrivikeruu_keratytrivit:hover > td {
                    background-color: #a7f3d0 !important;
                }

                /* Kerätyn rivin tuotekoodi ja nimitys */
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit td a {
                    color: #047857 !important;
                    font-weight: 800 !important;
                }

                #maintable tbody tr.yksittainenrivikeruu_keratytrivit td[id$='_varattu'] {
                    color: #064e3b !important;
                    font-weight: 800 !important;
                }

                /* Kerätyn rivin painike: selkeä VIHREÄ kuittausnappi */
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit button.kerattavatrivit {
                    background-color: #059669 !important;
                    color: #ffffff !important;
                    font-weight: 800 !important;
                    border: 1px solid #047857 !important;
                    box-shadow: 0 1px 3px rgba(5, 150, 105, 0.3) !important;
                }
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit button.kerattavatrivit:hover {
                    background-color: #047857 !important;
                }

                /* OK-kuittausikoni / teksti selkeänä vihreänä laattana */
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit font.ok,
                #maintable tbody tr.yksittainenrivikeruu_keratytrivit .kerattavatrivit_info font {
                    display: inline-block !important;
                    background-color: #059669 !important;
                    color: #ffffff !important;
                    font-weight: 900 !important;
                    font-size: 10pt !important;
                    padding: 3px 8px !important;
                    border-radius: 4px !important;
                    margin-left: 6px !important;
                    vertical-align: middle !important;
                }

                /* ========================================================================= */
                /* KERÄYSKOMMENTTI - Yhdistetty saumattomasti yläpuoliseen tuotteeseen */
                /* ========================================================================= */
                #maintable tbody tr.ai-has-comment > td {
                    border-bottom: none !important;
                }

                #maintable tbody tr.ai-keraa-kommentti > td {
                    border-top: none !important;
                    padding: 0 10px 10px 10px !important;
                    border-bottom: 2px solid #cbd5e1 !important;
                }

                .ai-kommentti-box {
                    display: flex !important;
                    align-items: center !important;
                    gap: 10px !important;
                    background-color: #fffbeb !important;
                    border: 2px solid #f59e0b !important;
                    border-left: 6px solid #d97706 !important;
                    border-radius: 6px !important;
                    padding: 8px 14px !important;
                    margin: 0 6px 4px 40px !important;
                    box-shadow: 0 2px 4px rgba(217, 119, 6, 0.12) !important;
                }

                .ai-kommentti-icon {
                    font-size: 18px !important;
                    line-height: 1 !important;
                    color: #d97706 !important;
                    flex-shrink: 0 !important;
                }

                .ai-kommentti-text {
                    font-size: 10.5pt !important;
                    font-weight: 800 !important;
                    color: #78350f !important;
                    word-break: break-word !important;
                }

                /* Määrä-solun selkeys ja huomioarvo */
                #maintable tbody tr.keraysrivi td[id$='_varattu'] {
                    font-size: 13pt !important;
                    font-weight: 800 !important;
                    color: #0f172a !important;
                    text-align: center !important;
                }

                /* Tuotekoodit ja linkit selkeämmin esiin keräämättömillä riveillä */
                #maintable tbody tr.keraysrivi:not(.yksittainenrivikeruu_keratytrivit) td a {
                    color: #0284c7 !important;
                    font-weight: 700 !important;
                    font-size: 10.5pt !important;
                }

                /* Kerää-painikkeen tyyli keräämättömille riveille */
                #maintable tbody tr.keraysrivi:not(.yksittainenrivikeruu_keratytrivit) button.kerattavatrivit {
                    background-color: #0284c7 !important;
                    color: #ffffff !important;
                    font-weight: bold !important;
                    padding: 6px 14px !important;
                    border-radius: 4px !important;
                    border: none !important;
                    cursor: pointer !important;
                    font-size: 9.5pt !important;
                    box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important;
                }
                #maintable tbody tr.keraysrivi:not(.yksittainenrivikeruu_keratytrivit) button.kerattavatrivit:hover {
                    background-color: #0369a1 !important;
                }
                /* ========================================================================= */
                /* SKAALAUTUVA JA LAITEOPTIMOITU KERÄILYTAULUKKO (#maintable)                */
                /* ========================================================================= */
                form[name*="rivit"], form#rivit_form {
                    display: block !important;
                    width: 100% !important;
                    max-width: 100% !important;
                    box-sizing: border-box !important;
                    overflow-x: auto !important;
                }

                #maintable {
                    width: 100% !important;
                    min-width: 100% !important;
                    max-width: 100% !important;
                    table-layout: auto !important;
                    border-collapse: separate !important;
                    border-spacing: 0 !important;
                    box-sizing: border-box !important;
                }

                /* 1. SARAKE: PAIKKA + VARASTOPAIKKASIIRTO (Kompakti, rinnakkain) */
                #maintable th:nth-of-type(1),
                #maintable th#paikka_header,
                #maintable tbody tr.keraysrivi > td:nth-of-type(1),
                #maintable tr.keraysrivi > td:nth-of-type(1) {
                    width: 240px !important;
                    min-width: 230px !important;
                    max-width: 255px !important;
                    white-space: nowrap !important;
                    vertical-align: middle !important;
                    padding: 6px 8px !important;
                    box-sizing: border-box !important;
                }

                #maintable tbody tr.keraysrivi > td:nth-of-type(1) select,
                #maintable tr.keraysrivi > td:nth-of-type(1) select {
                    min-width: 105px !important;
                    width: auto !important;
                    max-width: 125px !important;
                    height: 24px !important;
                    line-height: 22px !important;
                    padding: 1px 18px 1px 6px !important;
                    font-size: 9.5pt !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 4px !important;
                    background-color: #ffffff !important;
                    color: #1e293b !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }

                /* 2. SARAKE: TUOTENUMERO (Siisti ja kompakti, ei syö tilaa Nimitykseltä) */
                #maintable th:nth-of-type(2),
                #maintable tbody tr.keraysrivi > td:nth-of-type(2),
                #maintable tr.keraysrivi > td:nth-of-type(2) {
                    width: 130px !important;
                    min-width: 110px !important;
                    max-width: 150px !important;
                    white-space: nowrap !important;
                    vertical-align: middle !important;
                    padding: 6px 10px !important;
                    text-align: left !important;
                    box-sizing: border-box !important;
                }

                /* 3. SARAKE: NIMITYS - JOUSTAVA PÄÄSARAKE JOKA SKAALAUTUU IKKUNAN MUKAAN */
                #maintable th:nth-of-type(3),
                #maintable tbody tr.keraysrivi > td:nth-of-type(3),
                #maintable tr.keraysrivi > td:nth-of-type(3) {
                    width: auto !important;
                    min-width: 240px !important;
                    vertical-align: middle !important;
                    padding: 6px 12px !important;
                    text-align: left !important;
                    word-break: normal !important;
                    overflow-wrap: break-word !important;
                    line-height: 1.35 !important;
                    font-size: 9.5pt !important;
                    color: #1e293b !important;
                    box-sizing: border-box !important;
                }

                /* 4. SARAKE: MÄÄRÄ */
                #maintable th:nth-of-type(4),
                #maintable tbody tr.keraysrivi > td:nth-of-type(4),
                #maintable tr.keraysrivi > td:nth-of-type(4) {
                    width: 50px !important;
                    min-width: 44px !important;
                    max-width: 55px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding: 6px 4px !important;
                    box-sizing: border-box !important;
                }

                /* 5. SARAKE: YKSIKKÖ */
                #maintable th:nth-of-type(5),
                #maintable tbody tr.keraysrivi > td:nth-of-type(5),
                #maintable tr.keraysrivi > td:nth-of-type(5) {
                    width: 45px !important;
                    min-width: 40px !important;
                    max-width: 50px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding: 6px 4px !important;
                    color: #475569 !important;
                    font-size: 9pt !important;
                    box-sizing: border-box !important;
                }

                /* 6. SARAKE: POIKKEAVA MÄÄRÄ */
                #maintable th:nth-of-type(6),
                #maintable tbody tr.keraysrivi > td:nth-of-type(6),
                #maintable tr.keraysrivi > td:nth-of-type(6) {
                    width: 65px !important;
                    min-width: 60px !important;
                    max-width: 75px !important;
                    white-space: nowrap !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding: 6px 4px !important;
                    box-sizing: border-box !important;
                }

                #maintable tr.keraysrivi > td:nth-of-type(6) input.poikkeava_maara {
                    width: 42px !important;
                    height: 24px !important;
                    text-align: center !important;
                    padding: 2px !important;
                    font-size: 9.5pt !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 4px !important;
                    box-sizing: border-box !important;
                }

                /* 7. SARAKE: POIKKEAMAN KÄSITTELY */
                #maintable th:nth-of-type(7),
                #maintable tbody tr.keraysrivi > td:nth-of-type(7),
                #maintable tr.keraysrivi > td:nth-of-type(7) {
                    width: 110px !important;
                    min-width: 95px !important;
                    max-width: 120px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding: 6px 4px !important;
                    box-sizing: border-box !important;
                }

                #maintable tr.keraysrivi > td:nth-of-type(7) select {
                    width: 100% !important;
                    max-width: 115px !important;
                    height: 24px !important;
                    padding: 2px 4px !important;
                    font-size: 9pt !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 4px !important;
                    box-sizing: border-box !important;
                }

                /* 8. SARAKE: MERKKAA KERÄTYKSI */
                #maintable th:nth-of-type(8),
                #maintable tbody tr.keraysrivi > td:nth-of-type(8),
                #maintable tr.keraysrivi > td:nth-of-type(8) {
                    width: 90px !important;
                    min-width: 80px !important;
                    max-width: 105px !important;
                    text-align: center !important;
                    vertical-align: middle !important;
                    padding: 6px 6px !important;
                    white-space: nowrap !important;
                    box-sizing: border-box !important;
                }

                #maintable tfoot select {
                    max-width: 320px !important;
                }
            `;
            document.head.appendChild(style);
        }

        paivitaKeraaRivit();
        sovitaVarastopaikkasiirtoPainikkeet();

        if (table.dataset.aiInitialized) return;
        table.dataset.aiInitialized = 'true';

        table.addEventListener('click', () => {
            setTimeout(paivitaKeraaRivit, 100);
            setTimeout(paivitaKeraaRivit, 400);
            setTimeout(paivitaKeraaRivit, 800);
            setTimeout(alustaPikasiirtoPainikkeet, 200);
        });

        const tbody = table.querySelector('tbody') || table;
        if (window.MutationObserver) {
            const observer = new MutationObserver(() => {
                paivitaKeraaRivit();
                sovitaVarastopaikkasiirtoPainikkeet();
            });
            observer.observe(tbody, { childList: true });
        }
    }

    // =========================================================================
async function fetchProductLocations(tuoteno) {
        const cleanSku = String(tuoteno || '').trim();
        if (!cleanSku) throw new Error('Tuotenumero puuttuu');

        const params = new URLSearchParams();
        params.set('tee', 'M');
        params.set('tuoteno', cleanSku);
        params.set('toim', '');

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: params.toString()
        });

        if (!res.ok) {
            throw new Error(`Palvelin vastasi virheellä: ${res.status}`);
        }

        const buffer = await res.arrayBuffer();
        let html = '';
        try {
            html = new TextDecoder('utf-8').decode(buffer);
            if (html.includes('\uFFFD')) {
                html = new TextDecoder('iso-8859-1').decode(buffer);
            }
        } catch (e) {
            html = new TextDecoder('iso-8859-1').decode(buffer);
        }

        const doc = new DOMParser().parseFromString(html, 'text/html');

        const parseSelectOptions = (sel) => {
            if (!sel) return [];
            return Array.from(sel.options)
                .filter(opt => opt.value && opt.value.trim() !== '')
                .map(opt => {
                    const id = opt.value.trim();
                    const rawLabel = (opt.textContent || '').trim();
                    const m = rawLabel.match(/\(([-]?\d+(?:\.\d+)?)\)/);
                    const qty = m ? parseFloat(m[1]) : 0;
                    return {
                        id,
                        label: rawLabel,
                        qty,
                        selected: opt.selected
                    };
                });
        };

        const mistaSel = doc.querySelector('select[name="mista"]');
        const minneSel = doc.querySelector('select[name="minne"]');

        let sourceLocations = parseSelectOptions(mistaSel);
        let targetLocations = parseSelectOptions(minneSel);

        if (sourceLocations.length === 0 && targetLocations.length > 0) {
            sourceLocations = [...targetLocations];
        }
        if (targetLocations.length === 0 && sourceLocations.length > 0) {
            targetLocations = [...sourceLocations];
        }

        let productName = '';
        const allTh = Array.from(doc.querySelectorAll('th, h2, h3, .head, font.head'));
        const nameHeader = allTh.find(el => {
            const txt = (el.textContent || '').trim();
            return txt.includes(cleanSku) && !txt.includes('Tuotteen varastopaikat');
        });
        if (nameHeader) {
            productName = nameHeader.textContent.replace(cleanSku, '').replace(/^[\s\-:]+/, '').trim();
        }

        return {
            sku: cleanSku,
            productName,
            sourceLocations,
            targetLocations
        };
    }

    async function executeStockTransfer({ tuoteno, mistaId, minneId, maara, selite }) {
        const cleanSku = String(tuoteno || '').trim();
        const cleanQty = parseFloat(String(maara).replace(',', '.'));

        if (!cleanSku) throw new Error('Tuotenumero puuttuu');
        if (!mistaId) throw new Error('Lähettävä varastopaikka puuttuu');
        if (!minneId) throw new Error('Vastaanottava varastopaikka puuttuu');
        if (isNaN(cleanQty) || cleanQty <= 0) throw new Error('Siirrettävä määrä on virheellinen');

        const params = new URLSearchParams();
        params.set('tee', 'N');
        params.set('toim', '');
        params.set('tuoteno', cleanSku);
        params.set('mista', String(mistaId).trim());
        params.set('minne', String(minneId).trim());
        params.set('asaldo', String(cleanQty));
        params.set('selite', (selite || 'Keräilysiirto').trim());

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: params.toString()
        });

        if (!res.ok) {
            throw new Error(`Siirto epäonnistui (HTTP ${res.status})`);
        }

        const buffer = await res.arrayBuffer();
        let resHtml = '';
        try {
            resHtml = new TextDecoder('utf-8').decode(buffer);
            if (resHtml.includes('\uFFFD')) {
                resHtml = new TextDecoder('iso-8859-1').decode(buffer);
            }
        } catch (e) {
            resHtml = new TextDecoder('iso-8859-1').decode(buffer);
        }

        const doc = new DOMParser().parseFromString(resHtml, 'text/html');
        const errFont = doc.querySelector('font[color="red"], .error, font.error');
        if (errFont && errFont.textContent.trim()) {
            throw new Error(errFont.textContent.trim());
        }

        return true;
    }

    async function addNewLocationToProduct(tuoteno, newLocationStr) {
        const cleanSku = String(tuoteno || '').trim();
        const cleanLoc = String(newLocationStr || '').trim();
        if (!cleanSku || !cleanLoc) throw new Error('Uusi varastopaikka puuttuu');

        const params = new URLSearchParams();
        params.set('tee', 'UUSIPAIKKA_VIIVAKOODI');
        params.set('toim', '');
        params.set('tuoteno', cleanSku);
        params.set('paikkalahde', 'VAPAA');
        params.set('hyllypaikka_viivakoodilla', cleanLoc);

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            },
            body: params.toString()
        });

        if (!res.ok) {
            throw new Error(`Uuden paikan luonti epäonnistui (HTTP ${res.status})`);
        }

        return true;
    }

    function createPikasiirtoModal(targetRow, sku, initialName, currentShelf, neededQty) {
        avaaVarastopaikkasiirtoModal(sku, initialName, (result) => {
            if (targetRow && result && result.targetLocName) {
                const rowSelect = targetRow.querySelector('select[name^="varastorekla"]');
                if (rowSelect) {
                    const cleanTarget = result.targetLocName
                        .replace(/\s*\[Oletuspaikka\]/gi, '')
                        .replace(/\s*\([^)]*\)/g, '')
                        .trim();
                    let existingOpt = Array.from(rowSelect.options).find(o => cleanTarget.includes(o.text.trim()) || o.text.trim().includes(cleanTarget));
                    if (!existingOpt) {
                        const newRowOpt = document.createElement('option');
                        newRowOpt.value = cleanTarget.replace(/\s+/g, '###');
                        newRowOpt.textContent = cleanTarget;
                        rowSelect.appendChild(newRowOpt);
                        rowSelect.value = newRowOpt.value;
                    } else {
                        rowSelect.value = existingOpt.value;
                    }
                }
            }
        }, neededQty, 'Keräilysiirto', currentShelf);
    }

    // Varmistetaan että Tee varastopaikkasiirto -painike asettuu suoraan hyllyvalikon perään samalle riville
    function sovitaVarastopaikkasiirtoPainikkeet() {
        const table = document.getElementById('maintable');
        if (!table) return;

        const rows = Array.from(table.querySelectorAll('tbody tr.keraysrivi, tr.keraysrivi'));
        rows.forEach(tr => {
            const paikkaTd = tr.children[0];
            if (!paikkaTd) return;

            const paikkaSelect = tr.querySelector('select[name^="varastorekla"]');
            if (paikkaSelect) {
                paikkaSelect.style.verticalAlign = 'middle';
                paikkaSelect.style.minWidth = '105px';
                paikkaSelect.style.width = 'auto';
                paikkaSelect.style.maxWidth = '125px';
                paikkaSelect.style.height = '24px';
                paikkaSelect.style.lineHeight = '22px';
                paikkaSelect.style.padding = '1px 18px 1px 6px';
                paikkaSelect.style.fontSize = '9.5pt';
                paikkaSelect.style.boxSizing = 'border-box';
                paikkaSelect.style.backgroundColor = '#ffffff';
                paikkaSelect.style.border = '1px solid #cbd5e1';
                paikkaSelect.style.borderRadius = '4px';
            }

            paikkaTd.style.whiteSpace = 'nowrap';
            paikkaTd.style.verticalAlign = 'middle';
            const brs = paikkaTd.querySelectorAll('br');
            brs.forEach(br => br.remove());

            let btn = tr.querySelector('.ai-pikasiirto-btn');
            if (!btn) {
                const codeInput = tr.querySelector('input.tuoteno_input, input[name^="rivin_puhdas_tuoteno"]');
                const sku = codeInput ? codeInput.value.trim() : (tr.querySelector('a')?.textContent || '').trim();
                if (!sku) return;

                const nameTd = tr.children[2];
                const prodName = nameTd ? (nameTd.textContent || '').trim() : '';

                const qtyTd = tr.children[3];
                const neededQty = qtyTd ? parseInt((qtyTd.textContent || '').trim(), 10) || 1 : 1;

                const currentShelf = paikkaSelect ? (paikkaSelect.options[paikkaSelect.selectedIndex]?.textContent || '').trim() : '';

                btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'ai-pikasiirto-btn';
                btn.textContent = 'Varastopaikkasiirto';
                btn.title = `Pikasiirto hyllystä toiseen: ${sku}`;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    createPikasiirtoModal(tr, sku, prodName, currentShelf, neededQty);
                };

                if (paikkaSelect) {
                    paikkaSelect.insertAdjacentElement('afterend', btn);
                } else {
                    paikkaTd.appendChild(btn);
                }
            } else {
                btn.textContent = 'Varastopaikkasiirto';
                if (paikkaSelect && btn.previousElementSibling !== paikkaSelect) {
                    paikkaSelect.insertAdjacentElement('afterend', btn);
                }
            }

            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.gap = '3px';
            btn.style.marginLeft = '4px';
            btn.style.marginTop = '0';
            btn.style.marginBottom = '0';
            btn.style.padding = '0 6px';
            btn.style.height = '23px';
            btn.style.minHeight = '23px';
            btn.style.maxHeight = '23px';
            btn.style.lineHeight = '21px';
            btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            btn.style.fontSize = '10px';
            btn.style.fontWeight = '700';
            btn.style.color = '#ffffff';
            btn.style.background = '#4f46e5';
            btn.style.border = '1px solid #4338ca';
            btn.style.borderRadius = '3px';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 1px 2px rgba(79, 70, 229, 0.2)';
            btn.style.verticalAlign = 'middle';
            btn.style.whiteSpace = 'nowrap';
            btn.style.boxSizing = 'border-box';
        });
    }

    // =========================================================================

    // ASETUKSET JA TILA
    // =========================================================================
    const STORAGE_KEY_SOUND = 'pupe_skannaus_sound_enabled';
    const STORAGE_KEY_ACTIVE = 'pupe_skannaus_mode_active';

    let soundEnabled = localStorage.getItem(STORAGE_KEY_SOUND) !== 'false'; // oletuksena päällä
    let scanModeActive = localStorage.getItem(STORAGE_KEY_ACTIVE) !== 'false'; // oletuksena päällä

    // Välimuisti EAN -> Tuotenumero
    const eanToSkuMap = new Map();
    let isPrefetchingEans = false;

    // Viivakoodinlukijan näppäimistöpuskuri (globaali kuuntelija)
    let scanBuffer = '';
    let lastKeyTime = 0;
    const SCANNER_CHAR_INTERVAL_MS = 100; // Tyypillinen skannerin merkkiväli on < 60ms, sallitaan pieni BT-latenssi

    // Web Audio konteksti äänipalautteelle
    let audioCtx = null;
    function getAudioContext() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        return audioCtx;
    }

    // =========================================================================
    // ÄÄNIPALAUTTEET (Syntetisoitu Web Audio API - ei ulkoisia äänitiedostoja)
    // =========================================================================
    function playTone(freq, durationMs, type = 'sine', startTimeOffset = 0, gainLevel = 0.15) {
        if (!soundEnabled) return;
        try {
            const ctx = getAudioContext();
            if (!ctx) return;

            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);

            gain.gain.setValueAtTime(0.001, ctx.currentTime + startTimeOffset);
            gain.gain.exponentialRampToValueAtTime(gainLevel, ctx.currentTime + startTimeOffset + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTimeOffset + (durationMs / 1000));

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(ctx.currentTime + startTimeOffset);
            osc.stop(ctx.currentTime + startTimeOffset + (durationMs / 1000) + 0.05);
        } catch (e) {
            console.warn('[Pupe-Skannaus] Äänen toisto epäonnistui:', e);
        }
    }

    // 1. Onnistunut keräys: raikas kaksiääninen "bli-blip" (587Hz -> 880Hz)
    function playSuccessChime() {
        playTone(587.33, 90, 'triangle', 0, 0.18);      // D5
        playTone(880.00, 150, 'triangle', 0.08, 0.22);  // A5
    }

    // 2. Tuote on jo kerätty: neutraali varoituspiippaus (440Hz x 2)
    function playWarningBeep() {
        playTone(440, 80, 'sine', 0, 0.15);
        playTone(440, 90, 'sine', 0.12, 0.15);
    }

    // 3. Virheääni: matala selkeä summeri (väärä tuote / ei tilauksella)
    function playErrorBuzzer() {
        playTone(220, 160, 'sawtooth', 0, 0.22);
        playTone(164.81, 200, 'sawtooth', 0.08, 0.25);
    }

    // 4. Koko tilaus kerätty: iloinen nousufanfaari (C5 -> E5 -> G5 -> C6)
    function playOrderCompleteFanfare() {
        playTone(523.25, 110, 'triangle', 0, 0.20);     // C5
        playTone(659.25, 110, 'triangle', 0.10, 0.20);   // E5
        playTone(783.99, 110, 'triangle', 0.20, 0.22);   // G5
        playTone(1046.50, 260, 'triangle', 0.30, 0.25);  // C6
    }

    // =========================================================================
    // VISUAALISET TYYLIT JA ANIMAATIOT
    // =========================================================================
    function injectScanStyles() {
        if (document.getElementById('ai-skannaus-styles')) return;
        const st = document.createElement('style');
        st.id = 'ai-skannaus-styles';
        st.textContent = `
            @keyframes aiScanFlashGreen {
                0% { background-color: #86efac !important; outline: 3px solid #22c55e !important; }
                50% { background-color: #bbf7d0 !important; outline: 2px solid #22c55e !important; }
                100% { background-color: inherit; outline: none; }
            }

            @keyframes aiScanFlashYellow {
                0% { background-color: #fde047 !important; outline: 3px solid #eab308 !important; }
                100% { background-color: inherit; outline: none; }
            }

            @keyframes aiScanFlashRed {
                0% { background-color: #fca5a5 !important; outline: 3px solid #ef4444 !important; }
                100% { background-color: inherit; outline: none; }
            }

            .ai-row-flash-success {
                animation: aiScanFlashGreen 1.2s ease-out !important;
            }

            .ai-row-flash-warning {
                animation: aiScanFlashYellow 1.2s ease-out !important;
            }

            #ai-scan-bar {
                margin: 10px 0 14px 0;
                padding: 14px 18px;
                background: #ffffff;
                color: #1e293b;
                border: 1px solid #cbd5e1;
                border-radius: 8px;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                gap: 12px;
            }

            .ai-scan-bar-top {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }

            .ai-scan-bar-title {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 15px;
                font-weight: 700;
                color: #1e293b;
                letter-spacing: 0.2px;
            }

            .ai-scan-bar-title span.badge {
                background: #f0fdf4;
                color: #166534;
                border: 1px solid #bbf7d0;
                padding: 3px 9px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .ai-scan-bar-controls {
                display: flex;
                align-items: center;
                gap: 8px;
                flex-wrap: wrap;
            }

            .ai-scan-toggle-btn {
                background: #f8fafc;
                color: #475569;
                border: 1px solid #cbd5e1;
                border-radius: 6px;
                padding: 8px 14px;
                font-size: 13px;
                font-weight: 600;
                min-height: 42px;
                cursor: pointer;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                gap: 6px;
                user-select: none;
                touch-action: manipulation;
                box-sizing: border-box;
            }
            .ai-scan-toggle-btn:hover {
                background: #f1f5f9;
                color: #0f172a;
                border-color: #94a3b8;
            }
            .ai-scan-toggle-btn.active {
                background: #f0f9ff;
                border-color: #0284c7;
                color: #0369a1;
                font-weight: 700;
            }

            .ai-scan-progress-pill {
                background: #f8fafc;
                color: #1e293b;
                border: 1px solid #cbd5e1;
                padding: 8px 14px;
                border-radius: 6px;
                font-size: 13px;
                font-weight: 700;
                display: inline-flex;
                align-items: center;
                min-height: 42px;
                box-sizing: border-box;
            }
            .ai-scan-progress-pill.all-done {
                background: #dcfce7 !important;
                border-color: #86efac !important;
                color: #15803d !important;
            }

            .ai-scan-input-wrap {
                display: flex;
                align-items: center;
                gap: 10px;
                background: #ffffff;
                border: 1.5px solid #cbd5e1;
                border-radius: 6px;
                padding: 4px 6px 4px 12px;
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
                box-sizing: border-box;
                transition: border-color 0.15s ease, box-shadow 0.15s ease;
            }
            .ai-scan-input-wrap:focus-within {
                border-color: #01a1eb;
                box-shadow: 0 0 0 3px rgba(1, 161, 235, 0.15);
            }

            #ai-scan-field {
                flex: 1;
                background: transparent;
                border: none;
                color: #0f172a;
                font-size: 16px;
                font-weight: 600;
                outline: none;
                padding: 8px 4px;
                min-width: 160px;
                min-height: 40px;
                box-sizing: border-box;
            }
            #ai-scan-field::placeholder {
                color: #94a3b8;
                font-size: 14px;
                font-weight: 400;
            }

            .ai-scan-submit-btn {
                background: #01a1eb;
                color: #ffffff;
                border: none;
                border-radius: 5px;
                padding: 8px 20px;
                font-weight: 700;
                font-size: 14px;
                min-height: 42px;
                cursor: pointer;
                touch-action: manipulation;
                transition: background-color 0.15s ease;
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .ai-scan-submit-btn:hover {
                background: #0088c7;
            }
            .ai-scan-submit-btn:active {
                background: #0077b0;
            }

            .ai-scan-status-line {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                font-size: 12.5px;
                min-height: 22px;
            }

            .ai-scan-status-msg {
                font-weight: 600;
                color: #334155;
                display: flex;
                align-items: center;
                gap: 6px;
            }

            #ai-scan-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 999999;
                min-width: 280px;
                max-width: 90vw;
                padding: 12px 20px;
                border-radius: 8px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 4px 16px rgba(0,0,0,0.12);
                display: none;
                transition: opacity 0.2s ease;
                box-sizing: border-box;
                text-align: center;
            }

            /* Tablet & Mobile optimointi */
            @media (max-width: 860px) {
                #ai-scan-bar {
                    margin: 8px 0 12px 0;
                    padding: 12px 14px;
                    gap: 10px;
                }
                .ai-scan-bar-top {
                    gap: 8px;
                }
                .ai-scan-bar-controls {
                    flex-grow: 1;
                    justify-content: flex-end;
                }
                .ai-scan-toggle-btn, .ai-scan-progress-pill {
                    min-height: 44px;
                    padding: 8px 12px;
                }
                #ai-scan-field {
                    min-height: 44px;
                    font-size: 16px;
                }
                .ai-scan-submit-btn {
                    min-height: 44px;
                    padding: 8px 20px;
                    font-size: 15px;
                }
            }

            @media (max-width: 600px) {
                .ai-scan-bar-top {
                    flex-direction: column;
                    align-items: stretch;
                    gap: 10px;
                }
                .ai-scan-bar-title {
                    justify-content: space-between;
                }
                .ai-scan-bar-controls {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    width: 100%;
                }
                .ai-scan-progress-pill {
                    grid-column: span 2;
                    justify-content: center;
                }
                .ai-scan-input-wrap {
                    padding: 4px 6px 4px 10px;
                }
                .ai-scan-status-line {
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 4px;
                }
            }

            @media (pointer: coarse), (max-width: 1024px) {
                /* Helpotetaan rivin kuittausta tablet-kosketusnäytöillä */
                button.kerattavatrivit,
                input.kerattavatrivit {
                    min-height: 40px !important;
                    min-width: 68px !important;
                    font-size: 13px !important;
                    font-weight: bold !important;
                    touch-action: manipulation !important;
                }
                table.tuotekysely td, table#maintable td {
                    padding-top: 8px !important;
                    padding-bottom: 8px !important;
                }
            }

            .ai-pikasiirto-btn {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                gap: 3px !important;
                height: 23px !important;
                min-height: 23px !important;
                max-height: 23px !important;
                line-height: 21px !important;
                padding: 0 6px !important;
                font-size: 10px !important;
                font-weight: 700 !important;
                margin-left: 4px !important;
                border-radius: 3px !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            /* ========================================================================= */
            /* SKAALAUTUVA JA LAITEOPTIMOITU KERÄILYTAULUKKO (#maintable)                */
            /* ========================================================================= */
            form[name*="rivit"], form#rivit_form {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                box-sizing: border-box !important;
                overflow-x: auto !important;
            }

            #maintable {
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
                table-layout: auto !important;
                border-collapse: separate !important;
                border-spacing: 0 !important;
                box-sizing: border-box !important;
            }

            /* 1. SARAKE: PAIKKA + VARASTOPAIKKASIIRTO (Kompakti, rinnakkain) */
            #maintable th:nth-of-type(1),
            #maintable th#paikka_header,
            #maintable tbody tr.keraysrivi > td:nth-of-type(1),
            #maintable tr.keraysrivi > td:nth-of-type(1) {
                width: 240px !important;
                min-width: 230px !important;
                max-width: 255px !important;
                white-space: nowrap !important;
                vertical-align: middle !important;
                padding: 6px 8px !important;
                box-sizing: border-box !important;
            }

            #maintable tbody tr.keraysrivi > td:nth-of-type(1) select,
            #maintable tr.keraysrivi > td:nth-of-type(1) select {
                min-width: 105px !important;
                width: auto !important;
                max-width: 125px !important;
                height: 24px !important;
                line-height: 22px !important;
                padding: 1px 18px 1px 6px !important;
                font-size: 9.5pt !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 4px !important;
                background-color: #ffffff !important;
                color: #1e293b !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            /* 2. SARAKE: TUOTENUMERO (Siisti ja kompakti, ei syö tilaa Nimitykseltä) */
            #maintable th:nth-of-type(2),
            #maintable tbody tr.keraysrivi > td:nth-of-type(2),
            #maintable tr.keraysrivi > td:nth-of-type(2) {
                width: 130px !important;
                min-width: 110px !important;
                max-width: 150px !important;
                white-space: nowrap !important;
                vertical-align: middle !important;
                padding: 6px 10px !important;
                text-align: left !important;
                box-sizing: border-box !important;
            }

            /* 3. SARAKE: NIMITYS - JOUSTAVA PÄÄSARAKE JOKA SKAALAUTUU IKKUNAN MUKAAN */
            #maintable th:nth-of-type(3),
            #maintable tbody tr.keraysrivi > td:nth-of-type(3),
            #maintable tr.keraysrivi > td:nth-of-type(3) {
                width: auto !important;
                min-width: 240px !important;
                vertical-align: middle !important;
                padding: 6px 12px !important;
                text-align: left !important;
                word-break: normal !important;
                overflow-wrap: break-word !important;
                line-height: 1.35 !important;
                font-size: 9.5pt !important;
                color: #1e293b !important;
                box-sizing: border-box !important;
            }

            /* 4. SARAKE: MÄÄRÄ */
            #maintable th:nth-of-type(4),
            #maintable tbody tr.keraysrivi > td:nth-of-type(4),
            #maintable tr.keraysrivi > td:nth-of-type(4) {
                width: 50px !important;
                min-width: 44px !important;
                max-width: 55px !important;
                white-space: nowrap !important;
                text-align: center !important;
                vertical-align: middle !important;
                padding: 6px 4px !important;
                box-sizing: border-box !important;
            }

            /* 5. SARAKE: YKSIKKÖ */
            #maintable th:nth-of-type(5),
            #maintable tbody tr.keraysrivi > td:nth-of-type(5),
            #maintable tr.keraysrivi > td:nth-of-type(5) {
                width: 45px !important;
                min-width: 40px !important;
                max-width: 50px !important;
                white-space: nowrap !important;
                text-align: center !important;
                vertical-align: middle !important;
                padding: 6px 4px !important;
                color: #475569 !important;
                font-size: 9pt !important;
                box-sizing: border-box !important;
            }

            /* 6. SARAKE: POIKKEAVA MÄÄRÄ */
            #maintable th:nth-of-type(6),
            #maintable tbody tr.keraysrivi > td:nth-of-type(6),
            #maintable tr.keraysrivi > td:nth-of-type(6) {
                width: 65px !important;
                min-width: 60px !important;
                max-width: 75px !important;
                white-space: nowrap !important;
                text-align: center !important;
                vertical-align: middle !important;
                padding: 6px 4px !important;
                box-sizing: border-box !important;
            }

            #maintable tr.keraysrivi > td:nth-of-type(6) input.poikkeava_maara {
                width: 42px !important;
                height: 24px !important;
                text-align: center !important;
                padding: 2px !important;
                font-size: 9.5pt !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 4px !important;
                box-sizing: border-box !important;
            }

            /* 7. SARAKE: POIKKEAMAN KÄSITTELY */
            #maintable th:nth-of-type(7),
            #maintable tbody tr.keraysrivi > td:nth-of-type(7),
            #maintable tr.keraysrivi > td:nth-of-type(7) {
                width: 110px !important;
                min-width: 95px !important;
                max-width: 120px !important;
                text-align: center !important;
                vertical-align: middle !important;
                padding: 6px 4px !important;
                box-sizing: border-box !important;
            }

            #maintable tr.keraysrivi > td:nth-of-type(7) select {
                width: 100% !important;
                max-width: 115px !important;
                height: 24px !important;
                padding: 2px 4px !important;
                font-size: 9pt !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 4px !important;
                box-sizing: border-box !important;
            }

            /* 8. SARAKE: MERKKAA KERÄTYKSI */
            #maintable th:nth-of-type(8),
            #maintable tbody tr.keraysrivi > td:nth-of-type(8),
            #maintable tr.keraysrivi > td:nth-of-type(8) {
                width: 90px !important;
                min-width: 80px !important;
                max-width: 105px !important;
                text-align: center !important;
                vertical-align: middle !important;
                padding: 6px 6px !important;
                white-space: nowrap !important;
                box-sizing: border-box !important;
            }

            #maintable tfoot select {
                max-width: 320px !important;
            }
        `;
        document.head.appendChild(st);
    }

    // =========================================================================
    // TOAST-ILMOITUKSET
    // =========================================================================
    let toastTimeout = null;
    function showToast(message, type = 'info') {
        let toast = document.getElementById('ai-scan-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ai-scan-toast';
            document.body.appendChild(toast);
        }

        if (toastTimeout) clearTimeout(toastTimeout);

        if (type === 'success') {
            toast.style.background = '#f0fdf4';
            toast.style.color = '#15803d';
            toast.style.border = '1px solid #86efac';
        } else if (type === 'warning') {
            toast.style.background = '#fefce8';
            toast.style.color = '#854d0e';
            toast.style.border = '1px solid #fef08a';
        } else if (type === 'error') {
            toast.style.background = '#fef2f2';
            toast.style.color = '#991b1b';
            toast.style.border = '1px solid #fecaca';
        } else {
            toast.style.background = '#ffffff';
            toast.style.color = '#1e293b';
            toast.style.border = '1px solid #cbd5e1';
        }

        toast.innerHTML = message;
        toast.style.display = 'block';

        toastTimeout = setTimeout(() => {
            if (toast) toast.style.display = 'none';
        }, 4000);
    }

    // =========================================================================
    // KERÄYSRIVIEN ANALYYSI JA HAKU
    // =========================================================================
    function getPickingRows() {
        const table = document.getElementById('maintable');
        if (!table) return [];

        const trList = Array.from(table.querySelectorAll('tbody tr.keraysrivi, tr.keraysrivi'));
        return trList.map(tr => {
            // Tuotenumero
            const inputSku = tr.querySelector('input.tuoteno_input, input[name^="rivin_puhdas_tuoteno"]');
            const linkSku = tr.children[1]?.querySelector('a');
            const rawSku = (inputSku?.value || linkSku?.textContent || tr.children[1]?.textContent || '').trim();

            // Tuotenimi
            const prodName = (tr.children[2]?.textContent || '').trim();

            // Määrä
            const qtyText = (tr.children[3]?.textContent || '').trim();
            const qty = parseInt(qtyText, 10) || 1;

            // Kerää / Päivitä -painike
            const button = tr.querySelector('button.kerattavatrivit');
            const tunnus = button ? button.value : '';

            // Tila: Onko jo kerätty?
            const isKeratty = tr.classList.contains('yksittainenrivikeruu_keratytrivit') ||
                              Boolean(tr.querySelector('.kerattavatrivit_info')?.innerHTML.includes('OK')) ||
                              (button?.textContent?.trim() === 'Päivitä');

            return {
                element: tr,
                sku: rawSku,
                name: prodName,
                qty: qty,
                button: button,
                tunnus: tunnus,
                isCollected: isKeratty
            };
        }).filter(r => r.sku && r.button);
    }

    // Normalisoi koodi vertailua varten (poistaa välilyönnit, viivat jne. löyhää vertailua varten)
    function cleanCode(str) {
        return String(str || '').trim().toUpperCase();
    }
    function relaxedCode(str) {
        return cleanCode(str).replace(/[\s\-_.\/]/g, '');
    }

    // Päivittää tilauspalkin edistymistiedon (esim. "3 / 4 riviä kerätty (75%)")
    function updateProgressStatus() {
        const rows = getPickingRows();
        if (rows.length === 0) return;

        const collectedCount = rows.filter(r => r.isCollected).length;
        const totalCount = rows.length;
        const percent = Math.round((collectedCount / totalCount) * 100);

        const pill = document.getElementById('ai-scan-progress-pill');
        if (pill) {
            pill.textContent = `📊 ${collectedCount} / ${totalCount} kerätty (${percent}%)`;
            if (collectedCount === totalCount) {
                pill.classList.add('all-done');
                pill.textContent = `🎉 Kaikki kerätty! (${totalCount}/${totalCount})`;
            } else {
                pill.classList.remove('all-done');
            }
        }
    }

    // =========================================================================
    // EAN-KOODIEN TAUSTAHAKU (PREFETCH)
    // =========================================================================
    async function prefetchOrderEans() {
        if (isPrefetchingEans) return;
        isPrefetchingEans = true;

        const rows = getPickingRows();
        const uniqueSkus = Array.from(new Set(rows.map(r => r.sku)));

        console.log(`[Pupe-Skannaus] Aloitetaan EAN-taustahaku ${uniqueSkus.length} eri tuotteelle...`);

        for (const sku of uniqueSkus) {
            try {
                // Haetaan tuotetiedot tuote.php:sta taustalla
                const res = await fetch(`/tuote.php?tee=Z&tuoteno=${encodeURIComponent(sku)}`, {
                    credentials: 'include'
                });
                if (!res.ok) continue;

                const text = await res.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');

                // Etsitään eankoodi: tuote.php:ssa eankoodi on solussa tuotenumeron vieressä
                // Esim: <td>6430072080031</td>
                const cells = Array.from(doc.querySelectorAll('td'));
                for (const td of cells) {
                    const txt = (td.textContent || '').trim();
                    // Jos solu sisältää 8-14 numeroisen EAN/GTIN-koodin
                    if (/^\d{8,14}$/.test(txt)) {
                        eanToSkuMap.set(txt, sku);
                        console.log(`[Pupe-Skannaus] EAN löydetty tuotteelle ${sku}: ${txt}`);
                        break;
                    }
                }
            } catch (e) {
                // Hiljainen ohitus
            }
        }

        console.log(`[Pupe-Skannaus] EAN-taustahaku valmis. Yhdistettyjä EAN-koodeja: ${eanToSkuMap.size}`);
    }

    // Yrittää selvittää EAN-koodin suoralla kyselyllä, jos sitä ei löydy muistista
    async function resolveEanDirectly(scannedCode) {
        if (eanToSkuMap.has(scannedCode)) {
            return eanToSkuMap.get(scannedCode);
        }

        if (!/^\d{6,14}$/.test(scannedCode)) return null;

        try {
            console.log(`[Pupe-Skannaus] Haetaan tuntematonta viivakoodia ${scannedCode} tuotehausta...`);
            const res = await fetch(`/tuote.php?tee=Z&tuoteno=${encodeURIComponent(scannedCode)}`, {
                credentials: 'include'
            });
            if (!res.ok) return null;

            const text = await res.text();
            const doc = new DOMParser().parseFromString(text, 'text/html');

            // Tarkistetaan vastaako tulos jotain tilausrivin tuotenumeroa
            const rows = getPickingRows();
            const orderSkus = rows.map(r => r.sku.toUpperCase());

            // Katsotaan löytyykö otsikoista tai linkeistä jokin tilauksen tuoteno
            const allLinksAndHeaders = Array.from(doc.querySelectorAll('a, th, td, h2, h3'));
            for (const el of allLinksAndHeaders) {
                const txt = (el.textContent || '').trim().toUpperCase();
                for (const orderSku of orderSkus) {
                    if (txt === orderSku || txt.includes(orderSku)) {
                        eanToSkuMap.set(scannedCode, orderSku);
                        return orderSku;
                    }
                }
            }
        } catch (e) {
            console.warn('[Pupe-Skannaus] Suora EAN-haku epäonnistui:', e);
        }
        return null;
    }

    // =========================================================================
    // SKANNAUKSEN KÄSITTELIJÄ (PÄÄLOGIIKKA)
    // =========================================================================
    async function handleScannedBarcode(rawBarcode) {
        if (!scanModeActive) {
            showToast('⚠️ Skannauskeräys on kytketty pois päältä yläpalkista.', 'warning');
            return;
        }

        const inputCode = cleanCode(rawBarcode);
        if (!inputCode) return;

        const statusMsgEl = document.getElementById('ai-scan-status-msg');
        if (statusMsgEl) {
            statusMsgEl.innerHTML = `<span>🔍 Tarkistetaan koodia <b>${escapeHtml(inputCode)}</b>...</span>`;
        }

        const rows = getPickingRows();
        if (rows.length === 0) {
            showToast('⛔ Keräysrivejä ei löytynyt sivulta.', 'error');
            playErrorBuzzer();
            return;
        }

        // 1. Etsitään täsmäävä tuotenumero:
        // A) Suora täsmäys tuotenumeroon (esim. "4-800331" tai "UP X4BMW-FRT.2")
        let matchedSku = null;
        const exactSkuMatch = rows.find(r => r.sku.toUpperCase() === inputCode);
        if (exactSkuMatch) {
            matchedSku = exactSkuMatch.sku;
        }

        // B) Löyhä täsmäys tuotenumeroon (ilman välilyöntejä/viivoja, esim. "4800331")
        if (!matchedSku) {
            const relInput = relaxedCode(inputCode);
            const relaxedMatch = rows.find(r => relaxedCode(r.sku) === relInput);
            if (relaxedMatch) {
                matchedSku = relaxedMatch.sku;
            }
        }

        // C) EAN-koodin välimuistihaku
        if (!matchedSku && eanToSkuMap.has(inputCode)) {
            matchedSku = eanToSkuMap.get(inputCode);
        }

        // D) Jos kyseessä on numeerinen viivakoodi (EAN/GTIN) eikä vielä muistissa, haetaan lennossa
        if (!matchedSku && /^\d{6,14}$/.test(inputCode)) {
            matchedSku = await resolveEanDirectly(inputCode);
        }

        // Jos koodia ei löydy tilaukselta ollenkaan:
        if (!matchedSku) {
            playErrorBuzzer();
            if (statusMsgEl) {
                statusMsgEl.innerHTML = `<span style="color:#dc2626;">⛔ Koodia <b>${escapeHtml(inputCode)}</b> ei löydy tältä tilaukselta!</span>`;
            }
            showToast(`⛔ Koodia <b>${escapeHtml(inputCode)}</b> ei löydy tilaukselta! Tarkista tuote.`, 'error');
            return;
        }

        // 2. Etsitään tilauksen rivit tälle tuotenumerolle
        const matchingRows = rows.filter(r => r.sku.toUpperCase() === matchedSku.toUpperCase());

        // Etsitään ensimmäinen rivi, jota EI ole vielä kerätty
        const uncollectedRow = matchingRows.find(r => !r.isCollected);

        if (!uncollectedRow) {
            // Kaikki tämän tuotteen rivit on jo kerätty!
            playWarningBeep();
            if (statusMsgEl) {
                statusMsgEl.innerHTML = `<span style="color:#b45309;">⚠️ Tuote <b>${escapeHtml(matchedSku)}</b> on jo kerätty!</span>`;
            }
            showToast(`⚠️ Tuote <b>${escapeHtml(matchedSku)}</b> on jo kerätty keräyslistalla.`, 'warning');

            // Korostetaan kyseistä riviä keltaisella huomiovärillä
            if (matchingRows[0]?.element) {
                const el = matchingRows[0].element;
                el.classList.remove('ai-row-flash-warning');
                void el.offsetWidth; // pakota reflow
                el.classList.add('ai-row-flash-warning');
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
        }

        // 3. KUUTATAAN RIVI KERÄTYKSI
        console.log(`[Pupe-Skannaus] Kuitataan rivi tuotteelle: ${matchedSku} (tunnus: ${uncollectedRow.tunnus})`);

        // 1. Klikataan Pupesoftin natiivia painiketta
        uncollectedRow.button.click();

        // 2. Kutsutaan myös jQuery-triggeriä siltä varalta että sivun oma jQuery kuuntelee tapahtumaa
        try {
            const jq = (typeof unsafeWindow !== 'undefined' && unsafeWindow.jQuery) || window.jQuery || window.$;
            if (jq) {
                jq(uncollectedRow.button).trigger('click');
            }
        } catch (e) {}

        // 3. Varmistus: Jos Pupesoftin AJAX ei jostain syystä lähtenyt, lähetetään natiivi AJAX-kutsu suoraan
        setTimeout(() => {
            const infoEl = document.getElementById(`kerattavatrivit_info_${uncollectedRow.tunnus}`);
            if (!infoEl || !infoEl.innerHTML.includes('OK')) {
                const tunnus = uncollectedRow.tunnus;
                const paikkaSel = uncollectedRow.element.querySelector(`select[name="varastorekla[${tunnus}]"]`);
                const paikkaVal = paikkaSel ? paikkaSel.value : '';
                let hyllyalue = '', hyllynro = '', hyllyvali = '', hyllytaso = '';
                if (paikkaVal && paikkaVal.includes('###')) {
                    const parts = paikkaVal.split('###');
                    hyllyalue = parts[0] || '';
                    hyllynro = parts[1] || '';
                    hyllyvali = parts[2] || '';
                    hyllytaso = parts[3] || '';
                }

                const poikkMaara = uncollectedRow.element.querySelector(`input[name="maara[${tunnus}]"]`)?.value || '';
                const poikkKas = uncollectedRow.element.querySelector(`select[name="poikkeama_kasittely[${tunnus}]"]`)?.value || '';

                const bodyParams = new URLSearchParams();
                bodyParams.set('ajax_toiminto', 'kerattavatrivit');
                bodyParams.set('tunnus', tunnus);
                bodyParams.set('hyllyalue', hyllyalue);
                bodyParams.set('hyllynro', hyllynro);
                bodyParams.set('hyllyvali', hyllyvali);
                bodyParams.set('hyllytaso', hyllytaso);
                bodyParams.set('poikkeava_maara', poikkMaara);
                bodyParams.set('poikkeama_kasittely', poikkKas);
                bodyParams.set('no_head', 'yes');
                bodyParams.set('ohje', 'off');

                fetch(window.location.pathname || '/tilauskasittely/keraa.php', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: bodyParams.toString()
                }).then(r => r.text()).then(() => {
                    if (infoEl) infoEl.innerHTML = '<font class="ok">OK</font>';
                    uncollectedRow.element.classList.remove('aktiivi');
                    uncollectedRow.element.classList.add('yksittainenrivikeruu_keratytrivit');
                    uncollectedRow.button.textContent = 'Päivitä';
                }).catch(() => {});
            }
        }, 200);

        // Visuaalinen palaute riville (vihreä korostusanimaatio)
        const rowEl = uncollectedRow.element;
        rowEl.classList.remove('ai-row-flash-success');
        void rowEl.offsetWidth;
        rowEl.classList.add('ai-row-flash-success');
        rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Päivitetään tila ja ääni
        uncollectedRow.isCollected = true;

        // Tarkistetaan oliko tämä tilauksen viimeinen keräämätön rivi
        const remainingUncollected = rows.filter(r => !r.isCollected && r !== uncollectedRow);
        if (remainingUncollected.length === 0) {
            playOrderCompleteFanfare();
            if (statusMsgEl) {
                statusMsgEl.innerHTML = `<span style="color:#15803d;">🎉 <b>Valmista!</b> Kaikki rivit kerätty!</span>`;
            }
            showToast(`🎉 <b>Kaikki tilauksen tuotteet on kerätty!</b> Voit siirtyä rahtikirjaan.`, 'success');
        } else {
            playSuccessChime();
            if (statusMsgEl) {
                statusMsgEl.innerHTML = `<span style="color:#15803d;">✅ Kuitattu: <b>${escapeHtml(matchedSku)}</b> - ${escapeHtml(uncollectedRow.name)} (${uncollectedRow.qty} kpl)</span>`;
            }
            showToast(`✅ Kuitattu kerätyksi: <b>${escapeHtml(matchedSku)}</b> (${uncollectedRow.qty} kpl)`, 'success');
        }

        setTimeout(updateProgressStatus, 250);
        setTimeout(updateProgressStatus, 700);
    }

    // =========================================================================
    // KÄYTTÖLIITTYMÄ: SKANNAUSPALKKI JA SYÖTTEET
    // =========================================================================
    function renderScanBar() {
        if (document.getElementById('ai-scan-bar')) return;

        const table = document.getElementById('maintable');
        if (!table) return;

        const scanBar = document.createElement('div');
        scanBar.id = 'ai-scan-bar';
        scanBar.innerHTML = `
            <div class="ai-scan-bar-top">
                <div class="ai-scan-bar-title">
                    <span style="font-size:18px;">📱</span>
                    <span>SKANNAUSKERÄYS</span>
                    <span class="badge">Aktiivinen</span>
                </div>
                <div class="ai-scan-bar-controls">
                    <button type="button" id="ai-toggle-sound" class="ai-scan-toggle-btn ${soundEnabled ? 'active' : ''}" title="Kytke piippausäänet päälle/pois">
                        ${soundEnabled ? '🔊 Äänet: Päällä' : '🔇 Äänet: Pois'}
                    </button>
                    <button type="button" id="ai-toggle-mode" class="ai-scan-toggle-btn ${scanModeActive ? 'active' : ''}" title="Ota skannauskeräys käyttöön tai poista se käytöstä">
                        ${scanModeActive ? '⚡ Skannaus: Päällä' : '⏸️ Skannaus: Pois'}
                    </button>
                    <div id="ai-scan-progress-pill" class="ai-scan-progress-pill">
                        📊 Ladataan...
                    </div>
                </div>
            </div>

            <div class="ai-scan-input-wrap">
                <span style="font-size:16px; user-select:none;">🔍</span>
                <input type="text" id="ai-scan-field" placeholder="Piippaa viivakoodi lukijalla tai kirjoita koodi ja paina Enter..." autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" inputmode="text">
                <button type="button" id="ai-scan-submit-btn" class="ai-scan-submit-btn" title="Kuittaa skannattu koodi">
                    Kuittaa
                </button>
            </div>

            <div class="ai-scan-status-line">
                <div id="ai-scan-status-msg" class="ai-scan-status-msg">
                    <span>Valmiina piippaukseen (Bluetooth / USB / näppäimistö)</span>
                </div>
                <div style="font-size:12px; color:#64748b;">
                    Vaihtoehtoinen keräystapa: Voit myös klikata rivejä normaalisti käsin.
                </div>
            </div>
        `;

        table.parentNode.insertBefore(scanBar, table);

        // Nappien tapahtumakuuntelijat
        const soundBtn = document.getElementById('ai-toggle-sound');
        soundBtn.onclick = () => {
            soundEnabled = !soundEnabled;
            localStorage.setItem(STORAGE_KEY_SOUND, soundEnabled ? 'true' : 'false');
            soundBtn.className = `ai-scan-toggle-btn ${soundEnabled ? 'active' : ''}`;
            soundBtn.innerHTML = soundEnabled ? '🔊 Äänet: Päällä' : '🔇 Äänet: Pois';
            if (soundEnabled) playSuccessChime();
        };

        const modeBtn = document.getElementById('ai-toggle-mode');
        modeBtn.onclick = () => {
            scanModeActive = !scanModeActive;
            localStorage.setItem(STORAGE_KEY_ACTIVE, scanModeActive ? 'true' : 'false');
            modeBtn.className = `ai-scan-toggle-btn ${scanModeActive ? 'active' : ''}`;
            modeBtn.innerHTML = scanModeActive ? '⚡ Skannaus: Päällä' : '⏸️ Skannaus: Pois';
            const statusMsgEl = document.getElementById('ai-scan-status-msg');
            if (statusMsgEl) {
                statusMsgEl.innerHTML = scanModeActive ?
                    '<span>Valmiina piippaukseen (Bluetooth / USB / näppäimistö)</span>' :
                    '<span style="color:#64748b;">Skannaus pois käytöstä. Klikkaa "Skannaus: Pois" aktivoidaksesi.</span>';
            }
        };

        const inputField = document.getElementById('ai-scan-field');
        const submitBtn = document.getElementById('ai-scan-submit-btn');

        const doInputSubmit = () => {
            const val = inputField.value.trim();
            if (val) {
                inputField.value = '';
                handleScannedBarcode(val);
            }
            inputField.focus();
        };

        submitBtn.onclick = doInputSubmit;
        inputField.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                doInputSubmit();
            }
        };

        // AUTOMAATTIKUUTTAUS SUORAAN SYÖTTEESTÄ:
        // Kun koodi tulee skannerilta, puhelimelta tai kameralla, se kuitataan VÄLITTÖMÄSTI
        let inputTimer = null;
        inputField.addEventListener('input', () => {
            const val = inputField.value.trim();
            if (!val) return;

            const rows = getPickingRows();
            const upper = cleanCode(val);
            const rel = relaxedCode(val);
            const isKnownSku = rows.some(r => cleanCode(r.sku) === upper || relaxedCode(r.sku) === rel);
            const isKnownEan = eanToSkuMap.has(upper);
            const looksLikeEan = /^\d{8,14}$/.test(upper);

            clearTimeout(inputTimer);

            if (isKnownSku || isKnownEan) {
                // Välitön kuittaus ilman minkäänlaista viivettä!
                inputField.value = '';
                handleScannedBarcode(val);
            } else {
                // Odotetaan hetki (75ms) että skannerin kaikki merkit ovat ehtineet kenttään, ja kuitataan automaattisesti
                inputTimer = setTimeout(() => {
                    const currentVal = inputField.value.trim();
                    if (currentVal.length >= 2) {
                        inputField.value = '';
                        handleScannedBarcode(currentVal);
                    }
                }, looksLikeEan ? 40 : 75);
            }
        });

        // Päivitetään edistymistieto
        updateProgressStatus();
    }

    // =========================================================================
    // GLOBAALI VIIVAKOODINLUKIJATUNNISTUS (KEYBOARD WEDGE LISTENER)
    // =========================================================================
    let globalScanTimer = null;

    function setupGlobalScannerListener() {
        const handleKeyDown = (e) => {
            if (e.__aiProcessed) return;
            e.__aiProcessed = true;
            if (!scanModeActive) return;

            // Jos Pikasiirto-ikkuna on auki, älä käsittele skannauksia keräyslistalle
            if (document.getElementById('ai-pikasiirto-overlay')) {
                return;
            }

            const activeEl = document.activeElement;
            const isOurField = activeEl && activeEl.id === 'ai-scan-field';
            const isKeraajaField = activeEl && (activeEl.name === 'keraajanro' || activeEl.id === 'keraajanro');
            
            // Sallitaan skannaus myös silloin kun kohdistus on keraajanro-kentässä (johon Pupesoft kohdistaa oletuksena)
            const isOtherInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT') && !isKeraajaField;

            if (isOtherInput && !isOurField) {
                // Älä häiritse kenttiin (esim. poikkeava määrä) kirjoittamista
                return;
            }

            const now = performance.now();
            const timeDiff = now - lastKeyTime;
            lastKeyTime = now;

            // Enter tai Tab päättää viivakoodin välittömästi
            if (e.key === 'Enter' || e.key === 'Tab') {
                clearTimeout(globalScanTimer);
                if (isOurField) {
                    return;
                }

                if (scanBuffer.length >= 2 && timeDiff < 160) {
                    const code = scanBuffer.trim();
                    scanBuffer = '';
                    if (code) {
                        e.preventDefault();
                        e.stopPropagation();

                        if (isKeraajaField && activeEl) {
                            activeEl.value = '';
                        }

                        handleScannedBarcode(code);
                    }
                }
                scanBuffer = '';
                return;
            }

            // Jos näppäin on funktionäppäin (Shift, Alt, Ctrl tms.)
            if (e.key.length !== 1) {
                return;
            }

            if (isOurField) {
                // Käyttäjä kirjoittaa suoraan skannauskenttään (hoidetaan input-tapahtumassa)
                return;
            }

            // Jos merkkien väli on liian pitkä (> 140ms), nollataan puskuri
            if (timeDiff > 140) {
                scanBuffer = '';
            }

            scanBuffer += e.key;

            // AUTOMAATTIKUUTTAUS HILJAISUUDESTA:
            // Jos skanneri ei lähetä Enteriä lainkaan (vain merkit nopeasti),
            // 85ms tauko viimeisen merkin jälkeen laukaisee automaattisen kuittauksen!
            clearTimeout(globalScanTimer);
            globalScanTimer = setTimeout(() => {
                if (scanBuffer.length >= 2) {
                    const code = scanBuffer.trim();
                    scanBuffer = '';
                    if (code) {
                        if (isKeraajaField && activeEl) {
                            activeEl.value = '';
                        }
                        handleScannedBarcode(code);
                    }
                }
            }, 85);
        };

        window.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('keydown', handleKeyDown, true);
    }

    // Apufunktio HTML-turvallisuudelle
    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }



    function getPageType() {
        const isTulostusjonoSivu = location.pathname.includes('lahetteen_tulostusjono.php') ||
                                  location.search.includes('lahetteen_tulostusjono.php') ||
                                  Boolean(document.querySelector('font.head')?.textContent.includes('Tulosta keräyslista'));

        const isKeraaSivu = !isTulostusjonoSivu && (
            location.pathname.includes('keraa.php') ||
            location.search.includes('keraa.php') ||
            Boolean(document.getElementById('maintable') || document.querySelector('#keraajalist, input[name="keraajanro"], #keraa_lista_table, #hakutable'))
        );

        const isKeraaYksittainenSivu = isKeraaSivu && Boolean(
            location.search.includes('id=') ||
            document.getElementById('maintable') ||
            document.getElementById('tilaus_id') ||
            document.querySelector('form[name="rivit"]')
        );

        const isKeraaListaSivu = isKeraaSivu && !isKeraaYksittainenSivu;

        const isSaapuminenSivu = Boolean(
            location.pathname.includes('keikka.php') ||
            location.search.includes('keikka.php') ||
            location.search.includes('toiminto=kohdista') ||
            document.querySelector('table.ostorivien_kohdistus')
        );

        return { isTulostusjonoSivu, isKeraaSivu, isKeraaYksittainenSivu, isKeraaListaSivu, isSaapuminenSivu };
    }

    // =========================================================================
    // SYNKRONOINTI & TALLENNUSTILA (localStorage + BroadcastChannel)
    // =========================================================================
    const STORAGE_KEY_CLAIMS = 'ai_pupe_picking_claims_v6';
    const STORAGE_KEY_USER = 'ai_pupe_current_picker_name';
    const SYNC_CHANNEL = 'ai_pupe_tyonjako_sync';

    // Siivotaan vanhat mahdollisesti virheelliset välimuistitiedot
    try {
        localStorage.removeItem('ai_pupe_picking_claims_v1');
        localStorage.removeItem('ai_pupe_picking_claims_v2');
        localStorage.removeItem('ai_pupe_picking_claims_v3');
        localStorage.removeItem('ai_pupe_picking_claims_v4');
        localStorage.removeItem('ai_pupe_picking_claims_v5');
    } catch (e) {}

    // Käyttäjäkirjasto Pupesoftin käyttäjätunnuksista koko nimiin
    const GLOBAL_USER_MAP = new Map([
        ['varasto', 'Varasto'],
        ['jere', 'Jere Vehmas'],
        ['aleksi', 'Aleksi Judin'],
        ['christer', 'Christer'],
        ['toni', 'Toni Palosaari'],
        ['eetu', 'Eetu Kinnunen'],
        ['girts', 'Girts Pavlins'],
        ['hanna', 'Hanna Hautamäki'],
        ['hedde', 'Hedde'],
        ['jarkko', 'Jarkko Saukonoja'],
        ['joni', 'Joni Syrjämäki'],
        ['katja', 'Katja Heikkinen'],
        ['kaur', 'Kaur Noormets'],
        ['kiia', 'Kiia Latvakoski'],
        ['kimmo', 'Kimmo'],
        ['konsta', 'Konsta Törne'],
        ['marika', 'Marika Partala'],
        ['marja', 'Marja Heinonen'],
        ['marko a', 'Marko Andsten'],
        ['marko', 'Marko Tammilehto'],
        ['matti', 'Matti Eskola'],
        ['olga', 'Olga'],
        ['pekka', 'Pekka Kinnunen'],
        ['peter', 'Peter Flodqvist'],
        ['micke', 'Petteri Krogerus'],
        ['piritta', 'Piritta Tanttari'],
        ['admin', 'Pupesoft'],
        ['riku', 'Riku Tolonen'],
        ['seija', 'Seija Kukkonen'],
        ['tatiana', 'Tatiana'],
        ['timo', 'Tilintarkastaja'],
        ['timppa', 'Timo Järvelä'],
        ['naumanen', 'Timo Naumanen'],
        ['tuotehallinta', 'Tuotehallinta'],
        ['valdis', 'Valdis Cinītis'],
        ['valtteri', 'Valtteri Karhukorpi'],
        ['veikka', 'Veikka Välimäki'],
        ['vytautas', 'Vytautas Brusokas'],
        ['webadmin', 'Webadmin']
    ]);

    let broadcast = null;
    try {
        if ('BroadcastChannel' in window) {
            broadcast = new BroadcastChannel(SYNC_CHANNEL);
        }
    } catch (e) {}

    function getClaims() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY_CLAIMS);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            const now = Date.now();
            const TTL_KERAYS_MS = 24 * 60 * 60 * 1000; // 24 tuntia aktiiviselle keräykselle
            const TTL_PRINT_MS = 60 * 24 * 60 * 60 * 1000; // 60 päivää tulostetulle tilaukselle
            const active = {};
            for (const [k, v] of Object.entries(parsed)) {
                if (!v || !v.timestamp) continue;
                // Hyväksytään tulostustiedoksi ainoastaan aito suorituskykylokin merkintä
                if (v.action === 'tulostettu' && v.source !== 'suorituskykyloki') continue;
                const ttl = v.action === 'kerayksessa' ? TTL_KERAYS_MS : TTL_PRINT_MS;
                if ((now - v.timestamp) < ttl) {
                    active[k] = v;
                }
            }
            return active;
        } catch (e) {
            return {};
        }
    }

    function formatClaimTime(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const now = new Date();
        const isToday = d.getDate() === now.getDate() &&
                        d.getMonth() === now.getMonth() &&
                        d.getFullYear() === now.getFullYear();
        const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) {
            return `${timePart}`;
        }
        const dayPart = `${d.getDate()}.${d.getMonth() + 1}.`;
        return `${dayPart} klo ${timePart}`;
    }

    function saveClaims(claims) {
        try {
            localStorage.setItem(STORAGE_KEY_CLAIMS, JSON.stringify(claims));
            if (broadcast) {
                broadcast.postMessage({ type: 'CLAIMS_UPDATED', claims });
            }
        } catch (e) {}
    }

    // Tunnistetaan kirjautunut käyttäjä.
    function getPickerName() {
        // 1. Luetaan Pupesoftin omasta kerääjävalikosta (keraa.php:n <select id="keraajalist">)
        const sel = document.getElementById('keraajalist');
        if (sel && sel.options && sel.selectedIndex >= 0) {
            const opt = sel.options[sel.selectedIndex];
            if (opt && opt.textContent.trim()) {
                const detectedName = opt.textContent.trim();
                if (detectedName.toLowerCase() !== 'varasto') {
                    localStorage.setItem(STORAGE_KEY_USER, detectedName);
                    return detectedName;
                }
            }
        }

        // 2. Etsitään Pupesoftin yläpalkista tai kehyksistä (top.php) kirjautuneen käyttäjän nimi
        try {
            const topDoc = window.top?.document || document;
            if (topDoc) {
                const topText = topDoc.body?.innerText || '';
                const match = topText.match(/(?:Käyttäjä|Kirjautunut|User):\s*([A-Za-zÅÄÖåäö\s]+?)(?:\s*\(|\s*\n|\s*\||$)/i);
                if (match && match[1] && match[1].trim().length > 2) {
                    const detectedName = match[1].trim();
                    localStorage.setItem(STORAGE_KEY_USER, detectedName);
                    return detectedName;
                }

                // Tunnistetaan Audioimportin yläkulman rakenne: "Oy Audioimport ... \n <Käyttäjän Nimi>"
                const nameMatch = topText.match(/Audioimport[^\n\r]*[\r\n]+\s*([A-ZÅÄÖ][A-Za-zÅÄÖåäö\s\-]{1,35})/);
                if (nameMatch && nameMatch[1]) {
                    const detectedName = nameMatch[1].split(/[\r\n]/)[0].trim();
                    if (detectedName) {
                        localStorage.setItem(STORAGE_KEY_USER, detectedName);
                        return detectedName;
                    }
                }
            }
        } catch (e) {}

        const saved = localStorage.getItem(STORAGE_KEY_USER);
        if (saved) return saved;

        return 'Varasto';
    }

    // Poimii keraa.php-rivin 4. sarakkeesta ("Laadittu / Valmis / Tulostettu") 3. rivin Tulostettu-aikaleiman
    function parseKeraaRowTulostettuTimestamp(cell) {
        if (!cell) return 0;
        const lines = cell.innerHTML
            .split(/<br\s*\/?>|\n/i)
            .map(s => s.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean);
        if (lines.length < 3) return 0;

        let day = 0, mon = 0, yr = 0;
        for (let i = 0; i < 3; i++) {
            const dm = lines[i].match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
            if (dm) {
                day = parseInt(dm[1], 10);
                mon = parseInt(dm[2], 10);
                yr = parseInt(dm[3], 10);
                if (yr < 100) yr += 2000;
            }
        }
        const tm = lines[2].match(/(\d{1,2}):(\d{2})/);
        if (!day || !mon || !yr || !tm) return 0;
        const hr = parseInt(tm[1], 10);
        const mn = parseInt(tm[2], 10);
        return new Date(yr, mon - 1, day, hr, mn, 0).getTime();
    }

    function claimOrder(orderNo, picker = null, action = 'kerayksessa') {
        const cleanNo = String(orderNo || '').trim();
        if (!cleanNo) return;
        const claims = getClaims();
        claims[cleanNo] = {
            picker: picker || getPickerName(),
            timestamp: Date.now(),
            action: action // 'tulostettu' tai 'kerayksessa'
        };
        saveClaims(claims);
        updateAllViews();
    }

    function releaseOrder(orderNo) {
        const cleanNo = String(orderNo || '').trim();
        if (!cleanNo) return;
        const claims = getClaims();
        if (claims[cleanNo]) {
            delete claims[cleanNo];
            saveClaims(claims);
            updateAllViews();
        }
    }

    function setSyncStatus(text, color = '#64748b') {
        const head = document.querySelector('font.head');
        if (!head) return;
        let el = document.getElementById('ai-tyonjako-sync-status');
        if (!el) {
            el = document.createElement('span');
            el.id = 'ai-tyonjako-sync-status';
            el.style.cssText = 'font-size: 11px; font-weight: normal; margin-left: 14px; text-transform: none; letter-spacing: normal; vertical-align: middle;';
            head.appendChild(el);
        }
        el.style.color = color;
        el.textContent = text;
    }

    // =========================================================================
    // NÄKYMÄ 1: KERÄÄ-OHJELMAN TILAUSLISTA (keraa.php)
    // =========================================================================
    let latestKeraaOrderInfos = [];

    function paivitaKeraaTilauslista() {
        const { isKeraaListaSivu } = getPageType();
        if (!isKeraaListaSivu) return;

        const claims = getClaims();
        const currentPicker = getPickerName();

        // 1. Lisätään oma "Tulostanut"- ja "Rahti"-sarakeotsikot taulukkoon
        const thList = Array.from(document.querySelectorAll('table tr th'));
        const keraaTh = thList.find(th => th.textContent.trim().includes('Kerää'));
        if (keraaTh && keraaTh.parentNode) {
            let thTulostanut = keraaTh.parentNode.querySelector('.ai-tulostanut-th');
            if (!thTulostanut) {
                thTulostanut = document.createElement('th');
                thTulostanut.className = 'ai-tulostanut-th';
                keraaTh.parentNode.insertBefore(thTulostanut, keraaTh);
            }
            thTulostanut.setAttribute('valign', 'top');
            thTulostanut.style.cssText = 'vertical-align: top; white-space: nowrap;';

            if (!thTulostanut.querySelector('.ai-tulostanut-sort-link')) {
                thTulostanut.innerHTML = '';
                const link = document.createElement('a');
                link.href = 'javascript:void(0)';
                link.className = 'ai-tulostanut-sort-link';
                link.textContent = 'Tulostanut';
                link.title = 'Järjestä tulostustiedon mukaan';
                link.style.cssText = 'color: #828282; text-decoration: underline; cursor: pointer;';

                let sortAsc = true;
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    sortAsc = !sortAsc;
                    const table = keraaTh.closest('table');
                    if (!table) return;
                    const tbody = table.querySelector('tbody') || table;
                    const rows = Array.from(tbody.querySelectorAll('tr')).filter(tr => tr.querySelector('.ai-tulostanut-td'));
                    rows.sort((a, b) => {
                        const textA = a.querySelector('.ai-tulostanut-td')?.textContent.trim() || '';
                        const textB = b.querySelector('.ai-tulostanut-td')?.textContent.trim() || '';
                        if (!textA && textB) return 1;
                        if (textA && !textB) return -1;
                        return sortAsc ? textA.localeCompare(textB) : textB.localeCompare(textA);
                    });
                    rows.forEach(r => tbody.appendChild(r));
                });

                thTulostanut.appendChild(link);
            }

            let thRahti = keraaTh.parentNode.querySelector('.ai-rahti-th');
            if (!thRahti) {
                thRahti = document.createElement('th');
                thRahti.className = 'ai-rahti-th';
                thRahti.setAttribute('valign', 'top');
                thRahti.style.cssText = 'text-align: left !important; vertical-align: top !important; padding: 5px !important; color: #828282; font-family: "Lato", "Helvetica", Arial, sans-serif; font-size: 10pt; font-weight: normal; white-space: nowrap;';
                thRahti.textContent = 'Rahti';
                if (keraaTh.nextSibling) {
                    keraaTh.parentNode.insertBefore(thRahti, keraaTh.nextSibling);
                } else {
                    keraaTh.parentNode.appendChild(thRahti);
                }
            }
        }

        // Korjataan mahdolliset yhteenvetorivien colspanit (+2: Tulostanut ja Rahti)
        const colspans = document.querySelectorAll('table tr th[colspan], table tr td[colspan]');
        colspans.forEach(el => {
            if (!el.dataset.aiColspanFixedV2) {
                el.dataset.aiColspanFixedV2 = 'true';
                const c = parseInt(el.getAttribute('colspan'), 10);
                if (c >= 6) {
                    const extra = el.dataset.aiColspanFixed ? 1 : 2;
                    el.setAttribute('colspan', String(c + extra));
                }
            }
        });

        // Etsitään kaikki taulukkorivit (tr), joissa on tilausnumero
        const rows = Array.from(document.querySelectorAll('table tr'));
        const missingOrders = [];
        const customerMap = new Map();
        const orderInfos = [];

        // PASS 1: Tunnistetaan ja kerätään rivien tilaustiedot ja ryhmitellään asiakkaittain
        rows.forEach(tr => {
            // Ohitetaan otsikkorivit (th)
            if (tr.querySelector('th')) return;

            const cells = Array.from(tr.children).filter(c => c.tagName === 'TD');
            if (cells.length < 3) return;

            let orderNo = '';
            let orderCell = null;

            // 1. Ensisijainen: Kerää-painikkeen value tai valintaruudun value
            const keraaBtn = tr.querySelector('button[name="tilaus"], input[name="tilaus"], button[value*="Kerä"], input[type="submit"][value*="Kerä"], button, a.nappi');
            const chkBox = tr.querySelector('input[type="checkbox"][name*="valitut"], input[type="checkbox"][value]');

            if (keraaBtn && keraaBtn.value && /^\d{5,8}$/.test(keraaBtn.value.trim())) {
                orderNo = keraaBtn.value.trim();
            } else if (chkBox && chkBox.value && /^\d{5,8}$/.test(chkBox.value.trim())) {
                orderNo = chkBox.value.trim();
            }

            // 2. Toissijainen: Tarkistetaan 2. sarake (Tilaus-sarake Pupesoftin keräyslistassa)
            if (!orderNo && cells[1]) {
                const m = cells[1].textContent.trim().match(/\b(\d{5,8})\b/);
                if (m) {
                    orderNo = m[1];
                    orderCell = cells[1];
                }
            }

            // 3. Etsitään 49-alkuinen 6-numeroinen tilausnumero mistä tahansa solusta
            if (!orderNo) {
                for (let i = 0; i < cells.length; i++) {
                    const txt = cells[i].textContent.trim();
                    if (txt.includes(':') || (txt.includes('.') && txt.length > 8)) continue;
                    const m = txt.match(/\b(49\d{4})\b/) || txt.match(/\b(\d{5,8})\b/);
                    if (m) {
                        orderNo = m[1];
                        orderCell = cells[i];
                        break;
                    }
                }
            }

            if (!orderNo) return;

            if (!orderCell) {
                orderCell = cells[1] || cells[0];
            }

            // Asiakkaan tiedot (cells[2])
            let asiakasNimi = '';
            let customerKey = '';
            if (cells[2]) {
                const parts = cells[2].innerHTML.split(/<br\s*\/?>|\n/i)
                    .map(s => s.replace(/<[^>]+>/g, '').trim())
                    .filter(Boolean);
                const ytunnus = parts.length > 1 ? parts[0] : '';
                const nameParts = parts.length > 1 ? parts.slice(1) : parts;
                asiakasNimi = nameParts.join(' ').replace(/\s+/g, ' ').trim();
                const cleanY = ytunnus.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const cleanN = asiakasNimi.toUpperCase().replace(/\s+/g, ' ').trim();
                customerKey = cleanN ? (cleanY ? `${cleanY}___${cleanN}` : cleanN) : (cleanY || '');
            }

            // Valmis-teksti (cells[3])
            let valmisText = '';
            if (cells[3]) {
                const lines = cells[3].innerHTML.split(/<br\s*\/?>|\n/i)
                    .map(s => s.replace(/<[^>]+>/g, '').trim())
                    .filter(Boolean);
                if (lines.length >= 2) {
                    valmisText = lines[1];
                } else if (lines.length === 1) {
                    valmisText = lines[0];
                }
            }

            // Toimitustapa (cells[5])
            const toimitustapaStr = cells[5] ? cells[5].textContent.trim() : '';
            const isDpd = /dpd/i.test(toimitustapaStr);

            // Rivimäärä (cells[6])
            const riviCount = cells[6] ? cells[6].textContent.trim() : '';

            // Tulostettu-aikaleima ja välimuistitarkistus
            const rowTulostettuTs = parseKeraaRowTulostettuTimestamp(cells[3]);
            let claim = claims[orderNo];

            if (claim) {
                const isInvalid = (claim.source !== 'suorituskykyloki') ||
                    (rowTulostettuTs > 0 && Math.abs(claim.timestamp - rowTulostettuTs) > 120000);
                if (isInvalid) {
                    delete claims[orderNo];
                    saveClaims(claims);
                    claim = null;
                }
            }

            if (!claim && rowTulostettuTs > 0) {
                missingOrders.push({ orderNo, tulostettuTs: rowTulostettuTs });
            }

            const keraaTd = keraaBtn ? keraaBtn.closest('td') : (cells[cells.length - 2] || cells[cells.length - 1]);
            const isPika = isOrderMarkedPika(orderNo);

            const orderObj = {
                tilausNumero: orderNo,
                customerKey: customerKey || orderNo,
                customerName: asiakasNimi || ('Tilaus #' + orderNo),
                toimitustapa: toimitustapaStr,
                riviCount,
                paino: '',
                valmisText,
                isPika,
                isDpd,
                row: tr,
                claim,
                keraaTd,
                keraaBtn
            };

            orderInfos.push(orderObj);

            if (customerKey) {
                if (!customerMap.has(customerKey)) {
                    customerMap.set(customerKey, []);
                }
                customerMap.get(customerKey).push(orderObj);
            }
        });

        latestKeraaOrderInfos = orderInfos;

        // PASS 2: Luodaan ja päivitetään jokaiselle riville Tulostanut- ja Rahti-solut
        orderInfos.forEach(ord => {
            const { tilausNumero: orderNo, row: tr, claim, keraaTd, keraaBtn } = ord;

            // 1. Luodaan tai etsitään rivikohtainen "Tulostanut"-solu (ennen Kerää-saraketta)
            let tdTulostanut = tr.querySelector('.ai-tulostanut-td');
            if (!tdTulostanut) {
                tdTulostanut = document.createElement('td');
                tdTulostanut.className = 'ai-tulostanut-td';
                tdTulostanut.style.cssText = 'padding: 5px; vertical-align: middle; white-space: nowrap; text-align: left;';
                if (keraaTd) {
                    keraaTd.parentNode.insertBefore(tdTulostanut, keraaTd);
                } else {
                    tr.appendChild(tdTulostanut);
                }
            }

            // Poistetaan vanhat päällekkäiset merkit solujen sisältä
            const oldOrderBadge = tr.querySelector('.ai-orderno-badge');
            if (oldOrderBadge) oldOrderBadge.remove();
            const oldKeraaBadge = tr.querySelector('.ai-keraa-row-badge');
            if (oldKeraaBadge) oldKeraaBadge.remove();

            if (!claim) {
                tr.style.backgroundColor = '';
                tdTulostanut.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">—</span>';
                if (keraaBtn) {
                    keraaBtn.style.outline = '';
                    keraaBtn.title = 'Aloita keräys';
                }
            } else {
                const timeStr = formatClaimTime(claim.timestamp);
                const isOwn = (claim.picker === currentPicker && currentPicker.toLowerCase() !== 'varasto');
                const rowBg = isOwn ? 'rgba(254, 240, 138, 0.40)' : 'rgba(254, 226, 226, 0.40)';
                const badgeBg = isOwn ? '#fef08a' : '#fee2e2';
                const badgeBorder = isOwn ? '#facc15' : '#fca5a5';
                const badgeColor = isOwn ? '#854d0e' : '#991b1b';
                const icon = isOwn ? '🟡' : '🔒';

                tr.style.backgroundColor = rowBg;

                const actionText = `Tulostanut: ${escapeHtml(claim.picker)} (${timeStr})`;
                tdTulostanut.innerHTML = `
                    <span style="color: ${badgeColor}; background: ${badgeBg}; border: 1px solid ${badgeBorder}; border-radius: 4px; padding: 3px 8px; font-weight: 700; font-size: 11px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap;" title="Tilaus #${orderNo}: ${escapeHtml(claim.picker)} (${timeStr})">
                        <span>${icon} ${actionText}</span>
                        <a href="#" class="ai-release-order-btn" title="Vapauta tilaus listalta" style="color: ${isOwn ? '#854d0e' : '#991b1b'}; opacity: 0.7; margin-left: 2px; text-decoration: none; font-size: 12px; font-weight: bold; line-height: 1;">✕</a>
                    </span>
                `;

                const relBtn = tdTulostanut.querySelector('.ai-release-order-btn');
                if (relBtn) {
                    relBtn.onclick = (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm(`Haluatko varmasti vapauttaa tilauksen #${orderNo} (${claim.picker})?`)) {
                            releaseOrder(orderNo);
                        }
                    };
                }

                if (keraaBtn) {
                    keraaBtn.title = `Tilaus: ${claim.picker} (${timeStr})`;
                }
            }

            // 2. Luodaan tai etsitään rivikohtainen "Rahti"-solu (sijoitetaan Kerää-sarakkeen jälkeen)
            let tdRahti = tr.querySelector('.ai-rahti-td');
            if (!tdRahti) {
                tdRahti = document.createElement('td');
                tdRahti.className = 'ai-rahti-td';
                tdRahti.style.cssText = 'text-align: left !important; vertical-align: top !important; padding: 5px !important; white-space: nowrap;';
                if (keraaTd && keraaTd.nextSibling) {
                    keraaTd.parentNode.insertBefore(tdRahti, keraaTd.nextSibling);
                } else {
                    tr.appendChild(tdRahti);
                }
            }

            const custOrders = customerMap.get(ord.customerKey) || [ord];
            const hasMultiple = custOrders.length > 1;

            let rahtiBtn = tdRahti.querySelector('.ai-rahti-btn');
            if (!rahtiBtn) {
                rahtiBtn = document.createElement('button');
                rahtiBtn.className = 'ai-rahti-btn';
                rahtiBtn.type = 'button';
                tdRahti.appendChild(rahtiBtn);
            }

            rahtiBtn.style.border = 'none';
            rahtiBtn.style.borderRadius = '5px';
            rahtiBtn.style.padding = '4px 9px';
            rahtiBtn.style.fontSize = '11px';
            rahtiBtn.style.fontWeight = 'bold';
            rahtiBtn.style.cursor = 'pointer';
            rahtiBtn.style.display = 'inline-flex';
            rahtiBtn.style.alignItems = 'center';
            rahtiBtn.style.gap = '5px';
            rahtiBtn.style.transition = 'all 0.15s ease';

            if (hasMultiple) {
                rahtiBtn.style.background = '#2563eb';
                rahtiBtn.style.color = '#ffffff';
                rahtiBtn.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.3)';
                rahtiBtn.innerHTML = `Laske rahti <span class="ai-rahti-badge">${custOrders.length}</span>`;
                rahtiBtn.title = `Asiakkaalla on ${custOrders.length} tilausta listalla. Klikkaa yhdistääksesi!`;
                rahtiBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    avaaYhdistelyModaali(ord, custOrders, ord.customerName);
                };
            } else {
                rahtiBtn.style.background = '#0284c7';
                rahtiBtn.style.color = '#ffffff';
                rahtiBtn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
                rahtiBtn.textContent = 'Laske rahti';
                rahtiBtn.title = 'Avaa Rahtilaskuri ja siirrä tämän tilauksen tiedot';
                rahtiBtn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showToast(`📦 Noudetaan tilaus #${ord.tilausNumero} ja avataan Rahtilaskuri...`);
                    lahetaTilauksetRahtilaskuriin([ord]);
                };
            }
        });

        // 3. Lisätään "Laske rahti valituille" -painike Pupesoftin "Yhdistä valitut keräykseen" -painikkeen viereen
        const yhdistysSubmitBtn = document.querySelector('input[value*="Yhdistä valitut"], button[value*="Yhdistä valitut"]');
        if (yhdistysSubmitBtn && yhdistysSubmitBtn.parentNode) {
            let rahtiValituilleBtn = document.getElementById('ai-keraa-rahti-valituille-btn');
            if (!rahtiValituilleBtn) {
                rahtiValituilleBtn = document.createElement('button');
                rahtiValituilleBtn.id = 'ai-keraa-rahti-valituille-btn';
                rahtiValituilleBtn.type = 'button';
                rahtiValituilleBtn.textContent = 'Laske rahti valituille';
                rahtiValituilleBtn.title = 'Laske rahti valituille tilauksille yhdessä Rahtilaskurissa';
                rahtiValituilleBtn.style.cssText = 'background: #0284c7; color: #ffffff; border: none; padding: 6px 12px; margin-right: 8px; border-radius: 4px; font-weight: bold; font-size: 12px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.1); vertical-align: middle;';
                rahtiValituilleBtn.onmouseover = () => { rahtiValituilleBtn.style.background = '#0369a1'; };
                rahtiValituilleBtn.onmouseout = () => { rahtiValituilleBtn.style.background = '#0284c7'; };

                yhdistysSubmitBtn.parentNode.insertBefore(rahtiValituilleBtn, yhdistysSubmitBtn);

                rahtiValituilleBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    const currentOrders = latestKeraaOrderInfos.length > 0 ? latestKeraaOrderInfos : orderInfos;
                    const checkedBoxes = Array.from(document.querySelectorAll('table input[type="checkbox"]:checked'))
                        .filter(cb => (cb.name && cb.name.includes('valitut')) || cb.value);

                    const selectedOrders = [];
                    checkedBoxes.forEach(cb => {
                        const tr = cb.closest('tr');
                        if (!tr) return;
                        const matchObj = currentOrders.find(o => o.row === tr);
                        if (matchObj) {
                            if (!selectedOrders.some(x => x.tilausNumero === matchObj.tilausNumero)) {
                                selectedOrders.push(matchObj);
                            }
                        } else {
                            const numMatch = cb.value?.match(/\d+/) || tr.textContent.match(/\b(49\d{4}|\d{5,8})\b/);
                            if (numMatch && !selectedOrders.some(x => x.tilausNumero === numMatch[0])) {
                                selectedOrders.push({
                                    tilausNumero: numMatch[0],
                                    customerKey: '',
                                    customerName: 'Tilaus #' + numMatch[0],
                                    toimitustapa: '',
                                    riviCount: '',
                                    paino: '',
                                    row: tr
                                });
                            }
                        }
                    });

                    if (selectedOrders.length === 0) {
                        alert('Valitse vähintään yksi tilaus taulukon valintaruuduista.');
                        return;
                    }

                    if (selectedOrders.length === 1) {
                        showToast(`📦 Noudetaan tilaus #${selectedOrders[0].tilausNumero} ja avataan Rahtilaskuri...`);
                        lahetaTilauksetRahtilaskuriin(selectedOrders);
                    } else {
                        const firstCust = selectedOrders[0].customerName || 'Valitut tilaukset';
                        avaaYhdistelyModaali(selectedOrders[0], selectedOrders, firstCust);
                    }
                });
            }
        }

        // Jos listalla on tilauksia, joiden tulostustietoa ei vielä ole välimuistissa,
        // suoritetaan niille välitön kohdennettu taustahaku!
        if (missingOrders.length > 0) {
            tarkistaPuuttuvatTilaukset(missingOrders);
        }
    }

    // =========================================================================
    // KOHDENNETTU LOKIHAKU PUUTTUVILE TILAUKSILE
    // =========================================================================
    const activeOrderLookups = new Set();

    async function tarkistaPuuttuvatTilaukset(orderItems) {
        const normalized = orderItems.map(item => {
            if (typeof item === 'object' && item !== null) return item;
            return { orderNo: String(item), tulostettuTs: 0 };
        });

        const toFetch = normalized.filter(item => item.orderNo && !activeOrderLookups.has(item.orderNo));
        if (toFetch.length === 0) return;

        toFetch.forEach(item => activeOrderLookups.add(item.orderNo));

        try {
            const orderListStr = toFetch.map(i => i.orderNo).join(', ');
            console.log(`[Pupe-Työnjako] Haetaan tulostustiedot suorituskykylokista: ${orderListStr}`);
            setSyncStatus(`🔄 Haetaan tulostajia (${toFetch.length} kpl)...`, '#64748b');

            const batches = [];
            for (let i = 0; i < toFetch.length; i += 5) {
                batches.push(toFetch.slice(i, i + 5));
            }

            let foundCount = 0;
            const pad2 = n => String(n).padStart(2, '0');

            for (const batch of batches) {
                await Promise.all(batch.map(async ({ orderNo, tulostettuTs }) => {
                    const formData = new URLSearchParams();
                    formData.set('tee', 'listaa');
                    formData.set('rekuesti', orderNo);
                    formData.set('kuka', '');
                    formData.set('skripti', '');

                    let startDate = new Date();
                    let endDate = new Date();

                    if (tulostettuTs > 0) {
                        startDate = new Date(tulostettuTs - 24 * 60 * 60 * 1000);
                        endDate = new Date(Math.min(Date.now(), tulostettuTs + 24 * 60 * 60 * 1000));
                    } else {
                        startDate.setDate(endDate.getDate() - 30);
                    }

                    formData.set('ppa', pad2(startDate.getDate()));
                    formData.set('kka', pad2(startDate.getMonth() + 1));
                    formData.set('vva', String(startDate.getFullYear()));
                    formData.set('ppl', pad2(endDate.getDate()));
                    formData.set('kkl', pad2(endDate.getMonth() + 1));
                    formData.set('vvl', String(endDate.getFullYear()));
                    formData.set('tta', '00');
                    formData.set('mma', '00');
                    formData.set('ttl', '23');
                    formData.set('mml', '59');

                    const res = await fetch('/raportit/suorituskykyloki.php?indexvas=1', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: formData.toString()
                    });

                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const parsed = parsiSuorituskykylokiDoc(doc);
                        if (parsed[orderNo]) {
                            const claims = getClaims();
                            claims[orderNo] = parsed[orderNo];
                            saveClaims(claims);
                            foundCount++;
                        }
                    }
                }));
            }

            if (foundCount > 0) {
                paivitaKeraaTilauslista();
                paivitaKeraaSivuClaim();
                const totalClaims = Object.keys(getClaims()).length;
                setSyncStatus(`✓ Tulostustiedot aktiiviset (${totalClaims} kpl)`, '#16a34a');
            } else {
                setSyncStatus(`✓ Tulostustiedot ajan tasalla`, '#16a34a');
            }

        } catch (e) {
            console.warn('[Pupe-Työnjako] Virhe kohdennetussa lokihaussa:', e);
        } finally {
            toFetch.forEach(item => activeOrderLookups.delete(item.orderNo));
        }
    }

    // =========================================================================
    // NÄKYMÄ 2: KERÄILYSSIVU TILAUKSELLE (keraa.php?id=...)
    // =========================================================================
    let isReleasingOrder = false;

    function paivitaKeraaSivuClaim() {
        const { isKeraaYksittainenSivu } = getPageType();
        if (!isKeraaYksittainenSivu || isReleasingOrder) return;

        const urlParams = new URLSearchParams(window.location.search);
        const orderNo = (
            document.getElementById('tilaus_id')?.value ||
            urlParams.get('id') ||
            (() => {
                const infoTd = document.querySelector('#info_table tr:nth-child(2) td');
                const m = (infoTd ? infoTd.textContent : '').match(/\b(\d{5,8})\b/);
                return m ? m[1] : '';
            })()
        ).trim();

        if (!orderNo) return;

        const claims = getClaims();
        const currentPicker = getPickerName();
        const claim = claims[orderNo];

        const oldBanner = document.getElementById('ai-keraa-claim-banner');
        if (oldBanner) oldBanner.remove();

        // Jos tulostustietoa ei ole vielä välimuistissa, haetaan se suorituskykylokista
        // EIKÄ keksitä tai merkitä avaajaa itseään tilauksen omistajaksi!
        if (!claim) {
            tarkistaPuuttuvatTilaukset([orderNo]);
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'ai-keraa-claim-banner';
        banner.style.cssText = `
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
            margin: 10px 0 12px 0 !important;
            padding: 8px 14px !important;
            border-radius: 6px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08) !important;
        `;

        const isOwn = (claim.picker === currentPicker && currentPicker.toLowerCase() !== 'varasto');
        const timeStr = formatClaimTime(claim.timestamp);

        if (isOwn) {
            // Oma tulostettu tilaus
            banner.style.background = '#fef9c3';
            banner.style.border = '1px solid #facc15';
            banner.style.color = '#854d0e';
            banner.innerHTML = `
                <div style="font-size:12.5px; font-weight:700;">
                    <span>🟡 Tilaus #${orderNo} — Tulostanut: ${escapeHtml(claim.picker)} (${timeStr})</span>
                </div>
                <div>
                    <button type="button" id="ai-keraa-release-btn" style="
                        background: #ffffff !important;
                        border: 1px solid #cbd5e1 !important;
                        padding: 4px 12px !important;
                        border-radius: 4px !important;
                        font-size: 11.5px !important;
                        font-weight: 700 !important;
                        color: #1e293b !important;
                        cursor: pointer !important;
                    " title="Vapauta tilaus muille keräilijöille ja palaa Kerää-ohjelman tilauslistaan">
                        ↩️ Vapauta ja palaa Kerää-ohjelmaan
                    </button>
                </div>
            `;

            const targetPos = document.getElementById('maintable') || document.querySelector('form[name="rivit"]') || document.querySelector('table');
            if (targetPos) targetPos.parentNode.insertBefore(banner, targetPos);

            document.getElementById('ai-keraa-release-btn').onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                isReleasingOrder = true;
                releaseOrder(orderNo);
                window.location.href = '/tilauskasittely/keraa.php';
            };

        } else {
            // TULOSTETTU TOISELLE KÄYTTÄJÄLLE (ml. Varasto)
            banner.style.background = '#fee2e2';
            banner.style.border = '1.5px solid #ef4444';
            banner.style.color = '#991b1b';
            banner.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:18px;">⛔</span>
                    <div>
                        <div style="font-size:13px; font-weight:800;">VAROITUS: ${escapeHtml(claim.picker)} on tulostanut tämän tilauksen!</div>
                        <div style="font-size:11px; opacity:0.9;">Aikaleima: ${timeStr}. Varmista ettette kerää samaa tilausta päällekkäin.</div>
                    </div>
                </div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <button type="button" id="ai-keraa-back-btn" style="
                        background: #ffffff !important;
                        border: 1px solid #cbd5e1 !important;
                        padding: 4px 10px !important;
                        border-radius: 4px !important;
                        font-size: 11px !important;
                        font-weight: 700 !important;
                        color: #475569 !important;
                        cursor: pointer !important;
                    ">↩️ Palaa listalle</button>
                </div>
            `;

            const targetPos = document.getElementById('maintable') || document.querySelector('form[name="rivit"]') || document.querySelector('table');
            if (targetPos) targetPos.parentNode.insertBefore(banner, targetPos);

            document.getElementById('ai-keraa-back-btn').onclick = (e) => {
                e.preventDefault();
                window.location.href = '/tilauskasittely/keraa.php';
            };
        }

        // Kun tilaus kuitataan valmiiksi ("Merkkaa kerätyksi"), vapautetaan varaus automaattisesti
        const completeBtn = document.querySelector('input[type="submit"][value*="Merkkaa"], button[value*="Merkkaa"], #real_submit');
        if (completeBtn && !completeBtn.dataset.aiClaimListener) {
            completeBtn.dataset.aiClaimListener = 'true';
            completeBtn.addEventListener('click', () => {
                releaseOrder(orderNo);
            });
        }
    }

    // =========================================================================
    // NÄKYMÄ 3: TULOSTA KERÄYSLISTA (lahetteen_tulostusjono.php)
    // =========================================================================
    function alustaTulostusjonoKuuntelu() {
        // Tulostustiedot haetaan AINA palvelimen todellisesta suorituskykylokista (suorituskykyloki.php).
        // Emme koskaan tee paikallisia arvauksia tai merkitse tilauksia lomakkeen submit-tapahtumista,
        // jotta suodatus, haku tai sivunvaihto ei koskaan vääristä tulostajatietoja.
    }

    // =========================================================================
    // NÄKYMÄ 4: SUORITUSKYKYLOKIN PARSERI & SYNKRONOINTI
    // =========================================================================
    function parsiSuorituskykylokiDoc(doc) {
        const claims = {};
        const rows = Array.from(doc.querySelectorAll('tr'));

        rows.forEach(tr => {
            const directTds = Array.from(tr.children).filter(c => c.tagName === 'TD');
            if (directTds.length < 3) return;

            // 1. Varmistetaan, että tämä on suorituskykylokin päärivi (solussa 0 tai 1 on aikaleima pp.kk.vvvv tt:mm).
            // Näin sisätaulukon parametririvit (esim. <tr><td>tulostukseen</td><td>0</td><td>497110</td></tr>)
            // eivät koskaan sekoitu pääriveihin!
            let ts = 0;
            let dateCellIndex = -1;
            for (let i = 0; i < Math.min(directTds.length, 2); i++) {
                const m = directTds[i].textContent.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
                if (m) {
                    const [, day, mon, yr, hr, mn] = m;
                    ts = new Date(Number(yr), Number(mon) - 1, Number(day), Number(hr), Number(mn), 0).getTime();
                    dateCellIndex = i;
                    break;
                }
            }
            if (!ts || dateCellIndex === -1) return;

            // Varmistetaan, että jos rivillä on skriptisarake (.php), kyseessä on nimenomaan
            // Tulosta keräyslista (lahetteen_tulostusjono.php) tai Tulosta keräyserä (tulosta_keraysera.php)
            const scriptCell = directTds.find((td, idx) => idx !== dateCellIndex && idx !== directTds.length - 1 && /\.php/i.test(td.textContent));
            if (scriptCell) {
                const scriptTxt = scriptCell.textContent.trim();
                if (!/lahetteen_tulostusjono\.php|tulosta_keraysera\.php/i.test(scriptTxt)) {
                    return;
                }
            }

            const paramTd = directTds[directTds.length - 1];
            // Huom: DOMin .textContent liimaa vierekkäiset <td>0</td><td>497110</td> yhteen muotoon "0497110"!
            // Siksi poimitaan kaikkien sisäsolujen tekstit välilyönnillä erotettuna.
            const allParamCells = Array.from(paramTd.querySelectorAll('td'));
            const paramRawText = allParamCells.length > 0
                ? allParamCells.map(c => {
                    // Jos solun sisällä on vielä oma table, ei oteta sen yhdistettyä tekstiä vaan vain lehtisolut
                    if (c.querySelector('td')) return '';
                    return c.textContent.trim();
                }).filter(Boolean).join(' ')
                : (paramTd.textContent || '');

            // Puretaan mahdolliset URL-koodaukset (esim. tulostukseen_kaikki)
            let decodedParamText = paramRawText;
            try {
                decodedParamText = decodeURIComponent(paramRawText.replace(/\+/g, ' '));
            } catch (e) {
                decodedParamText = paramRawText;
            }

            // 2. Kerätään parametrit avain -> arvo -rakenteeseen (sekä sisätaulukosta että tekstistä)
            const paramMap = new Map();
            const innerRows = Array.from(paramTd.querySelectorAll('tr'));
            if (innerRows.length > 0) {
                innerRows.forEach(pTr => {
                    const pTds = Array.from(pTr.children).filter(c => c.tagName === 'TD');
                    if (pTds.length >= 2) {
                        const k = pTds[0].textContent.trim().toLowerCase();
                        if (/^\d+$/.test(k)) return; // Ohitetaan sisätaulukon indeksirivit (0 | 497110)
                        const valTokens = [];
                        pTds.slice(1).forEach(cell => {
                            const leafTds = Array.from(cell.querySelectorAll('td')).filter(td => !td.querySelector('td'));
                            if (leafTds.length > 0) {
                                leafTds.forEach(lt => valTokens.push(lt.textContent.trim()));
                            } else {
                                valTokens.push(cell.textContent.trim());
                            }
                        });
                        const v = valTokens.filter(Boolean).join(' ').trim();
                        if (k) {
                            paramMap.set(k, paramMap.has(k) ? (paramMap.get(k) + ' ' + v) : v);
                        }
                    }
                });
            }

            // Täydennetään myös "avain: arvo" / "avain=arvo" -riveistä siltä varalta että solussa on suoraa tekstiä
            const rawLines = (paramTd.textContent || '').split(/\r?\n/);
            rawLines.forEach(line => {
                const kv = line.match(/^\s*([a-zA-Z0-9_\[\]]+)\s*[:=]\s*(.+?)\s*$/);
                if (kv) {
                    const k = kv[1].toLowerCase();
                    const v = kv[2].trim();
                    if (!paramMap.has(k)) {
                        paramMap.set(k, v);
                    }
                }
            });

            const teeVal = (paramMap.get('tee') || '').trim().toUpperCase();
            const tee2Val = (paramMap.get('tee2') || '').trim().toUpperCase();

            // 3. HYLÄTÄÄN EHDOTTOMASTI NAYTATILAUS-ESIKATSELUT!
            // Taustaskannerin (fetchSafeNaytaTilausRaw) tai käyttäjän Näytä-napin NAYTATILAUS ei ole koskaan tulostus!
            if (teeVal === 'NAYTATILAUS' || tee2Val === 'NAYTATILAUS' || /\bNAYTATILAUS\b/i.test(paramRawText)) {
                return;
            }

            // 4. VAADITAAN AITO TULOSTUSTAPAHTUMA (tee2=TULOSTA / tee=TULOSTA tai tulostukseen-parametri)
            const hasTeeTulosta = (
                tee2Val === 'TULOSTA' ||
                teeVal === 'TULOSTA' ||
                /\btee2?\s*[:=]?\s*TULOSTA\b/i.test(paramRawText)
            );
            const tulostukseenVal = paramMap.get('tulostukseen') || paramMap.get('tulostukseen[]') || '';
            const tulostukseenKaikkiVal = paramMap.get('tulostukseen_kaikki') || '';
            const hasTulostukseen = Boolean(
                /\b\d{5,8}\b/.test(tulostukseenVal) ||
                tulostukseenKaikkiVal.trim().length > 0
            );

            if (!hasTeeTulosta && !hasTulostukseen) {
                return;
            }

            // 5. Poimitaan tulostetut tilausnumerot ensisijaisesti tulostukseen / tulostukseen_kaikki -parametreista
            const orderNumbers = new Set();

            if (tulostukseenVal) {
                for (const m of tulostukseenVal.matchAll(/\b(\d{5,8})\b/g)) {
                    orderNumbers.add(m[1]);
                }
            }

            if (tulostukseenKaikkiVal) {
                let decKaikki = tulostukseenKaikkiVal;
                try {
                    decKaikki = decodeURIComponent(tulostukseenKaikkiVal.replace(/\+/g, ' '));
                } catch (e) {}
                for (const m of decKaikki.matchAll(/i:(\d{5,8});|\b(49\d{4})\b/g)) {
                    orderNumbers.add(m[1] || m[2]);
                }
            }

            // Jos tee2=TULOSTA mutta tilausnumero on muussa kentässä (esim. tilausnumero, otunnus, tunnus)
            if (orderNumbers.size === 0 && hasTeeTulosta) {
                for (const key of ['tilausnumero', 'otunnus', 'tunnus']) {
                    const v = paramMap.get(key) || '';
                    for (const m of v.matchAll(/\b(\d{5,8})\b/g)) {
                        orderNumbers.add(m[1]);
                    }
                }
            }

            // Viimeinen varakeino (vain kun rivi on varmistetusti TULOSTA-rivi)
            if (orderNumbers.size === 0 && hasTeeTulosta) {
                for (const m of decodedParamText.matchAll(/\b(49\d{4})\b/g)) {
                    orderNumbers.add(m[1]);
                }
                if (orderNumbers.size === 0) {
                    const fb = decodedParamText.match(/tulostukseen[^\d]*(\d{5,8})/i);
                    if (fb) orderNumbers.add(fb[1]);
                }
            }

            if (orderNumbers.size === 0) return;

            // 6. Poimitaan käyttäjänimi suoraan päärivin käyttäjäsolusta (solu 1 tai 0)
            let user = '';
            const candidateIndices = dateCellIndex === 0 ? [1, 2] : [0, 2];
            for (const idx of candidateIndices) {
                if (!directTds[idx]) continue;
                const cText = directTds[idx].textContent.trim();
                if (!cText || cText.includes('.php') || cText.includes('/')) continue;
                const low = cText.toLowerCase();
                if (GLOBAL_USER_MAP.has(low)) {
                    user = GLOBAL_USER_MAP.get(low);
                    break;
                }
                if (cText.length >= 2 && cText.length <= 40 && !/^\d/.test(cText)) {
                    user = cText;
                    break;
                }
            }

            if (!user) return;

            // 7. Tallennetaan kullekin tilaukselle aina tuorein oikea tulostustapahtuma
            for (const orderNo of orderNumbers) {
                if (!claims[orderNo] || ts >= claims[orderNo].timestamp) {
                    claims[orderNo] = {
                        picker: user,
                        timestamp: ts,
                        action: 'tulostettu',
                        source: 'suorituskykyloki'
                    };
                }
            }
        });

        return claims;
    }

    let lastLogSyncTime = 0;
    const LOG_SYNC_INTERVAL_MS = 60 * 1000; // 1 min taustasykli

    async function synkronoiSuorituskykylokista(force = false) {
        const now = Date.now();
        if (!force && (now - lastLogSyncTime) < LOG_SYNC_INTERVAL_MS) {
            return;
        }
        lastLogSyncTime = now;

        try {
            setSyncStatus('🔄 Synkronoidaan tulostustietoja...', '#64748b');

            // 1. Haetaan suorituskykylokin lomake ja päivitetään käyttäjälista
            const getRes = await fetch('/raportit/suorituskykyloki.php?indexvas=1', { credentials: 'include' });
            if (!getRes.ok) return;
            const html = await getRes.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');

            const form = doc.querySelector('form');
            if (!form) return;

            const kukaSelect = form.querySelector('select[name="kuka"]');
            if (kukaSelect) {
                Array.from(kukaSelect.options).forEach(opt => {
                    const val = (opt.value || '').trim().toLowerCase();
                    const name = (opt.textContent || '').trim();
                    if (val && name && name !== 'Valitse käyttäjä') {
                        GLOBAL_USER_MAP.set(val, name);
                    }
                });
            }

            // 2. Yleishaku tulostustapahtumille (rekuesti=TULOSTA)
            const formData = new URLSearchParams();
            formData.set('tee', 'listaa');
            formData.set('rekuesti', 'TULOSTA'); // Haetaan vain varsinaiset TULOSTA-tapahtumat

            const today = new Date();
            const pastDate = new Date();
            pastDate.setDate(today.getDate() - 14);
            const pad2 = n => String(n).padStart(2, '0');

            formData.set('ppa', pad2(pastDate.getDate()));
            formData.set('kka', pad2(pastDate.getMonth() + 1));
            formData.set('vva', String(pastDate.getFullYear()));
            formData.set('ppl', pad2(today.getDate()));
            formData.set('kkl', pad2(today.getMonth() + 1));
            formData.set('vvl', String(today.getFullYear()));
            formData.set('tta', '00');
            formData.set('mma', '00');
            formData.set('ttl', '23');
            formData.set('mml', '59');
            formData.set('kuka', '');
            formData.set('skripti', '');

            const postRes = await fetch('/raportit/suorituskykyloki.php?indexvas=1', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });

            if (!postRes.ok) return;
            const resHtml = await postRes.text();
            const resDoc = new DOMParser().parseFromString(resHtml, 'text/html');

            const parsedClaims = parsiSuorituskykylokiDoc(resDoc);
            const claims = getClaims();
            let addedCount = 0;

            for (const [orderNo, item] of Object.entries(parsedClaims)) {
                const existing = claims[orderNo];
                if (!existing || item.timestamp >= existing.timestamp) {
                    claims[orderNo] = item;
                    addedCount++;
                }
            }

            saveClaims(claims);
            paivitaKeraaTilauslista();
            paivitaKeraaSivuClaim();

            const totalClaims = Object.keys(claims).length;
            if (totalClaims > 0) {
                setSyncStatus(`✓ Tulostustiedot aktiiviset (${totalClaims} kpl)`, '#16a34a');
            } else {
                setSyncStatus('✓ Tulostustiedot ajan tasalla', '#16a34a');
            }

            if (addedCount > 0) {
                console.log(`[Pupe-Työnjako] Synkronoitu ${addedCount} tulostettua tilausta lokista!`);
            }

        } catch (err) {
            console.warn('[Pupe-Työnjako] Suorituskykylokin taustasynkronointi:', err);
            setSyncStatus(`⚠️ Lokihaku epäonnistui: ${err.message || err}`, '#dc2626');
        }
    }

    function updateAllViews() {
        const { isTulostusjonoSivu, isKeraaYksittainenSivu, isKeraaListaSivu } = getPageType();
        if (isKeraaListaSivu) {
            paivitaKeraaTilauslista();
            synkronoiSuorituskykylokista();
        } else if (isKeraaYksittainenSivu) {
            paivitaKeraaSivuClaim();
        }
        if (isTulostusjonoSivu) {
            alustaTulostusjonoKuuntelu();
        }
    }

    // =========================================================================
    // OSA 3: PUPESOFTIN KERÄYSLISTA (lahetteen_tulostusjono.php)
    // =========================================================================

    const PIKA_BADGE_HTML = '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>';

    function parseValmisTimestamp(cell) {
        if (!cell) return { ts: 0, line1: '', line2: '' };

        const parts = cell.innerHTML.split(/<br\s*\/?>|\n/i)
            .map(s => s.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean);

        if (parts.length === 0) return { ts: 0, line1: '', line2: '' };

        const line1 = parts[0] || '';
        const line2 = parts.length > 1 ? parts[1] : '';

        const mDate1 = line1.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        const mTime1 = line1.match(/(\d{1,2}):(\d{2})/);
        const mDate2 = line2.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
        const mTime2 = line2.match(/(\d{1,2}):(\d{2})/);

        let d = 0, m = 0, y = 0, h = 0, min = 0;

        if (mDate2) {
            d = parseInt(mDate2[1], 10);
            m = parseInt(mDate2[2], 10);
            y = parseInt(mDate2[3], 10);
            if (mTime2) { h = parseInt(mTime2[1], 10); min = parseInt(mTime2[2], 10); }
        } else if (mDate1) {
            d = parseInt(mDate1[1], 10);
            m = parseInt(mDate1[2], 10);
            y = parseInt(mDate1[3], 10);
            if (mTime2) { h = parseInt(mTime2[1], 10); min = parseInt(mTime2[2], 10); }
            else if (mTime1) { h = parseInt(mTime1[1], 10); min = parseInt(mTime1[2], 10); }
        }

        if (y < 100) y += 2000;
        const ts = new Date(y, m - 1, d, h, min).getTime();
        return { ts, line1, line2 };
    }

    function varmistaLegend(table) {
        let legend = document.getElementById("ai-color-legend");
        if (!legend) {
            legend = document.createElement("div");
            legend.id = "ai-color-legend";
            legend.style.margin = "8px 0 10px 0";
            legend.style.display = "inline-flex";
            legend.style.flexWrap = "wrap";
            legend.style.alignItems = "center";
            legend.style.gap = "8px";
            legend.style.fontSize = "11px";
            legend.style.fontFamily = "Arial, sans-serif";
            table.parentNode.insertBefore(legend, table);
        }

        legend.innerHTML = `
            <span style="font-weight:bold; color:#475569; margin-right:2px;">Värikoodit:</span>
            <span style="background:#fde8e8; color:#9b1c1c; border:1px solid #f8b4b4; border-left:4px solid #e02424; padding:2px 8px; border-radius:3px; font-weight:bold; white-space:nowrap;">🔴 = Prio 1</span>
            <span style="background:#fef3c7; color:#78350f; border:1px solid #fcd34d; border-left:4px solid #d97706; padding:2px 8px; border-radius:3px; font-weight:bold; white-space:nowrap;">🟡 = Prio 2</span>
            <span style="background:#ecfdf5; color:#065f46; border:1px solid #6ee7b7; border-left:4px solid #059669; padding:2px 8px; border-radius:3px; font-weight:bold; white-space:nowrap;">🟢 = Prio 3</span>
        `;
    }

    function varmistaStatusOtsikko(table) {
        const thead = table.querySelector('thead');
        if (!thead) return;

        const headerRow = thead.querySelector('tr');
        if (headerRow) {
            let th = headerRow.querySelector('.ai-status-th');
            if (!th) {
                th = document.createElement('th');
                th.className = 'ai-status-th';
                th.style.textAlign = 'center';
                headerRow.insertBefore(th, headerRow.firstChild);
            }
            th.innerText = 'Aika jonossa';

            let thRahti = headerRow.querySelector('.ai-rahti-th');
            if (!thRahti) {
                thRahti = document.createElement('th');
                thRahti.className = 'ai-rahti-th';
                thRahti.style.textAlign = 'center';
                thRahti.innerText = 'Rahti';
                headerRow.appendChild(thRahti);
            }
        }

        const summaryRow = table.querySelector('tbody tr:not(.niputettava_rivi)');
        if (summaryRow && !summaryRow.dataset.colAdjusted) {
            const firstTh = summaryRow.querySelector('th');
            if (firstTh && firstTh.colSpan) {
                firstTh.colSpan = firstTh.colSpan + 2;
                summaryRow.dataset.colAdjusted = '1';
            }
        }
    }

    function asetaRivinStatus(row, badgeHtml, bgColor = '', borderLeftColor = '') {
        let statusTd = row.querySelector('.ai-status-td');
        if (!statusTd) {
            statusTd = document.createElement('td');
            statusTd.className = 'ai-status-td';
            statusTd.style.textAlign = 'center';
            statusTd.style.verticalAlign = 'middle';
            statusTd.style.whiteSpace = 'nowrap';
            statusTd.style.padding = '4px 6px';
            row.insertBefore(statusTd, row.firstChild);
        }
        statusTd.innerHTML = badgeHtml;

        if (bgColor) {
            row.style.setProperty('background-color', bgColor, 'important');
        } else {
            row.style.backgroundColor = '';
        }

        if (borderLeftColor) {
            row.style.setProperty('border-left', `5px solid ${borderLeftColor}`, 'important');
        } else {
            row.style.borderLeft = '';
        }
    }

    function asetaNormaaliAikaStatus(row, now) {
        const ts = parseInt(row.dataset.valmisTs, 10) || 0;
        row.dataset.isPika = '0';
        if (ts > 0) {
            const diffHours = (now - ts) / (1000 * 60 * 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffHours >= 48) {
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, `<span style="background:#fde8e8; color:#9b1c1c; border:1px solid #f8b4b4; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">⚠️ ${diffDays} pv</span>`, '#fde8e8', '#e02424');
            } else if (diffHours >= 24) {
                row.dataset.colorCategory = 'yellow';
                asetaRivinStatus(row, `<span style="background:#fef3c7; color:#78350f; border:1px solid #fcd34d; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">⏱️ ${diffDays} pv</span>`, '#fef3c7', '#d97706');
            } else {
                row.dataset.colorCategory = 'green';
                asetaRivinStatus(row, '<span style="background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">🟢 Tänään</span>', '#ecfdf5', '#059669');
            }
        } else {
            row.dataset.colorCategory = 'none';
            asetaRivinStatus(row, '<span style="color:#94a3b8; font-size:9pt;">-</span>', '', '');
        }
    }

    function haeToimitustapaColIndex(table) {
        let idx = -1;
        const ths = table.querySelectorAll('thead th');
        ths.forEach((th, i) => {
            if (th.textContent.toLowerCase().includes('toimitustapa')) {
                idx = i;
            }
        });
        return idx;
    }

    function getRowTier(row) {
        if (row.dataset.isPika === '1') return 0;
        const cat = row.dataset.colorCategory;
        if (cat === 'red') return 1;
        if (cat === 'yellow') return 2;
        if (cat === 'green') return 3;
        return 4;
    }

    function jarjestaRivit(dataRows, tbody, summaryRow) {
        dataRows.sort((a, b) => {
            const tierA = getRowTier(a);
            const tierB = getRowTier(b);
            if (tierA !== tierB) return tierA - tierB;

            const isDpdA = a.dataset.isDpd === '1' ? 1 : 0;
            const isDpdB = b.dataset.isDpd === '1' ? 1 : 0;
            if (isDpdA !== isDpdB) return isDpdB - isDpdA;

            const tsA = parseInt(a.dataset.valmisTs, 10) || 0;
            const tsB = parseInt(b.dataset.valmisTs, 10) || 0;
            return tsA - tsB;
        });

        dataRows.forEach(row => {
            if (summaryRow) {
                tbody.insertBefore(row, summaryRow);
            } else {
                tbody.appendChild(row);
            }
        });
    }

    const skannatutTallaLatauksella = new Set();
    let backgroundScanRunning = false;

    /**
     * Tarkistaa taustalla turvallisella vain-luku NAYTATILAUS-haulla tilaukset (esim. EXTRA DELIVERY COST tai
     * tilausrivin/otsikon kommentit, jotka eivät näy suoraan jonotaulukon .popup-sarakkeessa).
     * Tarkistaa uusimmat tilaukset ensin, jotta tuoreet pikatilaukset nousevat kärkeen välittömästi!
     */
    async function tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow, orderInfosByNum) {
        if (backgroundScanRunning) return;
        backgroundScanRunning = true;

        try {
            // 1. Jos sivulla on jo avattuna NAYTATILAUS-esikatselu, tarkistetaan se heti ilman verkkopyyntöä
            const openId = findOpenPreviewOrderNumberOnPage();
            if (openId) {
                const pageHtml = document.documentElement.outerHTML;
                const cleanPreview = buildCleanOrderHtmlForRahtilaskuri(pageHtml, openId);
                if (cleanPreview) orderCleanHtmlCache.set(openId, cleanPreview);

                const avoinRivi = dataRows.find(r => r.dataset.tilausNumero === openId);
                const isOpenPika = checkParsedOrderIsPika(pageHtml, openId) || checkQueueRowPopupsIsPika(avoinRivi, openId);
                markOrderPika(openId, isOpenPika);
                skannatutTallaLatauksella.add(openId);

                if (avoinRivi) {
                    if (isOpenPika && avoinRivi.dataset.isPika !== '1') {
                        avoinRivi.dataset.isPika = '1';
                        avoinRivi.dataset.colorCategory = 'red';
                        asetaRivinStatus(avoinRivi, PIKA_BADGE_HTML, '#fde8e8', '#e02424');
                        if (orderInfosByNum && orderInfosByNum.get(openId)) orderInfosByNum.get(openId).isPika = true;
                        jarjestaRivit(dataRows, tbody, summaryRow);
                    } else if (!isOpenPika && avoinRivi.dataset.isPika === '1') {
                        asetaNormaaliAikaStatus(avoinRivi, Date.now());
                        if (orderInfosByNum && orderInfosByNum.get(openId)) orderInfosByNum.get(openId).isPika = false;
                        jarjestaRivit(dataRows, tbody, summaryRow);
                    }
                }
            }

            // 2. Järjestetään tarkistettavat jonorivit: uusimmat tilaukset ensin (suurin tilausnumero ensin)
            const rowsToScan = dataRows
                .filter(r => r.dataset.tilausNumero && !skannatutTallaLatauksella.has(r.dataset.tilausNumero))
                .slice()
                .sort((a, b) => (parseInt(b.dataset.tilausNumero, 10) || 0) - (parseInt(a.dataset.tilausNumero, 10) || 0));

            const CONCURRENCY = 3;
            for (let i = 0; i < rowsToScan.length; i += CONCURRENCY) {
                const batch = rowsToScan.slice(i, i + CONCURRENCY);
                let batchChanged = false;

                await Promise.all(batch.map(async (row) => {
                    const tilausNumero = row.dataset.tilausNumero;
                    if (!tilausNumero) return;
                    skannatutTallaLatauksella.add(tilausNumero);

                    const rawHtml = await fetchSafeNaytaTilausRaw(tilausNumero, row);
                    if (!rawHtml) return;

                    const cleanForCalc = buildCleanOrderHtmlForRahtilaskuri(rawHtml, tilausNumero);
                    if (cleanForCalc) {
                        orderCleanHtmlCache.set(tilausNumero, cleanForCalc);
                    }

                    const isDetailPika = checkParsedOrderIsPika(rawHtml, tilausNumero);
                    const isPopupPika = checkQueueRowPopupsIsPika(row, tilausNumero);
                    const finalPika = isDetailPika || isPopupPika;

                    markOrderPika(tilausNumero, finalPika);

                    if (finalPika && row.dataset.isPika !== '1') {
                        row.dataset.isPika = '1';
                        row.dataset.colorCategory = 'red';
                        asetaRivinStatus(row, PIKA_BADGE_HTML, '#fde8e8', '#e02424');
                        if (orderInfosByNum && orderInfosByNum.get(tilausNumero)) {
                            orderInfosByNum.get(tilausNumero).isPika = true;
                        }
                        batchChanged = true;
                    } else if (!finalPika && row.dataset.isPika === '1') {
                        asetaNormaaliAikaStatus(row, Date.now());
                        if (orderInfosByNum && orderInfosByNum.get(tilausNumero)) {
                            orderInfosByNum.get(tilausNumero).isPika = false;
                        }
                        batchChanged = true;
                    }
                }));

                if (batchChanged) {
                    jarjestaRivit(dataRows, tbody, summaryRow);
                }

                if (i + CONCURRENCY < rowsToScan.length) {
                    await new Promise(r => setTimeout(r, 60));
                }
            }
        } finally {
            backgroundScanRunning = false;
        }
    }

    // =========================================================================
    // TILAUSTEN YHDISTÄMINEN JA LÄHETTÄMINEN RAHTILASKURIIN
    // =========================================================================

    function showToast(viesti, isError = false) {
        let toast = document.getElementById('ai-pupe-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ai-pupe-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.right = '24px';
            toast.style.zIndex = '999999';
            toast.style.padding = '12px 18px';
            toast.style.borderRadius = '8px';
            toast.style.boxShadow = '0 10px 25px -5px rgba(0, 0, 0, 0.3)';
            toast.style.fontFamily = 'Arial, sans-serif';
            toast.style.fontSize = '13px';
            toast.style.fontWeight = 'bold';
            toast.style.transition = 'all 0.3s ease';
            document.body.appendChild(toast);
        }

        toast.style.background = isError ? '#991b1b' : '#0f172a';
        toast.style.color = '#ffffff';
        toast.style.border = isError ? '1px solid #f87171' : '1px solid #38bdf8';
        toast.innerHTML = viesti;
        toast.style.display = 'block';

        setTimeout(() => {
            if (toast) toast.style.display = 'none';
        }, 4500);
    }

    async function lahetaTilauksetRahtilaskuriin(valitutTilaukset, statusCallback) {
        if (!valitutTilaukset || valitutTilaukset.length === 0) return;

        // 1. Avataan ikkuna välittömästi käyttäjän klikkauksen yhteydessä (estää popup-blockerin)
        const rahtiWin = window.open('https://rahtilaskuri.audioimport.workers.dev', '_blank');
        if (!rahtiWin) {
            alert('Selain esti Rahtilaskurin ponnahdusikkunan. Salli ponnahdusikkunat tälle sivustolle osoitepalkista.');
            return;
        }

        if (statusCallback) statusCallback(`Noudetaan ${valitutTilaukset.length} tilauksen tiedot Pupesoftista...`);

        // 2. Haetaan ja puhdistetaan tilausten HTML-sisällöt Pupesta
        const ordersData = [];
        for (let i = 0; i < valitutTilaukset.length; i++) {
            const ord = valitutTilaukset[i];
            if (statusCallback) {
                statusCallback(`Noudetaan tilaus #${ord.tilausNumero} (${i + 1}/${valitutTilaukset.length})...`);
            }
            try {
                const html = await fetchOrderHtml(ord.tilausNumero, ord.row);
                if (html && html.trim()) {
                    ordersData.push({ tilausNumero: ord.tilausNumero, html });
                }
            } catch (err) {
                console.error('Virhe noudettaessa tilausta', ord.tilausNumero, err);
            }
        }

        if (ordersData.length === 0) {
            if (statusCallback) statusCallback('⚠️ Tilaustietojen nouto epäonnistui tai tilauksella ei ole toimitettavia tuotteita.', true);
            showToast('⚠️ Tilaustietojen nouto epäonnistui tai tilauksella ei ole toimitettavia tuotteita.', true);
            return;
        }

        if (statusCallback) statusCallback('Siirretään tuoterivit ja toimitusosoite Rahtilaskuriin...');

        // 3. Lähetetään postMessage Rahtilaskurin ikkunaan ja odotetaan kuittausta
        let isDone = false;
        let attempts = 0;
        let timer = null;

        function ackListener(e) {
            if (!e.data) return;

            if (e.data.type === 'RAHTILASKURI_READY') {
                sendPayload();
                return;
            }

            if (e.data.type === 'IMPORT_PUPESOFT_ACK') {
                if (statusCallback) statusCallback('Käsitellään ja pakataan tilauksia Rahtilaskurissa...');
            }

            if (e.data.type === 'IMPORT_PUPESOFT_SUCCESS') {
                isDone = true;
                if (timer) clearInterval(timer);
                window.removeEventListener('message', ackListener);
                const rivitTeksti = e.data.linesCount ? ` (${e.data.linesCount} tuoteriviä)` : '';
                if (statusCallback) statusCallback(`✅ Valmis! Tilaukset siirretty Rahtilaskuriin${rivitTeksti}.`);
                showToast(`✅ ${ordersData.length} tilaus(ta)${rivitTeksti} siirretty onnistuneesti Rahtilaskuriin!`);
            }

            if (e.data.type === 'IMPORT_PUPESOFT_EMPTY') {
                isDone = true;
                if (timer) clearInterval(timer);
                window.removeEventListener('message', ackListener);
                if (statusCallback) statusCallback('⚠️ Rahtilaskuri: Tilauksesta ei löytynyt toimitettavia tuotteita.', true);
                showToast('⚠️ Rahtilaskuri: Tilauksesta ei löytynyt toimitettavia tuotteita.', true);
            }
        }
        window.addEventListener('message', ackListener);

        const sendPayload = () => {
            if (isDone || !rahtiWin || rahtiWin.closed) return;
            try {
                rahtiWin.postMessage({ type: 'IMPORT_PUPESOFT_ORDERS', orders: ordersData }, '*');
            } catch {}
        };

        timer = setInterval(() => {
            attempts++;
            if (isDone || attempts > 90 || !rahtiWin || rahtiWin.closed) {
                if (timer) clearInterval(timer);
                window.removeEventListener('message', ackListener);

                if (isDone) {
                    // Jo kuitattu
                } else if (!rahtiWin || rahtiWin.closed) {
                    if (statusCallback) statusCallback('⚠️ Rahtilaskurin välilehti suljettiin.', true);
                } else {
                    if (statusCallback) statusCallback('⚠️ Rahtilaskuri ei vastannut ajoissa (tarkista kirjautuminen).', true);
                    showToast('⚠️ Rahtilaskuri ei vastannut ajoissa — kokeile painaa Laske rahti uudelleen.', true);
                }
                return;
            }

            sendPayload();
        }, 500);

        sendPayload();
    }

    function avaaYhdistelyModaali(nykyinenTilaus, asiakkaanTilaukset, asiakasNimi) {
        const vanha = document.getElementById('ai-combine-modal-overlay');
        if (vanha) vanha.remove();

        const overlay = document.createElement('div');
        overlay.id = 'ai-combine-modal-overlay';
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.65)';
        overlay.style.backdropFilter = 'blur(2px)';
        overlay.style.zIndex = '999999';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.padding = '16px';
        overlay.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';

        const modal = document.createElement('div');
        modal.style.background = '#ffffff';
        modal.style.borderRadius = '12px';
        modal.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
        modal.style.width = '580px';
        modal.style.maxWidth = '100%';
        modal.style.overflow = 'hidden';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';

        modal.innerHTML = `
            <div style="background:#0f172a; color:#ffffff; padding:16px 20px; display:flex; align-items:center; justify-content:space-between;">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span style="font-size:22px;">📦</span>
                    <div>
                        <div style="font-size:16px; font-weight:bold;">Yhdistä tilaukset Rahtilaskuriin</div>
                        <div style="font-size:12px; color:#94a3b8; margin-top:2px;">Audioimport Rahtilaskuri • Automaattinen yhdistäminen</div>
                    </div>
                </div>
                <button id="ai-modal-close" style="background:transparent; border:none; color:#94a3b8; font-size:20px; cursor:pointer; padding:4px 8px; line-height:1;">✕</button>
            </div>
            
            <div style="padding:20px; max-height:65vh; overflow-y:auto;">
                <div style="font-size:14px; color:#1e293b; margin-bottom:12px;">
                    Asiakkaalla <b>${escapeHtml(asiakasNimi)}</b> on keräyslistalla <b>${asiakkaanTilaukset.length}</b> tilausta:
                </div>
                <div style="font-size:12px; color:#64748b; margin-bottom:16px; line-height:1.4;">
                    Valitse tilaukset, jotka haluat yhdistää samaan kuormaan. Rahtilaskuri yhdistää tuoterivit, laskee kollit ja lavat sekä näyttää parhaan rahtihinnan.
                </div>

                <div id="ai-order-cards" style="display:flex; flex-direction:column; gap:8px;">
                    ${asiakkaanTilaukset.map(ord => `
                        <label style="display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; background:#f8fafc; transition:background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                            <input type="checkbox" class="ai-order-check" value="${escapeHtml(ord.tilausNumero)}" checked style="width:18px; height:18px; cursor:pointer;">
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-weight:bold; color:#0f172a; font-size:14px;">Tilaus #${escapeHtml(ord.tilausNumero)}</span>
                                    ${ord.isPika ? '<span style="background:#dc2626; color:#fff; font-size:10px; font-weight:bold; padding:1px 6px; border-radius:3px;">🔥 PIKA</span>' : ''}
                                    ${ord.isDpd ? '<span style="background:#f03023; color:#fff; font-size:10px; font-weight:bold; padding:1px 6px; border-radius:3px;">DPD</span>' : ''}
                                </div>
                                <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                    <span>${escapeHtml(ord.riviCount ? ord.riviCount + ' riviä' : '')}</span>
                                    ${ord.paino ? ` • <span>${escapeHtml(ord.paino)}</span>` : ''}
                                    ${ord.toimitustapa ? ` • <span>${escapeHtml(ord.toimitustapa)}</span>` : ''}
                                    ${ord.valmisText ? ` • <span style="color:#059669;">Valmis: ${escapeHtml(ord.valmisText)}</span>` : ''}
                                </div>
                            </div>
                        </label>
                    `).join('')}
                </div>

                <div id="ai-modal-status-box" style="display:none; margin-top:16px; padding:12px; border-radius:8px; background:#eff6ff; color:#1e40af; font-size:13px; font-weight:bold; text-align:center;">
                </div>
            </div>

            <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:14px 20px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <button id="ai-btn-cancel" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:8px 14px; border-radius:6px; font-weight:600; font-size:13px; cursor:pointer;">
                    Sulje
                </button>
                <div style="display:flex; gap:10px;">
                    <button id="ai-btn-single" style="background:#ffffff; border:1px solid #0284c7; color:#0284c7; padding:8px 14px; border-radius:6px; font-weight:600; font-size:13px; cursor:pointer;">
                        Laske vain #${escapeHtml(nykyinenTilaus.tilausNumero)}
                    </button>
                    <button id="ai-btn-combine" style="background:#2563eb; border:none; color:#ffffff; padding:8px 18px; border-radius:6px; font-weight:bold; font-size:13px; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
                        🚀 Yhdistä ja laske (<span id="ai-sel-count">${asiakkaanTilaukset.length}</span>)
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeBtn = modal.querySelector('#ai-modal-close');
        const cancelBtn = modal.querySelector('#ai-btn-cancel');
        const singleBtn = modal.querySelector('#ai-btn-single');
        const combineBtn = modal.querySelector('#ai-btn-combine');
        const countSpan = modal.querySelector('#ai-sel-count');
        const statusBox = modal.querySelector('#ai-modal-status-box');
        const checkboxes = modal.querySelectorAll('.ai-order-check');

        function updateSelectionCount() {
            const checkedCount = Array.from(checkboxes).filter(cb => cb.checked).length;
            countSpan.textContent = checkedCount;
            combineBtn.disabled = checkedCount === 0;
            combineBtn.style.opacity = checkedCount === 0 ? '0.5' : '1';
        }

        checkboxes.forEach(cb => {
            cb.addEventListener('change', updateSelectionCount);
        });

        function suljeModaali() {
            overlay.remove();
        }

        closeBtn.addEventListener('click', suljeModaali);
        cancelBtn.addEventListener('click', suljeModaali);

        singleBtn.addEventListener('click', () => {
            statusBox.style.display = 'block';
            statusBox.style.background = '#eff6ff';
            statusBox.style.color = '#1e40af';
            combineBtn.disabled = true;
            singleBtn.disabled = true;

            lahetaTilauksetRahtilaskuriin([nykyinenTilaus], (msg, isErr) => {
                statusBox.innerHTML = msg;
                if (isErr) {
                    statusBox.style.background = '#fee2e2';
                    statusBox.style.color = '#991b1b';
                }
                if (msg.includes('Valmis')) {
                    statusBox.style.background = '#d1fae5';
                    statusBox.style.color = '#065f46';
                    setTimeout(suljeModaali, 1200);
                }
            });
        });

        combineBtn.addEventListener('click', () => {
            const valitutNumerot = Array.from(checkboxes)
                .filter(cb => cb.checked)
                .map(cb => cb.value);

            if (valitutNumerot.length === 0) return;

            const valitutObjektit = asiakkaanTilaukset.filter(o => valitutNumerot.includes(o.tilausNumero));

            statusBox.style.display = 'block';
            statusBox.style.background = '#eff6ff';
            statusBox.style.color = '#1e40af';
            combineBtn.disabled = true;
            singleBtn.disabled = true;

            lahetaTilauksetRahtilaskuriin(valitutObjektit, (msg, isErr) => {
                statusBox.innerHTML = msg;
                if (isErr) {
                    statusBox.style.background = '#fee2e2';
                    statusBox.style.color = '#991b1b';
                }
                if (msg.includes('Valmis')) {
                    statusBox.style.background = '#d1fae5';
                    statusBox.style.color = '#065f46';
                    setTimeout(suljeModaali, 1200);
                }
            });
        });
    }

    // =========================================================================
    // OSA 4: KERÄYSLISTAN KÄSITTELY JA RAHTINAPPULARIVIT
    // =========================================================================

    function jarjestaKerayslista() {
        const table = document.getElementById('kerayslistat_table');
        if (!table) return;

        const vanhaBanner = document.getElementById('ai-helper-banner');
        if (vanhaBanner) vanhaBanner.remove();

        varmistaStatusOtsikko(table);
        varmistaLegend(table);

        const dataRows = Array.from(table.querySelectorAll('tr.niputettava_rivi'));
        if (dataRows.length === 0) return;

        const tbody = table.querySelector('tbody') || table;
        const summaryRow = table.querySelector('tbody tr:not(.niputettava_rivi)');
        const now = Date.now();

        const toimitustapaIdx = haeToimitustapaColIndex(table);

        // Jos sivulla on jo avattuna NAYTATILAUS-esikatselu, tarkistetaan sen pikatilausstatus heti
        const openPreviewId = findOpenPreviewOrderNumberOnPage();
        if (openPreviewId) {
            if (checkParsedOrderIsPika(document.documentElement.outerHTML, openPreviewId)) {
                markOrderPika(openPreviewId, true);
            }
        }

        const customerMap = new Map();
        const orderInfos = [];
        const orderInfosByNum = new Map();

        dataRows.forEach((row, idx) => {
            if (!row.dataset.origIdx) row.dataset.origIdx = idx;

            const hasStatusCell = !!row.querySelector('.ai-status-td');
            const offset = hasStatusCell ? 1 : 0;

            const tds = row.querySelectorAll('td');
            if (tds.length < 4 + offset) return;

            const tilausTd = tds[1 + offset];
            const asiakasTd = tds[2 + offset];
            const valmisCell = tds[3 + offset];
            const tilausNumero = tilausTd ? tilausTd.textContent.trim().match(/\d+/)?.[0] : null;
            if (tilausNumero) {
                row.dataset.tilausNumero = tilausNumero;
            }

            // Asiakkaan tiedot yhdistämistä varten: erotellaan yritystunnus ja tarkka toimipaikka/asiakasnimi
            let asiakasNimi = '';
            let customerKey = '';
            if (asiakasTd) {
                const parts = asiakasTd.innerHTML.split(/<br\s*\/?>|\n/i)
                    .map(s => s.replace(/<[^>]+>/g, '').trim())
                    .filter(Boolean);
                const ytunnus = parts.length > 1 ? parts[0] : '';
                const nameParts = parts.length > 1 ? parts.slice(1) : parts;
                asiakasNimi = nameParts.join(' ').replace(/\s+/g, ' ').trim();
                const cleanY = ytunnus.toUpperCase().replace(/[^A-Z0-9]/g, '');
                const cleanN = asiakasNimi.toUpperCase().replace(/\s+/g, ' ').trim();
                customerKey = cleanN ? (cleanY ? `${cleanY}___${cleanN}` : cleanN) : (cleanY || '');
            }

            // Toimitustapa ja DPD-tunnistus
            let toimitustapaStr = '';
            if (toimitustapaIdx >= 0 && tds[toimitustapaIdx]) {
                toimitustapaStr = tds[toimitustapaIdx].textContent.trim();
            } else if (tds[5 + offset]) {
                toimitustapaStr = tds[5 + offset].textContent.trim();
            }
            const isDpd = /dpd/i.test(toimitustapaStr);
            row.dataset.isDpd = isDpd ? '1' : '0';

            const riviCount = tds[6 + offset] ? tds[6 + offset].textContent.trim() : '';
            const paino = tds[7 + offset] ? tds[7 + offset].textContent.trim() : '';

            // Pikatilauksen välitön tunnistus VAIN lisätieto-popupeista ja vahvistetusta tallennuksesta
            // (EI KOSKAAN Toimitustapa-sarakkeesta kuten "Express-paketti" tai "Express Business Day pallet"!)
            const isPopupPika = checkQueueRowPopupsIsPika(row, tilausNumero);
            if (isPopupPika && tilausNumero) {
                markOrderPika(tilausNumero, true);
            }
            const isCachedExtra = tilausNumero && isOrderMarkedPika(tilausNumero);
            const isAlreadyPika = row.dataset.isPika === '1';

            // Parsitaan aikaleima
            const { ts, line1, line2 } = parseValmisTimestamp(valmisCell);
            row.dataset.valmisTs = ts;

            if (line1 || line2) {
                valmisCell.innerHTML = `${line1}${line2 ? '<br>' + line2 : ''}`;
            }

            // --- LIIKENNEVALOT ---
            if (isPopupPika || isCachedExtra || isAlreadyPika) {
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, PIKA_BADGE_HTML, '#fde8e8', '#e02424');
            } else {
                row.dataset.isPika = '0';
                asetaNormaaliAikaStatus(row, now);
            }

            if (tilausNumero && customerKey) {
                const orderObj = {
                    tilausNumero,
                    customerKey,
                    customerName: asiakasNimi,
                    toimitustapa: toimitustapaStr,
                    riviCount,
                    paino,
                    valmisText: line2 || line1,
                    isPika: row.dataset.isPika === '1',
                    isDpd,
                    row
                };
                orderInfos.push(orderObj);
                orderInfosByNum.set(tilausNumero, orderObj);

                if (!customerMap.has(customerKey)) {
                    customerMap.set(customerKey, []);
                }
                customerMap.get(customerKey).push(orderObj);
            }
        });

        // Lisätään "Laske rahti" -painikkeet riveihin
        orderInfos.forEach(ord => {
            const custOrders = customerMap.get(ord.customerKey) || [ord];
            const hasMultiple = custOrders.length > 1;

            let rahtiTd = ord.row.querySelector('.ai-rahti-td');
            if (!rahtiTd) {
                rahtiTd = document.createElement('td');
                rahtiTd.className = 'ai-rahti-td';
                rahtiTd.style.textAlign = 'center';
                rahtiTd.style.verticalAlign = 'middle';
                rahtiTd.style.whiteSpace = 'nowrap';
                rahtiTd.style.padding = '4px 8px';
                ord.row.appendChild(rahtiTd);
            }

            let btn = rahtiTd.querySelector('.ai-rahti-btn');
            if (!btn) {
                btn = document.createElement('button');
                btn.className = 'ai-rahti-btn';
                btn.type = 'button';
                rahtiTd.appendChild(btn);
            }

            btn.style.border = 'none';
            btn.style.borderRadius = '5px';
            btn.style.padding = '4px 9px';
            btn.style.fontSize = '11px';
            btn.style.fontWeight = 'bold';
            btn.style.cursor = 'pointer';
            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.gap = '5px';
            btn.style.transition = 'all 0.15s ease';

            if (hasMultiple) {
                btn.style.background = '#2563eb';
                btn.style.color = '#ffffff';
                btn.style.boxShadow = '0 1px 3px rgba(37, 99, 235, 0.3)';
                btn.innerHTML = `Laske rahti <span class="ai-rahti-badge">${custOrders.length}</span>`;
                btn.title = `Asiakkaalla on ${custOrders.length} tilausta jonossa. Klikkaa yhdistääksesi!`;
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    avaaYhdistelyModaali(ord, custOrders, ord.customerName);
                };
            } else {
                btn.style.background = '#0284c7';
                btn.style.color = '#ffffff';
                btn.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
                btn.textContent = 'Laske rahti';
                btn.title = 'Avaa Rahtilaskuri ja siirrä tämän tilauksen tiedot';
                btn.onclick = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    showToast(`📦 Noudetaan tilaus #${ord.tilausNumero} ja avataan Rahtilaskuri...`);
                    lahetaTilauksetRahtilaskuriin([ord]);
                };
            }
        });

        jarjestaRivit(dataRows, tbody, summaryRow);
        tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow, orderInfosByNum);
    }




    // =========================================================================
    // OSA 5: TAVARAN SAAPUMINEN & KOHDISTUS (keikka.php - v7.2 Siistitty)
    // =========================================================================
    function alustaSaapuminenSivu() {
        if (document.getElementById('ai-saapuminen-topbar')) return;

            // 1. Tunnistetaan saapumissivu
            const hasTable = Boolean(document.querySelector('table.ostorivien_kohdistus'));
            const hasQtyInput = Boolean(document.querySelector('input[name^="rivi_kpl["]'));
            if (!hasTable && !hasQtyInput) return;

            console.log('[Pupe-Saapuminen] Alustetaan siistitty saapumislaajennus...');

            // =========================================================================
            // ASETUKSET & TILA
            // =========================================================================
            const STORAGE_KEY_SOUND = 'pupe_saapuminen_sound_enabled';
            let soundEnabled = localStorage.getItem(STORAGE_KEY_SOUND) !== 'false';
            const eanToSkuMap = new Map();

            // Skanneripuskuri (Keyboard Wedge)
            let scanBuffer = '';
            let lastKeyTime = 0;
            const SCANNER_CHAR_INTERVAL_MS = 85;

            // Web Audio
            let audioCtx = null;
            function getAudioContext() {
                if (!audioCtx) {
                    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
                    if (AudioContextClass) audioCtx = new AudioContextClass();
                }
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
                return audioCtx;
            }

            function playTone(freq, durationMs, type = 'sine', startTimeOffset = 0, gainLevel = 0.15) {
                if (!soundEnabled) return;
                try {
                    const ctx = getAudioContext();
                    if (!ctx) return;
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = type;
                    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTimeOffset);
                    gain.gain.setValueAtTime(0.001, ctx.currentTime + startTimeOffset);
                    gain.gain.exponentialRampToValueAtTime(gainLevel, ctx.currentTime + startTimeOffset + 0.015);
                    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startTimeOffset + (durationMs / 1000));
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(ctx.currentTime + startTimeOffset);
                    osc.stop(ctx.currentTime + startTimeOffset + (durationMs / 1000) + 0.05);
                } catch (e) {}
            }

            function playSuccessChime() {
                playTone(587.33, 80, 'triangle', 0, 0.16);
                playTone(880.00, 130, 'triangle', 0.07, 0.20);
            }

            function playErrorBuzzer() {
                playTone(220, 140, 'sawtooth', 0, 0.2);
                playTone(164.81, 180, 'sawtooth', 0.07, 0.22);
            }

            // =========================================================================
            // TYYLIT
            // =========================================================================
            function injectStyles() {
                if (document.getElementById('ai-saapuminen-styles')) return;
                const st = document.createElement('style');
                st.id = 'ai-saapuminen-styles';
                st.textContent = `
                    /* Kompakti ja siisti yläpalkki, sijoitettu taulukon yläpuolelle */
                    #ai-saapuminen-topbar {
                        background: #ffffff;
                        border: 1px solid #cbd5e1;
                        border-radius: 6px;
                        padding: 6px 12px;
                        margin: 8px 0 10px 0;
                        display: flex;
                        align-items: center;
                        gap: 12px;
                        box-sizing: border-box;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
                        box-shadow: 0 1px 3px rgba(0,0,0,0.05);
                    }

                    .ai-search-wrap {
                        position: relative;
                        flex: 0 0 340px;
                        max-width: 100%;
                    }

                    .ai-search-input {
                        width: 100%;
                        height: 32px;
                        padding: 4px 28px 4px 28px;
                        font-size: 13px;
                        color: #1e293b;
                        background: #f8fafc;
                        border: 1px solid #94a3b8;
                        border-radius: 4px;
                        box-sizing: border-box;
                        outline: none;
                        transition: border-color 0.15s, box-shadow 0.15s;
                    }

                    .ai-search-input:focus {
                        background: #ffffff;
                        border-color: #0284c7;
                        box-shadow: 0 0 0 2px rgba(2, 132, 199, 0.2);
                    }

                    .ai-search-icon {
                        position: absolute;
                        left: 8px;
                        top: 50%;
                        transform: translateY(-50%);
                        font-size: 13px;
                        color: #64748b;
                        pointer-events: none;
                    }

                    .ai-search-clear {
                        position: absolute;
                        right: 6px;
                        top: 50%;
                        transform: translateY(-50%);
                        width: 18px;
                        height: 18px;
                        border: none;
                        background: #e2e8f0;
                        color: #475569;
                        border-radius: 50%;
                        font-size: 11px;
                        font-weight: bold;
                        cursor: pointer;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0;
                    }

                    .ai-badge {
                        display: inline-flex;
                        align-items: center;
                        gap: 5px;
                        padding: 3px 8px;
                        border-radius: 4px;
                        font-size: 12px;
                        font-weight: 500;
                        user-select: none;
                    }

                    .ai-badge-scanner {
                        background: #f0fdf4;
                        color: #15803d;
                        border: 1px solid #bbf7d0;
                    }

                    .ai-badge-count {
                        background: #f8fafc;
                        color: #475569;
                        border: 1px solid #e2e8f0;
                    }

                    .ai-sound-btn {
                        margin-left: auto;
                        height: 30px;
                        padding: 0 10px;
                        border-radius: 4px;
                        border: 1px solid #cbd5e1;
                        background: #f8fafc;
                        color: #334155;
                        font-size: 12px;
                        cursor: pointer;
                    }

                    .ai-sound-btn:hover {
                        background: #e2e8f0;
                    }

                    /* Hyllypaikan siisti tekstimerkki solussa */
                    .ai-loc-badge {
                        display: inline-block;
                        padding: 1px 5px;
                        font-size: 11px;
                        font-weight: 600;
                        color: #0284c7;
                        background: #f0f9ff;
                        border: 1px solid #bae6fd;
                        border-radius: 4px;
                        cursor: pointer;
                        line-height: 1.3;
                        margin-top: 2px;
                        text-decoration: none;
                        transition: all 0.15s;
                        white-space: nowrap;
                    }

                    .ai-loc-badge:hover {
                        background: #e0f2fe;
                        border-color: #0284c7;
                        color: #0369a1;
                    }

                    .ai-loc-badge.ai-loc-empty {
                        color: #d97706;
                        background: #fffbeb;
                        border-color: #fde68a;
                    }

                    /* Skannatun rivin pehmeä korostus */
                    @keyframes aiRowGlow {
                        0% { background-color: #fef08a !important; }
                        50% { background-color: #bbf7d0 !important; }
                        100% { background-color: #ecfdf5 !important; }
                    }

                    .ai-row-highlight {
                        animation: aiRowGlow 1.2s ease-out forwards !important;
                    }

                    /* Popup varastopaikkojen valintaan */
                    #ai-loc-popup {
                        position: absolute;
                        z-index: 100000;
                        background: #ffffff;
                        border: 1px solid #94a3b8;
                        border-radius: 8px;
                        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.18);
                        padding: 12px;
                        width: 310px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        font-size: 12px;
                        color: #1e293b;
                    }

                    .ai-loc-popup-header {
                        font-weight: 700;
                        font-size: 13px;
                        margin-bottom: 8px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        border-bottom: 1px solid #e2e8f0;
                        padding-bottom: 5px;
                    }

                    .ai-loc-popup-close {
                        border: none;
                        background: none;
                        font-size: 16px;
                        cursor: pointer;
                        color: #64748b;
                        padding: 0 4px;
                    }

                    .ai-loc-item {
                        padding: 6px 8px;
                        border-radius: 4px;
                        border: 1px solid #e2e8f0;
                        margin-bottom: 5px;
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        background: #f8fafc;
                        cursor: pointer;
                    }

                    .ai-loc-item:hover {
                        background: #eff6ff;
                        border-color: #60a5fa;
                    }

                    .ai-loc-item.ai-loc-current {
                        border-color: #10b981;
                        background: #ecfdf5;
                    }

                    .ai-loc-new-box {
                        margin-top: 8px;
                        padding-top: 8px;
                        border-top: 1px solid #e2e8f0;
                    }

                    .ai-loc-input {
                        width: 100%;
                        height: 32px;
                        padding: 4px 8px;
                        font-size: 12px;
                        border: 1px solid #cbd5e1;
                        border-radius: 4px;
                        box-sizing: border-box;
                        margin-bottom: 6px;
                    }

                    .ai-loc-save-btn {
                        width: 100%;
                        height: 32px;
                        background: #0284c7;
                        color: #ffffff;
                        font-weight: 600;
                        border: none;
                        border-radius: 4px;
                        cursor: pointer;
                    }

                    .ai-loc-save-btn:hover {
                        background: #0369a1;
                    }

                    /* Toast-ilmoitus */
                    #ai-saapuminen-toast {
                        position: fixed;
                        bottom: 20px;
                        right: 20px;
                        z-index: 100001;
                        background: #0f172a;
                        color: #ffffff;
                        padding: 8px 14px;
                        border-radius: 6px;
                        box-shadow: 0 6px 18px rgba(0,0,0,0.2);
                        font-size: 12px;
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        border-left: 3px solid #10b981;
                        opacity: 0;
                        transform: translateY(8px);
                        transition: opacity 0.2s, transform 0.2s;
                        pointer-events: none;
                    }

                    #ai-saapuminen-toast.ai-show {
                        opacity: 1;
                        transform: translateY(0);
                    }
                `;
                document.head.appendChild(st);
            }

            // =========================================================================
            // TOAST
            // =========================================================================
            let toastTimeout = null;
            function showToast(text, isError = false) {
                let toast = document.getElementById('ai-saapuminen-toast');
                if (!toast) {
                    toast = document.createElement('div');
                    toast.id = 'ai-saapuminen-toast';
                    document.body.appendChild(toast);
                }
                clearTimeout(toastTimeout);
                toast.textContent = text;
                toast.style.borderLeftColor = isError ? '#ef4444' : '#10b981';
                toast.classList.add('ai-show');
                toastTimeout = setTimeout(() => {
                    toast.classList.remove('ai-show');
                }, 2500);
            }

            // =========================================================================
            // SAAPUMISRIVIEN PARSINTA
            // =========================================================================
            function getArrivalRows() {
                const rows = Array.from(document.querySelectorAll('table.ostorivien_kohdistus tr.aktiivi, tr.aktiivi'));
                const parsed = [];

                for (const row of rows) {
                    const skuLink = row.querySelector('a[onclick*="tuoteno="], a[href*="tuoteno="]');
                    let sku = skuLink ? skuLink.textContent.trim() : '';
                    if (!sku && row.children.length > 2) {
                        const rawTd2 = row.children[2].innerText || row.children[2].textContent;
                        sku = rawTd2.split('\n')[0].trim();
                    }
                    if (!sku) continue;

                    const qtyInput = row.querySelector('input[name^="rivi_kpl["]');
                    if (!qtyInput) continue;

                    const idMatch = qtyInput.name.match(/\[(\d+)\]/);
                    const riviId = idMatch ? idMatch[1] : '';
                    const checkbox = row.querySelector('input[type="checkbox"][name^="rivi_valitut_tunnukset"]');

                    let loc = '';
                    let orderNo = '';
                    const td1 = row.children[1];
                    if (td1) {
                        const parts = td1.innerHTML.split(/<br\s*\/?>/i);
                        orderNo = parts[0] ? parts[0].replace(/<[^>]+>/g, '').trim() : '';
                        if (parts.length > 1) {
                            loc = parts[1].replace(/<[^>]+>/g, '').trim();
                        }
                    }

                    const nameTd = row.children[3];
                    const nimitys = nameTd ? nameTd.textContent.trim() : '';

                    parsed.push({
                        element: row,
                        sku: sku.toUpperCase(),
                        rawSku: sku,
                        nimitys,
                        loc,
                        orderNo,
                        riviId,
                        qtyInput,
                        checkbox,
                        td1
                    });
                }

                return parsed;
            }

            // =========================================================================
            // YLÄPALKKI & PIKAHAKU
            // =========================================================================
            let arrivalRowsCache = [];

            function buildTopBar() {
                if (document.getElementById('ai-saapuminen-topbar')) return;

                arrivalRowsCache = getArrivalRows();

                const topBar = document.createElement('div');
                topBar.id = 'ai-saapuminen-topbar';

                topBar.innerHTML = `
                    <div class="ai-search-wrap">
                        <span class="ai-search-icon">🔍</span>
                        <input type="text" class="ai-search-input" id="ai-arrival-search" 
                               placeholder="Pikahaku tai skannaa viivakoodi..." 
                               autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
                        <button type="button" class="ai-search-clear" id="ai-arrival-clear" style="display:none;" title="Tyhjennä haku">✕</button>
                    </div>

                    <div class="ai-badge ai-badge-scanner">
                        <span>🟢</span> Skanneri valmiina
                    </div>

                    <div class="ai-badge ai-badge-count" id="ai-arrival-count">
                        Rivejä: <strong>${arrivalRowsCache.length}</strong>
                    </div>

                    <button type="button" class="ai-sound-btn" id="ai-sound-toggle">
                        ${soundEnabled ? '🔊 Äänet' : '🔇 Mykkä'}
                    </button>
                `;

                // TÄRKEÄ KORJAUS: Etsitään taulukko ja sijoitetaan yläpalkki AINA taulukon ETEEN (ei taulukon sisään!)
                const targetTable = document.querySelector('table.ostorivien_kohdistus') || document.querySelector('tr.aktiivi')?.closest('table');
                if (targetTable && targetTable.parentNode) {
                    targetTable.parentNode.insertBefore(topBar, targetTable);
                } else {
                    document.body.insertBefore(topBar, document.body.firstChild);
                }

                // Tapahtumat
                const searchInput = topBar.querySelector('#ai-arrival-search');
                const clearBtn = topBar.querySelector('#ai-arrival-clear');
                const soundBtn = topBar.querySelector('#ai-sound-toggle');
                const countEl = topBar.querySelector('#ai-arrival-count');

                searchInput.addEventListener('input', () => {
                    const query = searchInput.value.trim().toUpperCase();
                    clearBtn.style.display = query ? 'flex' : 'none';
                    filterRows(query, countEl);
                });

                clearBtn.addEventListener('click', () => {
                    searchInput.value = '';
                    clearBtn.style.display = 'none';
                    filterRows('', countEl);
                    searchInput.focus();
                });

                soundBtn.addEventListener('click', () => {
                    soundEnabled = !soundEnabled;
                    localStorage.setItem(STORAGE_KEY_SOUND, String(soundEnabled));
                    soundBtn.textContent = soundEnabled ? '🔊 Äänet' : '🔇 Mykkä';
                    showToast(soundEnabled ? '🔊 Äänipalaute päällä' : '🔇 Äänipalaute pois');
                });

                // Pikanäppäin Ctrl+F / Cmd+F kohdistaa suoraan tähän hakukenttään
                window.addEventListener('keydown', (e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                        if (document.activeElement !== searchInput) {
                            e.preventDefault();
                            searchInput.focus();
                            searchInput.select();
                        }
                    }
                });
            }

            function filterRows(query, countEl) {
                let matchCount = 0;
                for (const item of arrivalRowsCache) {
                    if (!query) {
                        item.element.style.display = '';
                        matchCount++;
                        continue;
                    }

                    const match = item.sku.includes(query) ||
                                  item.nimitys.toUpperCase().includes(query) ||
                                  item.loc.toUpperCase().includes(query) ||
                                  item.orderNo.toUpperCase().includes(query);

                    if (match) {
                        item.element.style.display = '';
                        matchCount++;
                    } else {
                        item.element.style.display = 'none';
                    }
                }

                if (countEl) {
                    if (!query) {
                        countEl.innerHTML = `Rivejä: <strong>${arrivalRowsCache.length}</strong>`;
                    } else {
                        countEl.innerHTML = `Löytyi: <strong>${matchCount}</strong> / ${arrivalRowsCache.length}`;
                    }
                }
            }

            // =========================================================================
            // VIIVAKOODIN LUKU & KOHDISTUS
            // =========================================================================
            function handleGlobalKeydown(e) {
                const target = e.target;
                const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

                // Jos ollaan hakukentässä ja painetaan enter
                if (target && target.id === 'ai-arrival-search' && e.key === 'Enter') {
                    const query = target.value.trim().toUpperCase();
                    if (query) {
                        const found = arrivalRowsCache.find(r => r.sku === query || r.sku.startsWith(query));
                        if (found) {
                            e.preventDefault();
                            focusArrivalRow(found);
                        }
                    }
                    return;
                }

                const now = Date.now();
                const timeDiff = now - lastKeyTime;
                lastKeyTime = now;

                if (timeDiff > SCANNER_CHAR_INTERVAL_MS && scanBuffer.length > 0) {
                    scanBuffer = '';
                }

                if (e.key === 'Enter') {
                    if (scanBuffer.length >= 3) {
                        e.preventDefault();
                        const code = scanBuffer.trim();
                        scanBuffer = '';
                        processScannedBarcode(code);
                        return;
                    }
                    scanBuffer = '';
                    return;
                }

                if (e.key.length === 1) {
                    scanBuffer += e.key;
                }
            }

            async function processScannedBarcode(rawCode) {
                const cleaned = rawCode.trim().toUpperCase();
                console.log('[Pupe-Saapuminen] Skannattu koodi:', cleaned);

                // 1. Suora täsmäys tuotenumeroon
                let matched = arrivalRowsCache.find(r => r.sku === cleaned);

                // 2. Täsmäys EAN-välimuistiin
                if (!matched && eanToSkuMap.has(cleaned)) {
                    const sku = eanToSkuMap.get(cleaned);
                    matched = arrivalRowsCache.find(r => r.sku === sku);
                }

                // 3. Osatäsmäys
                if (!matched) {
                    matched = arrivalRowsCache.find(r => r.sku.startsWith(cleaned) || cleaned.startsWith(r.sku));
                }

                if (matched) {
                    focusArrivalRow(matched);
                    return;
                }

                // 4. Taustahaku tuotteen EAN-koodilla tuote.php:sta
                try {
                    const res = await fetch(`/tuote.php?hae=${encodeURIComponent(cleaned)}`, { credentials: 'include' });
                    if (res.ok) {
                        const text = await res.text();
                        for (const row of arrivalRowsCache) {
                            if (text.includes(row.rawSku)) {
                                eanToSkuMap.set(cleaned, row.sku);
                                focusArrivalRow(row);
                                return;
                            }
                        }
                    }
                } catch (err) {}

                playErrorBuzzer();
                showToast(`❌ Tuotetta ei löytynyt saapumiselta: ${cleaned}`, true);
            }

            function focusArrivalRow(rowItem) {
                // Palautetaan haku jos rivi oli piilotettuna
                const searchInput = document.getElementById('ai-arrival-search');
                if (searchInput && searchInput.value) {
                    searchInput.value = '';
                    filterRows('', document.getElementById('ai-arrival-count'));
                }

                // Skrollaus keskelle
                rowItem.element.scrollIntoView({ behavior: 'smooth', block: 'center' });

                // Valoefekti
                rowItem.element.classList.remove('ai-row-highlight');
                void rowItem.element.offsetWidth;
                rowItem.element.classList.add('ai-row-highlight');

                // Kohdistetaan suoraan määräkenttään ja valitaan teksti (EI kuitata automaattisesti!)
                if (rowItem.qtyInput) {
                    rowItem.qtyInput.focus();
                    rowItem.qtyInput.select();
                }

                playSuccessChime();
                showToast(`🔍 Löydetty: ${rowItem.rawSku} (Määrä: ${rowItem.qtyInput ? rowItem.qtyInput.value : ''} kpl)`);
            }

            // =========================================================================
            // VARASTOPAIKAN SIISTI VALINTA JA LUONTI
            // =========================================================================
            let currentPopup = null;

            function openLocationPicker(rowItem, targetBadge) {
                closeLocationPicker();

                const popup = document.createElement('div');
                popup.id = 'ai-loc-popup';

                popup.innerHTML = `
                    <div class="ai-loc-popup-header">
                        <span>📍 Varastopaikka: <strong>${rowItem.rawSku}</strong></span>
                        <button type="button" class="ai-loc-popup-close">✕</button>
                    </div>
                    <div id="ai-loc-list" style="max-height: 150px; overflow-y: auto; margin-bottom: 6px;">
                        <div style="color: #64748b; padding: 4px;">Haetaan varastopaikkoja...</div>
                    </div>
                    <div class="ai-loc-new-box">
                        <div style="font-weight: 600; font-size: 11px; margin-bottom: 3px;">Uusi varastopaikka:</div>
                        <input type="text" class="ai-loc-input" id="ai-new-loc-input" placeholder="Esim. A-18-B-3">
                        <button type="button" class="ai-loc-save-btn" id="ai-save-new-loc-btn">Tallenna ja aseta paikaksi</button>
                    </div>
                `;

                document.body.appendChild(popup);
                currentPopup = popup;

                const rect = targetBadge.getBoundingClientRect();
                let left = rect.left + window.scrollX;
                let top = rect.bottom + window.scrollY + 4;
                if (left + 320 > window.innerWidth - 10) left = window.innerWidth - 330;

                popup.style.left = `${Math.max(10, left)}px`;
                popup.style.top = `${top}px`;

                popup.querySelector('.ai-loc-popup-close').addEventListener('click', closeLocationPicker);

                // Noudetaan tuotteen paikat
                fetchProductLocations(rowItem.rawSku).then(locations => {
                    const listEl = popup.querySelector('#ai-loc-list');
                    if (!listEl) return;

                    if (!locations || locations.length === 0) {
                        listEl.innerHTML = `<div style="color: #64748b; padding: 4px;">Ei aiemmin tallennettuja paikkoja.</div>`;
                        return;
                    }

                    listEl.innerHTML = '';
                    for (const loc of locations) {
                        const isCurrent = (rowItem.loc && loc.shelf.replace(/[^A-Za-z0-9]/g, '') === rowItem.loc.replace(/[^A-Za-z0-9]/g, ''));
                        const itemEl = document.createElement('div');
                        itemEl.className = `ai-loc-item ${isCurrent ? 'ai-loc-current' : ''}`;
                        itemEl.innerHTML = `
                            <div>
                                <strong>${loc.shelf}</strong> ${loc.isDefault ? '<span style="color:#0284c7; font-size:10px;">(Oletus)</span>' : ''}
                                <div style="font-size: 11px; color: #64748b;">Saldo: ${loc.saldo} kpl</div>
                            </div>
                            <span style="font-size:11px; color:#0284c7; font-weight:600;">Valitse ›</span>
                        `;

                        itemEl.addEventListener('click', () => {
                            applyLocationToRow(rowItem, loc.shelf, targetBadge);
                            closeLocationPicker();
                        });

                        listEl.appendChild(itemEl);
                    }
                });

                // Uuden paikan tallennus
                const saveBtn = popup.querySelector('#ai-save-new-loc-btn');
                const newLocInput = popup.querySelector('#ai-new-loc-input');

                saveBtn.addEventListener('click', async () => {
                    const newLoc = newLocInput.value.trim().toUpperCase();
                    if (!newLoc) {
                        newLocInput.focus();
                        return;
                    }

                    saveBtn.disabled = true;
                    saveBtn.textContent = 'Tallennetaan...';

                    try {
                        await saveNewLocation(rowItem.rawSku, newLoc);
                        applyLocationToRow(rowItem, newLoc, targetBadge);
                        showToast(`✅ Uusi varastopaikka tallennettu: ${newLoc}`);
                        closeLocationPicker();
                    } catch (err) {
                        alert('Virhe: ' + err.message);
                        saveBtn.disabled = false;
                        saveBtn.textContent = 'Tallenna ja aseta paikaksi';
                    }
                });
            }

            function closeLocationPicker() {
                if (currentPopup && currentPopup.parentNode) {
                    currentPopup.parentNode.removeChild(currentPopup);
                }
                currentPopup = null;
            }

            async function applyLocationToRow(rowItem, newShelf, targetBadge) {
                rowItem.loc = newShelf;
                targetBadge.textContent = `📍 ${newShelf} ▾`;
                targetBadge.classList.remove('ai-loc-empty');

                if (rowItem.riviId) {
                    syncLocationToArrivalLine(rowItem.riviId, newShelf).catch(e => {
                        console.warn('[Pupe-Saapuminen] Varastopaikan synkronointi epäonnistui:', e);
                    });
                }

                showToast(`📍 Paikaksi asetettu: ${newShelf}`);
            }

            async function syncLocationToArrivalLine(riviId, shelfStr) {
                const parts = shelfStr.replace(/[\s_]+/g, '-').split('-').filter(Boolean);
                const otunnusInput = document.querySelector('input[name="otunnus"], input[name="keikka"]');
                const otunnus = otunnusInput ? otunnusInput.value : '';

                const params = new URLSearchParams();
                params.set('toiminto', 'varastopaikat');
                params.set('tee', 'valmis');
                if (otunnus) params.set('otunnus', otunnus);
                params.append('tunnukset[]', String(riviId));
                params.set(`t1[${riviId}]`, parts[0] || shelfStr);
                params.set(`t2[${riviId}]`, parts[1] || '');
                params.set(`t3[${riviId}]`, parts[2] || '');
                params.set(`t4[${riviId}]`, parts[3] || '');

                await fetch('/tilauskasittely/keikka.php', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: params.toString()
                });
            }

            async function fetchProductLocations(sku) {
                const locations = [];
                try {
                    const res = await fetch(`/tuote.php?ajax=varastopaikat&tuoteno=${encodeURIComponent(sku)}`, { credentials: 'include' });
                    if (res.ok) {
                        const html = await res.text();
                        const doc = new DOMParser().parseFromString(html, 'text/html');
                        const trs = Array.from(doc.querySelectorAll('table tr'));
                        for (const tr of trs) {
                            const tds = tr.querySelectorAll('td');
                            if (tds.length >= 5) {
                                const shelf = (tds[1].textContent || '').trim();
                                const saldo = (tds[2].textContent || '').trim();
                                if (shelf && shelf !== '?' && !shelf.toLowerCase().includes('tuntematon')) {
                                    locations.push({
                                        shelf,
                                        saldo,
                                        isDefault: locations.length === 0
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {}
                return locations;
            }

            async function saveNewLocation(sku, newLoc) {
                const params = new URLSearchParams();
                params.set('tee', 'UUSIPAIKKA_VIIVAKOODI');
                params.set('toim', '');
                params.set('tuoteno', sku);
                params.set('paikkalahde', 'VAPAA');
                params.set('hyllypaikka_viivakoodilla', newLoc);

                const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                    body: params.toString()
                });

                if (!res.ok) throw new Error(`Palvelinvirhe (${res.status})`);
                return true;
            }

            // =========================================================================
            // RIVIN SIISTI RIKASTAMINEN (VAIN HYLLYPAIKKA-BADGE, EI YLIMÄÄRÄISIÄ NAPPEJA!)
            // =========================================================================
            function enhanceRowClean(rowItem) {
                if (!rowItem.td1) return;
                if (rowItem.td1.querySelector('.ai-loc-badge')) return;

                // Erotetaan tilausnumero ja hyllypaikka
                const parts = rowItem.td1.innerHTML.split(/<br\s*\/?>/i);
                const orderNo = parts[0] ? parts[0].trim() : '';
                const loc = parts[1] ? parts[1].replace(/<[^>]+>/g, '').trim() : '';

                // Luodaan kompakti badge tekstin tilalle
                const badge = document.createElement('span');
                badge.className = `ai-loc-badge ${(!loc || loc === 'A-0-0-0') ? 'ai-loc-empty' : ''}`;
                badge.textContent = `📍 ${loc || 'Valitse'} ▾`;
                badge.title = 'Vaihda tai lisää varastopaikka';

                badge.addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openLocationPicker(rowItem, badge);
                });

                rowItem.td1.innerHTML = `${orderNo}<br>`;
                rowItem.td1.appendChild(badge);
            }

            // =========================================================================
            // ALUSTUS
            // =========================================================================
            function init() {
                injectStyles();
                buildTopBar();

                for (const item of arrivalRowsCache) {
                    enhanceRowClean(item);
                }

                document.addEventListener('click', (e) => {
                    if (currentPopup && !currentPopup.contains(e.target) && !e.target.closest('.ai-loc-badge')) {
                        closeLocationPicker();
                    }
                });

                window.addEventListener('keydown', handleGlobalKeydown, true);
                console.log(`[Pupe-Saapuminen] Alustus valmis. ${arrivalRowsCache.length} riviä valmiina.`);
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
    }

    // =========================================================================
    // OSA 6: TUOTEKORTIN PIKANÄKYMÄ (HOVER & KOSKETUSNÄYTTÖ - v7.1)
    // =========================================================================
    function alustaTuotekortinPikanakyma() {
        // Suljetaan pois yläkehys (ylaframe) ja sivupalkki (menuframe, alamenu)
        const frameName = window.name || '';
        if (frameName === 'ylaframe' || frameName === 'menuframe' || frameName === 'alamenu') {
            return;
        }
        const path = (window.location.pathname || '').toLowerCase();
        if (path.includes('ylaframe.php') || path.includes('indexvas.php')) {
            return;
        }
        if (document.querySelector('frameset')) {
            return;
        }

        console.log('[Pupe-Tuotekortti-Pikanakyma] Alustetaan tuotekortin pikanäkymä v7.1...');

        // Välimuisti ja tila (Stale-While-Revalidate)
        const productCache = new Map();
        const CACHE_STALE_AGE_MS = 15 * 1000;
        let hoverTimer = null;
        let hideTimer = null;
        let activeSku = null;
        let activeAnchor = null;
        let cardElement = null;
        let isHoveringCard = false;

        function decodeBuffer(buffer) {
            let text = '';
            try {
                text = new TextDecoder('utf-8').decode(buffer);
                if (text.includes('\uFFFD')) {
                    text = new TextDecoder('iso-8859-1').decode(buffer);
                }
            } catch (e) {
                text = new TextDecoder('iso-8859-1').decode(buffer);
            }
            return text;
        }

        function cleanShelfName(raw) {
            if (!raw) return '';
            return String(raw)
                .replace(/<br\s*[\/]?>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/^[a-zäöå\s]+:\s*/i, '')
                .replace(/Ei\s*saapumis[^\n\r]*/gi, '')
                .replace(/Saapuu[^\n\r]*/gi, '')
                .replace(/Saapuminen[^\n\r]*/gi, '')
                .replace(/Tilattu[^\n\r]*/gi, '')
                .replace(/\(\d{4}-\d{2}-\d{2}\)/g, '')
                .replace(/\(\d+(?:\.\d+)?\)/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function formatPrice(val, defaultVal = '-') {
            if (!val || val === '-' || val === '') return defaultVal;
            const numMatch = val.replace(/\s+/g, '').replace(',', '.').match(/[-+]?\d*\.?\d+/);
            if (!numMatch) return val.trim();
            const num = parseFloat(numMatch[0]);
            if (isNaN(num)) return val.trim();
            const formatted = num.toLocaleString('fi-FI', {
                minimumFractionDigits: 2,
                maximumFractionDigits: (num % 1 === 0 || (num * 100) % 1 === 0) ? 2 : 4
            }).replace(/[\u00A0\u202F\s]/g, ' ');
            return `${formatted} €`;
        }

        function formatTime(ts) {
            if (!ts) return '';
            const d = new Date(ts);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
        }

        function extractSkuFromLink(anchor) {
            if (!anchor || !anchor.getAttribute) return null;
            const href = anchor.getAttribute('href');
            if (!href) return null;

            const m = href.match(/[?&]tuoteno=([^&#]+)/i);
            if (!m) return null;

            if (href.includes('tee=POISTA') || href.includes('action=delete')) return null;

            let sku = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
            sku = sku.replace(/^\*+|\*+$/g, '').trim();
            if (!sku || sku.length < 1) return null;

            return sku;
        }

        async function fetchProductDetails(sku, forceRefresh = false) {
            if (!forceRefresh && productCache.has(sku)) {
                const cached = productCache.get(sku);
                const age = Date.now() - (cached.timestamp || 0);
                if (age < CACHE_STALE_AGE_MS) {
                    return cached;
                }
            }

            try {
                const [resTuote, resVarasto] = await Promise.all([
                    fetch(`/tuote.php?tee=Z&tuoteno=${encodeURIComponent(sku)}&lopetus=`, { credentials: 'include' })
                        .then(r => r.ok ? r.arrayBuffer() : null)
                        .then(b => b ? decodeBuffer(b) : '')
                        .catch(() => ''),

                    fetch(`/tuote.php?ajax=varastopaikat&tuoteno=${encodeURIComponent(sku)}`, { credentials: 'include' })
                        .then(r => r.ok ? r.arrayBuffer() : null)
                        .then(b => b ? decodeBuffer(b) : '')
                        .catch(() => '')
                ]);

                const parsed = parseTuoteDetails(resTuote, sku);
                const locations = parseVarastopaikat(resVarasto);

                if (locations.length === 0 && parsed.primaryShelf) {
                    locations.push({
                        warehouse: 'Päävarasto',
                        shelf: parsed.primaryShelf,
                        saldo: parsed.totalStock !== null ? parsed.totalStock : 0,
                        hyllyssa: parsed.totalStock !== null ? parsed.totalStock : 0,
                        available: parsed.availableStock !== null ? parsed.availableStock : 0,
                        isDefault: true
                    });
                }

                let calculatedTotal = parsed.totalStock;
                let calculatedAvail = parsed.availableStock;
                if (locations.length > 0) {
                    const sumSaldo = locations.reduce((acc, l) => acc + (l.saldo || 0), 0);
                    const sumAvail = locations.reduce((acc, l) => acc + (l.available || 0), 0);
                    if (calculatedTotal === null) calculatedTotal = sumSaldo;
                    if (calculatedAvail === null) calculatedAvail = sumAvail;
                }

                const completeData = {
                    sku,
                    name: parsed.name || sku,
                    ean: parsed.ean || '',
                    myyntihinta: parsed.myyntihinta || '-',
                    kehahinta: parsed.kehahinta || '-',
                    vihahinta: parsed.vihahinta || '-',
                    vihapvm: parsed.vihapvm || '',
                    totalStock: calculatedTotal,
                    availableStock: calculatedAvail,
                    reservedStock: parsed.reservedStock !== null ? parsed.reservedStock : (calculatedTotal !== null && calculatedAvail !== null ? Math.max(0, calculatedTotal - calculatedAvail) : null),
                    locations,
                    timestamp: Date.now()
                };

                productCache.set(sku, completeData);
                return completeData;
            } catch (e) {
                console.error('[Pupe-Tuotekortti-Pikanakyma] Virhe tuotetietojen haussa:', e);
                return null;
            }
        }

        function parseTuoteDetails(html, sku) {
            if (!html) return { sku, name: sku, ean: '', myyntihinta: '-', kehahinta: '-', vihahinta: '-', vihapvm: '', primaryShelf: '', totalStock: null, availableStock: null, reservedStock: null };

            const doc = new DOMParser().parseFromString(html, 'text/html');

            let name = '';
            let ean = '';
            let myyntihinta = '';
            let kehahinta = '';
            let vihahinta = '';
            let vihapvm = '';
            let primaryShelf = '';
            let totalStock = null;
            let availableStock = null;
            let reservedStock = null;

            const tables = Array.from(doc.querySelectorAll('table'));
            for (const table of tables) {
                const rows = Array.from(table.querySelectorAll('tr'));
                for (let i = 0; i < rows.length; i++) {
                    const tr = rows[i];
                    const ths = Array.from(tr.querySelectorAll('th'));
                    if (ths.length === 0) continue;

                    const thTexts = ths.map(th => th.textContent.replace(/<[^>]+>/g, ' ').trim().toLowerCase());

                    if (thTexts.some(t => t.includes('nimitys') || t.includes('tuotenumero'))) {
                        const nextTr = rows[i + 1];
                        if (nextTr) {
                            const tds = Array.from(nextTr.querySelectorAll('td'));
                            thTexts.forEach((thText, idx) => {
                                const cellText = (tds[idx]?.textContent || '').trim();
                                if (thText.includes('nimitys') && !name) {
                                    name = cellText;
                                }
                                if (thText.includes('ean') && !ean) {
                                    const m = cellText.match(/\b\d{8,14}\b/);
                                    if (m) ean = m[0];
                                }
                                if ((thText.includes('varastopaikka') || thText === 'paikka') && !primaryShelf) {
                                    primaryShelf = cleanShelfName(cellText);
                                }
                                const num = parseFloat(cellText.replace(/\s+/g, '').replace(',', '.'));
                                if (!isNaN(num)) {
                                    if ((thText.includes('varastosaldo') || thText === 'saldo') && totalStock === null) {
                                        totalStock = num;
                                    } else if ((thText.includes('vapaa') || thText === 'vapaana') && availableStock === null) {
                                        availableStock = num;
                                    } else if (thText.includes('varattu') && reservedStock === null) {
                                        reservedStock = num;
                                    }
                                }
                            });
                        }
                    }

                    if (thTexts.some(t => t.includes('kehahinta') || t.includes('vihahinta') || t.includes('myyntihinta'))) {
                        const nextTr = rows[i + 1];
                        if (nextTr) {
                            const tds = Array.from(nextTr.querySelectorAll('td'));
                            thTexts.forEach((thText, idx) => {
                                const cellText = (tds[idx]?.textContent || '').trim();
                                if (thText.includes('myyntihinta') && !myyntihinta) {
                                    myyntihinta = cellText;
                                }
                                if (thText.includes('kehahinta') && !kehahinta) {
                                    kehahinta = cellText;
                                }
                                if (thText.includes('vihahinta') && !vihahinta) {
                                    vihahinta = cellText;
                                    const mDate = ths[idx]?.textContent.match(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/);
                                    if (mDate) vihapvm = mDate[0];
                                }
                            });
                        }
                    }
                }
            }

            if (!kehahinta) {
                const inpKeha = doc.querySelector('input#kehahin');
                if (inpKeha && inpKeha.value) kehahinta = inpKeha.value;
            }
            if (!name) {
                const inpNimi = doc.querySelector('input[name="nimi"], input#nimi');
                if (inpNimi && inpNimi.value) name = inpNimi.value;
            }
            if (!ean) {
                const mEan = html.match(/\b(64\d{11}|[0-9]{12,14})\b/);
                if (mEan) ean = mEan[1];
            }

            doc.querySelectorAll('tr').forEach(tr => {
                const th = tr.querySelector('th');
                const td = tr.querySelector('td');
                if (th && td) {
                    const label = th.textContent.trim().toLowerCase();
                    const val = td.textContent.trim();
                    if ((label.includes('varastopaikka') || label === 'paikka') && !primaryShelf) {
                        primaryShelf = cleanShelfName(val);
                    }
                    const num = parseFloat(val.replace(/\s+/g, '').replace(',', '.'));
                    if (!isNaN(num)) {
                        if (label.includes('varastosaldo') || label === 'saldo') {
                            if (totalStock === null) totalStock = num;
                        } else if (label.includes('vapaa') || label === 'vapaana') {
                            if (availableStock === null) availableStock = num;
                        } else if (label.includes('varattu')) {
                            if (reservedStock === null) reservedStock = num;
                        }
                    }
                }
            });

            return {
                sku,
                name: name || sku,
                ean: ean || '',
                myyntihinta: formatPrice(myyntihinta),
                kehahinta: formatPrice(kehahinta),
                vihahinta: formatPrice(vihahinta),
                vihapvm,
                primaryShelf,
                totalStock,
                availableStock,
                reservedStock
            };
        }

        function parseVarastopaikat(raw) {
            if (!raw) return [];
            let htmlTable = raw;
            try {
                const parsedJson = JSON.parse(raw);
                if (typeof parsedJson === 'string') htmlTable = parsedJson;
            } catch (e) {}

            const locations = [];
            const doc = new DOMParser().parseFromString(htmlTable, 'text/html');
            const trs = Array.from(doc.querySelectorAll('tr'));

            trs.forEach(tr => {
                if (tr.querySelector('th')) return;
                const tds = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
                if (tds.length >= 3) {
                    const wh = tds[0];
                    const shelf = cleanShelfName(tds[1]);
                    const saldo = parseFloat(tds[2].replace(',', '.')) || 0;
                    const hyllyssa = tds[3] ? (parseFloat(tds[3].replace(',', '.')) || 0) : saldo;
                    const available = tds[4] ? (parseFloat(tds[4].replace(',', '.')) || 0) : hyllyssa;

                    if (shelf && shelf !== '?' && !shelf.toLowerCase().includes('tuntematon')) {
                        locations.push({
                            warehouse: wh || 'Päävarasto',
                            shelf,
                            saldo,
                            hyllyssa,
                            available
                        });
                    }
                }
            });

            return locations;
        }

        function getOrCreateCardElement() {
            if (cardElement && document.body.contains(cardElement)) {
                return cardElement;
            }

            const el = document.createElement('div');
            el.id = 'pupe-product-hover-card';
            el.style.cssText = `
                position: fixed;
                z-index: 9999999;
                width: 390px;
                max-width: 92vw;
                background: #ffffff;
                color: #0f172a;
                border-radius: 12px;
                box-shadow: 0 16px 40px -6px rgba(15, 23, 42, 0.28), 0 0 0 1px rgba(15, 23, 42, 0.08);
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                font-size: 13px;
                line-height: 1.45;
                overflow: hidden;
                pointer-events: auto;
                opacity: 0;
                transform: translateY(6px);
                transition: opacity 0.16s ease, transform 0.16s ease;
                display: none;
            `;

            el.addEventListener('mouseenter', () => {
                isHoveringCard = true;
                if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                }
            });

            el.addEventListener('mouseleave', () => {
                isHoveringCard = false;
                scheduleHide();
            });

            document.body.appendChild(el);
            cardElement = el;
            return el;
        }

        function positionCard(anchorEl) {
            if (!cardElement || !anchorEl) return;
            const rect = anchorEl.getBoundingClientRect();
            const screenW = window.innerWidth;
            const screenH = window.innerHeight;
            const cardWidth = Math.min(390, screenW - 24);
            cardElement.style.width = `${cardWidth}px`;
            const cardHeight = cardElement.offsetHeight || 280;

            let top = rect.bottom + 8;
            let left = rect.left;

            if (left + cardWidth > screenW - 12) {
                left = Math.max(12, screenW - cardWidth - 12);
            }

            if (top + cardHeight > screenH - 12) {
                const topAbove = rect.top - cardHeight - 8;
                if (topAbove >= 10) {
                    top = topAbove;
                } else {
                    top = Math.max(10, (screenH - cardHeight) / 2);
                }
            }

            cardElement.style.top = `${Math.round(top)}px`;
            cardElement.style.left = `${Math.round(left)}px`;
        }

        function renderLoadingCard(sku, anchorEl) {
            const card = getOrCreateCardElement();
            card.innerHTML = `
                <div style="background:#0f172a; color:#ffffff; padding:12px 16px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <span style="font-family:monospace; font-size:15px; font-weight:800; letter-spacing:0.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(sku)}</span>
                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                            <span style="font-size:11px; background:rgba(255,255,255,0.15); padding:2px 8px; border-radius:999px; white-space:nowrap;">Haetaan...</span>
                            <button id="pupe-card-close-btn" type="button" title="Sulje" style="background:rgba(255,255,255,0.12); border:none; color:#cbd5e1; cursor:pointer; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; line-height:1; transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'; this.style.color='#ffffff';" onmouseout="this.style.background='rgba(255,255,255,0.12)'; this.style.color='#cbd5e1';">✕</button>
                        </div>
                    </div>
                </div>
                <div style="padding:24px 16px; text-align:center; color:#64748b;">
                    <div style="display:inline-block; width:22px; height:22px; border:3px solid #e2e8f0; border-top-color:#0284c7; border-radius:50%; animation:pupeSpin 0.7s linear infinite;"></div>
                    <div style="font-size:12px; font-weight:600; margin-top:8px;">Haetaan tuotetietoja ja hintoja...</div>
                </div>
                <style>
                    @keyframes pupeSpin { to { transform: rotate(360deg); } }
                </style>
            `;
            card.style.display = 'block';
            positionCard(anchorEl);

            const closeBtn = card.querySelector('#pupe-card-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideCard();
                });
            }

            requestAnimationFrame(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            });
        }

        function renderCompleteCard(data, anchorEl) {
            if (!data || activeSku !== data.sku) return;
            const card = getOrCreateCardElement();

            let locationsHtml = '';
            if (data.locations && data.locations.length > 0) {
                locationsHtml = data.locations.map(loc => `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:5px 0; border-bottom:1px dashed #f1f5f9; font-size:12px;">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span style="background:#f1f5f9; color:#475569; font-weight:700; padding:2px 6px; border-radius:4px; font-size:11px;">${escapeHtml(loc.warehouse)}</span>
                            <span style="font-family:monospace; font-weight:700; color:#0f172a;">${escapeHtml(loc.shelf)}</span>
                        </div>
                        <div style="text-align:right;">
                            <span style="font-weight:700; color:${loc.available > 0 ? '#16a34a' : '#dc2626'};">${loc.available} kpl</span>
                            <span style="color:#94a3b8; font-size:11px;"> / ${loc.saldo} kpl</span>
                        </div>
                    </div>
                `).join('');
            } else {
                locationsHtml = `<div style="color:#94a3b8; font-size:12px; font-style:italic; padding:4px 0;">Ei määriteltyä varastopaikkaa</div>`;
            }

            const availNum = data.availableStock !== null ? data.availableStock : '-';
            const totalNum = data.totalStock !== null ? data.totalStock : '-';
            const resNum = data.reservedStock !== null ? data.reservedStock : '-';

            card.innerHTML = `
                <!-- YLÄOSA: SKU, EAN, NIMI, SULJINAPPI -->
                <div style="background:#0f172a; color:#ffffff; padding:12px 16px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <span style="font-family:monospace; font-size:16px; font-weight:800; letter-spacing:0.5px; color:#38bdf8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(data.sku)}</span>
                        <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
                            ${data.ean ? `<span style="font-size:11px; font-family:monospace; background:rgba(255,255,255,0.16); color:#f8fafc; padding:2px 8px; border-radius:999px; white-space:nowrap;">EAN: ${escapeHtml(data.ean)}</span>` : ''}
                            <button id="pupe-card-close-btn" type="button" title="Sulje" style="background:rgba(255,255,255,0.12); border:none; color:#cbd5e1; cursor:pointer; width:26px; height:26px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:13px; font-weight:700; line-height:1; transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.25)'; this.style.color='#ffffff';" onmouseout="this.style.background='rgba(255,255,255,0.12)'; this.style.color='#cbd5e1';">✕</button>
                        </div>
                    </div>
                    <div style="font-size:13px; font-weight:600; color:#e2e8f0; margin-top:4px; line-height:1.35;">${escapeHtml(data.name)}</div>
                </div>

                <!-- HINTATIEDOT: MYYNTIHINTA, KEHAHINTA, VIHAHINTA -->
                <div style="padding:12px 16px 10px 16px; background:#ffffff; border-bottom:1px solid #f1f5f9;">
                    <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:8px; text-align:center;">
                        <!-- Myyntihinta -->
                        <div style="background:#f0f9ff; border:1px solid #bae6fd; border-radius:8px; padding:7px 4px;">
                            <div style="font-size:10px; font-weight:800; color:#0369a1; text-transform:uppercase; letter-spacing:0.4px;">Myyntihinta</div>
                            <div style="font-size:15px; font-weight:800; color:#0284c7; margin-top:2px;">${escapeHtml(data.myyntihinta)}</div>
                        </div>
                        <!-- Kehahinta -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:7px 4px;">
                            <div style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.4px;">Kehahinta</div>
                            <div style="font-size:14px; font-weight:700; color:#1e293b; margin-top:2px;">${escapeHtml(data.kehahinta)}</div>
                        </div>
                        <!-- Vihahinta -->
                        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:7px 4px;">
                            <div style="font-size:10px; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.4px;">Vihahinta</div>
                            <div style="font-size:14px; font-weight:700; color:#1e293b; margin-top:2px;">${escapeHtml(data.vihahinta)}</div>
                            ${data.vihapvm ? `<div style="font-size:9px; color:#64748b; margin-top:1px;">(${escapeHtml(data.vihapvm)})</div>` : ''}
                        </div>
                    </div>
                </div>

                <!-- VARASTOSALDO JA SAATAVUUS -->
                <div style="padding:10px 16px; background:#fafafa; border-bottom:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; font-size:12px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="font-weight:700; color:#475569;">Saldo yhteensä:</span>
                        <span style="font-weight:800; color:#0f172a;">${totalNum} kpl</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="color:#64748b;">Varattu: <strong style="color:#0f172a;">${resNum}</strong></span>
                        <span style="background:${availNum > 0 ? '#dcfce7' : '#fee2e2'}; color:${availNum > 0 ? '#15803d' : '#b91c1c'}; font-weight:800; padding:2px 8px; border-radius:999px;">
                            Vapaana: ${availNum}
                        </span>
                    </div>
                </div>

                <!-- VARASTOPAIKAT -->
                <div style="padding:10px 16px 12px 16px; background:#ffffff;">
                    <div style="font-size:11px; font-weight:800; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px;">
                        Varastopaikat
                    </div>
                    <div style="max-height:140px; overflow-y:auto;">
                        ${locationsHtml}
                    </div>
                </div>

                <!-- ALAOSA: YHTIÖ, HAKUHETKI JA LINKKI TUOTEKYSELYYN -->
                <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:8px 16px; display:flex; align-items:center; justify-content:space-between; font-size:11px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="color:#64748b; font-weight:700; letter-spacing:0.2px;">Audioimport Oy</span>
                        ${data.timestamp ? `
                            <span style="color:#cbd5e1;">·</span>
                            <span style="color:#94a3b8; font-size:10px;" title="Tietojen hakuhetki">${formatTime(data.timestamp)}</span>
                            <button id="pupe-card-refresh-btn" type="button" title="Päivitä tiedot heti palvelimelta" style="background:transparent; border:none; color:#94a3b8; cursor:pointer; padding:2px; border-radius:4px; display:inline-flex; align-items:center; justify-content:center; transition:color 0.15s;" onmouseover="this.style.color='#0284c7';" onmouseout="this.style.color='#94a3b8';">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
                            </button>
                        ` : ''}
                    </div>
                    <a href="/tuote.php?tee=Z&tuoteno=${encodeURIComponent(data.sku)}" target="_blank" style="color:#0284c7; font-weight:700; text-decoration:none; display:inline-flex; align-items:center; gap:4px;">
                        <span>Avaa tuotekyselyssä</span>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                    </a>
                </div>
            `;

            card.style.display = 'block';
            positionCard(anchorEl);

            const closeBtn = card.querySelector('#pupe-card-close-btn');
            if (closeBtn) {
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    hideCard();
                });
            }

            const refreshBtn = card.querySelector('#pupe-card-refresh-btn');
            if (refreshBtn) {
                refreshBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    refreshBtn.style.animation = 'pupeSpin 0.7s linear infinite';
                    const fresh = await fetchProductDetails(data.sku, true);
                    if (fresh && activeSku === data.sku) {
                        renderCompleteCard(fresh, anchorEl);
                    }
                });
            }

            requestAnimationFrame(() => {
                card.style.opacity = '1';
                card.style.transform = 'translateY(0)';
            });
        }

        function hideCard() {
            if (!cardElement) return;
            cardElement.style.opacity = '0';
            cardElement.style.transform = 'translateY(6px)';
            setTimeout(() => {
                if (!isHoveringCard && (!activeAnchor || !activeAnchor.matches(':hover'))) {
                    cardElement.style.display = 'none';
                    activeSku = null;
                    activeAnchor = null;
                }
            }, 160);
        }

        function scheduleHide() {
            if (hideTimer) clearTimeout(hideTimer);
            hideTimer = setTimeout(() => {
                if (!isHoveringCard && (!activeAnchor || !activeAnchor.matches(':hover'))) {
                    hideCard();
                }
            }, 180);
        }

        // Tapahtumankuuntelijat
        document.addEventListener('mouseover', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const sku = extractSkuFromLink(link);
            if (!sku) return;

            if (activeSku === sku && cardElement && cardElement.style.display !== 'none') {
                if (hideTimer) {
                    clearTimeout(hideTimer);
                    hideTimer = null;
                }
                return;
            }

            if (hoverTimer) clearTimeout(hoverTimer);
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }

            hoverTimer = setTimeout(async () => {
                activeSku = sku;
                activeAnchor = link;

                if (productCache.has(sku)) {
                    const cachedData = productCache.get(sku);
                    renderCompleteCard(cachedData, link);

                    const age = Date.now() - (cachedData.timestamp || 0);
                    if (age > CACHE_STALE_AGE_MS) {
                        fetchProductDetails(sku, true).then(freshData => {
                            if (freshData && activeSku === sku) {
                                renderCompleteCard(freshData, link);
                            }
                        });
                    }
                    return;
                }

                renderLoadingCard(sku, link);
                const data = await fetchProductDetails(sku);
                if (data && activeSku === sku) {
                    renderCompleteCard(data, link);
                }
            }, 200);
        }, true);

        document.addEventListener('mouseout', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            const sku = extractSkuFromLink(link);
            if (!sku) return;

            if (hoverTimer) {
                clearTimeout(hoverTimer);
                hoverTimer = null;
            }

            scheduleHide();
        }, true);

        // Kosketusnäyttöjen ja tablettien tuki (Touch & Tap)
        document.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (!link) return;

            if (cardElement && cardElement.contains(e.target)) return;

            const sku = extractSkuFromLink(link);
            if (!sku) return;

            if (activeSku !== sku || !cardElement || cardElement.style.display === 'none') {
                e.preventDefault();
                e.stopPropagation();

                if (hoverTimer) clearTimeout(hoverTimer);
                if (hideTimer) clearTimeout(hideTimer);

                activeSku = sku;
                activeAnchor = link;

                if (productCache.has(sku)) {
                    const cachedData = productCache.get(sku);
                    renderCompleteCard(cachedData, link);
                    const age = Date.now() - (cachedData.timestamp || 0);
                    if (age > CACHE_STALE_AGE_MS) {
                        fetchProductDetails(sku, true).then(freshData => {
                            if (freshData && activeSku === sku) {
                                renderCompleteCard(freshData, link);
                            }
                        });
                    }
                } else {
                    renderLoadingCard(sku, link);
                    fetchProductDetails(sku).then(data => {
                        if (data && activeSku === sku) {
                            renderCompleteCard(data, link);
                        }
                    });
                }
            }
        }, true);

        document.addEventListener('touchstart', (e) => {
            if (cardElement && cardElement.style.display !== 'none') {
                if (!cardElement.contains(e.target) && (!activeAnchor || !activeAnchor.contains(e.target))) {
                    hideCard();
                }
            }
        }, { passive: true });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (hoverTimer) clearTimeout(hoverTimer);
                hideCard();
            }
        });

        window.addEventListener('scroll', () => {
            if (cardElement && cardElement.style.display !== 'none' && !isHoveringCard) {
                hideCard();
            }
        }, { passive: true });
    }


    // =========================================================================
    // OSA 7: ENNUSTAVA PIKAHAKU & TUOTEKYSELYN VARASTOPAIKKASIIRTO (V7.3)
    // - Ennustava livesearch / jokerihaku (Alt+F tai kelluva painike)
    // - Tuotekyselyn ja keräilyn yhtenäistetty varastopaikkasiirto [Oletuspaikka]-tunnistuksella
    // - Yhtenäistetyt Pupesoft-siniset napit (#119fe7) ilman emojeja
    // - Pikselintarkka pysty- ja vaakakohdistus (Näytä / Tulosta / Päivitä -linjaan)
    // =========================================================================
    function isMainWorkspace() {
        const frameName = window.name || '';
        if (frameName === 'ylaframe' || frameName === 'menuframe' || frameName === 'alamenu') {
            return false;
        }
        const path = (window.location.pathname || '').toLowerCase();
        if (path.includes('ylaframe.php') || path.includes('indexvas.php')) {
            return false;
        }
        if (document.querySelector('frameset')) {
            return false;
        }
        if (frameName === 'mainframe') {
            return true;
        }
        if (window === window.top) {
            return true;
        }
        return false;
    }

// =========================================================================
    // APUFUNKTIOT
    // =========================================================================
    function decodeBuffer(buffer) {
        let text = '';
        try {
            text = new TextDecoder('utf-8').decode(buffer);
            if (text.includes('\uFFFD')) {
                text = new TextDecoder('iso-8859-1').decode(buffer);
            }
        } catch (e) {
            text = new TextDecoder('iso-8859-1').decode(buffer);
        }
        return text;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function cleanShelfName(raw) {
        if (!raw) return '';
        return String(raw)
            .replace(/<br\s*[\/]?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/^[a-zäöå\s]+:\s*/i, '') // Poistaa "Päävarasto: " tai "Varasto: "
            .replace(/Ei\s*saapumis[^\n\r]*/gi, '') // Poistaa ostotilaustiedon "Ei saapumista: 131.00"
            .replace(/Saapuu[^\n\r]*/gi, '') // Poistaa ostotilaustiedon "Saapuu: ..."
            .replace(/Saapuminen[^\n\r]*/gi, '') // Poistaa ostotilaustiedon "Saapuminen: ..."
            .replace(/Tilattu[^\n\r]*/gi, '') // Poistaa "Tilattu: ..."
            .replace(/\(\d{4}-\d{2}-\d{2}\)/g, '') // Poistaa päivämäärät esim. (2025-02-03)
            .replace(/\(\d+(?:\.\d+)?\)/g, '') // Poistaa lukumäärät esim. (16)
            .replace(/\s+/g, ' ')
            .trim();
    }

    // Puhdistaa tuotenimestä Pupesoftin taulukko- ja statusjätteet (kuten HinnastoonStatus)
    function cleanProductName(raw, sku = '') {
        if (!raw) return '';
        let cleaned = String(raw)
            .replace(/<br\s*[\/]?>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/gi, ' ')
            .trim();

        if (sku) {
            const escSku = String(sku).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            cleaned = cleaned.replace(new RegExp('^' + escSku + '[\\s\\-–—:]*', 'i'), '');
        }

        cleaned = cleaned
            .replace(/HinnastoonStatus/gi, '')
            .replace(/Hinnastoon/gi, '')
            .replace(/Status:\s*\w*/gi, '')
            .replace(/\bStatus\b/gi, '')
            .replace(/Tuotteen varastopaikat/gi, '')
            .replace(/^[\s\-–—:]+/, '')
            .replace(/[\s\-–—:]+$/, '')
            .replace(/\s+/g, ' ')
            .trim();

        const lower = cleaned.toLowerCase();
        if (lower === 'nimitys' || lower === 'tuotenumero' || lower === 'eankoodi' || lower === 'yksikkö' || lower === 'yksikko' || lower.length < 2) {
            return '';
        }

        return cleaned;
    }

    // =========================================================================
    // HAKUSTRAREGIAT: LIVESEARCH, JOKERI JA SUORA TUOTEHAKU
    // =========================================================================

    // 1. Pupesoftin sisäänrakennettu LiveSearch (hakee tuotenumerosta, nimityksestä ja EAN-koodista)
    async function fetchLivesearch(query) {
        const clean = String(query || '').trim();
        if (clean.length < 2) return [];

        try {
            const url = `/tuote.php?livesearch_tee=TUOTEHAKU&livesearch_haku=${encodeURIComponent(clean)}&livesearch_form=formi&livesearch_hakuid=tuoteno&livesearch_nimi=tuoteno&livesearch_submit=X`;
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return [];

            const buf = await res.arrayBuffer();
            const html = decodeBuffer(buf);

            const results = [];
            const blockRegex = /<div\s+id=['"]tuote_valinta_\d+['"][^>]*onclick=['"]([^"]+)['"][^>]*>([\s\S]*?)<\/div>/gi;
            let match;
            while ((match = blockRegex.exec(html)) !== null) {
                const onclick = match[1];
                const inner = match[2];

                const skuM = onclick.match(/value\s*=\s*['"]([^'"]+)['"]/i);
                const sku = skuM ? skuM[1].trim() : '';

                const fonts = Array.from(inner.matchAll(/<font[^>]*>([\s\S]*?)<\/font>/gi)).map(f => f[1].trim());
                const name = fonts[1] || '';
                const saldoRaw = fonts[2] || '';

                if (sku) {
                    results.push({
                        sku,
                        name: name || sku,
                        saldoRaw,
                        source: 'livesearch'
                    });
                }
            }

            return results;
        } catch (e) {
            console.warn('[Pupe-Pikahaku] Virhe livesearch-haussa:', e);
            return [];
        }
    }

    // 2. Pupesoftin jokerihaku (*sana*)
    async function fetchWildcardTuote(query) {
        const clean = String(query || '').trim();
        if (clean.length < 2) return { isList: false, items: [], singlePageHtml: null };

        try {
            const wildcardSku = `*${clean}*`;
            const url = `/tuote.php?tee=Z&tuoteno=${encodeURIComponent(wildcardSku)}&lopetus=`;
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return { isList: false, items: [], singlePageHtml: null };

            const buf = await res.arrayBuffer();
            const html = decodeBuffer(buf);

            // A) Tarkistetaan palauttiko Pupesoft <select name="tuoteno">-pudotusvalikon
            const optRegex = /<option\s+value=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/option>/gi;
            const items = [];
            let mOpt;
            while ((mOpt = optRegex.exec(html)) !== null) {
                const val = mOpt[1].trim();
                const text = mOpt[2].trim();
                if (!val || val.includes('Valitse')) continue;

                let cleanVal = val.split('####')[0].trim();
                let name = text;
                let saldo = null;
                const saldoM = text.match(/\(([-]?\d+(?:\.\d+)?)\)$/);
                if (saldoM) {
                    saldo = parseFloat(saldoM[1]);
                    name = name.replace(/\s*\([-]?\d+(?:\.\d+)?\)$/, '');
                }
                if (name.startsWith(cleanVal)) {
                    name = name.substring(cleanVal.length).trim();
                }
                if (cleanVal && !items.some(it => it.sku === cleanVal)) {
                    items.push({
                        sku: cleanVal,
                        name: name || cleanVal,
                        saldo,
                        source: 'select'
                    });
                }
            }

            if (items.length > 0) {
                return { isList: true, items, singlePageHtml: null };
            }

            // B) Tarkistetaan tuloslista taulukkomuodossa
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const tableLinks = Array.from(doc.querySelectorAll('table a[href*="tuoteno="], a[href*="tuote.php?tee=Z"]'));
            if (tableLinks.length > 1) {
                tableLinks.forEach(a => {
                    const m = a.href.match(/tuoteno=([^&]+)/);
                    if (m) {
                        const itemSku = decodeURIComponent(m[1]).replace(/\+/g, ' ').replace(/^\*+|\*+$/g, '').trim();
                        const tr = a.closest('tr');
                        let itemName = '';
                        if (tr) {
                            const tds = Array.from(tr.querySelectorAll('td'));
                            const candidate = tds.find(td => td !== a.closest('td') && td.textContent.trim().length > 2);
                            if (candidate) itemName = candidate.textContent.trim();
                        }
                        if (itemSku && !items.some(p => p.sku === itemSku)) {
                            items.push({ sku: itemSku, name: itemName || itemSku, source: 'table' });
                        }
                    }
                });

                if (items.length > 0) {
                    return { isList: true, items, singlePageHtml: null };
                }
            }

            return { isList: false, items: [], singlePageHtml: html };
        } catch (e) {
            console.warn('[Pupe-Pikahaku] Virhe jokerisivun haussa:', e);
            return { isList: false, items: [], singlePageHtml: null };
        }
    }

    // 3. Hakee tuotteen tarkat varastopaikat, Hyllyssä-määrät ja saldot ajax=varastopaikat -rajapinnasta
    async function fetchVarastopaikatAjax(sku) {
        const clean = String(sku || '').trim();
        if (!clean) return { locations: [], totalHyllyssa: null, totalSaldo: null, totalAvailable: null };

        try {
            const url = `/tuote.php?ajax=varastopaikat&tuoteno=${encodeURIComponent(clean)}`;
            const res = await fetch(url, { credentials: 'include' });
            if (!res.ok) return { locations: [], totalHyllyssa: null, totalSaldo: null, totalAvailable: null };

            const buf = await res.arrayBuffer();
            let rawText = decodeBuffer(buf);

            let htmlTable = rawText;
            try {
                const parsedJson = JSON.parse(rawText);
                if (typeof parsedJson === 'string') htmlTable = parsedJson;
            } catch (e) {}

            const locations = [];
            let totalSaldo = 0;
            let totalHyllyssa = 0;
            let totalAvailable = 0;
            let hasRows = false;
            let defaultCandidate = '';

            const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let mRow;
            while ((mRow = rowRegex.exec(htmlTable)) !== null) {
                const rowContent = mRow[1];
                if (rowContent.includes('<th')) continue;

                const tds = Array.from(rowContent.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(m => m[1].replace(/<br\s*[\/]?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
                if (tds.length >= 3) {
                    hasRows = true;
                    const warehouse = tds[0];
                    const rawShelf = tds[1];
                    const shelf = cleanShelfName(rawShelf);

                    // Pupesoftin sarakkeet:
                    // tds[2] = Saldo (kokonaissaldo)
                    // tds[3] = Hyllyssä (fyysisesti hyllyssä)
                    // tds[4] = Myytävissä (vapaana)
                    const saldoVal = parseFloat(tds[2].replace(',', '.')) || 0;
                    const hyllyssaVal = tds[3] ? (parseFloat(tds[3].replace(',', '.')) || 0) : saldoVal;
                    const availableVal = tds[4] ? (parseFloat(tds[4].replace(',', '.')) || 0) : saldoVal;

                    if (shelf && shelf !== '?' && !shelf.toLowerCase().includes('tuntematon')) {
                        const isMainWh = warehouse.toLowerCase().includes('pää');
                        // Pupesoft järjestää sql-kyselyssä: ORDER BY toimipaikka_sorttaus, tuotepaikat.oletus DESC
                        // Ensimmäinen Päävaraston hylly on siten vahva oletuspaikkakandidaatti
                        if (!defaultCandidate && isMainWh) {
                            defaultCandidate = shelf;
                        }

                        locations.push({
                            warehouse,
                            placeName: shelf,
                            qty: hyllyssaVal, // Ensisijainen varaston lukema on FYYSISESTI HYLLYSSÄ
                            hyllyssa: hyllyssaVal,
                            saldo: saldoVal,
                            available: availableVal
                        });

                        if (saldoVal > 0) totalSaldo += saldoVal;
                        if (hyllyssaVal > 0) totalHyllyssa += hyllyssaVal;
                        if (availableVal > 0) totalAvailable += availableVal;
                    }
                }
            }

            if (!defaultCandidate && locations.length > 0) {
                defaultCandidate = locations[0].placeName;
            }

            return {
                locations,
                defaultCandidate,
                totalHyllyssa: hasRows ? totalHyllyssa : null,
                totalSaldo: hasRows ? totalSaldo : null,
                totalAvailable: hasRows ? totalAvailable : null
            };
        } catch (e) {
            console.warn('[Pupe-Pikahaku] Virhe varastopaikat-ajaxissa:', e);
            return { locations: [], defaultCandidate: '', totalHyllyssa: null, totalSaldo: null, totalAvailable: null };
        }
    }

    // 4. Hakee lisäpaikat ja virallisen Oletuspaikan muuvarastopaikka.php:sta
    async function fetchLocationsFromMuuvarastopaikka(sku) {
        const cleanSku = String(sku || '').trim();
        if (!cleanSku) return { locations: [], defaultShelf: '' };

        try {
            const params = new URLSearchParams();
            params.set('tee', 'M');
            params.set('tuoteno', cleanSku);
            params.set('toim', '');

            const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
                body: params.toString()
            });

            if (!res.ok) return { locations: [], defaultShelf: '' };

            const buffer = await res.arrayBuffer();
            const html = decodeBuffer(buffer);
            const doc = new DOMParser().parseFromString(html, 'text/html');

            let defaultShelf = '';

            // 1. Etsitään Oletuspaikka radio-painikkeesta (<input type="radio" name="oletus" checked>)
            const checkedRadio = doc.querySelector('input[name="oletus"]:checked, input[name="oletus"][checked]');
            if (checkedRadio) {
                const tr = checkedRadio.closest('tr');
                if (tr) {
                    const tds = Array.from(tr.querySelectorAll('td'));
                    if (tds.length >= 2) {
                        defaultShelf = cleanShelfName(tds[1].textContent);
                    }
                }
            }

            // 2. Parsitaan taulukon rivit
            const locations = [];
            const tableRows = Array.from(doc.querySelectorAll('table tr'));
            for (const tr of tableRows) {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 4) {
                    const warehouse = (tds[0]?.textContent || '').trim() || 'Varasto';
                    const rawShelf = (tds[1]?.textContent || '').trim();
                    const shelf = cleanShelfName(rawShelf);
                    if (!shelf || shelf === '?' || shelf.toLowerCase().includes('tuntematon')) continue;

                    const saldoVal = parseFloat((tds[2]?.textContent || '').replace(',', '.')) || 0;
                    const hyllyVal = parseFloat((tds[3]?.textContent || '').replace(',', '.')) || saldoVal;
                    const isOletus = tr.querySelector('input[name="oletus"]:checked, input[name="oletus"][checked]');

                    if (isOletus && !defaultShelf) {
                        defaultShelf = shelf;
                    }

                    locations.push({
                        warehouse,
                        placeName: shelf,
                        qty: hyllyVal,
                        hyllyssa: hyllyVal,
                        saldo: saldoVal
                    });
                }
            }

            // 3. Varmistus: jos taulukosta ei löytynyt, tarkistetaan select-optiot
            if (locations.length === 0) {
                const selectOptions = Array.from(doc.querySelectorAll('select[name="mista"] option, select[name="minne"] option'));
                selectOptions.forEach(opt => {
                    const rawLabel = (opt.textContent || '').trim();
                    if (!rawLabel || rawLabel.includes('Valitse') || rawLabel === '') return;

                    const m = rawLabel.match(/\(([-]?\d+(?:\.\d+)?)\)/);
                    const qty = m ? parseFloat(m[1]) : 0;
                    const placeName = cleanShelfName(rawLabel);

                    if (placeName) {
                        locations.push({ warehouse: 'Varasto', placeName, qty, hyllyssa: qty, saldo: qty });
                    }
                });
            }

            return { locations, defaultShelf };
        } catch (e) {
            return { locations: [], defaultShelf: '' };
        }
    }

    // 5. Jäsentää yksittäisen tuotteen tiedot tuote.php-sivulta
    function parsePikahakuTuoteDetails(html, query, fallbackName = '') {
        if (!html) return null;
        const doc = new DOMParser().parseFromString(html, 'text/html');

        let sku = '';
        let name = '';
        let ean = '';
        let primaryShelf = '';
        let totalStock = null;
        let availableStock = null;
        let reservedStock = null;

        // Etsitään taulukosta .tuotekysely tarkat sarakkeet
        const tuoteTable = doc.querySelector('table.tuotekysely, table#maintable');
        if (tuoteTable) {
            const trs = Array.from(tuoteTable.querySelectorAll('tr'));
            let headerCells = [];
            for (const tr of trs) {
                const ths = Array.from(tr.querySelectorAll('th'));
                if (ths.length >= 3) {
                    headerCells = ths.map(th => th.textContent.replace(/<[^>]+>/g, ' ').trim().toLowerCase());
                } else if (headerCells.length >= 3) {
                    const tds = Array.from(tr.querySelectorAll('td'));
                    if (tds.length >= headerCells.length - 2) {
                        headerCells.forEach((h, idx) => {
                            const rawCellText = (tds[idx]?.textContent || '').trim();
                            if (h.includes('tuotenumero') && !sku) {
                                sku = rawCellText.split('\n')[0].trim();
                            }
                            if (h.includes('nimitys') && !name) {
                                name = rawCellText;
                            }
                            if (h.includes('ean') && !ean) {
                                const m = rawCellText.match(/\b\d{8,14}\b/);
                                if (m) ean = m[0];
                            }
                        });
                        break;
                    }
                }
            }
        }

        // Varmistus: jos nimitys jäi tyhjäksi tai sekoittui otsikkosanoihin
        name = cleanProductName(name, sku) || cleanProductName(fallbackName, sku) || '';

        // Etsitään EAN-koodi tekstistä varmistuksena
        if (!ean) {
            const mEan = html.match(/\b(64\d{11}|[0-9]{12,14})\b/);
            if (mEan) ean = mEan[1];
        }

        // Päävarastopaikka ja saldot
        doc.querySelectorAll('tr').forEach(tr => {
            const th = tr.querySelector('th');
            const td = tr.querySelector('td');
            if (th && td) {
                const label = th.textContent.trim().toLowerCase();
                const val = td.textContent.trim();
                if (label.includes('varastopaikka') || label === 'paikka') {
                    primaryShelf = cleanShelfName(val);
                }
                const num = parseFloat(val.replace(/\s+/g, '').replace(',', '.'));
                if (!isNaN(num)) {
                    if (label.includes('varastosaldo') || label === 'saldo') {
                        if (totalStock === null) totalStock = num;
                    } else if (label.includes('vapaa') || label === 'vapaana') {
                        if (availableStock === null) availableStock = num;
                    } else if (label.includes('varattu')) {
                        if (reservedStock === null) reservedStock = num;
                    }
                }
            }
        });

        return {
            sku: sku || query,
            name: name || fallbackName || sku || query,
            ean: (ean && /^\d{8,14}$/.test(ean)) ? ean : '',
            primaryShelf,
            totalStock,
            availableStock,
            reservedStock
        };
    }

    // 6. Hakee yhden tietyn tuotteen täydet tiedot, erittelee Hyllyssä vs Saldo
    async function fetchFullProductInfo(targetSku, initialName = '', initialStock = null) {
        console.log(`[Pupe-Pikahaku] Haetaan tuotekortti kohteelle: ${targetSku}`);
        const debugLog = [`Haetaan tiedot tuotteelle: ${targetSku}`];

        const [resTuote, resAjax, resMuu] = await Promise.all([
            fetch(`/tuote.php?tee=Z&tuoteno=${encodeURIComponent(targetSku)}&lopetus=`, { credentials: 'include' })
                .then(r => r.ok ? r.arrayBuffer() : null)
                .then(b => b ? decodeBuffer(b) : '')
                .catch(e => { debugLog.push(`tuote.php virhe: ${e.message}`); return ''; }),

            fetchVarastopaikatAjax(targetSku),
            fetchLocationsFromMuuvarastopaikka(targetSku)
        ]);

        const parsed = parsePikahakuTuoteDetails(resTuote, targetSku, initialName);

        // Kootaan ja suodatetaan varastopaikat
        const rawLocations = [];

        // 1. ajax=varastopaikat -taulukko
        if (resAjax.locations && resAjax.locations.length > 0) {
            resAjax.locations.forEach(loc => rawLocations.push(loc));
        }

        // 2. tuote.php pääpaikka
        if (parsed?.primaryShelf) {
            rawLocations.push({
                warehouse: 'Päävarasto',
                placeName: parsed.primaryShelf,
                qty: parsed.totalStock !== null ? parsed.totalStock : 0,
                hyllyssa: parsed.totalStock !== null ? parsed.totalStock : 0,
                saldo: parsed.totalStock !== null ? parsed.totalStock : 0,
                available: parsed.availableStock !== null ? parsed.availableStock : parsed.totalStock
            });
        }

        // 3. muuvarastopaikka.php lisäpaikat ja virallinen oletuspaikka
        const muuLocations = resMuu?.locations || [];
        const muuDefaultShelf = resMuu?.defaultShelf || '';

        if (muuLocations.length > 0) {
            muuLocations.forEach(loc => rawLocations.push(loc));
        }

        // Määritetään virallinen Oletuspaikka:
        // 1. Ensisijainen: muuvarastopaikka.php <input type="radio" name="oletus" checked>
        // 2. Toissijainen: ajax=varastopaikat sql ORDER BY oletus DESC mukainen ensimmäinen Päävaraston hylly
        // 3. Kolmassijainen: tuote.php parsed.primaryShelf
        const officialDefaultShelf = cleanShelfName(muuDefaultShelf || resAjax?.defaultCandidate || parsed?.primaryShelf || '');

        // Suodatetaan nollasaldoiset tyhjät ja poistetaan tuplat
        const hasPositiveStock = rawLocations.some(l => (l.hyllyssa || l.saldo || l.qty) > 0);
        const seenShelves = new Set();
        const cleanedLocations = [];

        for (const loc of rawLocations) {
            const pName = cleanShelfName(loc.placeName);
            if (!pName) continue;

            const locHylly = loc.hyllyssa !== undefined ? loc.hyllyssa : (loc.qty || 0);
            const locSaldo = loc.saldo !== undefined ? loc.saldo : (loc.qty || 0);

            // Ohitetaan tyhjät 0 0 0 -haamupaikat jos ei saldoa
            if (pName.includes('0 0 0') && locHylly <= 0 && locSaldo <= 0) continue;

            // Jos tuotteella on oikeita saldollisia hyllyjä, ei näytetä nollasaldoisia
            if (locHylly <= 0 && locSaldo <= 0 && hasPositiveStock) continue;

            const shelfKey = pName.toUpperCase();
            if (seenShelves.has(shelfKey)) continue;
            seenShelves.add(shelfKey);

            cleanedLocations.push({
                warehouse: loc.warehouse || 'Varasto',
                placeName: pName,
                qty: locHylly, // Päämäärä on FYYSISESTI HYLLYSSÄ
                hyllyssa: locHylly,
                saldo: locSaldo,
                available: loc.available !== undefined ? loc.available : locHylly,
                isDefault: false
            });
        }

        // Merkitään TARKALLEEN YKSI virallinen Oletuspaikka:
        let defaultAssigned = false;
        if (officialDefaultShelf) {
            const match = cleanedLocations.find(l => cleanShelfName(l.placeName).toUpperCase() === officialDefaultShelf.toUpperCase());
            if (match) {
                match.isDefault = true;
                defaultAssigned = true;
            }
        }
        // Varmistus: jos mikään ei täsmännyt suoraan, merkitään Päävaraston ensimmäinen paikka
        if (!defaultAssigned && cleanedLocations.length > 0) {
            const firstMain = cleanedLocations.find(l => (l.warehouse || '').toLowerCase().includes('pää')) || cleanedLocations[0];
            if (firstMain) {
                firstMain.isDefault = true;
            }
        }

        // Järjestetään: Oletuspaikka ensin, sitten Päävarasto, sitten hyllymäärät laskevasti
        cleanedLocations.sort((a, b) => {
            if (a.isDefault && !b.isDefault) return -1;
            if (!a.isDefault && b.isDefault) return 1;

            const aIsMain = (a.warehouse || '').toLowerCase().includes('pää');
            const bIsMain = (b.warehouse || '').toLowerCase().includes('pää');
            if (aIsMain && !bIsMain) return -1;
            if (!aIsMain && bIsMain) return 1;

            return (b.hyllyssa || 0) - (a.hyllyssa || 0);
        });

        // Lasketaan kokonaissummat eriteltynä
        let finalHyllyssa = resAjax.totalHyllyssa;
        let finalSaldo = resAjax.totalSaldo !== null ? resAjax.totalSaldo : parsed?.totalStock;
        let finalAvailable = resAjax.totalAvailable !== null ? resAjax.totalAvailable : parsed?.availableStock;

        if (finalHyllyssa === null && cleanedLocations.length > 0) {
            finalHyllyssa = cleanedLocations.reduce((s, l) => s + (l.hyllyssa > 0 ? l.hyllyssa : 0), 0);
        }
        if (finalSaldo === null && cleanedLocations.length > 0) {
            finalSaldo = cleanedLocations.reduce((s, l) => s + (l.saldo > 0 ? l.saldo : 0), 0);
        }

        if (finalHyllyssa === null) finalHyllyssa = finalSaldo || 0;
        if (finalSaldo === null) finalSaldo = finalHyllyssa || 0;
        if (finalAvailable === null) finalAvailable = finalHyllyssa;

        const reservedStock = Math.max(0, finalSaldo - finalAvailable);

        return {
            sku: parsed?.sku || targetSku,
            name: parsed?.name || initialName || targetSku,
            ean: parsed?.ean || '',
            locations: cleanedLocations,
            totalHyllyssa: finalHyllyssa !== null ? finalHyllyssa : 0,
            totalSaldo: finalSaldo !== null ? finalSaldo : 0,
            availableStock: finalAvailable !== null ? finalAvailable : finalHyllyssa,
            reservedStock: reservedStock,
            debugLog
        };
    }

    // =========================================================================
    // ÄLYKÄS PÄÄHAKUTOIMINTO
    // =========================================================================
    async function executeSmartSearch(query) {
        const cleanQuery = String(query || '').trim();
        if (!cleanQuery) return null;

        console.log(`[Pupe-Pikahaku] Älykäs haku: "${cleanQuery}"`);
        const debugLog = [`Haku aloitettu sanalla: "${cleanQuery}"`];

        const [liveMatches, wildcardResult] = await Promise.all([
            fetchLivesearch(cleanQuery),
            fetchWildcardTuote(cleanQuery)
        ]);

        debugLog.push(`Livesearch osumia: ${liveMatches.length}`);
        debugLog.push(`Jokerihaku osumia: ${wildcardResult.items.length}`);

        const candidatesMap = new Map();

        liveMatches.forEach(item => {
            if (item.sku && !candidatesMap.has(item.sku.toUpperCase())) {
                candidatesMap.set(item.sku.toUpperCase(), item);
            }
        });

        wildcardResult.items.forEach(item => {
            if (item.sku && !candidatesMap.has(item.sku.toUpperCase())) {
                candidatesMap.set(item.sku.toUpperCase(), item);
            }
        });

        const candidates = Array.from(candidatesMap.values());

        // A) Jos löytyy täsmällinen osuma (SKU täsmää suoraan)
        const exactMatch = candidates.find(c => c.sku.toUpperCase() === cleanQuery.toUpperCase());
        if (exactMatch) {
            debugLog.push(`Täsmällinen osuma löytyi: ${exactMatch.sku}`);
            const fullInfo = await fetchFullProductInfo(exactMatch.sku, exactMatch.name);
            fullInfo.debugLog = debugLog;
            return fullInfo;
        }

        // B) Jos löytyy vain 1 ennustettu tuote
        if (candidates.length === 1) {
            const single = candidates[0];
            debugLog.push(`Yksikäsitteinen ennuste: ${single.sku} (${single.name})`);
            const fullInfo = await fetchFullProductInfo(single.sku, single.name);
            fullInfo.debugLog = debugLog;
            return fullInfo;
        }

        // C) Jos löytyy useampi tuote
        if (candidates.length > 1) {
            debugLog.push(`Näytetään monivalintalista (${candidates.length} tuotetta)`);
            return {
                isMultipleList: true,
                query: cleanQuery,
                products: candidates,
                debugLog
            };
        }

        // D) Jos kumpikaan ei löytänyt, kokeillaan suorahakua /tuote.php
        debugLog.push(`Ei osumia ennustavasta hausta, kokeillaan suorahakua /tuote.php...`);
        const fullInfo = await fetchFullProductInfo(cleanQuery);
        if (fullInfo && (fullInfo.name !== cleanQuery || fullInfo.locations.length > 0 || fullInfo.totalSaldo > 0)) {
            fullInfo.debugLog = debugLog;
            return fullInfo;
        }

        return {
            notFound: true,
            query: cleanQuery,
            debugLog,
            rawPreview: 'Pupesoftin tietokannasta ei löytynyt tuotetta tällä hakusanalla.'
        };
    }

    // =========================================================================
    // UI: MODAALI JA KÄYTTÖLIITTYMÄ
    // =========================================================================
    let modalOverlay = null;
    let searchInput = null;
    let resultsContainer = null;
    let searchTimeout = null;
    let activeQueryId = 0;
    let lastSearchResults = null;
    let selectedListIndex = -1;

    function luoPikahakuModaali() {
        if (modalOverlay) return;

        modalOverlay = document.createElement('div');
        modalOverlay.id = 'ai-pikahaku-overlay';
        modalOverlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(15, 23, 42, 0.70);
            backdrop-filter: blur(4px);
            z-index: 9999999;
            display: none;
            align-items: flex-start;
            justify-content: center;
            padding-top: 8vh;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            box-sizing: border-box;
        `;

        const modal = document.createElement('div');
        modal.id = 'ai-pikahaku-box';
        modal.style.cssText = `
            background: #ffffff;
            width: 660px;
            max-width: 95vw;
            border-radius: 16px;
            box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1);
            overflow: hidden;
            display: flex;
            flex-direction: column;
            animation: aiPikahakuFadeIn 0.15s ease-out;
        `;

        modal.innerHTML = `
            <style>
                @keyframes aiPikahakuFadeIn {
                    from { opacity: 0; transform: scale(0.97) translateY(-10px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }
                @keyframes aiSpin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                #ai-pikahaku-input::placeholder {
                    color: #94a3b8;
                    font-weight: 500;
                }
                .ai-spinner {
                    display: inline-block;
                    width: 28px;
                    height: 28px;
                    border: 3px solid #e2e8f0;
                    border-top-color: #2563eb;
                    border-radius: 50%;
                    animation: aiSpin 0.75s linear infinite;
                }
                .ai-loc-card {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    padding: 10px 14px;
                    transition: background 0.15s;
                }
                .ai-loc-card:hover {
                    background: #f1f5f9;
                }
                .ai-list-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 11px 14px;
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.12s ease;
                }
                .ai-list-item:hover, .ai-list-item.ai-selected {
                    background: #eff6ff;
                    border-color: #3b82f6;
                    transform: translateX(2px);
                }
                .ai-list-item.ai-selected {
                    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.3);
                }
            </style>
            
            <!-- HAKUPALKKI -->
            <div style="display:flex; align-items:center; gap:12px; padding:15px 20px; border-bottom:1px solid #e2e8f0; background:#ffffff;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input type="text" id="ai-pikahaku-input" placeholder="Hae tuotekoodilla, nimikkeellä tai EAN-koodilla..." autocomplete="off" spellcheck="false" style="flex:1; border:none; outline:none; font-size:16px; font-weight:600; color:#0f172a; background:transparent;">
                <button id="ai-pikahaku-clear" title="Tyhjennä haku" style="display:none; background:#f1f5f9; border:none; border-radius:50%; width:24px; height:24px; min-width:24px; min-height:24px; padding:0; flex-shrink:0; font-size:12px; font-weight:bold; color:#64748b; cursor:pointer; line-height:1; align-items:center; justify-content:center;">✕</button>
                <button id="ai-pikahaku-close" title="Sulje haku (Esc)" style="background:transparent; border:none; border-radius:6px; width:28px; height:28px; min-width:28px; min-height:28px; padding:0; flex-shrink:0; font-size:16px; color:#94a3b8; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all 0.15s;" onmouseover="this.style.background='#f1f5f9'; this.style.color='#475569';" onmouseout="this.style.background='transparent'; this.style.color='#94a3b8';">✕</button>
            </div>

            <!-- TULOSALUE -->
            <div id="ai-pikahaku-results" style="padding:20px; max-height:68vh; overflow-y:auto; min-height:140px; display:flex; flex-direction:column; justify-content:center;">
                <div style="text-align:center; padding:32px 20px; color:#64748b;">
                    <div style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; background:#f1f5f9; border-radius:50%; margin-bottom:12px;">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    </div>
                    <div style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:6px;">Tuote- ja saldopikahaku</div>
                    <div style="font-size:13px; color:#64748b; line-height:1.5; max-width:440px; margin:0 auto;">
                        Syötä tuotekoodi, nimikkeen osa tai lue viivakoodi skannerilla nähdäksesi reaaliaikaiset varastosaldot ja hyllypaikat välittömästi.
                    </div>
                </div>
            </div>

            <!-- ALAPALKKI -->
            <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:10px 20px; display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#64748b;">
                <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; font-family:monospace;">Alt + F</span>
                        <span style="font-weight:500;">Pikahaku</span>
                    </div>
                    <span style="color:#cbd5e1;">•</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; font-family:monospace;">↑ / ↓</span>
                        <span style="font-weight:500;">Selaa</span>
                    </div>
                    <span style="color:#cbd5e1;">•</span>
                    <div style="display:flex; align-items:center; gap:6px;">
                        <span style="background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; font-family:monospace;">Enter</span>
                        <span style="font-weight:500;">Avaa</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="background:#e2e8f0; color:#334155; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px; font-family:monospace;">Esc</span>
                    <span style="font-weight:500;">Sulje</span>
                </div>
            </div>
        `;

        modalOverlay.appendChild(modal);
        document.body.appendChild(modalOverlay);

        searchInput = modal.querySelector('#ai-pikahaku-input');
        resultsContainer = modal.querySelector('#ai-pikahaku-results');
        const clearBtn = modal.querySelector('#ai-pikahaku-clear');
        const closeBtn = modal.querySelector('#ai-pikahaku-close');

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) suljePikahakuModaali();
        });

        closeBtn.addEventListener('click', suljePikahakuModaali);

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            searchInput.focus();
            naytaAlkuohje();
        });

        searchInput.addEventListener('input', () => {
            const val = searchInput.value.trim();
            clearBtn.style.display = val ? 'flex' : 'none';

            clearTimeout(searchTimeout);
            if (!val) {
                lastSearchResults = null;
                naytaAlkuohje();
                return;
            }

            const isFullBarcode = /^\d{8,14}$/.test(val);
            const delay = isFullBarcode ? 100 : 280;

            searchTimeout = setTimeout(() => {
                suoritaHaku(val);
            }, delay);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (lastSearchResults && lastSearchResults.isMultipleList) {
                const listItems = resultsContainer.querySelectorAll('.ai-list-item');
                if (listItems.length > 0) {
                    if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        selectedListIndex = Math.min(selectedListIndex + 1, listItems.length - 1);
                        updateSelectedListItem(listItems);
                        return;
                    } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        selectedListIndex = Math.max(selectedListIndex - 1, 0);
                        updateSelectedListItem(listItems);
                        return;
                    } else if (e.key === 'Enter') {
                        e.preventDefault();
                        if (selectedListIndex >= 0 && listItems[selectedListIndex]) {
                            listItems[selectedListIndex].click();
                            return;
                        }
                    }
                }
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                clearTimeout(searchTimeout);
                const val = searchInput.value.trim();
                if (val) suoritaHaku(val);
            }
        });
    }

    function updateSelectedListItem(listItems) {
        listItems.forEach((item, idx) => {
            if (idx === selectedListIndex) {
                item.classList.add('ai-selected');
                item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            } else {
                item.classList.remove('ai-selected');
            }
        });
    }

    function naytaAlkuohje() {
        if (!resultsContainer) return;
        selectedListIndex = -1;
        resultsContainer.innerHTML = `
            <div style="text-align:center; padding:32px 20px; color:#64748b;">
                <div style="display:inline-flex; align-items:center; justify-content:center; width:44px; height:44px; background:#f1f5f9; border-radius:50%; margin-bottom:12px;">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                <div style="font-size:15px; font-weight:700; color:#1e293b; margin-bottom:6px;">Tuote- ja saldopikahaku</div>
                <div style="font-size:13px; color:#64748b; line-height:1.5; max-width:440px; margin:0 auto;">
                    Syötä tuotekoodi, nimikkeen osa tai lue viivakoodi skannerilla nähdäksesi reaaliaikaiset varastosaldot ja hyllypaikat välittömästi.
                </div>
            </div>
        `;
    }

    async function suoritaHaku(query) {
        const queryId = ++activeQueryId;
        selectedListIndex = -1;

        resultsContainer.innerHTML = `
            <div style="text-align:center; padding:35px 20px; color:#64748b;">
                <div class="ai-spinner" style="margin-bottom:12px;"></div>
                <div style="font-size:14px; font-weight:700; color:#1e293b;">Haetaan tietoja...</div>
                <div style="font-size:12px; color:#64748b; margin-top:4px;">Hakusana: "${escapeHtml(query)}"</div>
            </div>
        `;

        try {
            const res = await executeSmartSearch(query);
            if (queryId !== activeQueryId) return;

            lastSearchResults = res;

            // 1. Useita osumia
            if (res && res.isMultipleList) {
                renderMultipleResults(res.products, query);
                return;
            }

            // 2. Ei löytynyt
            if (!res || res.notFound) {
                renderNotFoundWithDebug(query, res?.debugLog, res?.rawPreview);
                return;
            }

            // 3. Yksittäinen tuotekortti
            renderProductCard(res, false);
        } catch (err) {
            if (queryId !== activeQueryId) return;
            resultsContainer.innerHTML = `
                <div style="text-align:center; padding:20px; color:#991b1b; background:#fee2e2; border-radius:8px; font-size:13px;">
                    <div style="font-weight:700; margin-bottom:4px;">Haku epäonnistui järjestelmävirheen vuoksi</div>
                    <div style="font-size:12px;">${escapeHtml(err.message || String(err))}</div>
                </div>
            `;
        }
    }

    function renderMultipleResults(products, query) {
        selectedListIndex = 0;

        resultsContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; font-size:13px; font-weight:700; color:#475569; margin-bottom:2px;">
                    <span>Hakutulokset: <b>${escapeHtml(query)}</b> (${products.length} osumaa)</span>
                    <span style="font-size:11px; font-weight:500; color:#64748b;">Selaa nuolinäppäimillä tai klikkaa</span>
                </div>
                <div id="ai-list-scrollbox" style="display:flex; flex-direction:column; gap:6px; max-height:48vh; overflow-y:auto; padding-right:4px;">
                    ${products.map((p, idx) => {
                        const isFirst = idx === 0 ? 'ai-selected' : '';
                        let badgeHtml = '';
                        if (p.saldoRaw) {
                            const isZero = p.saldoRaw.toLowerCase().includes('loppu') || p.saldoRaw.includes(' 0');
                            const bColor = isZero ? '#dc2626' : '#059669';
                            const bBg = isZero ? '#fef2f2' : '#ecfdf5';
                            badgeHtml = `<span style="font-size:11px; font-weight:bold; color:${bColor}; background:${bBg}; padding:2px 8px; border-radius:6px; white-space:nowrap;">${escapeHtml(p.saldoRaw)}</span>`;
                        } else if (p.saldo !== null && p.saldo !== undefined) {
                            const isZero = p.saldo <= 0;
                            const bColor = isZero ? '#dc2626' : '#059669';
                            const bBg = isZero ? '#fef2f2' : '#ecfdf5';
                            badgeHtml = `<span style="font-size:11px; font-weight:bold; color:${bColor}; background:${bBg}; padding:2px 8px; border-radius:6px; white-space:nowrap;">Saldo: ${p.saldo} kpl</span>`;
                        }

                        return `
                            <div class="ai-list-item ${isFirst}" data-sku="${escapeHtml(p.sku)}" data-name="${escapeHtml(p.name)}" onclick="window.aiPikahakuAvaaTuote('${escapeHtml(p.sku)}', '${escapeHtml(p.name)}')">
                                <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                                    <span style="font-family:monospace; font-weight:800; font-size:13px; color:#0f172a; background:#e2e8f0; padding:3px 8px; border-radius:5px; white-space:nowrap;">${escapeHtml(p.sku)}</span>
                                    <span style="font-size:13px; font-weight:600; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(p.name)}</span>
                                </div>
                                <div style="display:flex; align-items:center; gap:10px; margin-left:12px;">
                                    ${badgeHtml}
                                    <span style="font-size:12px; color:#2563eb; font-weight:bold;">→</span>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;

        window.aiPikahakuAvaaTuote = async (sku, name) => {
            resultsContainer.innerHTML = `
                <div style="text-align:center; padding:35px 20px; color:#64748b;">
                    <div class="ai-spinner" style="margin-bottom:12px;"></div>
                    <div style="font-size:14px; font-weight:700; color:#1e293b;">Noudetaan tuotetietoja ja hyllypaikkoja...</div>
                    <div style="font-size:12px; color:#64748b; margin-top:4px;">${escapeHtml(sku)} - ${escapeHtml(name)}</div>
                </div>
            `;

            try {
                const fullInfo = await fetchFullProductInfo(sku, name);
                renderProductCard(fullInfo, true);
            } catch (e) {
                resultsContainer.innerHTML = `<div style="color:#991b1b; background:#fee2e2; padding:16px; border-radius:8px; text-align:center; font-size:13px;">Virhe tuotteen latauksessa: ${escapeHtml(e.message)}</div>`;
            }
        };
    }

    function renderProductCard(data, hasBackToList = false) {
        const { sku, name, ean, locations, totalHyllyssa, totalSaldo, reservedStock, availableStock } = data;

        // Päämääränä käytetään ensisijaisesti FYYSISESTI HYLLYSSÄ olevaa määrää
        const primaryCount = totalHyllyssa !== null ? totalHyllyssa : (totalSaldo !== null ? totalSaldo : 0);
        const isPositive = primaryCount > 0;
        const isZero = primaryCount === 0;
        const stockColor = isPositive ? '#059669' : (isZero ? '#dc2626' : '#d97706');
        const stockBg = isPositive ? '#ecfdf5' : (isZero ? '#fef2f2' : '#fffbeb');
        const stockBorder = isPositive ? '#a7f3d0' : (isZero ? '#fecaca' : '#fde68a');

        let locationsHtml = '';
        if (locations && locations.length > 0) {
            locationsHtml = `
                <div style="font-size:12px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:8px; display:flex; justify-content:space-between;">
                    <span>Varastopaikat (${locations.length})</span>
                    <span>Määrä hyllyssä</span>
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    ${locations.map(loc => {
                        const locHylly = loc.hyllyssa !== undefined ? loc.hyllyssa : (loc.qty || 0);
                        const locSaldo = loc.saldo !== undefined ? loc.saldo : locHylly;

                        const qtyBadgeBg = locHylly > 0 ? '#e0f2fe' : '#f1f5f9';
                        const qtyBadgeColor = locHylly > 0 ? '#0369a1' : '#64748b';
                        const warehouseName = loc.warehouse ? escapeHtml(loc.warehouse) : 'Päävarasto';
                        const defaultBadge = loc.isDefault ? '<span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; padding:2px 7px; border-radius:4px; margin-left:8px; display:inline-block; vertical-align:middle;">Oletuspaikka</span>' : '';

                        // Jos Saldo poikkeaa Hyllyssä-määrästä, näytetään se tarkenteena
                        let saldoDiffHtml = '';
                        if (locSaldo !== locHylly) {
                            saldoDiffHtml = `<div style="font-size:10px; color:#64748b; margin-top:2px;">Saldo: ${locSaldo} kpl</div>`;
                        }

                        return `
                            <div class="ai-loc-card">
                                <div style="display:flex; align-items:center; gap:12px;">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                                    <div>
                                        <div style="font-weight:700; color:#0f172a; font-size:15px; font-family:monospace; display:flex; align-items:center;">
                                            ${escapeHtml(loc.placeName)} ${defaultBadge}
                                        </div>
                                        <div style="font-size:11px; color:#64748b; margin-top:2px;">Varasto: ${warehouseName}</div>
                                    </div>
                                </div>
                                <div style="text-align:right;">
                                    <div style="background:${qtyBadgeBg}; color:${qtyBadgeColor}; font-weight:700; font-size:14px; padding:4px 12px; border-radius:6px; display:inline-block;">
                                        ${locHylly} kpl
                                    </div>
                                    ${saldoDiffHtml}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            locationsHtml = `
                <div style="display:flex; align-items:center; justify-content:center; gap:8px; padding:18px; background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; color:#64748b; font-size:13px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <span>Tuotteelle ei ole määritetty aktiivista hyllypaikkaa järjestelmässä.</span>
                </div>
            `;
        }

        const backBtnHtml = hasBackToList ? `
            <button onclick="window.aiPikahakuTakaisinListaan()" style="background:#ffffff; border:1px solid #cbd5e1; color:#334155; padding:6px 12px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.15s; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#ffffff'">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                <span>Takaisin hakutuloksiin</span>
            </button>
        ` : '';

        const hasValidEan = ean && /^\d{8,14}$/.test(ean);

        resultsContainer.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                ${hasBackToList ? `<div style="display:flex; justify-content:flex-start;">${backBtnHtml}</div>` : ''}

                <!-- TUOTEOTSIKKO JA SALDOKORTTI -->
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:14px; flex-wrap:wrap; background:#f8fafc; padding:14px 16px; border-radius:10px; border:1px solid #e2e8f0;">
                    <div style="flex:1; min-width:240px;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                            <span style="font-weight:800; font-size:16px; color:#0f172a; background:#e2e8f0; padding:2px 8px; border-radius:4px; font-family:monospace;">${escapeHtml(sku)}</span>
                            ${hasValidEan ? `<span style="font-size:11px; color:#64748b; background:#ffffff; border:1px solid #cbd5e1; padding:2px 6px; border-radius:4px;">EAN: ${escapeHtml(ean)}</span>` : ''}
                        </div>
                        <div style="font-size:16px; font-weight:700; color:#1e293b; line-height:1.3;">
                            ${escapeHtml(name)}
                        </div>
                    </div>

                    <!-- SALDO- JA HYLLYSSÄ-KORTTI -->
                    <div style="text-align:right; background:${stockBg}; border:1px solid ${stockBorder}; padding:10px 16px; border-radius:10px; min-width:180px;">
                        <div style="font-size:11px; font-weight:700; color:#0369a1; text-transform:uppercase; letter-spacing:0.5px;">Hyllyssä</div>
                        <div style="font-size:26px; font-weight:800; color:${stockColor}; line-height:1.1;">
                            ${primaryCount} <span style="font-size:13px; font-weight:normal;">kpl</span>
                        </div>
                        <div style="font-size:11px; color:#475569; margin-top:5px; border-top:1px solid rgba(0,0,0,0.06); padding-top:4px;">
                            <span>Kokonaissaldo: <b>${totalSaldo !== null ? totalSaldo : primaryCount}</b> kpl</span>
                            ${availableStock !== null ? `
                                <span style="margin:0 4px; color:#cbd5e1;">•</span>
                                <span>Vapaana: <b>${availableStock}</b> kpl</span>
                            ` : ''}
                            ${reservedStock > 0 ? `
                                <div style="color:#d97706; font-size:10px; margin-top:2px;">(varattu tilauksille: ${reservedStock} kpl)</div>
                            ` : ''}
                        </div>
                    </div>
                </div>

                <!-- PAIKKALISTAUS -->
                <div>
                    ${locationsHtml}
                </div>

                <!-- ALATOIMINNOT -->
                <div style="display:flex; align-items:center; justify-content:flex-end; gap:10px; margin-top:4px;">
                    <button type="button" onclick="window.aiAvaaVarastopaikkasiirto('${escapeHtml(sku)}', '${escapeHtml(name)}')" style="display:inline-flex; align-items:center; gap:7px; background:#f8fafc; border:1px solid #cbd5e1; color:#1e293b; padding:7px 14px; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer; transition:all 0.15s; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#e2e8f0'; this.style.borderColor='#94a3b8';" onmouseout="this.style.background='#f8fafc'; this.style.borderColor='#cbd5e1';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
                        <span>Varastopaikkasiirto</span>
                    </button>
                    <a href="/tuote.php?tee=Z&tuoteno=${encodeURIComponent(sku)}" target="_blank" style="text-decoration:none; display:inline-flex; align-items:center; gap:7px; background:#ffffff; border:1px solid #cbd5e1; color:#0369a1; padding:7px 14px; border-radius:6px; font-size:12px; font-weight:700; transition:all 0.15s; box-shadow:0 1px 2px rgba(0,0,0,0.05);" onmouseover="this.style.background='#f0f9ff'; this.style.borderColor='#93c5fd';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                        <span>Avaa Tuotekyselyssä</span>
                    </a>
                </div>
            </div>
        `;

        window.aiPikahakuTakaisinListaan = () => {
            if (lastSearchResults && lastSearchResults.isMultipleList) {
                renderMultipleResults(lastSearchResults.products, lastSearchResults.query);
            }
        };
    }

    function renderNotFoundWithDebug(query, debugLog, rawPreview) {
        const logHtml = debugLog && debugLog.length > 0 ? debugLog.map(l => escapeHtml(l)).join('<br>') : 'Ei lisälokeja';
        resultsContainer.innerHTML = `
            <div style="text-align:center; padding:28px 20px;">
                <div style="display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; background:#f1f5f9; border-radius:50%; margin-bottom:12px;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </div>
                <div style="font-size:16px; font-weight:700; color:#0f172a; margin-bottom:6px;">Tuotetta ei löytynyt</div>
                <div style="font-size:13px; color:#64748b; margin-bottom:18px; line-height:1.4;">
                    Hakusanalla <b>"${escapeHtml(query)}"</b> ei löytynyt osumia tuotekoodilla, nimikkeellä tai EAN-koodilla.
                </div>

                <details style="text-align:left; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px 14px; font-size:12px; color:#334155; max-width:540px; margin:0 auto;">
                    <summary style="font-weight:600; cursor:pointer; color:#0284c7;">Tekninen hakudiagnostiikka</summary>
                    <div style="margin-top:10px; font-family:monospace; font-size:11px; line-height:1.4;">
                        <div style="font-weight:700; color:#64748b; margin-bottom:4px;">Suoritetut hakurutiinit:</div>
                        <div style="background:#ffffff; border:1px solid #cbd5e1; padding:8px; border-radius:4px; margin-bottom:10px;">
                            ${logHtml}
                        </div>
                        <div style="font-weight:700; color:#64748b; margin-bottom:4px;">Palvelinvastaus:</div>
                        <div style="background:#ffffff; border:1px solid #cbd5e1; padding:8px; border-radius:4px; max-height:140px; overflow-y:auto; white-space:pre-wrap;">
                            ${escapeHtml(rawPreview || 'Ei lisätietoja')}
                        </div>
                    </div>
                </details>
            </div>
        `;
    }

    // =========================================================================
    // MODAALIN HALLINTA & NÄPPÄINOIKOTIET
    // =========================================================================
    function avaaPikahakuModaali(esitaytettyKoodi = '') {
        luoPikahakuModaali();
        modalOverlay.style.display = 'flex';
        const clearBtn = modalOverlay.querySelector('#ai-pikahaku-clear');
        if (esitaytettyKoodi) {
            searchInput.value = esitaytettyKoodi;
            if (clearBtn) clearBtn.style.display = 'flex';
            suoritaHaku(esitaytettyKoodi);
        } else {
            if (clearBtn) clearBtn.style.display = 'none';
            naytaAlkuohje();
            searchInput.value = '';
        }
        setTimeout(() => {
            searchInput.focus();
            searchInput.select();
        }, 50);
    }

    function suljePikahakuModaali() {
        if (modalOverlay) {
            modalOverlay.style.display = 'none';
        }
    }

    // Tehdään avaus- ja sulkufunktiot saataville globaalisti kehyksille
    window.aiAvaaPikahaku = avaaPikahakuModaali;
    window.aiSuljePikahaku = suljePikahakuModaali;

    window.addEventListener('keydown', (e) => {
        if (e.altKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
            e.preventDefault();
            e.stopPropagation();
            if (modalOverlay && modalOverlay.style.display === 'flex') {
                suljePikahakuModaali();
            } else {
                avaaPikahakuModaali();
            }
            return;
        }

        if (e.key === 'Escape' && modalOverlay && modalOverlay.style.display === 'flex') {
            e.preventDefault();
            suljePikahakuModaali();
        }
    }, true);

    // =========================================================================
    // KELLUVA PIKAHAKU-PILL (Oikea alakulma)
    // =========================================================================
    function lisaaPikahakuPainike() {
        if (document.getElementById('ai-pikahaku-floating-btn')) return;

        const pill = document.createElement('button');
        pill.id = 'ai-pikahaku-floating-btn';
        pill.type = 'button';
        pill.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <span>Pikahaku</span>
            <span style="background:rgba(255,255,255,0.18); border:1px solid rgba(255,255,255,0.12); padding:1px 6px; border-radius:4px; font-size:10px; font-weight:700; font-family:monospace;">Alt+F</span>
        `;
        pill.title = 'Avaa ennustava tuote- ja saldohaku (Alt + F)';
        pill.style.cssText = `
            position: fixed;
            bottom: 18px;
            right: 18px;
            z-index: 999998;
            background: #0f172a;
            color: #ffffff;
            border: 1px solid #334155;
            padding: 8px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            box-shadow: 0 4px 15px rgba(0,0,0,0.25);
            transition: all 0.2s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        `;

        pill.onmouseover = () => {
            pill.style.transform = 'translateY(-2px)';
            pill.style.boxShadow = '0 6px 20px rgba(0,0,0,0.35)';
            pill.style.background = '#1e293b';
        };
        pill.onmouseout = () => {
            pill.style.transform = 'translateY(0)';
            pill.style.boxShadow = '0 4px 15px rgba(0,0,0,0.25)';
            pill.style.background = '#0f172a';
        };

        pill.addEventListener('click', (e) => {
            e.preventDefault();
            avaaPikahakuModaali();
        });

        document.body.appendChild(pill);
    }

    // =========================================================================
    // VARASTOPAIKKASIIRTO (TUOTEKYSELY & PIKAHAKU)
    // =========================================================================

    // Hakee tuotteen varastopaikat siirtolomaketta varten ja tunnistaa virallisen oletuspaikan
    async function fetchMuuvarastopaikkaOptions(tuoteno) {
        const cleanSku = String(tuoteno || '').trim();
        if (!cleanSku) throw new Error('Tuotenumero puuttuu');

        const params = new URLSearchParams();
        params.set('tee', 'M');
        params.set('tuoteno', cleanSku);
        params.set('toim', '');

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: params.toString()
        });

        if (!res.ok) throw new Error(`Palvelinvirhe: ${res.status}`);

        const buf = await res.arrayBuffer();
        const html = decodeBuffer(buf);
        const doc = new DOMParser().parseFromString(html, 'text/html');

        let defaultShelfId = '';
        let defaultShelfName = '';

        // 1. Etsitään valittu oletuspaikkaradio (<input type="radio" name="oletus" checked>)
        const checkedRadio = doc.querySelector('input[name="oletus"]:checked, input[name="oletus"][checked]');
        if (checkedRadio) {
            defaultShelfId = checkedRadio.value ? checkedRadio.value.trim() : '';
            const tr = checkedRadio.closest('tr');
            if (tr) {
                const tds = Array.from(tr.querySelectorAll('td'));
                if (tds.length >= 2) {
                    defaultShelfName = cleanShelfName(tds[1].textContent);
                }
            }
        }

        // Varmistus regexpillä jos DOMParser ei havainnut checked-attribuuttia
        if (!defaultShelfName) {
            const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
            let mTr;
            while ((mTr = trRegex.exec(html)) !== null) {
                const trHtml = mTr[1];
                if (/name=["']?oletus["']?[^>]*checked/i.test(trHtml) || /checked[^>]*name=["']?oletus["']?/i.test(trHtml)) {
                    const tds = Array.from(trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map(x => x[1].replace(/<[^>]+>/g, '').trim());
                    if (tds.length >= 2) defaultShelfName = cleanShelfName(tds[1]);
                    const mVal = trHtml.match(/value=["']?([^"'>\s]+)/i);
                    if (mVal) defaultShelfId = mVal[1];
                    break;
                }
            }
        }

        const parseSelectOptions = (sel) => {
            if (!sel) return [];
            return Array.from(sel.options)
                .filter(opt => opt.value && opt.value.trim() !== '')
                .map(opt => {
                    const id = opt.value.trim();
                    const rawLabel = (opt.textContent || '').trim();
                    const cleanLabel = cleanShelfName(rawLabel);
                    const m = rawLabel.match(/\(([-]?\d+(?:\.\d+)?)\)/);
                    const qty = m ? parseFloat(m[1]) : 0;
                    const isDefault = Boolean(
                        (defaultShelfId && id === defaultShelfId) ||
                        (defaultShelfName && cleanLabel.toUpperCase() === defaultShelfName.toUpperCase())
                    );
                    return { id, label: cleanLabel || rawLabel, rawLabel, qty, isDefault, selected: opt.selected };
                });
        };

        const mistaSel = doc.querySelector('select[name="mista"]');
        const minneSel = doc.querySelector('select[name="minne"]');

        let sourceLocations = parseSelectOptions(mistaSel);
        let targetLocations = parseSelectOptions(minneSel);

        if (sourceLocations.length === 0 && targetLocations.length > 0) sourceLocations = [...targetLocations];
        if (targetLocations.length === 0 && sourceLocations.length > 0) targetLocations = [...sourceLocations];

        // Jos radiosta ei löytynyt mutta vaihtoehdoissa on paikkoja, varmistetaan tunnistus
        if (!defaultShelfName && sourceLocations.length > 0) {
            const defLoc = sourceLocations.find(l => l.isDefault) || sourceLocations[0];
            if (defLoc) {
                defLoc.isDefault = true;
                defaultShelfName = defLoc.label;
                defaultShelfId = defLoc.id;
            }
        }
        if (defaultShelfName) {
            targetLocations.forEach(loc => {
                if ((defaultShelfId && loc.id === defaultShelfId) ||
                    loc.label.toUpperCase() === defaultShelfName.toUpperCase()) {
                    loc.isDefault = true;
                }
            });
        }

        // Etsitään tuotenimi
        let productName = '';
        const allTh = Array.from(doc.querySelectorAll('th, h2, h3, .head, font.head'));
        const nameHeader = allTh.find(el => {
            const txt = (el.textContent || '').trim();
            return txt.includes(cleanSku) && !txt.includes('Tuotteen varastopaikat');
        });
        if (nameHeader) {
            productName = cleanProductName(nameHeader.textContent, cleanSku);
        }

        return { sku: cleanSku, productName, defaultShelfName, defaultShelfId, sourceLocations, targetLocations };
    }

    // Suorittaa varastopaikkasiirron muuvarastopaikka.php:n kautta
    async function executeStockTransfer({ tuoteno, mistaId, minneId, maara, selite }) {
        const cleanSku = String(tuoteno || '').trim();
        const cleanQty = parseFloat(String(maara).replace(',', '.'));

        if (!cleanSku) throw new Error('Tuotenumero puuttuu');
        if (!mistaId) throw new Error('Lähettävä varastopaikka puuttuu');
        if (!minneId) throw new Error('Vastaanottava varastopaikka puuttuu');
        if (isNaN(cleanQty) || cleanQty <= 0) throw new Error('Siirrettävä määrä on virheellinen');

        const params = new URLSearchParams();
        params.set('tee', 'N');
        params.set('toim', '');
        params.set('tuoteno', cleanSku);
        params.set('mista', String(mistaId).trim());
        params.set('minne', String(minneId).trim());
        params.set('asaldo', String(cleanQty));
        params.set('selite', (selite || 'Tuotekyselysiirto').trim());

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: params.toString()
        });

        if (!res.ok) throw new Error(`Siirto epäonnistui: ${res.status}`);

        const buf = await res.arrayBuffer();
        const resHtml = decodeBuffer(buf);
        const doc = new DOMParser().parseFromString(resHtml, 'text/html');
        const errFont = doc.querySelector('font[color="red"], .error, font.error');
        if (errFont && errFont.textContent.trim()) {
            throw new Error(errFont.textContent.trim());
        }

        return true;
    }

    // Luo uuden varastopaikan tuotteelle
    async function addNewLocationToProduct(tuoteno, newLocationStr) {
        const cleanSku = String(tuoteno || '').trim();
        const cleanLoc = String(newLocationStr || '').trim();
        if (!cleanSku || !cleanLoc) throw new Error('Uusi varastopaikka puuttuu');

        const params = new URLSearchParams();
        params.set('tee', 'UUSIPAIKKA_VIIVAKOODI');
        params.set('toim', '');
        params.set('tuoteno', cleanSku);
        params.set('paikkalahde', 'VAPAA');
        params.set('hyllypaikka_viivakoodilla', cleanLoc);

        const res = await fetch('/muuvarastopaikka.php?indexvas=1', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: params.toString()
        });

        if (!res.ok) throw new Error(`Uuden paikan luonti epäonnistui (HTTP ${res.status})`);
        return true;
    }

    // Näyttää toast-ilmoituksen ruudun yläkulmassa
    function showPikasiirtoToast(msgHtml) {
        let toast = document.getElementById('ai-siirto-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'ai-siirto-toast';
            toast.style.cssText = `
                position: fixed;
                top: 24px;
                right: 24px;
                z-index: 10000000;
                background: #0f172a;
                color: #ffffff;
                padding: 14px 20px;
                border-radius: 8px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                font-size: 13px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                border-left: 4px solid #10b981;
                transition: opacity 0.2s, transform 0.2s;
                transform: translateY(0);
                opacity: 1;
            `;
            document.body.appendChild(toast);
        }
        toast.innerHTML = msgHtml;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px)';
            setTimeout(() => { toast.style.display = 'none'; }, 200);
        }, 4000);
    }

    // Avaa siirtomodaalin (käytetään sekä Tuotekyselyssä että Keräilyssä)
    function avaaVarastopaikkasiirtoModal(sku, initialName = '', onDone = null, initialQty = 1, defaultSelite = 'Varastopaikkasiirto', preferredTargetShelf = '') {
        const old = document.getElementById('ai-pikasiirto-overlay');
        if (old) old.remove();

        let cleanName = cleanProductName(initialName, sku);

        const overlay = document.createElement('div');
        overlay.id = 'ai-pikasiirto-overlay';
        overlay.style.cssText = `
            position: fixed !important;
            inset: 0 !important;
            background-color: rgba(15, 23, 42, 0.70) !important;
            backdrop-filter: blur(3px) !important;
            z-index: 10000000 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 16px !important;
            box-sizing: border-box !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
        `;

        const modal = document.createElement('div');
        modal.id = 'ai-pikasiirto-card';
        modal.style.cssText = `
            background: #ffffff !important;
            border-radius: 14px !important;
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.35) !important;
            width: 580px !important;
            max-width: 95vw !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #cbd5e1 !important;
            animation: aiPikahakuFadeIn 0.15s ease-out !important;
        `;

        modal.innerHTML = `
            <!-- OTSIKKO -->
            <div style="background:#0f172a; color:#ffffff; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-size:15px; font-weight:700; display:flex; align-items:center; gap:8px;">
                        <span>Varastopaikkasiirto</span>
                    </div>
                    <div style="font-size:12px; color:#94a3b8; margin-top:2px;">
                        <span style="color:#ffffff; font-weight:700; font-family:monospace;">${escapeHtml(sku)}</span>
                        <span id="ai-siirto-prodname">${cleanName ? ' — ' + escapeHtml(cleanName) : ''}</span>
                    </div>
                </div>
                <button type="button" id="ai-siirto-modal-close" style="background:none; border:none; color:#94a3b8; font-size:22px; cursor:pointer; line-height:1; padding:4px;" title="Sulje (Esc)">✕</button>
            </div>

            <!-- RUNKO -->
            <div style="padding:20px; max-height:75vh; overflow-y:auto;">
                <div id="ai-siirto-loading" style="text-align:center; padding:30px 10px; color:#64748b;">
                    <div class="ai-spinner" style="margin-bottom:10px;"></div>
                    <div style="font-size:13px; font-weight:600;">Haetaan tuotteen nykyisiä hyllypaikkoja ja saldoja...</div>
                </div>

                <div id="ai-siirto-content" style="display:none; flex-direction:column; gap:14px;">
                    <!-- OLETUSPAIKKA-STATUSBANNERI -->
                    <div id="ai-siirto-oletuspaikka-banner" style="display:none; align-items:center; justify-content:space-between; background:#fffbeb; border:1px solid #fde68a; padding:9px 12px; border-radius:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="background:#fef3c7; color:#92400e; border:1px solid #fde68a; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; padding:2px 7px; border-radius:4px;">Oletuspaikka</span>
                            <span id="ai-siirto-oletuspaikka-nimi" style="font-weight:700; font-family:monospace; font-size:14px; color:#78350f;"></span>
                        </div>
                        <div id="ai-siirto-oletuspaikka-saldo" style="font-size:12px; font-weight:700; color:#92400e;"></div>
                    </div>

                    <!-- Lähdepaikka -->
                    <div>
                        <label style="display:block; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">
                            1. Mistä siirretään (Lähdepaikka):
                        </label>
                        <select id="ai-select-mista" style="width:100%; height:42px; padding:8px 12px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:14px; font-weight:600; color:#0f172a; background:#f8fafc; outline:none;">
                        </select>
                    </div>

                    <!-- Kohdepaikka -->
                    <div>
                        <label style="display:block; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">
                            2. Minne siirretään (Kohdepaikka):
                        </label>
                        <select id="ai-select-minne" style="width:100%; height:42px; padding:8px 12px; border:1.5px solid #cbd5e1; border-radius:6px; font-size:14px; font-weight:600; color:#0f172a; background:#f8fafc; outline:none;">
                        </select>
                    </div>

                    <!-- Uusi paikka (jos valittu) -->
                    <div id="ai-new-loc-container" style="display:none; background:#eff6ff; padding:12px; border-radius:6px; border:1px solid #bfdbfe;">
                        <label style="display:block; font-size:12px; font-weight:700; color:#1e40af; margin-bottom:4px;">
                            Kirjoita tai skannaa uusi hyllypaikka:
                        </label>
                        <input type="text" id="ai-new-loc-input" placeholder="esim. A 12 B 10 tai lue viivakoodi" style="width:100%; height:38px; padding:6px 10px; border:1.5px solid #93c5fd; border-radius:6px; font-size:13px; font-weight:700; color:#0f172a; background:#ffffff; box-sizing:border-box;">
                    </div>

                    <!-- Määrä -->
                    <div>
                        <label style="display:block; font-size:11px; font-weight:700; color:#475569; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:5px;">
                            3. Siirrettävä määrä:
                        </label>
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <input type="number" id="ai-input-qty" min="1" step="1" value="${initialQty && initialQty > 0 ? initialQty : 1}" style="width:90px; height:40px; padding:6px 10px; border:1.5px solid #94a3b8; border-radius:6px; font-size:16px; font-weight:800; text-align:center; color:#0f172a; background:#ffffff;">
                            <button type="button" class="ai-qty-quick" data-add="1" style="height:38px; padding:0 14px; border-radius:20px; border:1px solid #cbd5e1; background:#f1f5f9; font-weight:700; cursor:pointer;">+1</button>
                            <button type="button" class="ai-qty-quick" data-add="5" style="height:38px; padding:0 14px; border-radius:20px; border:1px solid #cbd5e1; background:#f1f5f9; font-weight:700; cursor:pointer;">+5</button>
                            <button type="button" class="ai-qty-quick" data-add="10" style="height:38px; padding:0 14px; border-radius:20px; border:1px solid #cbd5e1; background:#f1f5f9; font-weight:700; cursor:pointer;">+10</button>
                            <button type="button" id="ai-qty-all" style="height:38px; padding:0 16px; border-radius:20px; border:1px solid #93c5fd; background:#eff6ff; color:#1d4ed8; font-weight:800; cursor:pointer;">Kaikki</button>
                        </div>
                    </div>

                    <!-- Selite -->
                    <div>
                        <label style="display:block; font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">
                            Selite (valinnainen):
                        </label>
                        <input type="text" id="ai-input-selite" value="${escapeHtml(defaultSelite)}" style="width:100%; height:36px; padding:6px 10px; border:1px solid #cbd5e1; border-radius:6px; font-size:12px; color:#334155; box-sizing:border-box;">
                    </div>

                    <!-- Virheilmoitus -->
                    <div id="ai-modal-error" style="display:none; background:#fee2e2; border:1px solid #fca5a5; color:#991b1b; padding:10px 14px; border-radius:6px; font-size:12px; font-weight:600;">
                    </div>
                </div>
            </div>

            <!-- ALAPALKKI -->
            <div style="background:#f8fafc; border-top:1px solid #e2e8f0; padding:12px 20px; display:flex; justify-content:flex-end; gap:10px;">
                <button type="button" id="ai-siirto-cancel" style="background:#ffffff; border:1px solid #cbd5e1; color:#475569; padding:6px 14px; border-radius:2px; font-size:12px; font-weight:600; cursor:pointer;">Peruuta</button>
                <button type="button" id="ai-siirto-submit" disabled style="background:#119fe7; border:1px solid #1094d8; color:#ffffff; padding:6px 18px; border-radius:2px; font-size:12px; font-weight:700; cursor:pointer; box-shadow:none;">Suorita siirto</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeSiirtoModal = () => overlay.remove();

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeSiirtoModal();
        });
        modal.querySelector('#ai-siirto-modal-close').onclick = closeSiirtoModal;
        modal.querySelector('#ai-siirto-cancel').onclick = closeSiirtoModal;

        const onEscKey = (e) => {
            if (e.key === 'Escape') {
                closeSiirtoModal();
                window.removeEventListener('keydown', onEscKey);
            }
        };
        window.addEventListener('keydown', onEscKey);

        // Noudetaan varastopaikat
        fetchMuuvarastopaikkaOptions(sku).then(info => {
            document.getElementById('ai-siirto-loading').style.display = 'none';
            const content = document.getElementById('ai-siirto-content');
            content.style.display = 'flex';

            // Päivitetään tuotenimi jos saatiin tarkempi tai parempi nimi
            const fetchedName = cleanProductName(info.productName, sku);
            if (fetchedName && (!cleanName || cleanName.length < 3)) {
                cleanName = fetchedName;
                const nameEl = document.getElementById('ai-siirto-prodname');
                if (nameEl) nameEl.textContent = ' — ' + cleanName;
            }

            // Näytetään oletuspaikkabanneri jos tunnistettu
            if (info.defaultShelfName) {
                const banner = document.getElementById('ai-siirto-oletuspaikka-banner');
                const nameEl = document.getElementById('ai-siirto-oletuspaikka-nimi');
                const saldoEl = document.getElementById('ai-siirto-oletuspaikka-saldo');
                if (banner && nameEl) {
                    nameEl.textContent = info.defaultShelfName;
                    const defLoc = info.sourceLocations.find(l => l.isDefault);
                    if (saldoEl && defLoc) {
                        saldoEl.textContent = `Hyllyssä: ${defLoc.qty} kpl`;
                    }
                    banner.style.display = 'flex';
                }
            }

            const mistaSel = document.getElementById('ai-select-mista');
            const minneSel = document.getElementById('ai-select-minne');
            const qtyInput = document.getElementById('ai-input-qty');
            const submitBtn = document.getElementById('ai-siirto-submit');

            // Täytetään lähdepaikat
            mistaSel.innerHTML = '';
            info.sourceLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                const defaultTag = loc.isDefault ? ' [Oletuspaikka]' : '';
                opt.textContent = `${loc.label}${defaultTag} (${loc.qty} kpl)`;
                opt.dataset.qty = loc.qty;
                if (loc.isDefault) {
                    opt.style.fontWeight = 'bold';
                    opt.style.color = '#92400e';
                }
                mistaSel.appendChild(opt);
            });

            // Valitaan lähdepaikaksi ensisijaisesti paikka jossa on saldoa (mieluiten varastopaikka joka EI ole oletuspaikka, jos oletuspaikalle halutaan siirtää)
            const bulkWithStock = info.sourceLocations.find(l => l.qty > 0 && !l.isDefault);
            const anyWithStock = info.sourceLocations.find(l => l.qty > 0);
            if (bulkWithStock) {
                mistaSel.value = bulkWithStock.id;
            } else if (anyWithStock) {
                mistaSel.value = anyWithStock.id;
            }

            // Täytetään kohdepaikat
            minneSel.innerHTML = '';
            info.targetLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                const defaultTag = loc.isDefault ? ' [Oletuspaikka]' : '';
                opt.textContent = `${loc.label}${defaultTag} (${loc.qty} kpl)`;
                if (loc.isDefault) {
                    opt.style.fontWeight = 'bold';
                    opt.style.color = '#92400e';
                }
                minneSel.appendChild(opt);
            });

            // Lisätään mahdollisuus luoda uusi hyllypaikka
            const newOpt = document.createElement('option');
            newOpt.value = '__NEW__';
            newOpt.textContent = '➕ Luo uusi hyllypaikka...';
            minneSel.appendChild(newOpt);

            // Valitaan kohdepaikaksi:
            // 1. Ensisijaisesti pyydetty kohdepaikka (jos annettu ja eri kuin lähdepaikka)
            // 2. Oletuspaikka (jos eri kuin lähdepaikka)
            // 3. Toinen saatavilla oleva paikka
            let targetLoc = null;
            if (preferredTargetShelf) {
                const cleanPref = cleanShelfName(preferredTargetShelf);
                targetLoc = info.targetLocations.find(l => l.id !== mistaSel.value && (cleanShelfName(l.label) === cleanPref || cleanShelfName(l.rawLabel) === cleanPref));
            }
            if (!targetLoc) {
                targetLoc = info.targetLocations.find(l => l.isDefault && l.id !== mistaSel.value);
            }
            if (targetLoc) {
                minneSel.value = targetLoc.id;
            } else if (minneSel.value === mistaSel.value && info.targetLocations.length > 1) {
                const alt = info.targetLocations.find(l => l.id !== mistaSel.value);
                if (alt) minneSel.value = alt.id;
            }

            const newLocCont = document.getElementById('ai-new-loc-container');
            const newLocInput = document.getElementById('ai-new-loc-input');
            minneSel.onchange = () => {
                if (minneSel.value === '__NEW__') {
                    newLocCont.style.display = 'block';
                    newLocInput.focus();
                } else {
                    newLocCont.style.display = 'none';
                }
            };

            // Pikanapit määrille
            modal.querySelectorAll('.ai-qty-quick').forEach(btn => {
                btn.onclick = () => {
                    const add = parseInt(btn.dataset.add, 10);
                    const current = parseInt(qtyInput.value, 10) || 0;
                    qtyInput.value = Math.max(1, current + add);
                };
            });

            document.getElementById('ai-qty-all').onclick = () => {
                const selOpt = mistaSel.options[mistaSel.selectedIndex];
                const available = selOpt ? parseFloat(selOpt.dataset.qty) : 0;
                if (available > 0) qtyInput.value = available;
            };

            submitBtn.disabled = false;
            qtyInput.focus();
            qtyInput.select();

            const errorBox = document.getElementById('ai-modal-error');

            const doSubmit = async () => {
                errorBox.style.display = 'none';
                submitBtn.disabled = true;
                submitBtn.textContent = 'Siirretään...';

                try {
                    let finalMinneId = minneSel.value;
                    let targetLocName = minneSel.options[minneSel.selectedIndex]?.textContent || '';

                    if (finalMinneId === '__NEW__') {
                        const newName = newLocInput.value.trim();
                        if (!newName) throw new Error('Kirjoita uuden varastopaikan nimi tai skannaa koodi');
                        await addNewLocationToProduct(sku, newName);
                        const refreshed = await fetchMuuvarastopaikkaOptions(sku);
                        const created = refreshed.targetLocations.find(l => l.label.toUpperCase().includes(newName.toUpperCase()));
                        if (!created) throw new Error(`Uutta paikkaa '${newName}' ei löytynyt luonnin jälkeen.`);
                        finalMinneId = created.id;
                        targetLocName = created.label;
                    }

                    const mistaId = mistaSel.value;
                    const mistaText = mistaSel.options[mistaSel.selectedIndex]?.textContent || '';
                    const transferQty = parseFloat(qtyInput.value.replace(',', '.'));
                    const selite = document.getElementById('ai-input-selite').value;

                    if (!mistaId) throw new Error('Valitse lähdepaikka!');
                    if (!finalMinneId) throw new Error('Valitse kohdepaikka!');
                    if (mistaId === finalMinneId) throw new Error('Lähettävä ja vastaanottava paikka eivät voi olla sama!');

                    await executeStockTransfer({
                        tuoteno: sku,
                        mistaId,
                        minneId: finalMinneId,
                        maara: transferQty,
                        selite
                    });

                    closeSiirtoModal();
                    showPikasiirtoToast(`✅ Siirto onnistui! Siirretty <b>${transferQty} kpl</b> tuotteelle <b>${escapeHtml(sku)}</b><br><span style="font-size:12px; color:#94a3b8;">${escapeHtml(mistaText)} ➔ ${escapeHtml(targetLocName)}</span>`);

                    if (typeof onDone === 'function') {
                        onDone({ sku, transferQty, mistaId, minneId: finalMinneId, targetLocName, mistaText });
                    }

                } catch (err) {
                    errorBox.textContent = err.message || String(err);
                    errorBox.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Suorita siirto';
                }
            };

            submitBtn.onclick = doSubmit;
            qtyInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } };
            document.getElementById('ai-input-selite').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); doSubmit(); } };

        }).catch(err => {
            document.getElementById('ai-siirto-loading').innerHTML = `
                <div style="color:#ef4444; font-weight:700; margin-bottom:6px;">Varastopaikkojen haku epäonnistui:</div>
                <div style="font-size:12px; color:#64748b;">${escapeHtml(err.message || String(err))}</div>
            `;
        });
    }

    // Tehdään siirtomodaali globaalisti saataville
    window.aiAvaaVarastopaikkasiirto = (sku, prodName = '') => {
        avaaVarastopaikkasiirtoModal(sku, prodName, async () => {
            // Jos Pikahakumodaali on auki ja näyttää tätä tuotetta, päivitetään sen tiedot lennossa!
            if (modalOverlay && modalOverlay.style.display === 'flex' && lastSearchResults) {
                try {
                    const refreshed = await fetchFullProductInfo(sku, prodName);
                    renderProductCard(refreshed, lastSearchResults.isMultipleList);
                } catch (e) {}
            }
        });
    };

    // =========================================================================
    // SOVITUS TUOTEKYSELY-SIVULLE (tuote.php)
    // Lisää Varastopaikkasiirto-painikkeen Tuotekyselyn Varastopaikat-otsikon viereen
    // =========================================================================
    function sovitaTuotekyselySiirtoPainike() {
        if (!location.pathname.includes('tuote.php')) return;

        const urlParams = new URLSearchParams(window.location.search);
        const sku = urlParams.get('tuoteno') ||
                    document.querySelector('input[name="tuoteno"][type="hidden"]')?.value ||
                    document.querySelector('input[name="tuoteno"]')?.value ||
                    '';
        if (!sku) return;

        if (document.getElementById('ai-tuote-siirto-btn')) return;

        // Etsitään Varastopaikat-elementti Tuotekyselyssä
        const varastoContainer = document.getElementById('varastopaikat_container');
        const varastoLink = document.getElementById('varastopaikat');
        const allMessageFonts = Array.from(document.querySelectorAll('font.message, .message, h2, h3'));
        const varastoHeader = allMessageFonts.find(f => f.textContent.trim().toLowerCase().includes('varastopaikat'));

        const targetAnchor = varastoLink || varastoHeader || varastoContainer;
        if (!targetAnchor) return;

        // Etsitään tuotenimitys tuote.php -sivulta
        let prodName = '';
        const tuoteTable = document.querySelector('table.tuotekysely');
        if (tuoteTable) {
            const rows = tuoteTable.querySelectorAll('tr');
            if (rows.length >= 2) {
                // Toinen rivi on tuotetietojen datarivi, jossa nimitys on sarakkeessa td[colspan="2"]
                const nameTd = rows[1].querySelector('td[colspan="2"]');
                if (nameTd) {
                    prodName = cleanProductName(nameTd.textContent, sku);
                }
            }
        }
        if (!prodName) {
            // Etsitään otsikko "Nimitys" ja vastaava solu seuraavalta riviltä
            const allTh = Array.from(document.querySelectorAll('table.tuotekysely th, table th'));
            const thIndex = allTh.findIndex(th => th.textContent.trim().toLowerCase() === 'nimitys');
            if (thIndex !== -1) {
                const tr = allTh[thIndex].closest('tr');
                const nextTr = tr ? tr.nextElementSibling : null;
                if (nextTr) {
                    const candidateTd = nextTr.querySelector('td[colspan="2"]') || nextTr.children[thIndex];
                    if (candidateTd) {
                        prodName = cleanProductName(candidateTd.textContent, sku);
                    }
                }
            }
        }
        if (!prodName) {
            // Varahaku: etsitään td[colspan="2"] missä tahansa sivulla
            const candidate = document.querySelector('table.tuotekysely td[colspan="2"], table td[colspan="2"]');
            if (candidate) {
                prodName = cleanProductName(candidate.textContent, sku);
            }
        }

        // Etsitään vertailukohdaksi viereinen aito [ Päivitä ] -nappi
        const paivitaBtn = (varastoLink && varastoLink.tagName.toLowerCase() === 'input')
            ? varastoLink
            : document.querySelector('input[value*="Päivitä"], input[value*="paivita"], button[value*="Päivitä"], #varastopaikat');

        const isInputBtn = !paivitaBtn || paivitaBtn.tagName.toLowerCase() === 'input';
        const btn = document.createElement(isInputBtn ? 'input' : 'button');
        btn.type = 'button';
        btn.id = 'ai-tuote-siirto-btn';
        if (isInputBtn) {
            btn.value = 'Varastopaikkasiirto';
        } else {
            btn.textContent = 'Varastopaikkasiirto';
        }
        btn.title = `Tee nopea varastopaikkasiirto tuotteelle: ${sku}`;

        if (paivitaBtn && paivitaBtn.className) {
            btn.className = paivitaBtn.className;
        }

        let baseBg = '#119fe7';
        let baseBorder = '1px solid #1094d8';
        let baseRadius = '2px';
        let baseHeight = '26px';
        let basePadding = '0 10px';
        let baseFont = 'inherit';
        let baseFontSize = '11px';
        let baseFontWeight = '700';

        if (paivitaBtn) {
            try {
                const comp = window.getComputedStyle(paivitaBtn);
                if (comp) {
                    if (comp.backgroundColor && comp.backgroundColor !== 'transparent' && comp.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                        baseBg = comp.backgroundColor;
                    }
                    if (comp.border && comp.border !== 'none') baseBorder = comp.border;
                    if (comp.borderRadius) baseRadius = comp.borderRadius;
                    if (comp.fontFamily) baseFont = comp.fontFamily;
                    if (comp.fontSize) baseFontSize = comp.fontSize;
                    if (comp.fontWeight) baseFontWeight = comp.fontWeight;
                }
            } catch (e) {}
        }

        btn.style.cssText = `
            background: ${baseBg} !important;
            color: #ffffff !important;
            border: ${baseBorder} !important;
            border-radius: ${baseRadius} !important;
            font-family: ${baseFont} !important;
            font-size: ${baseFontSize} !important;
            font-weight: ${baseFontWeight} !important;
            height: ${baseHeight} !important;
            line-height: 24px !important;
            padding: ${basePadding} !important;
            position: relative !important;
            top: -2px !important;
            vertical-align: middle !important;
            margin-left: 6px !important;
            margin-right: 6px !important;
            box-shadow: none !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
            outline: none !important;
            transition: filter 0.15s ease !important;
        `;
        btn.onmouseover = () => { btn.style.filter = 'brightness(0.9)'; };
        btn.onmouseout = () => { btn.style.filter = 'none'; };

        btn.onclick = (e) => {
            e.preventDefault();
            avaaVarastopaikkasiirtoModal(sku, prodName, () => {
                // Päivitetään hyllypaikat ruudulla siirron jälkeen
                if (varastoLink) {
                    varastoLink.click();
                } else if (window.jQuery && jQuery('#varastopaikat').length) {
                    jQuery('#varastopaikat').trigger('click');
                }
            });
        };

        if (varastoLink && varastoLink.parentNode) {
            varastoLink.parentNode.insertBefore(btn, varastoLink.nextSibling);
        } else if (varastoHeader && varastoHeader.parentNode) {
            varastoHeader.parentNode.insertBefore(btn, varastoHeader.nextSibling);
        } else if (varastoContainer && varastoContainer.parentNode) {
            varastoContainer.parentNode.insertBefore(btn, varastoContainer);
        }

        // Pikselintarkka dynaaminen linjaus: varmistetaan että napin yläreuna vastaa tarkasti [ Päivitä ] -nappia
        const autoAlign = () => {
            const refBtn = (varastoLink && varastoLink.getBoundingClientRect) ? varastoLink : paivitaBtn;
            if (refBtn && btn && refBtn.getBoundingClientRect && btn.getBoundingClientRect) {
                const r1 = refBtn.getBoundingClientRect();
                const r2 = btn.getBoundingClientRect();
                if (r1.height > 0) {
                    btn.style.setProperty('height', `${Math.round(r1.height)}px`, 'important');
                    btn.style.setProperty('line-height', `${Math.round(r1.height - 2)}px`, 'important');
                }
                if (r1.top > 0 && r2.top > 0) {
                    const currentTopOffset = parseFloat(btn.style.top || '-2') || -2;
                    const diff = Math.round(r1.top - (r2.top - currentTopOffset));
                    btn.style.setProperty('top', `${diff}px`, 'important');
                }
            }
        };

        requestAnimationFrame(autoAlign);
        setTimeout(autoAlign, 100);
        setTimeout(autoAlign, 400);
        setTimeout(autoAlign, 1000);
    }

    // =========================================================================
    // SOVITUS KERÄILYSIVULLE (keraa.php)
    // Kytkee keräilyrivien "Varastopaikkasiirto" -painikkeet avaamaan
    // täsmälleen saman Oletuspaikka-tuetun siirtomodaalin!
    // =========================================================================
    function sovitaKeraaSiirtoPainikkeet() {
        const isKeraa = location.pathname.includes('keraa.php') || location.search.includes('keraa.php');
        if (!isKeraa) return;

        const table = document.getElementById('maintable');
        if (table) {
            const rows = Array.from(table.querySelectorAll('tbody tr.keraysrivi, tr.keraysrivi'));
            rows.forEach(tr => {
                const paikkaTd = tr.children[0];
                if (!paikkaTd) return;

                const paikkaSelect = tr.querySelector('select[name^="varastorekla"]');
                let btn = tr.querySelector('.ai-pikasiirto-btn');
                if (!btn) {
                    btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'ai-pikasiirto-btn';
                    btn.textContent = 'Varastopaikkasiirto';
                    btn.title = 'Tee nopea varastopaikkasiirto';
                    if (paikkaSelect) {
                        paikkaSelect.insertAdjacentElement('afterend', btn);
                    } else {
                        paikkaTd.appendChild(btn);
                    }
                }
            });
        }

        // Kaapataan klikkaus capture-vaiheessa, jotta ohitetaan vanhan tuotantoskriptin modaali
        if (!window._aiKeraaSiirtoCaptured) {
            window._aiKeraaSiirtoCaptured = true;
            document.addEventListener('click', (e) => {
                const btn = e.target.closest('.ai-pikasiirto-btn');
                if (!btn) return;

                e.preventDefault();
                e.stopImmediatePropagation();

                const tr = btn.closest('tr');
                if (!tr) return;

                const codeInput = tr.querySelector('input.tuoteno_input, input[name^="rivin_puhdas_tuoteno"]');
                const sku = codeInput ? codeInput.value.trim() : (tr.querySelector('a')?.textContent || '').trim();
                if (!sku) return;

                const nameTd = tr.children[2];
                const prodName = nameTd ? cleanProductName(nameTd.textContent, sku) : '';

                const qtyTd = tr.children[3];
                const neededQty = qtyTd ? parseInt((qtyTd.textContent || '').trim(), 10) || 1 : 1;

                const paikkaSelect = tr.querySelector('select[name^="varastorekla"]');
                const currentShelf = paikkaSelect ? (paikkaSelect.options[paikkaSelect.selectedIndex]?.textContent || '').trim() : '';

                avaaVarastopaikkasiirtoModal(sku, prodName, (result) => {
                    // Päivitetään keräilyrivin varastopaikkavalikko uudelle paikalle
                    if (tr && result && result.targetLocName) {
                        const rowSelect = tr.querySelector('select[name^="varastorekla"]');
                        if (rowSelect) {
                            const cleanTarget = result.targetLocName
                                .replace(/\s*\[Oletuspaikka\]/gi, '')
                                .replace(/\s*\([^)]*\)/g, '')
                                .trim();
                            let existingOpt = Array.from(rowSelect.options).find(o => cleanTarget.includes(o.text.trim()) || o.text.trim().includes(cleanTarget));
                            if (!existingOpt) {
                                const newRowOpt = document.createElement('option');
                                newRowOpt.value = cleanTarget.replace(/\s+/g, '###');
                                newRowOpt.textContent = cleanTarget;
                                rowSelect.appendChild(newRowOpt);
                                rowSelect.value = newRowOpt.value;
                            } else {
                                rowSelect.value = existingOpt.value;
                            }
                        }
                    }
                }, neededQty, 'Keräilysiirto', currentShelf);
            }, true);
        }
    }

    // =========================================================================
    // PUPESOFT-NATIIVITYYLI KAIKILLE LISÄTYILLE PAINIKKEILLE
    // Yhdenmukaistaa Laske rahti-, Varastopaikkasiirto- ja toimintopainikkeet
    // täsmälleen Pupesoftin omien sinisten nappuloiden näköisiksi (ilman emojeja)
    // =========================================================================
    function asennaPupeNappulaTyylit() {
        if (document.getElementById('ai-pupe-button-styles')) return;
        const st = document.createElement('style');
        st.id = 'ai-pupe-button-styles';
        st.textContent = `
            /* Pupesoftin taulukko- ja otsikkotyylien yhdenmukaistus */
            th.ai-rahti-th {
                text-align: left !important;
                vertical-align: top !important;
                padding: 5px !important;
                color: #828282 !important;
                font-family: "Lato", "Helvetica", Arial, Verdana, Lucida, sans-serif !important;
                font-size: 10pt !important;
                font-weight: normal !important;
                white-space: nowrap !important;
            }

            td.ai-rahti-td {
                text-align: left !important;
                vertical-align: top !important;
                padding: 5px !important;
                white-space: nowrap !important;
            }

            .ai-rahti-btn,
            #ai-keraa-rahti-valituille-btn,
            #ai-keraa-rahti-btn {
                background: #119fe7 !important;
                background-image: none !important;
                color: #ffffff !important;
                border: 1px solid #1094d8 !important;
                border-radius: 2px !important;
                font-family: "Lato", "Helvetica", Arial, Verdana, Lucida, sans-serif !important;
                font-size: 10pt !important;
                font-weight: normal !important;
                height: 26px !important;
                line-height: 24px !important;
                padding: 0 8px !important;
                box-shadow: none !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: top !important;
                position: relative !important;
                top: -1px !important;
                margin: 0 !important;
                text-shadow: none !important;
                outline: none !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
                transition: filter 0.15s ease !important;
            }

            .ai-pikasiirto-btn {
                background: #119fe7 !important;
                background-image: none !important;
                color: #ffffff !important;
                border: 1px solid #1094d8 !important;
                border-radius: 2px !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                height: 24px !important;
                line-height: 22px !important;
                padding: 0 8px !important;
                box-shadow: none !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: middle !important;
                text-shadow: none !important;
                outline: none !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
                transition: filter 0.15s ease !important;
            }

            #ai-tuote-siirto-btn {
                background: #119fe7 !important;
                background-image: none !important;
                color: #ffffff !important;
                border: 1px solid #1094d8 !important;
                border-radius: 2px !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                height: 26px !important;
                line-height: 24px !important;
                padding: 0 10px !important;
                position: relative !important;
                top: -2px !important;
                margin-left: 6px !important;
                margin-right: 6px !important;
                box-shadow: none !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                vertical-align: middle !important;
                text-shadow: none !important;
                outline: none !important;
                touch-action: manipulation !important;
                -webkit-tap-highlight-color: transparent !important;
                transition: filter 0.15s ease !important;
            }

            /* Tablet & kosketusnäyttöoptimointi: nopea vaste ja helppo kosketettavuus */
            @media (pointer: coarse) {
                .ai-rahti-btn,
                #ai-keraa-rahti-valituille-btn,
                #ai-keraa-rahti-btn,
                .ai-pikasiirto-btn {
                    min-height: 28px !important;
                    line-height: 26px !important;
                    padding: 0 10px !important;
                }
                #ai-tuote-siirto-btn {
                    min-height: 28px !important;
                    line-height: 26px !important;
                    padding: 0 12px !important;
                }
            }

            .ai-rahti-btn:hover,
            #ai-keraa-rahti-valituille-btn:hover,
            #ai-keraa-rahti-btn:hover,
            .ai-pikasiirto-btn:hover,
            #ai-tuote-siirto-btn:hover {
                filter: brightness(0.9) !important;
            }

            .ai-rahti-btn:active,
            #ai-keraa-rahti-valituille-btn:active,
            #ai-keraa-rahti-btn:active,
            .ai-pikasiirto-btn:active,
            #ai-tuote-siirto-btn:active {
                filter: brightness(0.8) !important;
            }

            .ai-rahti-badge {
                background: rgba(255, 255, 255, 0.28) !important;
                color: #ffffff !important;
                border: 1px solid rgba(255, 255, 255, 0.45) !important;
                font-size: 9px !important;
                font-weight: 800 !important;
                padding: 0px 4px !important;
                border-radius: 8px !important;
                margin-left: 4px !important;
                line-height: 1 !important;
                display: inline-block !important;
                vertical-align: middle !important;
            }
        `;
        document.head.appendChild(st);
    }

    function siistiKaikkiPupeNappulat() {
        // 1. Siistitään Rahti-painikkeet (poistetaan emoji, siistitään tekstit ja merkit)
        document.querySelectorAll('.ai-rahti-btn, #ai-keraa-rahti-valituille-btn, #ai-keraa-rahti-btn').forEach(btn => {
            const raw = btn.innerHTML;
            if (!raw.includes('📦') && btn.dataset.aiNativeClean) return;
            btn.dataset.aiNativeClean = 'true';

            // Etsitään mahdollinen monikkotilaus-määrä
            const m = raw.match(/(\d+)\s*<\/span>\s*$/) || raw.match(/badge[^>]*>(\d+)/) || raw.match(/>(\d+)</);
            if (m && btn.id !== 'ai-keraa-rahti-valituille-btn') {
                btn.innerHTML = `Laske rahti <span class="ai-rahti-badge">${m[1]}</span>`;
            } else if (btn.id === 'ai-keraa-rahti-valituille-btn') {
                btn.textContent = 'Laske rahti valituille';
            } else {
                btn.textContent = 'Laske rahti';
            }
        });

        // 2. Siistitään keräilyrivien pikasiirtopainikkeet
        document.querySelectorAll('.ai-pikasiirto-btn').forEach(btn => {
            if (btn.dataset.aiNativeClean) return;
            btn.dataset.aiNativeClean = 'true';
            btn.textContent = 'Varastopaikkasiirto';
        });
    }

    // =========================================================================
    // PIKSELINTARKKA LINJAUS KERÄYSLISTALLA (keraa.php / lahetteen_tulostusjono)
    // Linjaa "Laske rahti" -painikkeet 100% samaan pysty- ja vaakalinjaan
    // kuin viereiset Pupesoftin omat [ Näytä ] ja [ Tulosta ] -painikkeet
    // =========================================================================
    function sovitaKeraaRahtiPainikkeet() {
        // 1. Linjataan sarakeotsikko "Rahti" vastaamaan muita otsikoita
        document.querySelectorAll('th.ai-rahti-th').forEach(th => {
            th.style.setProperty('text-align', 'left', 'important');
            th.style.setProperty('vertical-align', 'top', 'important');
            th.style.setProperty('padding', '5px', 'important');
        });

        // 2. Linjataan rivikohtaiset Laske rahti -painikkeet viereisten Tulosta/Näytä -painikkeiden tasoon
        const rows = document.querySelectorAll('tr');
        rows.forEach(tr => {
            const rahtiBtn = tr.querySelector('.ai-rahti-btn');
            if (!rahtiBtn) return;

            const rahtiTd = rahtiBtn.closest('td');
            // Etsitään samalta riviltä aito Pupesoft-painike (Näytä tai Tulosta)
            const refBtn = tr.querySelector('input[type="submit"][value="Näytä"], input[value="Näytä"], input[type="submit"][value="Tulosta"], input[value="Tulosta"]');

            if (refBtn) {
                const refTd = refBtn.closest('td');
                if (refTd && rahtiTd) {
                    rahtiTd.style.setProperty('vertical-align', 'top', 'important');
                    rahtiTd.style.setProperty('text-align', 'left', 'important');
                    try {
                        const compTd = window.getComputedStyle(refTd);
                        if (compTd && compTd.padding) {
                            rahtiTd.style.setProperty('padding', compTd.padding, 'important');
                        }
                    } catch (e) {}
                }

                const r1 = refBtn.getBoundingClientRect();
                const r2 = rahtiBtn.getBoundingClientRect();

                if (r1.height > 0) {
                    rahtiBtn.style.setProperty('height', `${Math.round(r1.height)}px`, 'important');
                    rahtiBtn.style.setProperty('line-height', `${Math.round(r1.height - 2)}px`, 'important');
                }

                if (r1.top > 0 && r2.top > 0) {
                    const currentTop = parseFloat(rahtiBtn.style.top || '-1') || 0;
                    const diff = Math.round(r1.top - (r2.top - currentTop));
                    rahtiBtn.style.setProperty('position', 'relative', 'important');
                    rahtiBtn.style.setProperty('top', `${diff}px`, 'important');
                }
            } else if (rahtiTd) {
                rahtiTd.style.setProperty('vertical-align', 'top', 'important');
                rahtiTd.style.setProperty('padding', '5px', 'important');
                rahtiTd.style.setProperty('text-align', 'left', 'important');
            }
        });

        // 3. Linjataan "Laske rahti valituille" -painike viereisen "Yhdistä valitut keräykseen" -painikkeen rinnalle
        const valituilleBtn = document.getElementById('ai-keraa-rahti-valituille-btn');
        const yhdistysSubmitBtn = document.querySelector('input[value*="Yhdistä valitut"], button[value*="Yhdistä valitut"]');
        if (valituilleBtn && yhdistysSubmitBtn) {
            const r1 = yhdistysSubmitBtn.getBoundingClientRect();
            const r2 = valituilleBtn.getBoundingClientRect();
            if (r1.height > 0) {
                valituilleBtn.style.setProperty('height', `${Math.round(r1.height)}px`, 'important');
                valituilleBtn.style.setProperty('line-height', `${Math.round(r1.height - 2)}px`, 'important');
            }
            if (r1.top > 0 && r2.top > 0) {
                const currentTop = parseFloat(valituilleBtn.style.top || '0') || 0;
                const diff = Math.round(r1.top - (r2.top - currentTop));
                valituilleBtn.style.setProperty('position', 'relative', 'important');
                valituilleBtn.style.setProperty('top', `${diff}px`, 'important');
            }
        }
    }


    // =========================================================================
    // SIVUREITITIN JA KÄYNNISTYS (V7.3)
    // =========================================================================
    if (isRahtilaskuri) {
        // Rahtilaskuri-vastaanotin hoidettu Osa 1:ssä
    } else if (isPupesoft) {
        // 1. Kehysten suodatus ja Alt+F -viestinvälitys yläpalkista ja sivupalkista
        if (!isMainWorkspace()) {
            window.addEventListener('keydown', (e) => {
                if (e.altKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
                    try {
                        const mainWin = window.top?._aiPikahakuMainWin ||
                                        window.top?.frames?.['mainframe'] ||
                                        window.parent?.frames?.['mainframe'];
                        if (mainWin && typeof mainWin.aiAvaaPikahaku === 'function') {
                            e.preventDefault();
                            e.stopPropagation();
                            mainWin.aiAvaaPikahaku();
                        }
                    } catch (err) {}
                }
            }, true);
            return;
        }

        try {
            if (window.top) {
                window.top._aiPikahakuMainWin = window;
            }
        } catch (e) {}

        window.aiAvaaPikahaku = avaaPikahakuModaali;
        window.aiSuljePikahaku = suljePikahakuModaali;

        window.addEventListener('keydown', (e) => {
            if (e.altKey && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
                e.preventDefault();
                e.stopPropagation();
                const modal = document.getElementById('ai-pikahaku-overlay');
                if (modal && modal.style.display === 'flex') {
                    suljePikahakuModaali();
                } else {
                    avaaPikahakuModaali();
                }
                return;
            }

            if (e.key === 'Escape') {
                const modal = document.getElementById('ai-pikahaku-overlay');
                if (modal && modal.style.display === 'flex') {
                    e.preventDefault();
                    suljePikahakuModaali();
                }
            }
        }, true);

        // 2. Pupesoftin natiivityylit ja siistimiset kaikille napeille
        asennaPupeNappulaTyylit();
        siistiKaikkiPupeNappulat();

        // 3. Kelluva Pikahaku-pill ja Tuotekyselyn siirtonappi
        lisaaPikahakuPainike();
        sovitaTuotekyselySiirtoPainike();

        // 4. Tuotekortin pikanäkymä
        alustaTuotekortinPikanakyma();

        const { isTulostusjonoSivu, isKeraaSivu, isKeraaYksittainenSivu, isKeraaListaSivu, isSaapuminenSivu } = getPageType();

        if (isSaapuminenSivu) {
            alustaSaapuminenSivu();
            setTimeout(alustaSaapuminenSivu, 400);
            setTimeout(alustaSaapuminenSivu, 1000);
        }

        if (isTulostusjonoSivu || document.getElementById('kerayslistat_table')) {
            jarjestaKerayslista();
            setTimeout(jarjestaKerayslista, 300);
            setTimeout(jarjestaKerayslista, 800);
            alustaTulostusjonoKuuntelu();
        }

        if (isKeraaListaSivu) {
            paivitaKeraaTilauslista();
            synkronoiSuorituskykylokista();
            setInterval(() => synkronoiSuorituskykylokista(), 25000);
            sovitaKeraaRahtiPainikkeet();
            setTimeout(sovitaKeraaRahtiPainikkeet, 300);
            setTimeout(sovitaKeraaRahtiPainikkeet, 800);
            setTimeout(sovitaKeraaRahtiPainikkeet, 1500);
        }

        if (isKeraaYksittainenSivu) {
            alustaKeraaRivit();
            sovitaVarastopaikkasiirtoPainikkeet();
            injectScanStyles();
            renderScanBar();
            setupGlobalScannerListener();
            setTimeout(prefetchOrderEans, 800);
            paivitaKeraaSivuClaim();

            setTimeout(alustaKeraaRivit, 300);
            setTimeout(sovitaVarastopaikkasiirtoPainikkeet, 300);
            setTimeout(renderScanBar, 400);
            setTimeout(alustaKeraaRivit, 1000);
            setTimeout(sovitaVarastopaikkasiirtoPainikkeet, 1000);
            setTimeout(renderScanBar, 1200);

            // Pikatilaus-merkintä & Laske rahti -nappi otsikkoon
            const headTitle = document.querySelector('font.head') || document.querySelector('.head') || document.querySelector('h1');
            const urlParams = new URLSearchParams(window.location.search);
            const keraaTilausNro = (
                document.getElementById('tilaus_id')?.value ||
                urlParams.get('id') ||
                (() => {
                    const infoTd = document.querySelector('#info_table tr:nth-child(2) td');
                    const m = (infoTd ? infoTd.textContent : '').match(/\b(\d{5,8})\b/);
                    return m ? m[1] : '';
                })()
            ).trim();

            if (headTitle) {
                const isKeraaPika =
                    isOrderMarkedPika(keraaTilausNro) ||
                    checkParsedOrderIsPika(document.documentElement.outerHTML, keraaTilausNro);

                if (isKeraaPika) {
                    if (keraaTilausNro) markOrderPika(keraaTilausNro, true);
                    let pikaBadge = document.getElementById('ai-keraa-pika-badge');
                    if (!pikaBadge) {
                        pikaBadge = document.createElement('span');
                        pikaBadge.id = 'ai-keraa-pika-badge';
                        pikaBadge.innerHTML = '🔥 PIKATILAUS';
                        pikaBadge.style.cssText = 'background:#dc2626; color:#ffffff; font-size:11pt; font-weight:800; padding:3px 10px; border-radius:5px; margin-left:14px; vertical-align:middle; display:inline-block; box-shadow:0 2px 4px rgba(220,38,38,0.3);';
                        headTitle.appendChild(pikaBadge);
                    }
                }

                if (keraaTilausNro) {
                    let rahtiKeraaBtn = document.getElementById('ai-keraa-rahti-btn');
                    if (!rahtiKeraaBtn) {
                        rahtiKeraaBtn = document.createElement('button');
                        rahtiKeraaBtn.id = 'ai-keraa-rahti-btn';
                        rahtiKeraaBtn.type = 'button';
                        rahtiKeraaBtn.textContent = 'Laske rahti';
                        rahtiKeraaBtn.title = 'Avaa Rahtilaskuri ja siirrä tämän tilauksen tiedot';
                        rahtiKeraaBtn.style.cssText = 'background:#0284c7; color:#ffffff; font-size:10pt; font-weight:800; padding:4px 12px; border-radius:6px; border:none; margin-left:14px; vertical-align:middle; display:inline-block; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.2); transition:all 0.15s ease;';
                        rahtiKeraaBtn.onmouseover = () => { rahtiKeraaBtn.style.background = '#0369a1'; };
                        rahtiKeraaBtn.onmouseout = () => { rahtiKeraaBtn.style.background = '#0284c7'; };
                        rahtiKeraaBtn.onclick = (e) => {
                            e.preventDefault();
                            showToast(`📦 Noudetaan tilaus #${keraaTilausNro} ja avataan Rahtilaskuri...`);
                            lahetaTilauksetRahtilaskuriin([{ tilausNumero: keraaTilausNro, customerName: '', customerKey: '' }]);
                        };
                        headTitle.appendChild(rahtiKeraaBtn);
                    }
                }
            }
        }

        if (document.getElementById('kerayslistat_table')) {
            jarjestaKerayslista();
            setTimeout(jarjestaKerayslista, 500);
            sovitaKeraaRahtiPainikkeet();
            setTimeout(sovitaKeraaRahtiPainikkeet, 400);
            setTimeout(sovitaKeraaRahtiPainikkeet, 1200);
        }

        // Varmistetaan painikkeiden sovitus ja siistiminen viiveellä
        setTimeout(() => {
            siistiKaikkiPupeNappulat();
            sovitaTuotekyselySiirtoPainike();
            sovitaKeraaRahtiPainikkeet();
        }, 100);
        setTimeout(() => {
            siistiKaikkiPupeNappulat();
            sovitaTuotekyselySiirtoPainike();
            sovitaKeraaRahtiPainikkeet();
        }, 400);
        setTimeout(() => {
            siistiKaikkiPupeNappulat();
            sovitaTuotekyselySiirtoPainike();
            sovitaKeraaRahtiPainikkeet();
        }, 1200);

        // Seurataan dynaamisia taulukkomuutoksia
        if (window.MutationObserver) {
            const obs = new MutationObserver(() => {
                siistiKaikkiPupeNappulat();
                sovitaKeraaRahtiPainikkeet();
            });
            obs.observe(document.body, { childList: true, subtree: true });
        }
    }
})();
