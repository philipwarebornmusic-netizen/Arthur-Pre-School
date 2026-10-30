# Ändringslogg

## 2026-10-30 — Kortare schema på Min dag

- Min dag visar bara den aktuella schemaveckan i stället för hela terminen. Hela kalendern finns kvar under Hämtning via knappen Visa hela schemat.
- Varje vardagsruta visar sitt datum. Dagens ruta har dessutom etiketten Idag och en tydligare markerad ram.
- När administratörer och personal är klara med Kom igång öppnas Närvaro som första arbetsyta. Administratörens Översikt finns kvar som ett separat menyval för organisationsstatistik.

## 2026-10-25 — Bild på hämtlistan och förlängning av permanent pass

- En vårdnadshavare kan lägga en valfri bild på varje person i hämtlistan, både under Hämtning och under Barnet > Kontaktpersoner. Bilden beskärs och förminskas till 512 pixlar i webbläsaren. Personalen ser den vid utcheckning och när ett hämtpass skannas. Själva passet visar fortfarande bara namn, datum och kod.
- Bilderna ligger i en privat bucket. Bara barnets vårdnadshavare kan ladda upp och ta bort. Vårdnadshavare, personal på barnets avdelning och en organisationsadministratör kan läsa. Bilden tas bort när personen tas bort eller när bilden byts ut. `supabase/020_contact_photos_pass_renewal.sql` är körd mot produktion som version 20261025143236. `permanent_pickup_verify` är fortsatt spärrad för inloggade användare, så ett permanent pass inte kan verifieras med bara sitt id.
- Ett nytt permanent pass får terminens sista dag som slutdatum. Finns ingen publicerad termin används 30 juni eller 31 december, det som kommer härnäst. Datumet kan ändras eller tömmas, och det syns på passet.
- När ett permanent pass går ut inom 14 dagar visas ett kort på Min dag för båda vårdnadshavarna: Förläng eller Låt gå ut. Låt gå ut gäller bara den som trycker. Ett utgånget pass får Förnya under Hämtning. Förlängningen räknas ut i databasen till nästa termins slut.

## 2026-10-23 — Helg, separata lämnarval och synlig egen profilbild

- Min dag visar Helg i stället för Inte incheckad på lördagar och söndagar. Dagens plan och påminnelsen om incheckning eller hämtningstid döljs då. Ärtan förklarar att ingen dagsplan eller incheckning behövs under helgen.
- Veckoschemat har nu två tydliga personval per dag: Lämning och Hämtning. De kan vara olika personer, fylls oberoende, följer med i standardveckan och vid veckokopiering och visas tillsammans för personalen. Hämtpass gäller fortfarande bara hämtning.
- `supabase/019_handoff_people.sql` lägger till de separata personfälten och den nya RPC:n `save_pickup_day_handoffs`. Den kräver att `018_pickup_hub.sql` redan är applicerad. Båda migrationerna är nu körda mot produktion.
- En vårdnadshavare får nu alltid tillbaka sökvägen till sitt eget barns profilbild i klasslistan. Andra familjer ser fortfarande bilden bara när alla kopplade vårdnadshavare har samtyckt. `supabase/migrations/019_class_list_own_photo.sql` är nu körd mot produktion.
- Testprovisionern omfattar även `evelina@artanpreschool.test` och `oscar@artanpreschool.test` som vårdnadshavare i Testavdelningen. Provisionern läser det gemensamma lösenordet och service-role-nyckeln enbart från miljövariabler.

## 2026-10-23 — Kalendern visar bara sparade dagar

- Terminskalendern räknar en dag som ifylld bara när den är sparad. Veckan efter en sparad vecka blir inte ifylld av sig själv. Osparade dagar är streckade. En sparad standardvecka kan synas som en svag, kursiv tid, och veckoraden säger Ej ifylld tills dagarna sparas.
- Påminnelsen på Min dag använder samma regel och räknar bara sparade dagar. Personalens närvarotext hoppar över en rad som är märkt som förra veckan eller standardveckan. Databasfunktionen som skickar raderna är oförändrad.
- Samma som förra veckan kopierar förra veckans sparade dagar. Finns inga, tas den senaste sparade veckan före den i stället, med texten Kopierade vecka N. Knappen döljs om ingen vecka är sparad. Förslagen används bara i veckoeditorn.

## 2026-10-23 — Veckoschemat fylls i på några sekunder

- Ledig är avmarkerad när veckan öppnas. En öppen dag som redan har tider, eller som får ett förslag, är inte ledig förrän man kryssar i den.
- Tomma dagar fylls från standardveckan om den finns, annars från barnets senaste sparade vecka, samma veckodag och hämtare. Finns ingen standardvecka men någon dag i veckan redan är ifylld, får de andra tomma dagarna den tiderna. Förslagen syns direkt och sparas med Spara.
- När man sätter lämning, hämtning eller hämtare på en dag följer de andra tomma dagarna med. Dagar man redan ändrat, lediga dagar och stängda dagar rörs inte. Avmarkerar man Ledig fylls dagen med veckans vanliga tider och hämtare.
- Samma som förra veckan, överst i veckovyn, lägger in förra veckans sparade dagar och hoppar över stängda dagar. En tom tidväljare öppnas på den vanliga tiden, 08:00 eller 16:30 om veckan saknar tid. Saknas hämtare blir det den inloggade vårdnadshavaren.
- En redan sparad dag kan fortfarande inte tömmas. Ledig hoppar över dagen vid sparning, utan att ta bort det som redan ligger i databasen.

