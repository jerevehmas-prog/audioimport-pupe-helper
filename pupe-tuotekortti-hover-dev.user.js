// ==UserScript==
// @name         Audioimport Tuotekortin Pikanäkymä (DEV)
// @namespace    https://audioimport.ahkio.com/
// @version      1.2-dev
// @description  Tuotekortin pikanäkymä hiirellä ja kosketusnäytöllä (Kehahinta, Vihahinta, Myyntihinta, Varastopaikat, Tablet-tuki)
// @author       Audioimport Oy
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @match        https://*.ahkio.com/*
// @match        http://*.ahkio.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const isPupesoft = location.hostname.includes('ahkio.com') || location.hostname === 'localhost' || location.protocol === 'file:';
    if (!isPupesoft) return;

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

    console.log('[Pupe-Tuotekortti-Hover] Alustetaan tuotekortin pikanäkymä...');

    // =========================================================================
    // VÄLIMUISTI JA TILA (Stale-While-Revalidate)
    // =========================================================================
    // Välimuisti säilyttää tiedot selaimen muistissa nopeaa 0 ms näyttöä varten.
    // Jos tieto on yli 15 sekuntia vanhaa, taustalla tarkistetaan automaattisesti
    // tuorein tilanne palvelimelta ja päivitetään kortti lennosta.
    // =========================================================================
    const productCache = new Map(); // sku -> product data object
    const CACHE_STALE_AGE_MS = 15 * 1000; // 15 sekuntia
    let hoverTimer = null;
    let hideTimer = null;
    let activeSku = null;
    let activeAnchor = null;
    let cardElement = null;
    let isHoveringCard = false;

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

    // =========================================================================
    // TUOTELINKIN TUNNISTUS
    // =========================================================================
    function extractSkuFromLink(anchor) {
        if (!anchor || !anchor.getAttribute) return null;
        const href = anchor.getAttribute('href');
        if (!href) return null;

        // Tarkistetaan sisältääkö linkki tuoteno-parametrin
        const m = href.match(/[?&]tuoteno=([^&#]+)/i);
        if (!m) return null;

        // Ei käsitellä poistolinkkejä tai tyhjiä
        if (href.includes('tee=POISTA') || href.includes('action=delete')) return null;

        let sku = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
        sku = sku.replace(/^\*+|\*+$/g, '').trim();
        if (!sku || sku.length < 1) return null;

        return sku;
    }

    // =========================================================================
    // DATAN HAKU JA PARSIMINEN (tuote.php & ajax=varastopaikat)
    // =========================================================================
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

            // Jos ajax-varastopaikat ei palauttanut mitään, mutta tuote.php:sta löytyi pääpaikka
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

            // Jos kokonaissaldoa tai vapaata ei saatu suoraan tuotesivulta, lasketaan varastopaikoista
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
            console.error('[Pupe-Tuotekortti-Hover] Virhe tuotetietojen haussa:', e);
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

        // 1. Etsitään taulukoista rivit ja otsikot
        const tables = Array.from(doc.querySelectorAll('table'));
        for (const table of tables) {
            const rows = Array.from(table.querySelectorAll('tr'));
            for (let i = 0; i < rows.length; i++) {
                const tr = rows[i];
                const ths = Array.from(tr.querySelectorAll('th'));
                if (ths.length === 0) continue;

                const thTexts = ths.map(th => th.textContent.replace(/<[^>]+>/g, ' ').trim().toLowerCase());

                // A) Tuotenumero, Nimitys, EAN, Päävarastopaikka, Saldot
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

                // B) Hintatiedot: Myyntihinta, Kehahinta, Vihahinta
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

        // 2. Varmistukset input-kentistä ja regex-tekstistä
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

        // Saldotiedot yksittäisistä th/td-pareista
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

    // =========================================================================
    // KÄYTTÖLIITTYMÄ: KELLUVA PIKANÄKYMÄKORTTI
    // =========================================================================
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

        // Oletus: linkin alapuolelle
        let top = rect.bottom + 8;
        let left = rect.left;

        // Jos menee oikean reunan yli, siirretään vasemmalle
        if (left + cardWidth > screenW - 12) {
            left = Math.max(12, screenW - cardWidth - 12);
        }

        // Jos menee alareunan yli, kokeillaan linkin yläpuolelle
        if (top + cardHeight > screenH - 12) {
            const topAbove = rect.top - cardHeight - 8;
            if (topAbove >= 10) {
                top = topAbove;
            } else {
                // Jos ei mahdu ylä- eikä alapuolelle, keskitetään pystysuunnassa näytölle
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

        // Varastopaikat HTML
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

        // Saldoyhteenveto
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

    // =========================================================================
    // TAPAHTUMANKÄSITTELIJÄT (EVENT DELEGATION)
    // =========================================================================
    document.addEventListener('mouseover', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const sku = extractSkuFromLink(link);
        if (!sku) return;

        // Jos ollaan jo tämän tuotteen päällä, estetään piilotus
        if (activeSku === sku && cardElement && cardElement.style.display !== 'none') {
            if (hideTimer) {
                clearTimeout(hideTimer);
                hideTimer = null;
            }
            return;
        }

        // Aloitetaan pieni viive ennen pikanäkymän avaamista
        if (hoverTimer) clearTimeout(hoverTimer);
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }

        hoverTimer = setTimeout(async () => {
            activeSku = sku;
            activeAnchor = link;

            // Jos tuote on jo välimuistissa, näytetään suoraan ilman viivettä
            if (productCache.has(sku)) {
                const cachedData = productCache.get(sku);
                renderCompleteCard(cachedData, link);

                // Stale-While-Revalidate: Jos tieto on yli 15s vanhaa, tarkistetaan taustalla
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

            // Muutoin näytetään ensin kevyt latausnäkymä ja haetaan tiedot taustalla
            renderLoadingCard(sku, link);
            const data = await fetchProductDetails(sku);
            if (data && activeSku === sku) {
                renderCompleteCard(data, link);
            }
        }, 200); // 200 ms viive
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

    // =========================================================================
    // KOSKETUSNÄYTTÖJEN JA TABLETTIEN TUKI (TOUCH & TAP)
    // =========================================================================
    // Tableteilla (iPad, Android) ja kosketusnäytöillä ei ole leijuvaa hiirtä.
    // Kun tuotelinkkiä napautetaan sormella:
    // 1. Estetään suora sivulta poistuminen (e.preventDefault()).
    // 2. Avataan pikanäkymä heti kosketetulle tuotteelle.
    // 3. Napautus kortin ulkopuolelle tai sulkurastista (✕) sulkee pikanäkymän.
    // 4. Jos käyttäjä haluaa siirtyä tuotekortille, kortissa on "Avaa tuotekyselyssä ↗".
    // =========================================================================
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        // Jos klikkaus tapahtuu pikanäkymän sisältä (esim. "Avaa tuotekyselyssä"), sallitaan normaali toiminta
        if (cardElement && cardElement.contains(e.target)) return;

        const sku = extractSkuFromLink(link);
        if (!sku) return;

        // Jos kyseessä on tuotelinkki ja pikanäkymä ei ole vielä auki tälle tuotteelle:
        // Estetään linkin oletustoiminto (sivulta poistuminen) ja avataan pikanäkymä heti!
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

    // Kosketusnäytöllä: napautus kortin ulkopuolelle sulkee pikanäkymän
    document.addEventListener('touchstart', (e) => {
        if (cardElement && cardElement.style.display !== 'none') {
            if (!cardElement.contains(e.target) && (!activeAnchor || !activeAnchor.contains(e.target))) {
                hideCard();
            }
        }
    }, { passive: true });

    // Suljetaan pikanäkymä heti Escape-näppäimellä tai vieritettäessä
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

})();
