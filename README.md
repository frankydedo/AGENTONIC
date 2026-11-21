# Agentonic

**The colleague who rereads every meeting for you, warns the people affected by what changed, and
never acts without a person's yes.**

AGENTHON · GDG Torino, 21/11/2026 · track *Agentic AI for business* (Ariete Tech Solutions) ·
challenge A, *Company Brain*.

## The problem

In a small or medium business, decisions are made in meetings and lost right after, in minutes nobody
rereads. By the next meeting the quote has changed and a deadline has slipped. Whoever depends on it
finds out when it is too late.

## What it does

1. **Reads** the minutes, transcripts and PDFs the team uploads and compares them with the project's
   earlier meetings.
2. **Speaks first**: it flags inconsistencies (e.g. the inverter quote went from €6,200 to €7,400, a
   deadline slipped) and the people affected, without anyone asking.
3. **Proposes, never acts**: new facts for the memory, tasks, deadline changes. Every proposal waits
   until the project manager approves or rejects it, and every decision is logged.
4. **Keeps a curated memory**: it answers only from what a person has approved, and cites the exact
   sentence of the minutes the answer comes from.
5. **Knows who is asking**: the same budget question gives the figure to the purchasing manager and
   a neutral "I have no information you can see on this, ask the project manager" to the developer,
   who never even learns the data exists.
6. **Admits gaps**: without a valid source it gives that same neutral answer instead of guessing.
7. **Fits into the team's day**: each person's to-do for today updates with the approved decisions,
   and alerts appear next to the task they concern.

The user interface is in Italian, since the target users are Italian businesses.

## Who it's for

Small and medium businesses and professional firms that run on meetings: the people who lead them
(project managers, owners) and the people who live with the consequences (purchasing, technicians,
administration). This is Ariete Tech Solutions' audience: people stay in control, AI is used only
where it is needed, and the model can run locally, so data stays inside the company.

## Guarantees live in the code, not in the prompt

| Guarantee | Where |
|---|---|
| Identity comes from the session (`persona` cookie), never from the text of the question | [backend/app.py](backend/app.py) (`/sessione`) |
| Area permissions are applied **before** the model: the model never sees what the asker cannot see | [backend/domande.py](backend/domande.py) (`voci_visibili`) |
| Search reads only the approved memory (SQLite FTS5) | [backend/ricerca.py](backend/ricerca.py) |
| Citations are rebuilt by the code from stored segments; invented ids are discarded; without valid sources the answer becomes the neutral "no information" reply | [backend/domande.py](backend/domande.py), [backend/analisi/proposte.py](backend/analisi/proposte.py) |
| Source content enters the prompt marked as data, with delimiters neutralized | [backend/domande.py](backend/domande.py) |
| Actions stay proposals until a person approves them; every step of the agent is in the audit log | [backend/app.py](backend/app.py) (`/proposte`, `/registro`) |
| If the model does not answer, the flow does not break: the manager gets an alert | [backend/analisi/](backend/analisi/) |

## Quick start

Requirements: Python 3.12, Node 20 or later.

```bash
# 1. Backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env                     # default LLM_PROVIDER=mock: no network, no keys
.venv/bin/python scripts/crea_db.py      # clean database with the sample company
.venv/bin/uvicorn backend.app:app --reload        # http://127.0.0.1:8000 (API docs at /docs)

# 2. Interface (in another terminal)
cd web
npm install
npm run dev                              # http://localhost:5173, proxies /api to the backend
```

In the current demo, you pick who you are (e.g. Giulia, project manager), upload minutes from
[dati/riunioni/](dati/riunioni/) (`riu-001.md`, then `riu-002.md`, `riu-003.md`...), approve or
reject the proposals, and ask the Brain questions as different people.

### The model

A single function `chat(messaggi, schema)` in [backend/llm.py](backend/llm.py), with structured
output validated by Pydantic. The provider is chosen in `.env`:

- `LLM_PROVIDER=mock`: recorded answers in [dati/mock_llm/](dati/mock_llm/). Used for tests and as
  the demo fallback.
- `LLM_PROVIDER=locale` (alias `openai_compat`): any OpenAI-compatible API. We use
  **Qwen3-30B-A3B** (`qwen/qwen3-30b-a3b-2507`) on LM Studio, locally:
  `LLM_BASE_URL=http://<host>:1234/v1`.

## Limitations

This is a one-day prototype. What it does not do yet, and what to keep in mind:

- **No real authentication.** You pick who you are from a list; identity then travels in a cookie
  (or the `X-Persona` header). The server never trusts the text of a question, but anyone can pick
  any person. A real deployment needs company SSO.
- **Meetings only, uploaded by hand.** Inputs are minutes, transcripts and PDFs. Email, chat and task
  tools would enter through the same ingestion path, but no connector exists yet.
- **Small context.** The local model has a 16k-token context: a question sees at most 30 memory
  entries of 500 characters each, preselected by a deterministic rule. Fine for a small business
  project, not for years of history.
- **Coarse permissions.** Visibility is by area of competence (development, budget, sales,
  suppliers, staff, general) and project membership, not per document.

## Data

All **synthetic**, from a made-up company: *Automazioni Dora S.r.l.*, industrial automation in
Settimo Torinese. 8 people with different areas of competence and 3 projects
([dati/azienda.json](dati/azienda.json)), 5 meeting minutes ([dati/riunioni/](dati/riunioni/)) and
a PDF ([dati/documenti/](dati/documenti/)). Expected outcomes are in [dati/attese/](dati/attese/).
No real personal data.

## Structure

```
backend/            FastAPI API, SQLite database (schema.sql), FTS5 search, questions, to-do
backend/analisi/    ingestion of minutes and PDFs, extraction, comparison with earlier meetings, proposals
web/                interface: React 19 + TypeScript + Vite + Tailwind v4
scripts/            crea_db.py, demo_check.py and utilities
tests/              pytest tests
dati/               synthetic data, recorded answers of the mock model, expected outcomes
docs/               API, contract, pitch, submission description
Vault/              team knowledge base: brief, rules, decisions (log.md)
```

## Pre-existing components

The code was written during the hackathon, starting from an empty repository. We use these
third-party components:

- **Backend**: FastAPI, Uvicorn, Pydantic, httpx, pypdf, python-multipart, SQLite with FTS5, pytest.
- **Interface**: React 19, React Router, Vite (with its starter template), TypeScript,
  Tailwind CSS v4, Motion, lucide-react, sonner, date-fns, clsx, Inter font; Vitest and Playwright.
- **Model**: Qwen3-30B-A3B (Alibaba, open weights) served by LM Studio.
