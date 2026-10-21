# Ändringslogg

## 2026-10-21 — Administratörer äger terminer och kan rätta en publicerad termin

- Behåller skapande, publicering och redigering av terminer hos administratörer. Personal ser ingen knapp för att skapa, publicera eller ändra, och inga utkast.
- Visar den publicerade terminens datum, öppettider och stängningsdagar för personal på samma sätt som för vårdnadshavare, utan redigering.
- Låter administratörer ändra datum, vardagsöppettider och stängningsdagar även efter publicering.
- Behåller förbudet mot överlappande publicerade terminer. Personal och vårdnadshavare ser bara publicerade terminer, inklusive senare ändringar.
- Markerar vårdnadshavarens veckoschema när tiderna inte längre ryms inom öppettiderna, i stället för att ta bort det.
- Kräver migration `supabase/008_term_staff_publish_and_edits.sql` innan den nya behörigheten gäller i drift. Migrationen är inte körd mot produktionsdatabasen.

## 2026-10-21 — Responsiv layout på mobil, surfplatta och dator

- Tog bort horisontell sidförskjutning från långa kontonamn och inbjudningsåtgärder på smala mobilskärmar.
- Håller administratörens sex navigeringsval på en rad med fullstora tryckytor även vid 320 pixlars bredd.
- Använder 16-pixelstext i formulärfält för att undvika automatisk inzoomning när iOS-fält får fokus.
- Visar en kompakt Ärtan-knapp på mobil så att hjälpredan inte täcker formulärinnehåll.
- Behåller surfplattans och datorns flerkolumnslayouter utan horisontell skrollning.

## 2026-10-16 — Publicerade terminer och återkommande veckoscheman

- Låter administratörer skapa terminsutkast med datum, vardagsöppettider och namngivna stängningsdagar.
- Visar terminen för vårdnadshavare först efter en uttrycklig publicering och förhindrar överlappande publicerade terminer.
- Visar publicerade terminsdatum, öppettider och stängningsdagar för det valda barnets förskola.
- Låter vårdnadshavare spara ett fullständigt måndag–fredag-schema per barn och termin, inklusive lediga dagar.
- Kontrollerar att tiderna är ordnade och ryms inom de publicerade öppettiderna.
- Låter Ärtan tolka tydliga svenska termins- och veckoschemafraser till redigerbara formulär utan att spara automatiskt.

## 2026-10-16 — Samma privata meddelande till alla vårdnadshavare

- Låter personal och administratörer välja **alla vårdnadshavare** för ett visst barn eller en enskild mottagare.
- Hämtar barnets fullständiga aktuella vårdnadshavarlista på servern och skapar samtliga leveranser i en transaktion.
- Behåller en separat privat meddelanderad per mottagare så att vårdnadshavarna inte ser varandras identitet.
- Samlar leveranserna till ett enda skickat kort med alla mottagarnamn för avsändaren.
- Behåller befintliga behörighetsregler för personal–förälder och frivilliga förälder–förälder-meddelanden.

## 2026-10-16 — Flera bilder i officiella inlägg

- Låter personal och administratörer välja, förhandsgranska och beskriva upp till 20 bilder i samma inlägg.
- Skalar om bilder i webbläsaren, tar bort källfilens metadata och laddar endast upp storleksbegränsade JPEG-filer.
- Kräver att publiceraren markerar alla synliga barn eller bekräftar att inga barn syns.
- Kontrollerar bild- och gruppbildssamtycke på servern innan inlägget skapas.
- Lagrar bilder privat, delar dem via kortlivade signerade länkar och visar dem i ett responsivt bildgalleri.
- Rensar uppladdade utkast om publiceringen misslyckas och tar bort lagrade objekt när ett behörigt inlägg raderas.

## 2026-10-16 — Enkel in- och utcheckning

- Gav både personal och operativa administratörer en egen **Närvaro**-vy direkt i huvudnavigeringen.
- Visar levande antal för incheckade, inte incheckade, utcheckade och frånvarande barn.
- Ger varje barn en tydlig nästa huvudåtgärd: checka in, checka ut eller checka in igen.
- Sparar faktiska in- och utcheckningstider separat från vårdnadshavarens planerade tider.
- Behöll sjuk och ledig som sekundära val och flyttade alla närvaroändringar till behörighetskontrollerade RPC-funktioner.

## 2026-10-16 — Ärtans karaktär och teståtkomst

- Ersatte robotfiguren med den användarvalda gula Ärtan-karaktären på inloggning, föräldravyer och i assistentpanelen.
- Lade till en lugn CSS-animation genom fem poser: hälsning, upptäckt, lärande, gemenskap och på väg.
- Visar en statisk hälsningspose när användaren föredrar reducerad rörelse.
- Uppdaterade samtliga sju fasta `@artanpreschool.test`-konton till det gemensamma lösenord som användaren angav och verifierade alla inloggningar.
- Lösenordet och privilegierade projektuppgifter lagras inte i repositoryt eller verifieringsloggen.

## 2026-10-15 — Privata födelsedagsinbjudningar

- Lade till ett separat, avstängt-som-standard-val för att skicka och ta emot kalasinbjudningar.
- Låter en vårdnadshavare skapa ett strukturerat kalaskort för ett eget barn med start, slut, plats, OSA-datum, meddelande och en eller flera valda mottagare.
- Begränsar mottagare till vårdnadshavare som delar avdelning och där båda har aktiverat kalasinbjudningar.
- Håller gästlistan privat: varje mottagare ser bara sin egen inbjudan och sitt eget svar, medan värden ser alla OSA-statusar.
- Stöder acceptera, tacka nej, avbryt och permanent borttagning av avbrutna eller avslutade kalas.
- Lade till säkerhetsdefinierade RPC-funktioner, RLS och nekad direkt tabellåtkomst i migration `003_birthday_invitations.sql`.

