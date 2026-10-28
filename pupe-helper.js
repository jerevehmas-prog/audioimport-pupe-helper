// ==UserScript==
// @name         Audioimport Pupe Helper
// @namespace    https://audioimport.ahkio.com/
// @version      3.8
// @description  Liikennevalot parannetulla kontrastilla ja DPD-priorisoinnilla
// @match        https://audioimport.ahkio.com/*
// @match        http://audioimport.ahkio.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const PIKA_REGEX = /\b(pikatilaus|pika-tilaus|rush order|urgent order|priority order|express order|urgent|rush)\b/i;

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
        }

        const summaryRow = table.querySelector('tbody tr:not(.niputettava_rivi)');
        if (summaryRow && !summaryRow.dataset.colAdjusted) {
            const firstTh = summaryRow.querySelector('th');
            if (firstTh && firstTh.colSpan) {
                firstTh.colSpan = firstTh.colSpan + 1;
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
            statusTd.style.padding = '5px 8px';
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
        if (row.dataset.isPika === '1') return 0; // Pikatilaus aina ehdoton kärki
        const cat = row.dataset.colorCategory;
        if (cat === 'red') return 1;
        if (cat === 'yellow') return 2;
        if (cat === 'green') return 3;
        return 4;
    }

    function jarjestaRivit(dataRows, tbody, summaryRow) {
        dataRows.sort((a, b) => {
            // 1. Väritaso: Pikatilaus (0) -> Punainen (1) -> Keltainen (2) -> Vihreä (3)
            const tierA = getRowTier(a);
            const tierB = getRowTier(b);

            if (tierA !== tierB) {
                return tierA - tierB;
            }

            // 2. Saman värin sisällä: DPD-toimitustavat ensin!
            const isDpdA = a.dataset.isDpd === '1' ? 1 : 0;
            const isDpdB = b.dataset.isDpd === '1' ? 1 : 0;

            if (isDpdA !== isDpdB) {
                return isDpdB - isDpdA; // 1 (DPD) ennen 0 (ei-DPD)
            }

            // 3. Saman toimitustavan sisällä: vanhin Valmis-aika ensin!
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

    async function tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow) {
        let uusiaLoytyi = false;

        for (const row of dataRows) {
            const tds = row.querySelectorAll('td');
            const tilausTd = row.querySelector('.ai-status-td') ? tds[2] : tds[1];
            if (!tilausTd) continue;

            const tilausNumero = tilausTd.textContent.trim().match(/\d+/)?.[0];
            if (!tilausNumero) continue;

            if (row.dataset.isPika === '1') continue;

            const cached = sessionStorage.getItem('ai_extra_' + tilausNumero);
            if (cached === '1') {
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, '<span style="background:#dc2626; color:#fff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px;">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                uusiaLoytyi = true;
                continue;
            } else if (cached === '0') {
                continue;
            }

            try {
                const formData = new FormData();
                formData.append('tee2', 'NAYTATILAUS');
                formData.append('tunnus', tilausNumero);
                formData.append('lasku_yhtio', 'audio');
                formData.append('tuvarasto', 'KAIKKI');
                formData.append('tutyyppi', 'KAIKKI');
                formData.append('tutoimtapa', 'KAIKKI');
                formData.append('karajaus', '3');

                const response = await fetch(window.location.pathname || 'lahetteen_tulostusjono.php', {
                    method: 'POST',
                    body: formData
                });
                
                const htmlText = await response.text();
                const onExtra = /extra[\s_-]*delivery[\s_-]*cost/i.test(htmlText);

                if (onExtra) {
                    sessionStorage.setItem('ai_extra_' + tilausNumero, '1');
                    row.dataset.isPika = '1';
                    row.dataset.colorCategory = 'red';
                    asetaRivinStatus(row, '<span style="background:#dc2626; color:#fff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px;">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
                    uusiaLoytyi = true;
                } else {
                    sessionStorage.setItem('ai_extra_' + tilausNumero, '0');
                }
            } catch (err) {
                console.error('Virhe taustahaussa:', tilausNumero, err);
            }
        }

        if (uusiaLoytyi) {
            jarjestaRivit(dataRows, tbody, summaryRow);
        }
    }

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

        dataRows.forEach((row, idx) => {
            if (!row.dataset.origIdx) row.dataset.origIdx = idx;

            const hasStatusCell = !!row.querySelector('.ai-status-td');
            const offset = hasStatusCell ? 1 : 0;

            const tds = row.querySelectorAll('td');
            if (tds.length < 4 + offset) return;

            const tilausTd = tds[1 + offset];
            const valmisCell = tds[3 + offset];
            const tilausNumero = tilausTd ? tilausTd.textContent.trim().match(/\d+/)?.[0] : null;

            // Toimitustapa ja DPD-tunnistus
            let toimitustapaStr = '';
            if (toimitustapaIdx >= 0 && tds[toimitustapaIdx]) {
                toimitustapaStr = tds[toimitustapaIdx].textContent;
            } else if (tds[5 + offset]) {
                toimitustapaStr = tds[5 + offset].textContent;
            }
            const isDpd = /dpd/i.test(toimitustapaStr);
            row.dataset.isDpd = isDpd ? '1' : '0';

            // Tekstitarkistus pikatilauksille
            const popups = Array.from(row.querySelectorAll('.popup, .tooltip'));
            const popupText = popups.map(p => p.textContent || p.innerHTML).join(' ');
            const textWithoutDelivery = [tds[0 + offset], tds[1 + offset], tds[2 + offset], tds[3 + offset], tds[4 + offset]].map(td => td ? td.textContent : '').join(' ') + ' ' + popupText;

            const isTextPika = PIKA_REGEX.test(textWithoutDelivery);
            const isCachedExtra = tilausNumero && sessionStorage.getItem('ai_extra_' + tilausNumero) === '1';

            // Parsitaan aikaleima
            const { ts, line1, line2 } = parseValmisTimestamp(valmisCell);
            row.dataset.valmisTs = ts;

            // Pidetään Valmis-sarake puhtaana
            if (line1 || line2) {
                valmisCell.innerHTML = `${line1}${line2 ? '<br>' + line2 : ''}`;
            }

            // --- LIIKENNEVALOT TASAPAINOTETULLA KONTRASTILLA ---

            // 1. PUNAINEN: Pikatilaus
            if (isTextPika || isCachedExtra) {
                row.dataset.isPika = '1';
                row.dataset.colorCategory = 'red';
                asetaRivinStatus(row, '<span style="background:#dc2626; color:#ffffff; font-size:9pt; font-weight:bold; padding:2px 7px; border-radius:3px; white-space:nowrap; box-shadow:0 1px 2px rgba(0,0,0,0.15);">🔥 PIKATILAUS</span>', '#fde8e8', '#e02424');
            } 
            else {
                row.dataset.isPika = '0';

                if (ts > 0) {
                    const diffHours = (now - ts) / (1000 * 60 * 60);
                    const diffDays = Math.floor(diffHours / 24);

                    // 1. PUNAINEN: Yli 2 vrk (48 h) odottaneet
                    if (diffHours >= 48) {
                        row.dataset.colorCategory = 'red';
                        asetaRivinStatus(row, `<span style="background:#fde8e8; color:#9b1c1c; border:1px solid #f8b4b4; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">⚠️ ${diffDays} pv</span>`, '#fde8e8', '#e02424');
                    } 
                    // 2. KELTAINEN: 1–2 vrk (24–48 h) odottaneet (lämmin hunajankeltainen)
                    else if (diffHours >= 24) {
                        row.dataset.colorCategory = 'yellow';
                        asetaRivinStatus(row, `<span style="background:#fef3c7; color:#78350f; border:1px solid #fcd34d; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">⏱️ ${diffDays} pv</span>`, '#fef3c7', '#d97706');
                    } 
                    // 3. VIHREÄ: Tämän päivän tilaukset (raikas mintunvihreä)
                    else {
                        row.dataset.colorCategory = 'green';
                        asetaRivinStatus(row, '<span style="background:#d1fae5; color:#065f46; border:1px solid #6ee7b7; font-size:9pt; font-weight:bold; padding:2px 6px; border-radius:3px; white-space:nowrap;">🟢 Tänään</span>', '#ecfdf5', '#059669');
                    }
                } else {
                    row.dataset.colorCategory = 'none';
                    asetaRivinStatus(row, '<span style="color:#94a3b8; font-size:9pt;">-</span>', '', '');
                }
            }
        });

        jarjestaRivit(dataRows, tbody, summaryRow);
        tarkistaExtraDeliveryCostTaustalla(dataRows, tbody, summaryRow);
    }

    jarjestaKerayslista();
    setTimeout(jarjestaKerayslista, 500);
})();