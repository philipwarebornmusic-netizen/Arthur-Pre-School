# Ändringslogg

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