## 2026-10-14 — Ärtan hjälper med lämning och hämtning

- Lade till snabbvalet **Ändra lämning/hämtning** på alla föräldravyer.
- Låter Ärtan sammanfatta dagens sparade tider och hämtare samt länka direkt till dagens plan för granskning och ändring.
- Känner igen frågor om ändrade tider och om mormor, morfar, farmor eller farfar ska hämta.
- Visar registrerade kontaktpersoner som får hämta som förslag, men behåller fritext för andra godkända personer.
- Ärtan skriver inte närvarodata själv; föräldern granskar och sparar alltid det befintliga formuläret.

## 2026-10-14 — Testorganisationens namn

- Ändrade den fasta testorganisationens visningsnamn från `PreSchool Test` till `Test`.
- Behöll förskolans namn `PreSchool Test` och avdelningens namn `Testavdelningen`.
- Uppdaterade den idempotenta provisionern så att en framtida körning bevarar det nya organisationsnamnet.

## 2026-10-14 — Klickbar basversion av Ärtan

- Gjorde Ärtan till en klickbar hjälpreda på alla autentiserade huvudvyer för vårdnadshavare, personal och administratörer.
- Lade till kontextberoende snabbval, fria lokala frågor och källmärkta svar från redan behörighetsfiltrerad appdata.
- Lade till direkta vägar till dagens plan, barnuppgifter, skolans flöde, privata meddelanden, närvaro, personer och organisationsöversikt.
- Låter Ärtan säga tydligt när kalender, utvecklingssamtal, AI-utkast eller automatisk bildkontroll ännu saknas i stället för att gissa.
- Sparar ingen fråge- eller svarshistorik och skickar ingen information till en extern AI-tjänst.
- Lade till ett tangentbords- och mobilanpassat assistentfönster med Escape-stängning, fokushantering och stöd för reducerad rörelse.

## 2026-10-14 — Gemenskap och privat kommunikation

- Gjorde meddelandesidan till ett officiellt skolflöde där behöriga vårdnadshavare kan kommentera.
- Lade till privata meddelanden mellan vårdnadshavare och relevant personal.
- Lade till föräldra-till-föräldra-meddelanden med avstängd standard och krav på ömsesidigt samtycke samt gemensam avdelning.
- Lade till en separat frivillig inställning för lekförfrågningar med acceptera-/avböjflöde.
- Begränsade föräldrakatalogen till visningsnamn, roll och tillåtna åtgärder; barn-, hälso-, kontakt-, samtyckes-, telefon- och e-postuppgifter exponeras inte.

## 2026-10-14 — Ärtan-botten och testflöde

- Gjorde om maskoten till **Ärtan-botten** och lyfte dess integritetsvänliga påminnelsehjälp på inloggnings- och föräldraytan.
- Lade till tillståndsbaserade påminnelser för dagens plan, grunduppgifter, hälsa, kontaktpersoner och samtycken.
- Delade upp barnuppgifterna i fyra tydliga steg med beständig färdigmarkering och mobilanpassad översikt.
- Ersatte tvetydiga samtyckesväxlar med explicita ja-/nej-svar och synligt obesvarat läge.
- Lade till en idempotent, service-role-skyddad provisioner för den fasta testmiljön `PreSchool Test`; inga autentiseringsuppgifter lagras i repot.
- Tog bort det automatiskt skapade gemensamma testbarnet. Varje testförälder börjar utan barn och registrerar själv sitt eller sina barn i appen.
- Lade till en atomär, behörighetskontrollerad registrering som skapar barnprofilen och kopplar den enbart till den inloggade vårdnadshavaren.

## 2026-10-14 — Local AI-agentworkflow

- Lade till en Obsidian-baserad uppgiftskö med beständiga Markdown-statusar.
- Lade till ett avgränsat OMP-agentkontrakt med urval, tillståndsövergångar, stoppvillkor och maximalt tre uppgifter per körning.
- Lade till explicita godkännandegränser för driftsättning, Supabase, autentisering och känsliga personuppgifter.
- Lade till den beroendefria verifieringen `python3 scripts/verify.py` för applikationsfiler, lokala resurser och köinvarianter.

## 2026-10-09 — ärtan production cutover

- Bytte produktnamn och visuell identitet från Arthur till **ärtan**.
- Tog bort all hårdkodad demo-, pilot- och mockdata samt gamla statiska distributionskopior.
- Ersatte lokala låtsasändringar med Supabase-läsningar och beständiga skrivningar.
- Lade till riktig onboarding för nya organisationer med första skola och avdelning.
- Lade till skapande av flera skolor med kontaktuppgifter, adress, öppettider och första avdelning.
- Lade till barnregistrering och e-postbundna inbjudningar för personal och vårdnadshavare.
- Lade till vårdnadshavarformulär för barnets grunduppgifter, hälsa, specialkost, medicin, akutinfo, kontaktpersoner och samtycken.
- Lade till beständig närvaro och beständiga avdelnings-/barnmeddelanden.
- Tog bort fri rollväxling; visningen styrs nu av den autentiserade profilens roll.
- Skärpte RLS till organisations-, avdelnings-, barn- och vårdnadshavarnivå.
- Lade till sessionsförnyelse, tomlägen, felstatus och återkallning/delning av inbjudningar.
- Lade till ett fristående uppgraderingssteg som tar bort pilotversionens `accept_invitation(text)` innan det nya schemat installeras.
- Bytte Netlify-adress från `arthurpreschool.netlify.app` till `artanperschool.netlify.app`.
