# Ärtan – behov och framtida möjligheter

Status: Research och framtidsidéer. Inget i denna anteckning är godkänt för autonom publicering eller produktion.

## Produktprincip

Ärtan ska minska letande, dubbelarbete och missförstånd utan att ersätta relationen mellan hem och förskola. Viktig information ska alltid kunna nås utan botten. Ärtan ska visa källa, respektera samma behörigheter som användaren och lämna beslut om publicering, barn och samtycken till människor.

## Vad vårdnadshavare behöver

Researchen pekar på sex återkommande behov:

1. **Trygghet och tillit** – veta att barnet mår bra och kunna föra en förtroendefull dialog med personalen.
2. **Praktisk orientering** – tider, stängningsdagar, aktiviteter, vad som ska tas med och vem som ska kontaktas.
3. **Barnets vardag och lärande** – meningsfull information om aktiviteter, trivsel, social utveckling och lärande, inte bara ett bildflöde.
4. **Tvåvägskommunikation** – kunna dela prioriteringar, frågor och relevant information från hemmet, inte bara ta emot utskick.
5. **Tillgänglighet** – kort och tydligt språk, stöd för flera språk och lika tillgång för vårdnadshavare som inte hinner samtala vid lämning eller hämtning.
6. **Kontroll och integritet** – tydlig målgrupp, källa, samtycke och skillnad mellan intern information och offentlig publicering.

## Vad personal och organisation behöver

1. **Mindre administrativ belastning** – återanvänd en kalenderhändelse till inlägg och påminnelse i stället för att skriva samma information flera gånger.
2. **Rätt mottagare första gången** – organisation, förskola, avdelning, barn eller vårdnadshavare ska vara ett uttryckligt val.
3. **Meningsfull kommunikation** – hjälp att förklara hur en aktivitet knyter an till lärande, inte krav på många bilder eller inlägg.
4. **Tvåvägskommunikation med gränser** – privata kanaler och svarstider utan att personalens privata telefonnummer eller fritid tas i anspråk.
5. **Gemensamma arbetssätt** – mallar, ton, översättningar, godkännande och ansvar ska vara konsekventa i organisationen.
6. **Integritet före publicering** – samtyckeskontroll, målgruppskontroll, varning för känsligt innehåll och en revisionslogg.
7. **Överblick** – vad som är publicerat, schemalagt, oläst, obesvarat eller behöver åtgärdas.

## Prioriterade möjligheter för Ärtan

### För vårdnadshavare

- **Min dag:** sammanfatta dagens tider, aktiviteter, påminnelser och olästa officiella inlägg med källor.
- **Fråga kalendern:** svara på stängningsdagar, aktiviteter och utvecklingssamtal utan att gissa.
- **Förklara enkelt:** korta ned officiell information och förklara förskolans begrepp på enkelt språk.
- **Språkstöd:** översätta officiell information med originaltexten tillgänglig bredvid.
- **Hitta rätt kontakt:** öppna en privat tråd till rätt avdelning eller ansvarig roll.
- **Introduktionsguide:** stegvis hjälp för nya familjer med tider, rutiner, kontaktvägar och samtycken.
- **Påminnelsehjälp:** visa godkända, tidsatta notiser utan att skapa skuldkänslor eller överbelasta familjen.

### För personal och organisation

- **Kommunikationsutkast:** skapa korta, vänliga och källbundna utkast från kalenderhändelser.
- **Målgruppskontroll:** visa exakt vilka roller och avdelningar som får informationen innan publicering.
- **Klarspråk och översättning:** föreslå begripligare text och språkversioner, med mänskligt godkännande.
- **Integritetskontroll:** varna för personuppgifter, fel målgrupp, saknat samtycke och potentiellt identifierbara barnbilder.
- **Kommunikationsplan:** visa kommande händelser som saknar påminnelse och undvika dubbla utskick.
- **Pedagogisk förklaring:** hjälpa personalen beskriva varför en aktivitet stödjer lek, lärande eller social utveckling.
- **Arbetsro:** schemaläggning, gemensamma mallar och tydliga svarstider i stället för ständig tillgänglighet.

## Beslutad produktplan

