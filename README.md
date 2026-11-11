# Audioimport Pupe Helper 🚀

Pupesoft ERP -keräysjonon automaattinen älykkäämpi järjestely ja priorisointi (**Audioimport Oy**).

## Ominaisuudet
- 🚦 **Liikennevaloväritys:** 
  - 🔴 Punainen: Pikatilaukset tai yli 48 h odottaneet (`#fde8e8`, reunaviiva `#e02424`)
  - 🟡 Keltainen: 24–48 h odottaneet (`#fef3c7`, reunaviiva `#d97706`)
  - 🟢 Vihreä: Alle 24 h / tänään tulleet (`#ecfdf5`, reunaviiva `#059669`)
- ⚡ **Toimitustapapriorisointi (DPD):** Jokaisen väritason sisällä **DPD**-toimitukset nousevat automaattisesti ensimmäiseksi, minkä jälkeen tilaukset ovat vanhimmasta uusimpaan.
- 🔥 **Pikatilaukset:** Tunnistaa tekstit (`pikatilaus`, `rush order` jne.) ja skannaa taustalla tilauksen tuoteriveiltä automaattisesti tuotteen `EXTRA DELIVERY COST`.
- 📦 **Suora Rahtilaskuri-integraatio & tilausten yhdistäminen:** Keräyslistalla jokaisella rivillä on suora "Laske rahti" -painike. Jos samalle asiakkaalle on useita tilauksia jonossa, painike ilmoittaa tilauksien määrän ja avaa helpon yhdistelyikkunan, josta valitut tilaukset siirtyvät automaattisesti Rahtilaskuriin ja yhdistyvät samaan kuormaan.
- 📥 **Tavaran saapumiset ja kohdistus (`keikka.php` - v7.0):**
  - **Viivakoodiskannaus (Keyboard Wedge / EAN / Tuotenumero):** Piippaus hakee automaattisesti oikean saapumisrivin, skrollaa sen keskelle näyttöä, antaa vihreän huomiovalon ja asettaa kohdistuksen suoraan saapuvan määrän kenttään (`rivi_kpl`).
  - **Turvallinen konttipurkulogiikka:** Skannaus **EI kuittaa riviä automaattisesti**, koska saapuva määrä voi poiketa tilausmäärästä (konttipurku ja lavoitus). Määrä on heti muokattavissa ja valittavissa.
  - **Reaaliaikainen pikahaku:** Yläpalkin hakukenttä suodattaa 50+ rivin saapumislistaa salamannopeasti kirjoitettaessa (tuotenumero, nimike, ostotilausnumero).
  - **Suora varastopaikkavalitsin ja luonti (`[ 📍 Paikka ▾ ]`):** Näyttää tuotteen nykyiset varastopaikat ja reaaliaikaiset saldot. Uuden varastopaikan (hylly, hyllyväli, hyllytaso) voi luoda ja valita suoraan saapumissivulta ilman edestakaista hyppimistä `ostolaskunvarastopaikat.php`-sivulle.
  - **Täysi Tablet- ja kosketusnäyttöoptimointi:** Vähintään 44px kosketusalueet, `touch-action: manipulation;`, nopeat määränsäätimet `[-1]`, `[+1]`, `[Täysi]` sekä selkeä `[✓ Kuittaa]` -painike.
- 🎨 **Keräilysivun (keraa.php) selkeytys:**
  - Joka toinen tuoterivi pehmeällä harmaalla taustalla erottamisen helpottamiseksi.
  - Kerätyt rivit korostuvat välittömästi smaragdinvihreällä (`#d1fae5`), 8px vihreällä huomiopalkilla ja vihreällä `✓ Päivitä` -napilla.
  - Keräyskommentit on sidottu saumattomasti ja selkeästi yläpuoliseen tuotteeseen ilman ylimääräisiä häiritseviä tekstejä (sisennys, nuoli ja varoituskolmio `↳ ⚠️`).
- 🔍 **Tuotekortin pikanäkymä (Hover & Tablet-tuki - v7.1):**
  - **Globaali toiminta:** Toimii kaikilla Pupesoftin sivuilla, joilla tuotenumero esiintyy linkkinä (keräys, tulostusjono, tilauskäsittely, saapuminen, ostotilaukset).
  - **Kattavat hintatiedot ja saldot:** Myyntihinta, Kehahinta, Vihahinta (ostopäivämäärällä) sekä kaikki varastopaikat hyllykohtaisine saldoineen (Vapaana / Kokonaissaldo / Varattu).
  - **PC & Kosketusnäyttötuki:** Tietokoneella hiiren leijutus (200 ms), tableteilla sorminapautus (tap), selkeä ✕-sulkunappi ja sulkeutuminen ulkopuolelle napautettaessa.
  - **Stale-While-Revalidate -taustapäivitys:** Avaa tiedot välittömästi (0 ms) ja päivittää muuttuneet hinnat ja saldot lennosta taustakyselyllä. Alalaidassa tarkan hakuhetken aikaleima ja manuaalinen `↻ Päivitä` -painike.
- ☁️ **Reaaliaikainen pilvipäivitys:** Laitteille asennetaan kevyt latausohjelma (`loader.user.js`), joka noutaa uusimman koodin suoraan tästä repositoriosta joka kerta kun sivu ladataan.

---

## Asennusohje

### A. Tietokoneet (Chrome, Edge, Firefox)
1. Asenna selaimeen [Tampermonkey](https://www.tampermonkey.net/).
   - *Chromessa:* Muista käydä kytkemässä **Kehittäjätila (Developer mode)** päälle osoitteessa `chrome://extensions`.
2. Klikkaa Tampermonkey-kuvaketta -> **Luo uusi skripti**.
3. Tyhjennä oletuspohja ja liitä tiedoston [`loader.user.js`](loader.user.js) sisältö.
4. Tallenna painamalla **Ctrl + S**.
5. Valmis! Avaa Pupesoftin tulostusjono ja paina **F5**.

### B. iPad / iPhone (Safari)
1. Lataa App Storesta ilmainen **Userscripts** (tai vaihtoehtoisesti *Stay*).
2. Ota laajennus käyttöön: *Asetukset -> Safari -> Laajennukset -> Userscripts -> Salli*.
3. Avaa Safari ja klikkaa osoitepalkin vierestä palapelikuvaketta / Userscripts-kuvaketta.
4. Lisää uusi skripti ja liitä tiedoston [`loader.user.js`](loader.user.js) sisältö.
5. Tallenna. Pupesoft päivittyy heti ja hakee uusimman koodin pilvestä.

---

## Miten koodia päivitetään pilveen?
Kun haluat muuttaa värejä, prioriteetteja tai lisätä uusia ominaisuuksia:
1. Muokkaa tiedostoa `pupe-helper.js`.
2. Tee commit ja puske muutokset GitHubiin (`git push origin main`).
3. **Kaikki laitteet (PC:t ja iPadit) käyttävät uutta versiota heti seuraavalla sivun päivityksellä (F5)!** Laitteille ei tarvitse koskaan enää koskea.
