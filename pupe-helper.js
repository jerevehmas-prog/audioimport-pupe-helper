// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      6.2
// @description  Pupesoft keräyslistan priorisointi, keräilysivun riviväritykset, skannauskeräys viivakoodilla, varastopaikkasiirrot, työnjako ja tilausten yhdistäminen Rahtilaskuriin
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

    const isRahtilaskuri = location.hostname.includes('workers.dev') || location.hostname.includes('localhost');
    const isPupesoft = location.hostname.includes('ahkio.com');

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
        if (laskuYhtio) {
            params.set('lasku_yhtio', laskuYhtio);
        }

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
                /* TAULUKON KENTTIEN TIIVISTYS, JOTTA VARASTOPAIKKASIIRTO MAHTUU RINNALLE    */
                /* ========================================================================= */
                #maintable {
                    width: 100% !important;
                }

                #maintable th:first-child,
                #maintable th#paikka_header {
                    white-space: nowrap !important;
                    min-width: 280px !important;
                }

                /* Paikka-sarake rinnakkain */
                #maintable tbody tr.keraysrivi > td:first-child,
                #maintable tr.keraysrivi > td:first-child {
                    white-space: nowrap !important;
                    vertical-align: middle !important;
                    padding-right: 8px !important;
                }

                #maintable tbody tr.keraysrivi > td:first-child select,
                #maintable tr.keraysrivi > td:first-child select {
                    min-width: 130px !important;
                    width: auto !important;
                    max-width: none !important;
                    height: 28px !important;
                    line-height: 26px !important;
                    padding: 2px 24px 2px 8px !important;
                    font-size: 10pt !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 4px !important;
                    background-color: #ffffff !important;
                    color: #1e293b !important;
                    vertical-align: middle !important;
                    box-sizing: border-box !important;
                }

                /* Määrä & Yksikkö kompaktiksi */
                #maintable th:nth-child(4), #maintable tr.keraysrivi > td:nth-child(4) {
                    padding-left: 4px !important;
                    padding-right: 4px !important;
                    width: 45px !important;
                    text-align: center !important;
                }

                #maintable th:nth-child(5), #maintable tr.keraysrivi > td:nth-child(5) {
                    padding-left: 4px !important;
                    padding-right: 4px !important;
                    width: 38px !important;
                    text-align: center !important;
                }

                /* Poikkeava määrä -kenttä kompaktiksi */
                #maintable th:nth-child(6), #maintable tr.keraysrivi > td:nth-child(6) {
                    padding-left: 4px !important;
                    padding-right: 4px !important;
                    width: 65px !important;
                    text-align: center !important;
                }

                #maintable tr.keraysrivi > td:nth-child(6) input.poikkeava_maara {
                    width: 45px !important;
                    text-align: center !important;
                    padding: 2px 4px !important;
                    box-sizing: border-box !important;
                }

                /* Poikkeaman käsittely -valikko kompaktiksi */
                #maintable th:nth-child(7), #maintable tr.keraysrivi > td:nth-child(7) {
                    padding-left: 4px !important;
                    padding-right: 4px !important;
                    width: 110px !important;
                }

                #maintable tr.keraysrivi > td:nth-child(7) select {
                    max-width: 115px !important;
                    padding: 3px 4px !important;
                    font-size: 9.5pt !important;
                }

                /* Merkkaa kerätyksi -sarake */
                #maintable th:nth-child(8), #maintable tr.keraysrivi > td:nth-child(8) {
                    padding-left: 6px !important;
                    padding-right: 6px !important;
                    width: 75px !important;
                    text-align: center !important;
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
        const old = document.getElementById('ai-pikasiirto-overlay');
        if (old) old.remove();

        const defaultQty = (neededQty && neededQty > 0) ? neededQty : 1;

        if (!document.getElementById('ai-pikasiirto-styles')) {
            const st = document.createElement('style');
            st.id = 'ai-pikasiirto-styles';
            st.textContent = `
                @keyframes aiPikasiirtoPop {
                    from { transform: scale(0.97); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                @keyframes aiSpin {
                    to { transform: rotate(360deg); }
                }

                .ai-modal-reset * {
                    box-sizing: border-box !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
                }

                .ai-qty-group {
                    display: flex !important;
                    gap: 8px !important;
                    align-items: center !important;
                    flex-wrap: wrap !important;
                    width: 100% !important;
                }

                .ai-qty-btn {
                    height: 42px !important;
                    min-width: 54px !important;
                    padding: 0 16px !important;
                    font-size: 14px !important;
                    font-weight: 700 !important;
                    color: #1e293b !important;
                    background: #f1f5f9 !important;
                    border: 1.5px solid #cbd5e1 !important;
                    border-radius: 24px !important;
                    cursor: pointer !important;
                    line-height: normal !important;
                    box-shadow: none !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.1s ease !important;
                    user-select: none !important;
                    touch-action: manipulation !important;
                }
                .ai-qty-btn:hover {
                    background: #e2e8f0 !important;
                    color: #0f172a !important;
                    border-color: #94a3b8 !important;
                }
                .ai-qty-btn:active {
                    transform: scale(0.96) !important;
                    background: #cbd5e1 !important;
                }

                #ai-qty-all {
                    height: 42px !important;
                    min-width: 72px !important;
                    padding: 0 18px !important;
                    font-size: 14px !important;
                    font-weight: 800 !important;
                    color: #1d4ed8 !important;
                    background: #eff6ff !important;
                    border: 1.5px solid #93c5fd !important;
                    border-radius: 24px !important;
                    cursor: pointer !important;
                    line-height: normal !important;
                    box-shadow: none !important;
                    display: inline-flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    transition: all 0.1s ease !important;
                    user-select: none !important;
                    touch-action: manipulation !important;
                }
                #ai-qty-all:hover {
                    background: #dbeafe !important;
                    color: #1e40af !important;
                    border-color: #60a5fa !important;
                }
                #ai-qty-all:active {
                    transform: scale(0.96) !important;
                    background: #bfdbfe !important;
                }

                .ai-field-label {
                    display: block !important;
                    font-size: 12.5px !important;
                    font-weight: 700 !important;
                    color: #334155 !important;
                    text-transform: uppercase !important;
                    margin-bottom: 6px !important;
                    letter-spacing: 0.4px !important;
                }

                .ai-custom-select {
                    width: 100% !important;
                    max-width: 100% !important;
                    height: 46px !important;
                    padding: 10px 14px !important;
                    border: 1.5px solid #94a3b8 !important;
                    border-radius: 8px !important;
                    font-size: 14px !important;
                    font-weight: 600 !important;
                    color: #0f172a !important;
                    background: #f8fafc !important;
                    cursor: pointer !important;
                    box-sizing: border-box !important;
                    outline: none !important;
                    touch-action: manipulation !important;
                }
                .ai-custom-select:focus {
                    border-color: #2563eb !important;
                    background: #ffffff !important;
                    box-shadow: 0 0 0 3px rgba(37,99,235,0.15) !important;
                }

                @media (max-width: 680px) {
                    #ai-pikasiirto-overlay {
                        padding: 8px !important;
                    }
                    #ai-pikasiirto-card {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                        border-radius: 8px !important;
                    }
                    .ai-btn-footer {
                        flex-direction: column-reverse !important;
                        gap: 8px !important;
                    }
                    .ai-btn-footer button {
                        width: 100% !important;
                        height: 48px !important;
                        justify-content: center !important;
                    }
                }
            `;
            document.head.appendChild(st);
        }

        const overlay = document.createElement('div');
        overlay.id = 'ai-pikasiirto-overlay';
        overlay.className = 'ai-modal-reset';
        overlay.style.cssText = `
            position: fixed !important;
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            background-color: rgba(15, 23, 42, 0.75) !important;
            backdrop-filter: blur(2px) !important;
            z-index: 9999999 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            overflow-x: hidden !important;
            overflow-y: auto !important;
            padding: 16px 12px !important;
            box-sizing: border-box !important;
        `;

        const modal = document.createElement('div');
        modal.id = 'ai-pikasiirto-card';
        modal.style.cssText = `
            background: #ffffff !important;
            border-radius: 12px !important;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4) !important;
            width: 640px !important;
            max-width: 100% !important;
            max-height: calc(100vh - 32px) !important;
            max-height: calc(100dvh - 32px) !important;
            display: flex !important;
            flex-direction: column !important;
            overflow: hidden !important;
            border: 1px solid #cbd5e1 !important;
            margin: auto !important;
            animation: aiPikasiirtoPop 0.15s ease-out !important;
            box-sizing: border-box !important;
        `;

        modal.innerHTML = `
            <div style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color:#ffffff; padding:12px 18px; display:flex; justify-content:space-between; align-items:center; flex-shrink:0; border-top-left-radius:11px; border-top-right-radius:11px;">
                <div style="overflow:hidden; padding-right:12px;">
                    <div style="font-size:15px; font-weight:800; display:flex; align-items:center; gap:8px; color:#ffffff;">
                        <span>📦</span> <span>Pikasiirto hyllystä toiseen</span>
                    </div>
                    <div style="font-size:12.5px; color:#cbd5e1; margin-top:3px; word-break:break-word; line-height:1.3;">
                        <b style="color:#ffffff;">${escapeHtml(sku)}</b> <span id="ai-modal-prodname" style="color:#94a3b8;">${initialName ? ' - ' + escapeHtml(initialName) : ''}</span>
                    </div>
                </div>
                <button type="button" id="ai-modal-close" style="background:none !important; border:none !important; color:#cbd5e1 !important; font-size:28px !important; cursor:pointer !important; line-height:1 !important; width:44px !important; height:44px !important; display:flex !important; align-items:center !important; justify-content:center !important; border-radius:6px !important; touch-action:manipulation !important;" title="Sulje (Esc)">&times;</button>
            </div>

            <div id="ai-modal-body" style="padding: 18px 22px 20px; overflow-y: auto; overflow-x: hidden; flex: 1 1 auto; box-sizing: border-box;">
                <div id="ai-modal-loading" style="text-align:center; padding: 35px 10px; color:#64748b; font-size:14px; font-weight:600;">
                    <div style="display:inline-block; width:26px; height:26px; border:3px solid #cbd5e1; border-top-color:#3b82f6; border-radius:50%; animation:aiSpin 0.7s linear infinite; margin-bottom:10px;"></div>
                    <div>Haetaan tuotteen nykyisiä varastopaikkoja ja saldoja...</div>
                </div>

                <div id="ai-modal-content" style="display:none;">
                    <!-- Lähdepaikka -->
                    <div style="margin-bottom: 14px;">
                        <label class="ai-field-label">
                            1. Mistä siirretään (Lähdepaikka):
                        </label>
                        <select id="ai-select-mista" class="ai-custom-select">
                        </select>
                    </div>

                    <!-- Kohdepaikka -->
                    <div style="margin-bottom: 14px;">
                        <label class="ai-field-label">
                            2. Minne siirretään (Kohdepaikka):
                        </label>
                        <select id="ai-select-minne" class="ai-custom-select">
                        </select>
                    </div>

                    <!-- Uusi paikka (jos valittu) -->
                    <div id="ai-new-loc-container" style="display:none; margin-bottom: 14px; background:#eff6ff; padding:12px 14px; border-radius:8px; border:1.5px solid #bfdbfe;">
                        <label style="display:block; font-size:12px; font-weight:700; color:#1e40af; margin-bottom:5px;">
                            Kirjoita tai skannaa uusi hyllypaikka:
                        </label>
                        <input type="text" id="ai-new-loc-input" placeholder="esim. A 12 B 10 tai viivakoodi" style="width:100% !important; height:42px !important; padding:8px 12px !important; border:1.5px solid #93c5fd !important; border-radius:6px !important; font-size:14px !important; font-weight:bold !important; color:#0f172a !important; background:#ffffff !important; box-sizing:border-box !important;">
                    </div>

                    <!-- Määrä -->
                    <div style="margin-bottom: 14px;">
                        <label class="ai-field-label">
                            3. Siirrettävä määrä:
                        </label>
                        <div class="ai-qty-group">
                            <input type="number" id="ai-input-qty" min="1" step="1" inputmode="numeric" pattern="[0-9]*" value="${defaultQty}" style="width:100px !important; height:44px !important; padding:6px 10px !important; border:1.5px solid #94a3b8 !important; border-radius:8px !important; font-size:18px !important; font-weight:800 !important; text-align:center !important; color:#0f172a !important; background:#ffffff !important; box-sizing:border-box !important;">
                            <button type="button" class="ai-qty-btn" data-add="1">+1</button>
                            <button type="button" class="ai-qty-btn" data-add="5">+5</button>
                            <button type="button" class="ai-qty-btn" data-add="10">+10</button>
                            <button type="button" id="ai-qty-all">Kaikki</button>
                        </div>
                    </div>

                    <!-- Selite -->
                    <div style="margin-bottom: 16px;">
                        <label style="display:block; font-size:12px; font-weight:700; color:#64748b; margin-bottom:4px;">
                            Selite (valinnainen):
                        </label>
                        <input type="text" id="ai-input-selite" value="Keräilysiirto" style="width:100% !important; height:38px !important; padding:6px 12px !important; border:1px solid #cbd5e1 !important; border-radius:6px !important; font-size:13px !important; color:#334155 !important; background:#ffffff !important; box-sizing:border-box !important;">
                    </div>

                    <div id="ai-modal-error" style="display:none; padding:10px 14px; background:#fee2e2; border:1px solid #f87171; color:#b91c1c; border-radius:8px; font-size:13px; margin-bottom:14px; font-weight:600; line-height:1.4;"></div>

                    <!-- Painikkeet -->
                    <div class="ai-btn-footer" style="display:flex; justify-content:flex-end; gap:10px; padding-top:14px; border-top:1px solid #e2e8f0; align-items:center;">
                        <button type="button" id="ai-btn-cancel" style="height:44px !important; padding:0 20px !important; font-size:13.5px !important; font-weight:700 !important; border:1.5px solid #cbd5e1 !important; background:#ffffff !important; border-radius:8px !important; cursor:pointer !important; color:#475569 !important; box-shadow:none !important; touch-action:manipulation !important;">Peruuta (Esc)</button>
                        <button type="button" id="ai-btn-submit" style="height:46px !important; padding:0 24px !important; font-size:14px !important; font-weight:800 !important; border:none !important; background:#2563eb !important; color:#ffffff !important; border-radius:8px !important; cursor:pointer !important; box-shadow:0 3px 6px rgba(37,99,235,0.3) !important; display:inline-flex !important; align-items:center !important; gap:8px !important; touch-action:manipulation !important;">
                            <span>🚀 Suorita siirto</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const closeModal = () => overlay.remove();
        document.getElementById('ai-modal-close').onclick = closeModal;
        document.getElementById('ai-btn-cancel').onclick = closeModal;
        overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

        const handleKey = (e) => {
            if (e.key === 'Escape') {
                closeModal();
                window.removeEventListener('keydown', handleKey);
            }
        };
        window.addEventListener('keydown', handleKey);

        const qtyInput = document.getElementById('ai-input-qty');
        modal.querySelectorAll('.ai-qty-btn').forEach(b => {
            b.onclick = () => {
                const add = parseInt(b.dataset.add, 10) || 1;
                const cur = parseInt(qtyInput.value, 10) || 0;
                qtyInput.value = cur + add;
            };
        });

        fetchProductLocations(sku).then(info => {
            document.getElementById('ai-modal-loading').style.display = 'none';
            document.getElementById('ai-modal-content').style.display = 'block';

            if (info.productName) {
                document.getElementById('ai-modal-prodname').textContent = ' - ' + info.productName;
            }

            const mistaSel = document.getElementById('ai-select-mista');
            const minneSel = document.getElementById('ai-select-minne');
            mistaSel.innerHTML = '';
            minneSel.innerHTML = '';

            const hasSources = info.sourceLocations && info.sourceLocations.length > 0;
            const hasTargets = info.targetLocations && info.targetLocations.length > 0;

            if (!hasSources && !hasTargets) {
                mistaSel.innerHTML = '<option value="">(Ei tallennettuja varastopaikkoja)</option>';
                minneSel.innerHTML = '<option value="__NEW__">➕ [Lisää uusi varastopaikka...]</option>';
                const newLocCont = document.getElementById('ai-new-loc-container');
                if (newLocCont) newLocCont.style.display = 'block';
                return;
            }

            info.sourceLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = loc.label;
                opt.dataset.qty = loc.qty;
                mistaSel.appendChild(opt);
            });

            const positiveOtherLoc = info.sourceLocations.find(l => l.qty > 0 && currentShelf && !l.label.toUpperCase().includes(currentShelf.toUpperCase()));
            if (positiveOtherLoc) {
                mistaSel.value = positiveOtherLoc.id;
            } else {
                const anyPositive = info.sourceLocations.find(l => l.qty > 0);
                if (anyPositive) {
                    mistaSel.value = anyPositive.id;
                } else if (info.sourceLocations[0]) {
                    mistaSel.value = info.sourceLocations[0].id;
                }
            }

            info.targetLocations.forEach(loc => {
                const opt = document.createElement('option');
                opt.value = loc.id;
                opt.textContent = loc.label;
                minneSel.appendChild(opt);
            });

            const optNew = document.createElement('option');
            optNew.value = '__NEW__';
            optNew.textContent = '➕ [Lisää uusi varastopaikka...]';
            minneSel.appendChild(optNew);

            if (currentShelf) {
                const currentMatch = info.targetLocations.find(l => l.label.toUpperCase().includes(currentShelf.toUpperCase()));
                if (currentMatch) {
                    minneSel.value = currentMatch.id;
                }
            }

            if (minneSel.value === mistaSel.value && info.targetLocations.length > 1) {
                const alternative = info.targetLocations.find(l => l.id !== mistaSel.value);
                if (alternative) {
                    minneSel.value = alternative.id;
                }
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

            document.getElementById('ai-qty-all').onclick = () => {
                const selOpt = mistaSel.options[mistaSel.selectedIndex];
                const available = selOpt ? parseFloat(selOpt.dataset.qty) : 0;
                if (available > 0) {
                    qtyInput.value = available;
                }
            };

            qtyInput.focus();
            qtyInput.select();

            const submitBtn = document.getElementById('ai-btn-submit');
            const errorBox = document.getElementById('ai-modal-error');

            const doSubmit = async () => {
                errorBox.style.display = 'none';
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<span>⏳ Siirretään...</span>';

                try {
                    let finalMinneId = minneSel.value;
                    let targetLocName = minneSel.options[minneSel.selectedIndex]?.textContent || '';

                    if (finalMinneId === '__NEW__') {
                        const newName = newLocInput.value.trim();
                        if (!newName) {
                            throw new Error('Kirjoita uuden varastopaikan nimi tai skannaa koodi');
                        }
                        await addNewLocationToProduct(sku, newName);
                        const refreshed = await fetchProductLocations(sku);
                        const created = refreshed.targetLocations.find(l => l.label.toUpperCase().includes(newName.toUpperCase()));
                        if (!created) {
                            throw new Error(`Uutta paikkaa '${newName}' ei löytynyt luonnin jälkeen.`);
                        }
                        finalMinneId = created.id;
                        targetLocName = created.label;
                    }

                    const mistaId = mistaSel.value;
                    const mistaText = mistaSel.options[mistaSel.selectedIndex]?.textContent || '';
                    const transferQty = parseFloat(qtyInput.value.replace(',', '.'));
                    const selite = document.getElementById('ai-input-selite').value;

                    if (!mistaId || mistaId === '') {
                        throw new Error('Valitse lähdepaikka, josta tavara siirretään!');
                    }
                    if (!finalMinneId || finalMinneId === '') {
                        throw new Error('Valitse kohdepaikka, jonne tavara siirretään!');
                    }
                    if (mistaId === finalMinneId) {
                        throw new Error('Lähettävä ja vastaanottava paikka eivät voi olla sama!');
                    }

                    await executeStockTransfer({
                        tuoteno: sku,
                        mistaId,
                        minneId: finalMinneId,
                        maara: transferQty,
                        selite
                    });

                    closeModal();
                    showPikasiirtoToast(`✅ Siirto onnistui! Siirretty <b>${transferQty} kpl</b><br><span style="font-size:12px; opacity:0.9;">${escapeHtml(mistaText)} ➔ ${escapeHtml(targetLocName)}</span>`);

                    if (targetRow) {
                        const rowSelect = targetRow.querySelector('select[name^="varastorekla"]');
                        if (rowSelect) {
                            let existingOpt = Array.from(rowSelect.options).find(o => targetLocName.includes(o.text.trim()));
                            if (!existingOpt) {
                                const newRowOpt = document.createElement('option');
                                newRowOpt.value = targetLocName.replace(/\s+/g, '###');
                                newRowOpt.textContent = targetLocName;
                                rowSelect.appendChild(newRowOpt);
                                rowSelect.value = newRowOpt.value;
                            }
                        }
                    }

                } catch (err) {
                    errorBox.textContent = err.message || String(err);
                    errorBox.style.display = 'block';
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<span>🚀 Suorita siirto</span>';
                    playPikasiirtoErrorTone();
                }
            };

            submitBtn.onclick = doSubmit;

            qtyInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    doSubmit();
                }
            };

            document.getElementById('ai-input-selite').onkeydown = (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    doSubmit();
                }
            };

        }).catch(err => {
            document.getElementById('ai-modal-loading').innerHTML = `
                <div style="color:#ef4444; font-weight:700; margin-bottom:8px;">⚠️ Varastopaikkojen haku epäonnistui:</div>
                <div style="font-size:13px; color:#64748b;">${escapeHtml(err.message || String(err))}</div>
            `;
        });
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
                paikkaSelect.style.minWidth = '130px';
                paikkaSelect.style.width = 'auto';
                paikkaSelect.style.height = '28px';
                paikkaSelect.style.lineHeight = '26px';
                paikkaSelect.style.padding = '2px 24px 2px 8px';
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
                btn.innerHTML = '📦 Tee varastopaikkasiirto';
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
                btn.innerHTML = '📦 Tee varastopaikkasiirto';
                if (paikkaSelect && btn.previousElementSibling !== paikkaSelect) {
                    paikkaSelect.insertAdjacentElement('afterend', btn);
                }
            }

            btn.style.display = 'inline-flex';
            btn.style.alignItems = 'center';
            btn.style.justifyContent = 'center';
            btn.style.gap = '4px';
            btn.style.marginLeft = '6px';
            btn.style.marginTop = '0';
            btn.style.marginBottom = '0';
            btn.style.padding = '0 10px';
            btn.style.height = '28px';
            btn.style.lineHeight = '26px';
            btn.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif';
            btn.style.fontSize = '11px';
            btn.style.fontWeight = '700';
            btn.style.color = '#ffffff';
            btn.style.background = '#4f46e5';
            btn.style.border = '1px solid #4338ca';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            btn.style.boxShadow = '0 1px 2px rgba(79, 70, 229, 0.25)';
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
                /* Helpotetaan rivin kuittausta ja pikasiirtoa tablet-kosketusnäytöillä */
                button.kerattavatrivit,
                input.kerattavatrivit,
                .ai-pikasiirto-btn {
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

            /* ========================================================================= */
            /* TAULUKON KENTTIEN TIIVISTYS, JOTTA VARASTOPAIKKASIIRTO MAHTUU RINNALLE    */
            /* ========================================================================= */
            #maintable {
                width: 100% !important;
            }

            #maintable th:first-child,
            #maintable th#paikka_header {
                white-space: nowrap !important;
                min-width: 280px !important;
            }

            #maintable tbody tr.keraysrivi > td:first-child,
            #maintable tr.keraysrivi > td:first-child {
                white-space: nowrap !important;
                vertical-align: middle !important;
                padding-right: 8px !important;
            }

            #maintable tbody tr.keraysrivi > td:first-child select,
            #maintable tr.keraysrivi > td:first-child select {
                min-width: 130px !important;
                width: auto !important;
                max-width: none !important;
                height: 28px !important;
                line-height: 26px !important;
                padding: 2px 24px 2px 8px !important;
                font-size: 10pt !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 4px !important;
                background-color: #ffffff !important;
                color: #1e293b !important;
                vertical-align: middle !important;
                box-sizing: border-box !important;
            }

            #maintable th:nth-child(4), #maintable tr.keraysrivi > td:nth-child(4) {
                padding-left: 4px !important;
                padding-right: 4px !important;
                width: 45px !important;
                text-align: center !important;
            }

            #maintable th:nth-child(5), #maintable tr.keraysrivi > td:nth-child(5) {
                padding-left: 4px !important;
                padding-right: 4px !important;
                width: 38px !important;
                text-align: center !important;
            }

            #maintable th:nth-child(6), #maintable tr.keraysrivi > td:nth-child(6) {
                padding-left: 4px !important;
                padding-right: 4px !important;
                width: 65px !important;
                text-align: center !important;
            }

            #maintable tr.keraysrivi > td:nth-child(6) input.poikkeava_maara {
                width: 45px !important;
                text-align: center !important;
                padding: 2px 4px !important;
                box-sizing: border-box !important;
            }

            #maintable th:nth-child(7), #maintable tr.keraysrivi > td:nth-child(7) {
                padding-left: 4px !important;
                padding-right: 4px !important;
                width: 110px !important;
            }

            #maintable tr.keraysrivi > td:nth-child(7) select {
                max-width: 115px !important;
                padding: 3px 4px !important;
                font-size: 9.5pt !important;
            }

            #maintable th:nth-child(8), #maintable tr.keraysrivi > td:nth-child(8) {
                padding-left: 6px !important;
                padding-right: 6px !important;
                width: 75px !important;
                text-align: center !important;
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

        return { isTulostusjonoSivu, isKeraaSivu, isKeraaYksittainenSivu, isKeraaListaSivu };
    }

    // =========================================================================
    // SYNKRONOINTI & TALLENNUSTILA (localStorage + BroadcastChannel)
    // =========================================================================
    const STORAGE_KEY_CLAIMS = 'ai_pupe_picking_claims_v5';
    const STORAGE_KEY_USER = 'ai_pupe_current_picker_name';
    const SYNC_CHANNEL = 'ai_pupe_tyonjako_sync';

    // Siivotaan vanhat mahdollisesti virheelliset välimuistitiedot (esim. NAYTATILAUS-osumat tai paikalliset avaukset)
    try {
        localStorage.removeItem('ai_pupe_picking_claims_v1');
        localStorage.removeItem('ai_pupe_picking_claims_v2');
        localStorage.removeItem('ai_pupe_picking_claims_v3');
        localStorage.removeItem('ai_pupe_picking_claims_v4');
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
    function paivitaKeraaTilauslista() {
        const { isKeraaListaSivu } = getPageType();
        if (!isKeraaListaSivu) return;

        const claims = getClaims();
        const currentPicker = getPickerName();

        // 1. Lisätään oma "Tulostanut"-sarakeotsikko taulukkoon ennen Kerää-saraketta
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
        }

        // Korjataan mahdolliset yhteenvetorivien colspanit
        const colspans = document.querySelectorAll('table tr th[colspan], table tr td[colspan]');
        colspans.forEach(el => {
            if (!el.dataset.aiColspanFixed) {
                el.dataset.aiColspanFixed = 'true';
                const c = parseInt(el.getAttribute('colspan'), 10);
                if (c >= 6) {
                    el.setAttribute('colspan', String(c + 1));
                }
            }
        });

        // Etsitään kaikki taulukkorivit (tr), joissa on tilausnumero
        const rows = Array.from(document.querySelectorAll('table tr'));
        const missingOrders = [];

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

            // Varmistetaan tilausnumeron solu
            if (!orderCell) {
                orderCell = cells[1] || cells[0];
            }

            // HUOM: Kerää-napin painallus EI koskaan ylikirjoita tulostajaa!
            // Tulostaja haetaan AINA vain Tulosta keräyslista -ohjelman tulostustapahtumasta (suorituskykyloki.php).

            const rowTulostettuTs = parseKeraaRowTulostettuTimestamp(cells[3]);
            let claim = claims[orderNo];

            // Jos välimuistissa oleva tulostusmerkintä on vanhempi kuin Pupesoftin oma Tulostettu-aikaleima,
            // poistetaan vanhentunut merkintä ja haetaan todellinen tulostaja suorituskykylokista!
            if (claim && rowTulostettuTs > 0 && (claim.timestamp + 60000) < rowTulostettuTs) {
                delete claims[orderNo];
                saveClaims(claims);
                claim = null;
            }

            // Jos tilausta ei vielä löydy muistista, lisätään se kohdennettuun lokihakuun
            if (!claim) {
                missingOrders.push(orderNo);
            }

            // Etsitään solu, jossa Kerää-nappi sijaitsee
            const keraaTd = keraaBtn ? keraaBtn.closest('td') : (cells[cells.length - 2] || cells[cells.length - 1]);

            // Luodaan tai etsitään rivikohtainen "Tulostanut"-solu (sijoitetaan ennen Kerää-saraketta)
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

            // Poistetaan vanhat päällekkäiset merkit solujen sisältä, jotta Tilaus- ja Kerää-solut pysyvät siisteinä
            const oldOrderBadge = tr.querySelector('.ai-orderno-badge');
            if (oldOrderBadge) oldOrderBadge.remove();
            const oldKeraaBadge = tr.querySelector('.ai-keraa-row-badge');
            if (oldKeraaBadge) oldKeraaBadge.remove();

            if (!claim) {
                // Tilaus on VAPAA (ei tulostustietoa suorituskykylokissa)
                tr.style.backgroundColor = '';
                tdTulostanut.innerHTML = '<span style="color: #94a3b8; font-size: 11px;">—</span>';
                if (keraaBtn) {
                    keraaBtn.style.outline = '';
                    keraaBtn.title = 'Aloita keräys';
                }
            } else {
                const timeStr = formatClaimTime(claim.timestamp);
                const isOwn = (claim.picker === currentPicker && currentPicker.toLowerCase() !== 'varasto');

                // Värit ja korostukset:
                // Oma tilaus = keltainen
                // Toisen tilaus (ml. käyttäjä Varasto) = selkeä punertava/huomioväri
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
        });

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

    async function tarkistaPuuttuvatTilaukset(orderNumbers) {
        const toFetch = orderNumbers.filter(no => !activeOrderLookups.has(no));
        if (toFetch.length === 0) return;

        toFetch.forEach(no => activeOrderLookups.add(no));

        try {
            console.log(`[Pupe-Työnjako] Haetaan tulostustiedot tilauksille: ${toFetch.join(', ')}`);
            setSyncStatus(`🔄 Haetaan tulostajia (${toFetch.length} kpl)...`, '#64748b');

            // Haetaan kullekin puuttuvalle tilaukselle tiedot suorituskykylokista (max 5 rinnakkain)
            const batches = [];
            for (let i = 0; i < toFetch.length; i += 5) {
                batches.push(toFetch.slice(i, i + 5));
            }

            let foundCount = 0;
            for (const batch of batches) {
                await Promise.all(batch.map(async (orderNo) => {
                    const formData = new URLSearchParams();
                    formData.set('tee', 'listaa');
                    formData.set('rekuesti', orderNo);

                    // 60 päivän aikaväli
                    const today = new Date();
                    const pastDate = new Date();
                    pastDate.setDate(today.getDate() - 60);
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
                            const existing = claims[orderNo];
                            if (!existing || parsed[orderNo].timestamp >= existing.timestamp) {
                                claims[orderNo] = parsed[orderNo];
                                saveClaims(claims);
                                foundCount++;
                            }
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
            toFetch.forEach(no => activeOrderLookups.delete(no));
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
        const { isTulostusjonoSivu } = getPageType();
        if (!isTulostusjonoSivu) return;

        // Etsitään olemassa olevat rivikohtaiset Tulosta-painikkeet
        const printSubmits = document.querySelectorAll('input[type="submit"][value="Tulosta"], button[value="Tulosta"]');
        printSubmits.forEach(btn => {
            if (btn.dataset.aiPrintAttached) return;
            btn.dataset.aiPrintAttached = 'true';

            const handlePrint = () => {
                const tr = btn.closest('tr');
                const form = btn.form || btn.closest('form');
                let orderNo = '';
                const orderInput = (form && form.querySelector('input[name*="tulostukseen"]')) || (tr && tr.querySelector('input[name*="tulostukseen"]'));
                if (orderInput && orderInput.value) {
                    orderNo = orderInput.value.trim();
                }
                if (!orderNo && tr) {
                    const td = tr.querySelector('td:nth-child(2)');
                    const m = (td ? td.textContent : '').match(/\b(\d{5,8})\b/);
                    orderNo = m ? m[1] : '';
                }

                if (orderNo) {
                    const pickerName = getPickerName();
                    console.log(`[Pupe-Työnjako] Tilaus #${orderNo} tulostettu käyttäjälle: ${pickerName}`);
                    claimOrder(orderNo, pickerName, 'tulostettu');
                }
            };

            btn.addEventListener('click', handlePrint);
            if (btn.form) {
                btn.form.addEventListener('submit', handlePrint);
            }
        });

        // "Tulosta kaikki" -painikkeen käsittely
        const printAllBtn = document.getElementById('tulosta_kaikki_nappi') || document.querySelector('input[value="Tulosta kaikki"]');
        if (printAllBtn) {
            const allForm = printAllBtn.closest('form');
            if (allForm && !allForm.dataset.aiPrintAllAttached) {
                allForm.dataset.aiPrintAllAttached = 'true';
                allForm.addEventListener('submit', () => {
                    const pickerName = getPickerName();
                    const orders = Array.from(document.querySelectorAll('input[name="tulostukseen[]"]'))
                        .map(inp => inp.value.trim())
                        .filter(Boolean);
                    orders.forEach(orderNo => {
                        claimOrder(orderNo, pickerName, 'tulostettu');
                    });
                });
            }
        }
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
                                    <span>${escapeHtml(ord.riviCount || '0')} riviä</span> • 
                                    <span>${escapeHtml(ord.paino || '0 kg')}</span> • 
                                    <span>${escapeHtml(ord.toimitustapa || 'Ei toimitustapaa')}</span>
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
                btn.innerHTML = `<span>📦 Laske rahti</span> <span style="background:#f59e0b; color:#ffffff; font-size:10px; font-weight:800; padding:1px 5px; border-radius:10px;">${custOrders.length}</span>`;
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
                btn.innerHTML = `<span>📦 Laske rahti</span>`;
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
    // SIVUREITITIN JA KÄYNNISTYS (V6.0)
    // =========================================================================
    if (isRahtilaskuri) {
        // Rahtilaskuri-vastaanotin hoidettu Osa 1:ssä
    } else if (isPupesoft) {
        const { isTulostusjonoSivu, isKeraaSivu, isKeraaYksittainenSivu, isKeraaListaSivu } = getPageType();

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
                        rahtiKeraaBtn.innerHTML = '📦 Laske rahti';
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
        }
    }
})();