Hela funktionspaketet ska planeras, men införas i kontrollerade etapper. Ärtan ska vara varm och lekfull. Ett tryck på maskoten visar relevanta snabbval för den aktuella vyn samt ett fält för en fri fråga.

### Etapp 1 – gemensam faktagrund

- organisationens visningsnamn är `Test`;
- bygg kalender, utvecklingssamtal och godkända appnotiser;
- gör all viktig information åtkomlig även utan Ärtan;
- ge varje svar och notis en verifierbar källa;
- använd samma Supabase-behörigheter för botten som för användaren.

### Etapp 2 – föräldrarnas vardag

- klickbar Ärtan på alla huvudvyer;
- **Min dag** med tider, aktiviteter, notiser och olästa officiella inlägg;
- frågor om kalender, stängningsdagar och utvecklingssamtal;
- hjälp att hitta och öppna rätt privata kontaktväg;
- inga sparade frågor eller svar.

### Etapp 3 – personalens kommunikationshjälp

- källbundna utkast från kalenderhändelser;
- kontroll av målgrupp före publicering;
- godkänn och publicera direkt eller schemalagt;
- kommunikationsöverblick för publicerat, schemalagt, oläst, obesvarat och händelser utan påminnelse;
- gemensamma mallar och svarstider som skyddar personalens arbetsro.

### Etapp 4 – begriplighet och delaktighet

- klarspråk med originaltexten tillgänglig;
- språkversioner som personalen granskar före publicering;
- introduktionsguide för nya familjer;
- pedagogiska förklaringar som kopplar aktiviteter till lek och lärande utan att bedöma barnet.

### Etapp 5 – bildsäker publicering

- privat karantän för uppladdningar;
- manuell märkning av synliga barn;
- kanalbunden samtyckeskontroll;
- icke-identifierande varning om möjliga omarkerade ansikten;
- beskärning eller permanent döljning av ansikten;
- en andra mänsklig granskning vid offentlig publicering;
- hantering av återkallat samtycke och revisionslogg utan biometriska mallar.

Etapp 5 kräver separat rättslig bedömning och konsekvensbedömning innan utveckling eller test med riktiga barnbilder.

## Framtidsidé: bildsamtycke och säker publicering

### Problem

Ett barn utan godkännande för en viss publiceringskanal kan synas i en bild som personalen försöker publicera. Systemet behöver stoppa publiceringen innan bilden blir synlig.

Arthur har redan tre separata samtyckesomfattningar:

- `app_images` – bilder i den autentiserade appen;
- `group_images` – gruppbilder;
- `social_media` – skolans sociala medier.

Samtyckena ska fortsätta vara separata, frivilliga, tydliga och möjliga att återkalla.

### Rekommenderad säker lösning

Profilbilder ska **inte** användas som ett register för automatisk ansiktsidentifiering. Jämförelse av profilfoto med uppladdade bilder för att identifiera ett barn innebär behandling av biometriska uppgifter och kan bli behandling av känsliga personuppgifter. IMY beskriver ansiktsigenkänning som högriskbehandling som normalt kräver konsekvensbedömning; resultatet är dessutom alltid en sannolikhetsbedömning och kan ge falska träffar.

Använd i stället en strukturell publiceringsgrind:

1. Bilden laddas upp till ett privat karantänläge och är ännu inte publicerad.
2. Personalen anger vilka barn som är synliga och väljer publiceringskanal.
3. Systemet kontrollerar aktuellt samtycke för varje markerat barn och vald kanal.
4. Saknat eller nekat samtycke blockerar publicering utan möjlighet för vanlig personal att kringgå spärren.
5. En icke-identifierande ansiktsdetektor kan lokalt eller i en kontrollerad servermiljö varna om bilden verkar innehålla fler ansikten än antalet markerade barn. Den får inte avgöra vilka barn det är.
6. Personalen kan beskära bilden eller täcka ansikten med en permanent oskärpa och därefter göra en ny kontroll.
7. För offentlig kanal eller sociala medier krävs en andra mänsklig granskning.
8. Publiceringen sparar målgrupp, markerade barn, samtyckesomfattning, granskare och tidpunkt i en revisionslogg. Inga biometriska mallar lagras.

