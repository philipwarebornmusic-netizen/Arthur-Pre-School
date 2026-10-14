# Ändringslogg

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
