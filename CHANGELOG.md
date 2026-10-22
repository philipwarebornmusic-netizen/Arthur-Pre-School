# Ändringslogg

## 2026-10-22 — Permanent hämtpass

- En vårdnadshavare kan skapa ett permanent hämtpass för en person som redan får hämta. Passet kan också gälla samma person för vårdnadshavarens andra barn. Det kan användas igen tills det återkallas, eller till ett valfritt slutdatum.
- Länken, QR-koden och den sexsiffriga koden fungerar som för ett engångspass. Den som hämtar behöver inget konto. Koden lagras bara som kontrollsumma.
- Personal ser att passet är permanent och ser namn och relation, så att legitimationen kan kontrolleras. Varje skanning loggas och vårdnadshavarna får ett meddelande, till exempel ”Arthur hämtades av Mormor Karin 15.42”.
- Båda vårdnadshavarna kan se passet, återkalla det eller skapa en ny kod. Den gamla länken slutar då fungera. Passet fungerar inte om personen spärras, tas bort eller inte längre får hämta.
- Engångspassen är oförändrade. Båda permanenta passen hämtar slumptal med `extensions.gen_random_bytes`, eftersom pgcrypto ligger i schemat extensions. Migration `supabase/016_permanent_pickup_passes.sql` ska granskas och har inte körts här.

## 2026-10-22 — Kortöversikt i stället för långa menysidor

- Barnet, Skolor och Personer/Barn öppnas som ett rutnät av kort. Ett tryck visar den delen för sig, med ‹ Tillbaka och rubrik.
- På Barnet finns också Hämtlista, Profilbild, Klasslista-samtycke och Synka terminsschemat. Terminer på Skolor innehåller behörigheten Får hantera terminsschema. Klasslistan är kvar som egen vy. Närvaro skannar hämtpass som tidigare. Administratören spärrar personer under Personer.
- Webbläsarens bakåtknapp och en direktlänk, till exempel `#barnet/uppgifter`, öppnar samma vy.
- Barnväljaren ligger kvar överst när en vårdnadshavare har flera barn.
- Min dag, Närvaro, Gemenskap, Konto och Översikt är oförändrade listor.
- En ny del läggs till med ett anrop till `registerHubCard`. Inga nya databasmigrationer.

## 2026-10-22 — Signerade bildadresser

- Profilbilder och bilder i inlägg får `/storage/v1` i den signerade adressen, så att de inte blir 404.
- Efter en sparad profilbild signeras filen om, så att den gamla bilden inte ligger kvar.
- Om bilden inte kan laddas visas barnets initialer.

## 2026-10-22 — Klasslista och profilbilder

- Vårdnadshavare kan ladda upp, byta och ta bort en kvadratisk profilbild på Barnet. Bilden beskärs i webbläsaren, förminskas till cirka 512 pixlar och sparas som JPEG utan kamerans dolda uppgifter.
- Personal och administratörer på barnets avdelning ser namn och bild, till exempel i närvaron och under Personer. De kan inte ändra bilden eller klasslistan.
- Andra vårdnadshavare ser en klasslista för samma avdelning. Förnamnet visas om minst en vårdnadshavare sagt ja och ingen sagt nej. Bilden visas bara om varje kopplad vårdnadshavare sagt ja. Ett nej gäller direkt.
- Svaren loggas med vem, barn, vad och när. Den privata bucketen `child-photos` skapas av migrationen. Appen tar bort bildfilen via Storage. Databasen rensar bara sökvägen och raderar inte i `storage.objects`, eftersom det blockeras där. En ny bild ersätter samma fil.
- Migration `supabase/migrations/015_class_list_photos.sql` är redan körd mot produktion. Kör den inte igen.

## 2026-10-22 — Vårdnadshavare kan synka terminsschemat

- En vårdnadshavare kan skapa en personlig kalenderlänk under Barnet och lägga till den i Apple, Outlook eller Google.
- Länken innehåller publicerade terminer och stängda dagar för de förskolor där vårdnadshavaren har ett barn. Inga uppgifter om barnet följer med.
- Den råa länken visas bara direkt efter att den skapas. Databasen lagrar bara en kontrollsumma. En ny länk stänger den tidigare, och länken kan stängas av.
- Apple uppdaterar inom ungefär en timme. Google kan ta 12–24 timmar.
- Migration `supabase/migrations/013_calendar_subscriptions.sql` är redan körd och funktionen `term-feed` är publicerad. Kör inte migrationen igen.

## 2026-10-22 — Administratören kan låta personal hantera terminen

- En administratör kan ge en lärare behörigheten **Får hantera terminsschema**. Läraren kan då skapa utkast, publicera och ändra publicerade terminer och stängningsdagar för de skolor där läraren arbetar.
- Övrig personal ser fortfarande bara den publicerade terminen, utan knappar för att skapa eller ändra.
- Behörigheten kan tas bort när som helst. Varje tilldelning och borttagning sparas med vem, vem det gällde och när.
- Migration `supabase/migrations/014_term_managers.sql` är redan körd mot produktion. Kör den inte igen. Den ändrar inte befintliga terminsfunktioners argument.