## 2026-10-23 — Veckoschemat öppnas på den här veckan

- Hämtningens kalender öppnas vid den aktuella veckan. Äldre veckor ligger kvar ovanför och nås genom att skrolla upp.
- Varje ruta visar lämning och hämtning, till exempel 08:00 och 16:30. Tomma dagar är nedtonade. Dagen är markerad, stängda dagar är rosa med en stängd-symbol, och en personikon betyder att någon annan än du hämtar.
- Ett tryck på veckan öppnar en egen vy, Vecka N, med en rad per vardag. Där syns datum, tider, Ledig och vem som hämtar. Tiderna öppnar telefonens tidväljare. Datumet ligger kvar medan man fyller i.
- Hämtaren väljs i en lista, Hämtar och veckodagen, med vårdnadshavare och hämtlista. Kontaktpersoner har en annan färg. Bekräfta med bocken, så visas initialerna på raden.
- Spara skriver veckans ifyllda dagar via de befintliga funktionerna och återvänder till samma vecka. Ledig hoppar över dagen, så en redan sparad dag eller standardvecka ligger kvar tills nya tider sparas. Tomma dagar fylls i förväg från standardveckan.
- Formuläret som låg över kalendern är borta. Plusknappen för standardvecka och kopiera vecka ligger kvar.

## 2026-10-22 — Hämtning samlad, med pass och terminskalender

- Vårdnadshavare har en egen plats, Hämtning, i menyn. Där ligger veckoschemat, engångspass, permanenta pass och hämtlistan. Kontaktpersoner ligger kvar under Barnet och länkar dit. Kortet Hämtlista under Barnet är borttaget.
- Ett nyskapat pass visas som på den publika sidan: förnamn, datum eller giltighet, QR-kod och den sexsiffriga koden. Dela öppnar delningsytan, eller kopierar texten. Skriv ut/Spara skriver ut passet utan knapparna.
- Ett pass som fortfarande gäller kan öppnas igen. Den råa koden sparas i `pickup_pass_secrets`, som bara `reveal_pickup_pass` läser, och bara för en vårdnadshavare till barnet. Personal och anonyma får den inte. De gamla kontrollsummorna är oförändrade. Pass som skapades innan den här ändringen kan inte öppnas igen. Då står det att passet ska skapas på nytt, eller Ny kod för ett permanent pass.
- Schemat är en kalender för hela den publicerade terminen. Varje rad är en vecka, måndag till fredag, med datum och veckonummer. Rutan visar lämning och hämtning. Dagen är markerad, stängda dagar är rosa med en stängd-symbol, och dagar utanför terminen är grå. En personikon betyder att någon annan än en vårdnadshavare hämtar. Ett tryck ändrar den dagen. Plusknappen sätter en standardvecka eller kopierar veckan framåt.
- Tider hämtas från dagen, annars från samma dag förra veckan, annars från standardveckan. Ett engångspass följer inte med till en annan dag. Veckor de närmaste sju dagarna som saknar tid eller hämtare markeras, och Min dag påminner. Samma kalender visas skrivskyddad på Min dag. Personal ser dagens och veckans planerade tider per barn i närvaron.
- Båda vårdnadshavarna kan ändra. Ändringarna loggas. Migrationen `supabase/018_pickup_hub.sql` är inte körd. Innan den är applicerad ligger det gamla veckoschemat kvar på Min dag, och påminnelsen visas inte.
- `purge_expired_pickup_details` tar också bort sparade länkar när passet inte längre kan öppnas. Namn och telefon rensas som tidigare, sju dagar efter att engångspasset gått ut.

## 2026-10-22 — Engångspass hittar pgcrypto

- `supabase/017_fix_pickup_pass_random_bytes.sql` innehåller bara `alter function public.create_pickup_pass(uuid, date, time, time, text, text, text) set search_path = public, extensions;`. Funktionen skrivs inte om. Samma sats appliceras mot databasen separat. Kör inte filen igen.

## 2026-10-22 — Dela och skriv ut för vårdnadshavare

- På Min dag kan en vårdnadshavare dela och skriva ut en publicerad termin. Delningen är en textsammanfattning och en `.ics`-fil med terminen och stängningsdagarna. Barnets schema och den personliga kalenderlänken följer inte med.
- Där webbläsaren kan dela filer används det. Annars laddas filen ner och texten kopieras.
- Inlägg, bifogade bilder och mottagna privata meddelanden får Dela och Skriv ut. En bilaga delas som filen själv, hämtad via den befintliga signerade adressen, inte som en länk.
- Skriv ut öppnar en utskriftsvy och anropar utskrift direkt från trycket. Ingen ny publik länk skapas och lagringen är oförändrad.

