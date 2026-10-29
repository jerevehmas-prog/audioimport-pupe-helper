// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      5.0
// @description  Pupesoft keräyslistan priorisointi, keräilysivun riviväritykset ja tilausten yhdistäminen Rahtilaskuriin
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @match        https://rahtilaskuri.audioimport.workers.dev/*
// @match        http://localhost:5173/*
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
    const PIKA_COMMENT_REGEX = /\b(?:pikatilaus\w*|pika[\s_\-]+tilaus\w*|pikatilauksena|pikatoimitus\w*|pika[\s_\-]+toimitus\w*|pikarahti\w*|pika[\s_\-]+rahti\w*|pikakeräys\w*|pika[\s_\-]+keräys\w*|pikana|kiireellinen(?:[\s_\-]+tilaus\w*)?|rush[\s_\-]*order\w*|rush[\s_\-]*delivery|rush[\s_\-]*shipping|rush|urgent[\s_\-]*order\w*|urgent[\s_\-]*delivery|urgent[\s_\-]*shipping|urgent|express[\s_\-]*order\w*|express[\s_\-]*delivery|express[\s_\-]*shipping|express|priority[\s_\-]*order\w*|priority[\s_\-]*delivery|high[\s_\-]*priority|priority|fast[\s_\-]*order\w*|fast[\s_\-]*delivery|fast[\s_\-]*shipping|quick[\s_\-]*order\w*|quick[\s_\-]*delivery|quick[\s_\-]*shipping|expedited(?:[\s_\-]*order\w*|[\s_\-]*delivery|[\s_\-]*shipping)?|same[\s_\-]*day|sameday|asap)\b/i;

    // Ei-fyysiset palvelu- ja rahtirivit, joita ei pakata Rahtilaskurin kolleihin
    const NON_PHYSICAL_SERVICE_REGEX = /^(?:extra[\s_\-]*delivery(?:[\s_\-]*cost\w*)?|express[\s_\-]*delivery(?:[\s_\-]*cost\w*)?|pikarahti\w*|pikatoimitus\w*|pikatilaus\w*|rahti|rahtikulu\w*|rahtimaksu\w*|toimituskulu\w*|toimitusmaksu\w*|laskutuslisä\w*|pientoimituslisä\w*|käsittelykulu\w*|lavaveloitus\w*|huolintakulu\w*|freight(?:\s*(?:cost|charge|fee))?|shipping(?:\s*(?:cost|charge|fee))?|delivery(?:\s*(?:cost|charge|fee))?|handling(?:\s*fee)?)$/i;

    const PIKA_STORAGE_KEY = 'ai_pika_orders_v5';
    const PIKA_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 vrk

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
                'script, style, noscript, #kerayslistat_table, form[name="find"], form[name="sanakirjaform"], select[name="tutoimtapa"], select[name^="filtteri_"], .popup'
            ).forEach(el => el.remove());

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
            `;
            document.head.appendChild(style);
        }

        paivitaKeraaRivit();

        if (table.dataset.aiInitialized) return;
        table.dataset.aiInitialized = 'true';

        table.addEventListener('click', () => {
            setTimeout(paivitaKeraaRivit, 100);
            setTimeout(paivitaKeraaRivit, 400);
            setTimeout(paivitaKeraaRivit, 800);
        });

        const tbody = table.querySelector('tbody') || table;
        if (window.MutationObserver) {
            const observer = new MutationObserver(() => {
                paivitaKeraaRivit();
            });
            observer.observe(tbody, { childList: true });
        }
    }

    if (location.pathname.includes('keraa.php') || document.getElementById('maintable')) {
        alustaKeraaRivit();
        setTimeout(alustaKeraaRivit, 300);
        setTimeout(alustaKeraaRivit, 1000);

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

            // Asiakkaan tiedot yhdistämistä varten
            let asiakasNimi = '';
            let customerKey = '';
            if (asiakasTd) {
                const parts = asiakasTd.innerHTML.split(/<br\s*\/?>|\n/i)
                    .map(s => s.replace(/<[^>]+>/g, '').trim())
                    .filter(Boolean);
                const ytunnus = parts[0] || '';
                asiakasNimi = parts.length > 1 ? parts[1] : parts[0] || '';
                const cleanY = ytunnus.toUpperCase().replace(/\s+/g, '');
                const cleanN = asiakasNimi.toUpperCase().replace(/\s+/g, '');
                customerKey = cleanY.length >= 3 ? cleanY : cleanN;
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

    jarjestaKerayslista();
    setTimeout(jarjestaKerayslista, 500);
})();
