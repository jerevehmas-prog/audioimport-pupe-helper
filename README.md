# Audioimport Pupe Helper 🚀

Pupesoft ERP -keräysjonon automaattinen älykkäämpi järjestely ja priorisointi (**Audioimport Oy**).

## Ominaisuudet
- 🚦 **Liikennevaloväritys:** 
  - 🔴 Punainen: Pikatilaukset tai yli 48 h odottaneet (`#fde8e8`, reunaviiva `#e02424`)
  - 🟡 Keltainen: 24–48 h odottaneet (`#fef3c7`, reunaviiva `#d97706`)
  - 🟢 Vihreä: Alle 24 h / tänään tulleet (`#ecfdf5`, reunaviiva `#059669`)
- ⚡ **Toimitustapapriorisointi (DPD):** Jokaisen väritason sisällä **DPD**-toimitukset nousevat automaattisesti ensimmäiseksi, minkä jälkeen tilaukset ovat vanhimmasta uusimpaan.
- 🔥 **Pikatilaukset:** Tunnistaa tekstit (`pikatilaus`, `rush order` jne.) ja skannaa taustalla tilauksen tuoteriveiltä automaattisesti tuotteen `EXTRA DELIVERY COST`.
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
