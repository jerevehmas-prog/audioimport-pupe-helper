// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      4.7
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
            console.log('[Pupe-Helper] Käsitellään ' + orders.length + ' tilausta Rahtilaskuriin...');

            // 1. Etsitään file input suoraan tai avataan tuonti-ikkuna klikkaamalla "Tuo tilaus" -nappia
            let fileInput = document.querySelector('input[type="file"]');

            if (!fileInput) {
                for (let i = 0; i < 40; i++) {
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

            // 2. Odotetaan että file input on renderöitynyt modaalissa
            if (!fileInput) {
                for (let i = 0; i < 30; i++) {
                    fileInput = document.querySelector('input[type="file"]');
                    if (fileInput) break;
                    await new Promise(r => setTimeout(r, 150));
                }
            }

            if (!fileInput) {
                console.error('[Pupe-Helper] Tiedostosyötettä ei löytynyt');
                return false;
            }

            // 3. Luodaan File-objektit ja syötetään ne DataTransferilla
            try {
                const dt = new DataTransfer();
                for (const ord of orders) {
                    if (!ord.html || !ord.html.trim()) continue;
                    // Poistetaan Pupesoftin poikkeamakäsittely-valikot (kuten "Uusi tilaus"),
                    // jotta vanhatkaan tulkitsimet eivät sekoita seuraavien rivien tuotekoodeja tilausnumeroiksi
                    const sanitizedHtml = ord.html
                        .replace(/<select[^>]*name=['"]poikkeama_kasittely['"][^>]*>[\s\S]*?<\/select>/gi, '')
                        .replace(/<option[^>]*>\s*Uusi\s*tilaus\s*<\/option>/gi, '');
                    const blob = new Blob([sanitizedHtml], { type: 'text/html;charset=utf-8' });
                    const file = new File([blob], `tilaus_${ord.tilausNumero}.html`, { type: 'text/html' });
                    dt.items.add(file);
                }

                if (dt.files.length === 0) {
                    console.warn('[Pupe-Helper] Ei kelvollisia tiedostoja syötettäväksi');
                    return false;
                }

                fileInput.files = dt.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                // 4. Odotetaan että tiedostojen käsittely valmistuu (latausanimaatio katoaa)
                for (let i = 0; i < 60; i++) {
                    await new Promise(r => setTimeout(r, 200));
                    const isSpinning = !!document.querySelector('.animate-spin');
                    const modalOverlay = document.querySelector('.fixed.inset-0');
                    if (!isSpinning && modalOverlay) {
                        // Käsittely valmis, suljetaan modaali pehmeästi
                        await new Promise(r => setTimeout(r, 300));
                        const closeBtn = modalOverlay.querySelector('button');
                        if (closeBtn) closeBtn.click();
                        break;
                    }
                }

                showRahtilaskuriToast(orders);
                return true;
            } catch (err) {
                console.error('[Pupe-Helper] Virhe tiedostojen syötössä:', err);
                return false;
            }
        }

        window.addEventListener('message', async (event) => {
            // Jos Rahtilaskurissa on sisäänrakennettu natiivi vastaanotin, annetaan sen hoitaa tuonti
            if (window.__RAHTILASKURI_NATIVE_IMPORT__) {
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
                if (window.__RAHTILASKURI_NATIVE_IMPORT__) return;
                if (isHandlingImport) return;
                isHandlingImport = true;

                // Kuittaus lähettäjälle
                try {
                    if (event.source && typeof event.source.postMessage === 'function') {
                        event.source.postMessage({ type: 'IMPORT_PUPESOFT_ACK' }, '*');
                    }
                } catch {}

                try {
                    const ok = await injectOrdersIntoRahtilaskuri(event.data.orders);
                    if (ok && event.source && typeof event.source.postMessage === 'function') {
                        try {
                            event.source.postMessage({ type: 'IMPORT_PUPESOFT_SUCCESS', count: event.data.orders.length }, '*');
                        } catch {}
                    }
                } finally {
                    isHandlingImport = false;
                }
            }
        });

        // Ilmoitetaan avaajalle että Rahtilaskuri on valmis vastaanottamaan
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

        return; // Ei suoriteta Pupesoftin osuutta Rahtilaskurissa
    }

    if (!isPupesoft) return;

    const EXTRA_REGEX = /(?:extra[\s_\-&;%20]*delivery(?:[\s_\-&;%20]*cost)?|pikarahti|pikatoimitus)/i;
    const PIKA_REGEX = /(?:pikatilaus|pika[\s_\-]*tilaus|pikatoimitus|pika[\s_\-]*toimitus|pikarahti|pika[\s_\-]*rahti|\bpikana\b|\bpika\b|kiireellinen[\s_\-]*tilaus|\bkiireellinen\b|\bkiire\b|rush[\s_\-]*order|\brush\b|urgent[\s_\-]*order|\burgent\b|priority[\s_\-]*order|\bpriority\b|express[\s_\-]*order|express[\s_\-]*delivery|express[\s_\-]*shipping|\bexpress\b|fast[\s_\-]*delivery|fast[\s_\-]*shipping|quick[\s_\-]*delivery|quick[\s_\-]*order|extra[\s_\-&;%20]*delivery(?:[\s_\-&;%20]*cost)?|same[\s_\-]*day|\bsameday\b)/i;

    function cleanTextForPikaCheck(text) {
        if (!text) return '';
        return String(text)
            .replace(/\b(?:posti|dhl|tnt|gls|schenker|ups|fedex|dpd)\s+express\b/gi, 'carrier_deliv')
            .replace(/Toimitustapa[\s\S]*?(?:<\/tr>|\n\s*\n)/gi, '');
    }

    function onkoPikatilaus(textOrHtml) {
        if (!textOrHtml) return false;
        if (EXTRA_REGEX.test(textOrHtml)) return true;
        const cleaned = cleanTextForPikaCheck(textOrHtml);
        return PIKA_REGEX.test(cleaned);
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

                // Haetaan yläpuolinen tuoterivi
                const parentRow = lastProductRow || rows[idx - 1];
                let parentIsEven = false;

                if (parentRow && parentRow.classList.contains('keraysrivi')) {
                    parentRow.classList.add('ai-has-comment');
                    parentIsEven = parentRow.classList.contains('ai-keraa-even');
                }

                // Kommenttirivin taustaväri periytyy suoraan yläpuoliselta tuotteelta
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
                            <span class="ai-kommentti-text">${textToShow}</span>
                        </div>
                    `;
                }
                return;
            }

            if (isProductRow) {
                tr.classList.remove('ai-keraa-even', 'ai-keraa-odd');
                lastProductRow = tr;

                // Vuorotellaan vain tuoterivien kesken
                if (productIndex % 2 === 0) {
                    tr.classList.add('ai-keraa-odd');
                } else {
                    tr.classList.add('ai-keraa-even');
                }
                productIndex++;

                // Tarkistetaan onko rivi kerätty
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
                /* Ei käytetä sinistä tai vihreää jotta kerätty tila erottuu 100% selkeästi */
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
                    background-color: #d1fae5 !important; /* Raikas, selkeä smaragdinvihreä */
                    color: #064e3b !important;
                    border-bottom: 2px solid #a7f3d0 !important;
                }

                #maintable tbody tr.yksittainenrivikeruu_keratytrivit > td:first-child {
                    border-left: 8px solid #059669 !important; /* Paksu vihreä huomiopalkki vasemmalla */
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

                /* Kerätyn rivin painike: Ei sininen, vaan selkeä VIHREÄ kuittausnappi! */
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
                    border-bottom: none !important; /* Ei katkoviivaa tuotteen ja kommentin välille */
                }

                #maintable tbody tr.ai-keraa-kommentti > td {
                    border-top: none !important; /* Saumaton liitos yläpuoliseen riviin */
                    padding: 0 10px 10px 10px !important;
                    border-bottom: 2px solid #cbd5e1 !important; /* Selkeä raja seuraavaan tuotteeseen */
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

        // Kuunnellaan klikkauksia (Kerää-painikkeet, sarakeotsikoiden lajittelu)
        table.addEventListener('click', () => {
            setTimeout(paivitaKeraaRivit, 100);
            setTimeout(paivitaKeraaRivit, 400);
            setTimeout(paivitaKeraaRivit, 800);
        });

        // Tarkkaillaan DOM-muutoksia taulukossa (esim. sortable.js rivien järjestäminen)
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

        // Pikatilaus-tunniste ja Laske rahti -painike keräilysivun yläreunaan
        const keraaText = (document.body.innerText || document.body.textContent || '') + ' ' + (document.body.innerHTML || '');
        const headTitle = document.querySelector('font.head') || document.querySelector('.head') || document.querySelector('h1');

        const urlParams = new URLSearchParams(window.location.search);
        const keraaTilausNro = urlParams.get('id') || (() => {
            const m = document.body.textContent.match(/Tilaus[:\s]+(\d{5,8})/i);
            return m ? m[1] : '';
        })();

        if (headTitle) {
            // 1. Pikatilaus-badge
            if (onkoPikatilaus(keraaText)) {
                if (keraaTilausNro) {
                    sessionStorage.setItem('ai_extra_' + keraaTilausNro, '1');
                }
                let pikaBadge = document.getElementById('ai-keraa-pika-badge');
                if (!pikaBadge) {
                    pikaBadge = document.createElement('span');
                    pikaBadge.id = 'ai-keraa-pika-badge';
                    pikaBadge.innerHTML = '🔥 PIKATILAUS';
                    pikaBadge.style.cssText = 'background:#dc2626; color:#ffffff; font-size:11pt; font-weight:800; padding:3px 10px; border-radius:5px; margin-left:14px; vertical-align:middle; display:inline-block; box-shadow:0 2px 4px rgba(220,38,38,0.3);';
                    headTitle.appendChild(pikaBadge);
                }
            }

            // 2. Laske rahti -painike suoraan keräyssivulle
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
    // OSA 3: PUPESOFTIN KERÄYSLISTA (audioimport.ahkio.com)
    // =========================================================================

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
            // Aika jonossa -sarake vasemmalle
            let th = headerRow.querySelector('.ai-status-th');
            if (!th) {
                th = document.createElement('th');
                th.className = 'ai-status-th';
                th.style.textAlign = 'center';
                headerRow.insertBefore(th, headerRow.firstChild);
            }
            th.innerText = 'Aika jonossa';

            // Rahtilaskuri-sarake oikealle
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
                firstTh.colSpan = firstTh.colSpan + 2; // +1 vasen status, +1 oikea rahti
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

    async function fetchOrderHtml(tilausNumero, optionalRow) {
        if (!tilausNumero) return '';

        // 0. Jos tilauksen tiedot (ja tuoterivit) ovat JO avattuna nykyisellä sivulla (esim. keraa.php tai Näytä-painikkeella avattu tulostusjono)
        try {
            const pageDoc = document.documentElement.outerHTML;
            const hasOrderHeading = new RegExp(`(?:Tilaus|Tilausnumero)[:\\s]+${tilausNumero}\\b`, 'i').test(pageDoc) ||
                                    new RegExp(`otunnus=${tilausNumero}\\b`, 'i').test(pageDoc) ||
                                    new RegExp(`id=${tilausNumero}\\b`, 'i').test(pageDoc) ||
                                    new RegExp(`value=["']?${tilausNumero}["']?`, 'i').test(pageDoc);

            const hasProductRows = pageDoc.includes('Tilausrivit') || pageDoc.includes('keraysrivi') || pageDoc.includes('maintable');

            if (hasOrderHeading && hasProductRows) {
                console.log(`[Pupe-Helper] Tilaus #${tilausNumero} löytyi suoraan nykyiseltä sivulta!`);
                return pageDoc;
            }
        } catch (e) {}

        // 1. Jos rivillä on suoraan "Näytä" -lomake tai painike (Pupesoft lahetteen_tulostusjono.php)
        if (optionalRow) {
            try {
                const forms = Array.from(optionalRow.querySelectorAll('form'));
                const naytaForm = forms.find(f => {
                    const txt = (f.textContent || '') + (f.innerHTML || '');
                    return txt.includes('Näytä') || txt.includes('NAYTATILAUS');
                }) || forms[0];

                if (naytaForm) {
                    const params = new URLSearchParams();
                    const fd = new FormData(naytaForm);
                    for (const [k, v] of fd.entries()) {
                        params.append(k, v);
                    }
                    if (!params.get('tee2')) params.set('tee2', 'NAYTATILAUS');
                    if (!params.get('tunnus')) params.set('tunnus', tilausNumero);

                    const formAction = naytaForm.getAttribute('action') || window.location.pathname || 'lahetteen_tulostusjono.php';
                    const res = await fetch(formAction, {
                        method: (naytaForm.method || 'POST').toUpperCase(),
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: params.toString(),
                        credentials: 'include'
                    });

                    if (res.ok) {
                        const text = await res.text();
                        if (text.includes('Tilausrivit') || text.includes('Toimitusosoite') || text.includes('keraysrivi') || text.includes('maintable')) {
                            console.log(`[Pupe-Helper] Tilaus #${tilausNumero} noudettiin rivin Näytä-lomakkeella!`);
                            return text;
                        }
                    }
                }
            } catch (err) {
                console.warn('[Pupe-Helper] Virhe rivin lomakehaussa:', err);
            }
        }

        // 2. NAYTATILAUS POST lahetteen_tulostusjono.php nykyisen sivun lomakekentillä
        try {
            const baseParams = new URLSearchParams();
            const mainForm = document.querySelector('form[action*="tulostusjono"], form#valinnat, form[name="valinnat"]') || document.forms[0];
            if (mainForm) {
                try {
                    const mfd = new FormData(mainForm);
                    for (const [k, v] of mfd.entries()) {
                        if (!['tee2', 'tee', 'tunnus', 'otunnus'].includes(k)) {
                            baseParams.append(k, v);
                        }
                    }
                } catch (e) {}
            }
            baseParams.set('tee2', 'NAYTATILAUS');
            baseParams.set('tunnus', tilausNumero);

            const postUrl = window.location.pathname || '/tilauskasittely/lahetteen_tulostusjono.php';
            const resPost = await fetch(postUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: baseParams.toString(),
                credentials: 'include'
            });

            if (resPost.ok) {
                const textPost = await resPost.text();
                if (textPost.includes('Tilausrivit') || textPost.includes('Toimitusosoite') || textPost.includes('keraysrivi')) {
                    console.log(`[Pupe-Helper] Tilaus #${tilausNumero} noudettiin tulostusjonon POST-haulla!`);
                    return textPost;
                }
            }
        } catch (err) {
            console.warn('[Pupe-Helper] Virhe tulostusjonon POST-haussa:', err);
        }

        // 3. tulostakopio.php (Pupesoftin tilaus- ja lähetetuloste)
        try {
            const resKopio = await fetch(`/tilauskasittely/tulostakopio.php?otunnus=${tilausNumero}&toim=LAHETE&tee=NAYTATILAUS`, {
                credentials: 'include'
            });
            if (resKopio.ok) {
                const textKopio = await resKopio.text();
                if (textKopio && (textKopio.includes('Tilausrivit') || textKopio.includes('Toimitusosoite') || textKopio.length > 500)) {
                    console.log(`[Pupe-Helper] Tilaus #${tilausNumero} noudettiin tulostakopio.php:stä!`);
                    return textKopio;
                }
            }
        } catch (err) {
            console.warn('[Pupe-Helper] tulostakopio.php haku epäonnistui:', err);
        }

        // 4. keraa.php (keräilysivu)
        try {
            const resKeraa = await fetch(`/tilauskasittely/keraa.php?id=${tilausNumero}&toim=`, {
                credentials: 'include'
            });
            if (resKeraa.ok) {
                const textKeraa = await resKeraa.text();
                if (textKeraa.includes('maintable') || textKeraa.includes('keraysrivi') || textKeraa.includes('info_table')) {
                    console.log(`[Pupe-Helper] Tilaus #${tilausNumero} noudettiin keraa.php:stä!`);
                    return textKeraa;
                }
            }
        } catch (err) {
            console.warn('[Pupe-Helper] keraa.php haku epäonnistui:', err);
        }

        return '';
    }

    const skannatutTallaSivulla = new Set();

    async function tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow) {
        let uusiaLoytyi = false;

        // 1. Tarkistetaan ensin, onko sivulle jo valmiiksi auki jokin tilaus (esim. Näytä-painikkeella klikattu)
        try {
            const pageBodyText = (document.body.innerText || document.body.textContent || '') + ' ' + (document.body.innerHTML || '');
            const openOrderMatch = pageBodyText.match(/Tilaus[:\s]+(\d{5,8})/i) || pageBodyText.match(/Tilausnumero[:\s]+(\d{5,8})/i);
            if (openOrderMatch) {
                const avoinTilausNro = openOrderMatch[1];
                if (onkoPikatilaus(pageBodyText)) {
                    console.log(`[Pupe-Helper] 🔥 Avoin tilaus #${avoinTilausNro} sisältää EXTRA DELIVERY COST / pikatilauksen!`);
                    sessionStorage.setItem('ai_extra_' + avoinTilausNro, '1');
                    const avoinRivi = dataRows.find(r => r.dataset.tilausNumero === avoinTilausNro);
                    if (avoinRivi && avoinRivi.dataset.isPika !== '1') {
                        avoinRivi.dataset.isPika = '1';
                        avoinRivi.dataset.colorCategory = 'red';
                        asetaRivinStatus(avoinRivi, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                        uusiaLoytyi = true;
                    }
                }
            }
        } catch (e) {}

        // 2. Käydään läpi kaikki jonon rivit
        for (const row of dataRows) {
            const tilausNumero = row.dataset.tilausNumero || (row.querySelector('.ai-status-td') ? row.querySelectorAll('td')[2] : row.querySelectorAll('td')[1])?.textContent.trim().match(/\d+/)?.[0];
            if (!tilausNumero) continue;

            if (row.dataset.isPika === '1') continue;

            // Jos pikatilaus on jo aiemmin todettu, asetetaan heti
            if (sessionStorage.getItem('ai_extra_' + tilausNumero) === '1') {
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                uusiaLoytyi = true;
                continue;
            }

            // Vältetään saman tilauksen toistuva haku saman sivulatauksen aikana
            if (skannatutTallaSivulla.has(tilausNumero)) continue;
            skannatutTallaSivulla.add(tilausNumero);

            // Tarkistetaan ensin suoraan rivin sisällöstä, mukaan lukien title/alt/tooltip -lisätiedot
            let rowCheckText = row.textContent || '';
            row.querySelectorAll('*').forEach(el => {
                if (el.title) rowCheckText += ' ' + el.title;
                if (el.alt) rowCheckText += ' ' + el.alt;
            });

            if (onkoPikatilaus(rowCheckText) || onkoPikatilaus(row.innerHTML || '')) {
                sessionStorage.setItem('ai_extra_' + tilausNumero, '1');
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                uusiaLoytyi = true;
                jarjestaRivit(dataRows, tbody, summaryRow);
                continue;
            }

            // Haetaan tilauksen sisältö taustalla (sisältää tilauskommentit, lisätiedot ja tilausrivit)
            try {
                const htmlText = await fetchOrderHtml(tilausNumero, row);
                const onPika = onkoPikatilaus(htmlText);
                console.log(`[Pupe-Helper] Tilaus #${tilausNumero} taustaskannattu. Pikatilaus: ${onPika}`);

                if (onPika) {
                    sessionStorage.setItem('ai_extra_' + tilausNumero, '1');
                    row.dataset.isPika = '1';
                    row.dataset.colorCategory = 'red';
                    asetaRivinStatus(row, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                    uusiaLoytyi = true;
                    jarjestaRivit(dataRows, tbody, summaryRow);
                }
            } catch (err) {
                console.error('[Pupe-Helper] Virhe taustahaussa:', tilausNumero, err);
            }
        }

        if (uusiaLoytyi) {
            jarjestaRivit(dataRows, tbody, summaryRow);
        }
    }

    // =========================================================================
    // OSA 3: TILAUSTEN YHDISTÄMINEN JA LÄHETTÄMINEN RAHTILASKURIIN
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
        }, 4000);
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

        // 2. Haetaan tilausten HTML-sisällöt Pupesta
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
            if (statusCallback) statusCallback('⚠️ Tilaustietojen nouto epäonnistui.', true);
            showToast('⚠️ Tilaustietojen nouto epäonnistui Pupesoftista.', true);
            return;
        }

        if (statusCallback) statusCallback('Yhdistetään ja siirretään rivit Rahtilaskuriin...');

        // 3. Lähetetään postMessage Rahtilaskurin ikkunaan ja odotetaan kuittausta
        let isDone = false;
        let attempts = 0;
        let timer = null;

        function ackListener(e) {
            if (!e.data) return;

            // Kun Rahtilaskuri ilmoittaa olevansa valmis, lähetetään tilaukset heti
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
                if (statusCallback) statusCallback(`✅ Valmis! Tilaukset yhdistetty Rahtilaskurissa${rivitTeksti}.`);
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
            if (isDone || attempts > 40 || !rahtiWin || rahtiWin.closed) {
                if (timer) clearInterval(timer);
                window.removeEventListener('message', ackListener);

                if (isDone) {
                    // Jo onnistuneesti kuitattu
                } else if (!rahtiWin || rahtiWin.closed) {
                    if (statusCallback) statusCallback('⚠️ Rahtilaskurin välilehti suljettiin.', true);
                } else {
                    sendPayload();
                    if (statusCallback) statusCallback('✅ Lähetetty Rahtilaskuriin!');
                    showToast(`✅ Lähetetty Rahtilaskuriin!`);
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
                    Asiakkaalla <b>${asiakasNimi}</b> on keräyslistalla <b>${asiakkaanTilaukset.length}</b> tilausta:
                </div>
                <div style="font-size:12px; color:#64748b; margin-bottom:16px; line-height:1.4;">
                    Valitse tilaukset, jotka haluat yhdistää samaan kuormaan. Rahtilaskuri yhdistää tuoterivit, laskee kollit ja lavat sekä näyttää parhaan rahtihinnan.
                </div>

                <div id="ai-order-cards" style="display:flex; flex-direction:column; gap:8px;">
                    ${asiakkaanTilaukset.map(ord => `
                        <label style="display:flex; align-items:center; gap:12px; padding:10px 14px; border:1px solid #e2e8f0; border-radius:8px; cursor:pointer; background:#f8fafc; transition:background 0.2s;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='#f8fafc'">
                            <input type="checkbox" class="ai-order-check" value="${ord.tilausNumero}" checked style="width:18px; height:18px; cursor:pointer;">
                            <div style="flex:1;">
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <span style="font-weight:bold; color:#0f172a; font-size:14px;">Tilaus #${ord.tilausNumero}</span>
                                    ${ord.isPika ? '<span style="background:#dc2626; color:#fff; font-size:10px; font-weight:bold; padding:1px 6px; border-radius:3px;">🔥 PIKA</span>' : ''}
                                    ${ord.isDpd ? '<span style="background:#f03023; color:#fff; font-size:10px; font-weight:bold; padding:1px 6px; border-radius:3px;">DPD</span>' : ''}
                                </div>
                                <div style="font-size:12px; color:#64748b; margin-top:2px;">
                                    <span>${ord.riviCount || '0'} riviä</span> • 
                                    <span>${ord.paino || '0 kg'}</span> • 
                                    <span>${ord.toimitustapa || 'Ei toimitustapaa'}</span>
                                    ${ord.valmisText ? ` • <span style="color:#059669;">Valmis: ${ord.valmisText}</span>` : ''}
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
                        Laske vain #${nykyinenTilaus.tilausNumero}
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

        // Tyhjennetään mahdolliset aiemmat negatiiviset '0'-välimuistitiedot,
        // jotta juuri lisätyt pikatilaukset eivät jää vanhaan lukitukseen!
        try {
            for (let i = sessionStorage.length - 1; i >= 0; i--) {
                const k = sessionStorage.key(i);
                if (k && k.startsWith('ai_extra_') && sessionStorage.getItem(k) === '0') {
                    sessionStorage.removeItem(k);
                }
            }
        } catch (e) {}

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

        // Tarkistetaan heti alussa, onko sivulle avattu tilaus jolla on EXTRA DELIVERY COST / pikatilaus
        try {
            const pageBodyText = (document.body.innerText || document.body.textContent || '') + ' ' + (document.body.innerHTML || '');
            const openOrderMatch = pageBodyText.match(/Tilaus[:\s]+(\d{5,8})/i) || pageBodyText.match(/Tilausnumero[:\s]+(\d{5,8})/i);
            if (openOrderMatch) {
                const avoinTilausNro = openOrderMatch[1];
                if (onkoPikatilaus(pageBodyText)) {
                    sessionStorage.setItem('ai_extra_' + avoinTilausNro, '1');
                }
            }
        } catch (e) {}

        // Kerätään asiakkaiden tilaukset yhdistämistä varten
        const customerMap = new Map();
        const orderInfos = [];

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

            // Asiakkaan tiedot
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

            // Rivejä ja paino
            const riviCount = tds[6 + offset] ? tds[6 + offset].textContent.trim() : '';
            const paino = tds[7 + offset] ? tds[7 + offset].textContent.trim() : '';

            // Tekstitarkistus pikatilauksille: luetaan solut, popupt, tooltipit ja kaikki elementtien lisätietoattribuutit
            const popups = Array.from(row.querySelectorAll('.popup, .tooltip, .tip, [class*="popup"], [class*="tooltip"]'));
            const popupText = popups.map(p => p.textContent || p.innerHTML).join(' ');

            let rowAttrsText = '';
            row.querySelectorAll('*').forEach(el => {
                if (el.title) rowAttrsText += ' ' + el.title;
                if (el.alt) rowAttrsText += ' ' + el.alt;
                for (let i = 0; i < el.attributes.length; i++) {
                    const a = el.attributes[i];
                    if (a.name.startsWith('data-') || a.name.includes('tip') || a.name.includes('pop') || a.name.includes('title')) {
                        rowAttrsText += ' ' + a.value;
                    }
                }
            });

            const cellsToCheck = [tds[0 + offset], tds[1 + offset], tds[2 + offset], tds[3 + offset], tds[4 + offset]];
            if (tds.length > 6 + offset) cellsToCheck.push(tds[6 + offset]);
            if (tds.length > 7 + offset) cellsToCheck.push(tds[7 + offset]);
            const textWithoutDelivery = cellsToCheck.map(td => td ? td.textContent : '').join(' ') + ' ' + popupText + ' ' + rowAttrsText;

            const isTextPika = onkoPikatilaus(textWithoutDelivery);
            const isCachedExtra = tilausNumero && sessionStorage.getItem('ai_extra_' + tilausNumero) === '1';
            const isAlreadyPika = row.dataset.isPika === '1';
            const isRowExtra = onkoPikatilaus(row.textContent || '') || onkoPikatilaus(row.innerHTML || '');

            // Parsitaan aikaleima
            const { ts, line1, line2 } = parseValmisTimestamp(valmisCell);
            row.dataset.valmisTs = ts;

            // Pidetään Valmis-sarake puhtaana
            if (line1 || line2) {
                valmisCell.innerHTML = `${line1}${line2 ? '<br>' + line2 : ''}`;
            }

            // --- LIIKENNEVALOT ---
            if (isTextPika || isCachedExtra || isAlreadyPika || isRowExtra) {
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
            } 
            else {
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
        tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow);
    }

    jarjestaKerayslista();
    setTimeout(jarjestaKerayslista, 500);
})();