## 2026-10-22 — Vårdnadshavare äger barnets uppgifter

- Vårdnadshavare kan ändra och ta bort sina kontaktpersoner, tömma enskilda hälsofält och anteckningen, och svara nej för att ta tillbaka ett samtycke. Borttagning frågar en gång till.
- Personal och administratörer kan läsa barnets uppgifter, inklusive allergier, men ser inga fält för att ändra dem.
- En administratör kan fortfarande flytta ett barn mellan avdelningar. Personal och administratörer kan fortfarande lägga till ett barn och sätta namn och avdelning när barnet skapas. En administratör kan fortfarande ta bort ett barn.
- Migration `supabase/011_guardian_owned_child_info.sql` är redan körd mot produktion. Den raderar inga rader och tar inte bort kolumner. Den rör inte hämtpassens tabeller.

## 2026-10-21 — Hämtpass och utcheckning

- Vårdnadshavare håller en hämtlista per barn och kan skapa ett hämtpass för en dag. Länken visas för den som hämtar utan att den personen behöver ett konto.
- Personal skannar QR-koden eller skriver en sexsiffrig kod under Närvaro och bekräftar utcheckningen. Inget checkas ut automatiskt.
- Manuell utcheckning frågar vem som hämtar: vårdnadshavare, någon på hämtlistan eller annan med en kort kommentar.
- En administratör kan spärra en person med får ej hämta. Spärren gäller före pass och manuell utcheckning.
- Båda vårdnadshavarna får ett meddelande i appen, och händelsen sparas i en logg. Namn och telefon på passet rensas sju dagar efter att det gått ut.
- Hämtpasset, skanningen, bekräftelsen, Hämtad av och spärren följer skrivbordets vänsterspalt från 1200 px och bottenmenyn på smalare skärmar. Själva hämtpasset har ingen meny.
- Migration `supabase/010_pickup_passes.sql` är redan körd mot produktion.

## 2026-10-21 — Inbjudningar styr vem som kommer in

- En administratör skapar organisationen, skolan och avdelningarna och bjuder in personal till en bestämd skola och avdelning.
- Personal bjuder in varje vårdnadshavare till ett visst barn. En andra vårdnadshavare får en egen länk, och ett befintligt konto kan ta emot ytterligare ett barn.
- En skolkod kan användas som reserv, men ansökan visar inga uppgifter förrän en administratör godkänner den och väljer avdelning.
- Vårdnadshavare kan inte längre koppla ett barn själva. Ett syskon kopplas först när personalen godkänner förfrågan.
- Inbjudningslänkar kan användas en gång. Personalens länk gäller i 7 dagar och vårdnadshavarens i 14 dagar. Administratören kan se, skicka igen och återkalla väntande inbjudningar samt ta bort personalens åtkomst.
- Råa inbjudningskoder lagras inte. Migreringen `supabase/009_invite_onboarding.sql` ska köras för hand och har inte körts mot produktion.
- Inbjudningssidorna följer skrivbordets vänsterspalt från 1200 px och bottenmenyn på smalare skärmar. Den som ännu inte har en profil ser samma breda välkomstsida som övriga kontosidor.

## 2026-10-21 — Skrivbordslayout som fyller skärmen

- Låter appen använda hela fönstret på breda skärmar i stället för en centrerad kolumn.
- Flyttar huvudmenyn från nederkanten till en vänsterspalt, med samma val som tidigare.
- Låter översikter, listor, terminsytor och formulär använda den bredare ytan, och håller löptext inom en läsbar bredd.
- Behåller bottenmenyn och de tidigare anpassningarna på mobil och surfplatta.
- Placerar Ärtan längst ner till höger på skrivbordet så att hjälpredan inte täcker menyn.
- Lägger till en synlig väg förbi menyn för den som navigerar med tangentbord.

## 2026-10-21 — Administratörer äger terminer och kan rätta en publicerad termin

- Behåller skapande, publicering och redigering av terminer hos administratörer. Personal ser ingen knapp för att skapa, publicera eller ändra, och inga utkast.
- Visar den publicerade terminens datum, öppettider och stängningsdagar för personal på samma sätt som för vårdnadshavare, utan redigering.
- Låter administratörer ändra datum, vardagsöppettider och stängningsdagar även efter publicering.
- Behåller förbudet mot överlappande publicerade terminer. Personal och vårdnadshavare ser bara publicerade terminer, inklusive senare ändringar.
- Markerar vårdnadshavarens veckoschema när tiderna inte längre ryms inom öppettiderna, i stället för att ta bort det.
- Kräver migration `supabase/008_term_staff_publish_and_edits.sql` innan den nya behörigheten gäller i drift. Migrationen är redan körd mot produktionsdatabasen.

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
