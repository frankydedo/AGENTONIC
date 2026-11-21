---
type: overview
updated: 2026-11-21
sources: [raw/2026-11-20-luma-evento.md, raw/2026-11-20-arietetech.md, raw/regulation.md, raw/2026-11-21-brief.md, raw/2026-11-21-solution.md]
confidence: media
tags: [stato]
---
# Overview

**Cosa costruiamo** (2026-11-21): la challenge A del brief, Company Brain, **declinata sulle
riunioni di progetto**. Il Brain legge riunioni e documenti integrativi, estrae task e fatti, trova
incongruenze, ammette ciò che non sa e prepara le to-do di ciascuno; il manager approva tutto. Vedi
[Soluzione Company Brain](concepts/soluzione-company-brain.md) e
[Architettura e piano](analyses/architettura-e-piano.md).

## Cosa sappiamo
- Brief, challenge A e i sette controlli della giuria: [Brief del track](concepts/brief-del-track.md).
- Evento, track, premi e regole: [AGENTHON](entities/agenthon.md).
- Consegna **alle 17:00** (ultimo commit alle 16:50), criteri e pitch:
  [Consegna e valutazione](concepts/consegna-e-valutazione.md).
- Sponsor e principi: [Ariete Tech Solutions](entities/ariete-tech-solutions.md).

## Stato del progetto
- Cartella `AGENTONIC` **ripartita da zero**, senza starter kit. Repo pubblica
  [frankydedo/AGENTONIC](https://github.com/frankydedo/AGENTONIC), si lavora su `develop`.
- Dati sintetici: bozza di `dati/azienda.json` (Automazioni Dora S.r.l., 8 persone, progetto
  `prj-01`) e della riunione di kick-off `dati/riunioni/riu-001.md`, con le attese in `dati/attese/`.
- Modello in demo: Qwen3-30B-A3B su LM Studio nell'Air, cloud di riserva da scegliere
  ([LLM locale](analyses/llm-locale.md)).
- Divisione: Franky il cervello AI, Pietro backend/dati/voce, Mauro interfaccia/docs/pitch.

## Domande aperte
- Come si combinano i sette controlli sì/no con i 100 punti; come avviene l'attacco delle rivali.
- Quale branch registra il portale (la repo è pubblica: accesso della giuria risolto).
- Modello cloud di riserva; crediti ElevenLabs.
- Documenti integrativi (PDF): unità di citazione e agenti che li elaborano.
- Competenze definitive delle persone dell'azienda fittizia.