## 2026-10-22 — Permanent hämtpass

- En vårdnadshavare kan skapa ett permanent hämtpass för en person som redan får hämta. Passet kan också gälla samma person för vårdnadshavarens andra barn. Det kan användas igen tills det återkallas, eller till ett valfritt slutdatum.
- Länken, QR-koden och den sexsiffriga koden fungerar som för ett engångspass. Den som hämtar behöver inget konto. Koden lagras bara som kontrollsumma.
- Personal ser att passet är permanent och ser namn och relation, så att legitimationen kan kontrolleras. Varje skanning loggas och vårdnadshavarna får ett meddelande, till exempel ”Arthur hämtades av Mormor Karin 15.42”.
- Båda vårdnadshavarna kan se passet, återkalla det eller skapa en ny kod. Den gamla länken slutar då fungera. Passet fungerar inte om personen spärras, tas bort eller inte längre får hämta.
- Engångspassen är oförändrade. Båda permanenta passen hämtar slumptal med `extensions.gen_random_bytes`, eftersom pgcrypto ligger i schemat extensions. Migration `supabase/016_permanent_pickup_passes.sql` ska granskas och har inte körts här.

## 2026-10-22 — Personer som grupper, inte ett kort per barn

- Personer visar grupperna Barn, Vårdnadshavare och, för administratören, Personal. Varje grupp öppnas för sig med tillbaka-knapp och egen adress, till exempel `#personer/barn`.
- Listan är kompakt och går att söka på namn och avdelning. Den är sorterad alfabetiskt och tål många personer. En rad visar bild eller initialer, namn, avdelning och en kort status. Ett tryck öppnar samma detaljvy som tidigare.
- Barnlistan visar hur många vårdnadshavare som är kopplade. Vårdnadshavarlistan visar de kopplade barnen. Personal visar administratörer och personal, och om någon får hantera terminsschemat.
- Lägg till barn, Bjud in vårdnadshavare, Väntande inbjudningar, Syskonförfrågningar och Får ej hämta finns kvar. Personal ser fortfarande barnuppgifter utan att kunna ändra dem.

## 2026-10-22 — Termintext som tål vanlig svenska

- Tolka och fyll i läser start och slut även när de står var för sig, till exempel startar 3 aug och slutar 31 dec. Förkortade månader fungerar, och året väljs så att slutdatumet ligger efter starten.
- Stängningsdagar kan räknas upp med komma, och, & eller bara mellanslag. En fras före datumen, till exempel kompetensutveckling eller jul/nyår, blir anledningen. Ett spann som 24–31 dec fyller i varje dag.
- Öppettider kan skrivas 06.30-17.30, 6:30–17:30 eller kl 6.30 till 17.30. Saknas bara en del namnger Ärtan den delen och fyller i resten, inklusive stängningsdagarna, så att de kan granskas innan publicering.

## 2026-10-22 — Avvikelserapporter

- Personal skriver utkast för olycksfall/skada, tillbud, kränkande behandling och övrig avvikelse. Utkastet syns bara för författaren. Inskickad text låses, och senare uppgifter läggs till som tillägg.
- Flera barn kan ingå, med rollen drabbad, inblandad eller orsakande. Olycksfall har skadetyp, kroppsdel, första hjälpen och vård. Kränkning har vem som utsattes, vem som uppger det och barnets egen upplevelse. Inskickning av en kränkning räknas som anmälan till rektor.
- Personal ser sina egna rapporter och, efter inskickning, olycksfall och tillbud på avdelningar de tillhör. Kränkning och övrig avvikelse syns bara för författaren och administratören. Administratören ser alla inskickade rapporter i organisationen, utreder, lägger åtgärder och avslutar. Vårdnadshavare ser aldrig själva rapporten.
- En vårdnadshavarkopia skickas per barn och visar bara det barnets namn. Andra barn står som ett annat barn. Olycksfall nämner kommunens olycksfallsförsäkring. Vårdnadshavaren bekräftar med Jag har läst. Påminnelser stannar i appen.
- Meddelanden i appen återanvänder hämtpassens meddelandetabell. Administratören aviseras vid inskickning, vårdnadshavaren när kopian skickas och igen om den inte är läst. En händelselogg följer rapporten, och administratören kan skriva ut underlaget för huvudmannen.
- Migreringen `supabase/012_incident_reports.sql` ska köras för hand. Den är inte körd mot produktion. Den är oberoende av `011_guardian_owned_child_info.sql`.
- Personal och administratörer öppnar **Incidentrapporter** som ett kort under Personer/Barn. Menyn Avvikelse finns kvar.
- En vårdnadshavare ser kopian och knappen Jag har läst på Min dag, och som kortet Information att läsa under Barnet när en kopia finns för det valda barnet.

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