AI är här ett extra varningslager, aldrig bevis på att bilden är säker. Det är personalens märkning, samtyckesdata och publiceringsreglerna som avgör.

### Återkallat samtycke

Media behöver vara kopplad till de barn som personalen markerade. Om ett samtycke återkallas ska intern media döljas i väntan på granskning. För redan externpublicerat material behövs ett dokumenterat återtagningsflöde; systemet kan inte garantera att kopior utanför organisationens kontroll försvinner.

### Krav före eventuell utveckling

- fastställd rättslig grund och tydlig skillnad mellan intern och offentlig publicering;
- konsekvensbedömning för dataskydd, särskilt innan någon biometrisk teknik övervägs;
- gallringstider, lagringsplats och personuppgiftsbiträden;
- test av falska negativa och falska positiva varningar;
- tillgängligt manuellt alternativ och mänsklig slutkontroll;
- barnanpassad och vårdnadshavaranpassad information om hur bilder behandlas.

## Säkerhetsgränser för Ärtan

Ärtan ska inte:

- publicera, boka, ändra samtycke eller skicka privata svar utan en uttrycklig mänsklig handling;
- läsa hälsa, kontaktuppgifter, samtyckesdetaljer eller privata meddelanden för generella AI-svar;
- identifiera barn från ansikten eller skapa biometriska mallar;
- bedöma barns utveckling, diagnoser, beteende eller familjers lämplighet;
- ersätta brådskande kontakt med personal eller verksamhetens ordinarie rutiner;
- skapa prestationskrav genom antal bilder, inlägg eller svar.

## Researchkällor

- [Skolverket: Läroplan för förskolan, Lpfö 18](https://www.skolverket.se/download/18.6bfaca41169863e6a65d5aa/1553968116077/pdf4001.pdf) – tydlighet om mål och innehåll, fortlöpande samtal om trivsel, utveckling och lärande samt respekt för barnets integritet.
- [Skolverket: Utveckla samarbetet med vårdnadshavare i förskolan](https://www.skolverket.se/larande-och-trygghet/trygghet-vardegrund-och-arbetsmiljo/trygghet-och-studiero---forebygga-uppratthalla-och-agera/skolregler-konsekvensplaner-och-forvantansdokument/utveckla-samarbetet-med-vardnadshavare-i-forskolan) – tillit, introduktion, närvaro, delaktighet, kulturell bakgrund och tillgänglig kommunikation.
- [Avari med flera: Communication with families, Journal of Early Childhood Research](https://digitalcommons.unl.edu/cgi/viewcontent.cgi?article=1371&context=famconfacpub) – tvåvägskommunikation, vardagsrutiner, lärande, teknikens möjligheter samt risk för envägskommunikation och arbetsbelastning. Studien är explorativ med 31 amerikanska pedagoger och används därför som kompletterande, inte svensk normkälla.
- [OECD: Results from TALIS Starting Strong 2024](https://www.oecd.org/en/publications/results-from-talis-starting-strong-2024_20af08c0-en.html) – personal behöver balansera tid med barn, familjekommunikation, planering och administration.
- [IMY: Personuppgifter om barn](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/introduktion-till-gdpr/personuppgifter/personuppgifter-om-barn/) – barns uppgifter är särskilt skyddsvärda; samtycke måste vara frivilligt, specifikt och informerat.
- [IMY: GDPR och ansiktsigenkänningsteknik](https://www.imy.se/verksamhet/dataskydd/innovationsportalen/vagledning-om-ansiktsigenkanning-och-gdpr/gdpr-och-ansiktsigenkanningsteknik) – biometrisk identifiering, känsliga uppgifter, rättslig grund och krav på konsekvensbedömning.
- [IMY: Risker med ansiktsigenkänningsteknik](https://www.imy.se/verksamhet/dataskydd/innovationsportalen/vagledning-om-ansiktsigenkanning-och-gdpr/risker-med-ansiktsigenkanningsteknik) – oföränderliga biometriska uppgifter, sannolikhetsfel, bias och ändamålsglidning.

## Relaterat

- [[Arthur]]
- [[Ideer]]
- [[Projektplan]]
