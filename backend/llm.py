"""Provider del modello (F1). Owner: Franky.

Un'unica funzione, `chat(messaggi, schema, chiave=...)`, con tre provider scelti da `LLM_PROVIDER`:
- `mock`: risposte registrate in `dati/mock_llm/<chiave>.json` (sviluppo, test, piano B in demo);
- `locale`: API compatibile OpenAI (LM Studio sull'Air);
- `cloud`: stessa API verso un provider cloud di riserva; si attiva solo cambiando `.env`.

Security by design:
- l'output con `schema` si valida con Pydantic; se non è valido, UN nuovo tentativo, poi
  `OutputNonValido` (fail closed, mai risultati parziali);
- timeout su ogni chiamata; errori di rete -> `LLMNonDisponibile`;
- la chiave API non compare mai in repr, log o eccezioni;
- un mock mancante è un errore, non una risposta inventata.
"""

from __future__ import annotations

import json
import os
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import httpx
from pydantic import BaseModel, ValidationError

Provider = Literal["mock", "locale", "cloud"]
CARTELLA_MOCK = Path(__file__).resolve().parent.parent / "dati" / "mock_llm"
_CHIAVE_VALIDA = re.compile(r"^[a-z0-9_-]{1,80}$")


class LLMNonDisponibile(RuntimeError):
    """Il modello non risponde (rete, timeout, HTTP) o manca il mock richiesto."""


class OutputNonValido(RuntimeError):
    """Il modello ha risposto, ma l'output non rispetta lo schema neanche dopo il nuovo tentativo."""


@dataclass(frozen=True)
class Config:
    provider: Provider = "mock"
    base_url: str = ""
    modello: str = ""
    api_key: str = field(default="", repr=False)   # mai stampata
    temperatura: float = 0.3
    timeout_s: float = 120.0
    registra: bool = False                         # salva le risposte vere come mock
    cartella_mock: Path = CARTELLA_MOCK

    @classmethod
    def da_ambiente(cls) -> Config:
        provider = os.environ.get("LLM_PROVIDER", "mock")
        provider = {"openai_compat": "locale"}.get(provider, provider)   # alias usato nel .env del team
        if provider not in ("mock", "locale", "cloud"):
            raise ValueError(f"LLM_PROVIDER non valido: {provider!r} (mock, locale, cloud, openai_compat)")
        return cls(
            provider=provider,
            base_url=os.environ.get("LLM_BASE_URL", "").rstrip("/"),
            modello=os.environ.get("LLM_MODEL", ""),
            api_key=os.environ.get("LLM_API_KEY", ""),
            temperatura=float(os.environ.get("LLM_TEMPERATURE", "0.3")),
            timeout_s=float(os.environ.get("LLM_TIMEOUT", "120")),
            registra=os.environ.get("LLM_REGISTRA", "") == "1",
        )


@dataclass
class RispostaLLM:
    testo: str                      # testo grezzo (pulito da <think> e ```json)
    dati: BaseModel | None          # istanza validata di `schema`, se c'era uno schema
    provider: Provider
    modello: str
    tentativi: int
    durata_ms: int


# --- Pulizia e validazione ----------------------------------------------------------------------

def _pulisci(testo: str) -> str:
    testo = re.sub(r"<think>.*?</think>", "", testo, flags=re.DOTALL).strip()
    m = re.fullmatch(r"```(?:json)?\s*(.*?)\s*```", testo, flags=re.DOTALL)
    return m.group(1) if m else testo


def _valida(testo: str, schema: type[BaseModel]) -> BaseModel:
    return schema.model_validate_json(testo)


def _errore_breve(e: ValidationError) -> str:
    return "; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors()[:5])


# --- Provider -----------------------------------------------------------------------------------

def _file_mock(cfg: Config, chiave: str) -> Path:
    return cfg.cartella_mock / f"{chiave}.json"


def _chiama_mock(cfg: Config, chiave: str, tentativo: int) -> str:
    # Per provare il nuovo tentativo: `<chiave>.2.json` è la risposta al secondo tentativo.
    secondo = cfg.cartella_mock / f"{chiave}.{tentativo}.json"
    percorso = secondo if tentativo > 1 and secondo.exists() else _file_mock(cfg, chiave)
    if not percorso.exists():
        raise LLMNonDisponibile(f"Mock mancante: {percorso.name}")
    return percorso.read_text(encoding="utf-8")


def _chiama_openai(cfg: Config, messaggi: list[dict], schema: type[BaseModel] | None,
                   client: httpx.Client | None) -> str:
    if not cfg.base_url or not cfg.modello:
        raise LLMNonDisponibile("LLM_BASE_URL o LLM_MODEL non impostati.")
    corpo: dict = {"model": cfg.modello, "messages": messaggi, "temperature": cfg.temperatura, "stream": False}
    if schema is not None:
        corpo["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": schema.__name__, "schema": schema.model_json_schema(), "strict": True},
        }
    intestazioni = {"Authorization": f"Bearer {cfg.api_key}"} if cfg.api_key else {}
    proprio = client is None
    client = client or httpx.Client(timeout=cfg.timeout_s)
    try:
        r = client.post(f"{cfg.base_url}/chat/completions", json=corpo, headers=intestazioni)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"] or ""
    except httpx.HTTPStatusError as e:
        raise LLMNonDisponibile(f"Il modello ha risposto HTTP {e.response.status_code}.") from None
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise LLMNonDisponibile(f"Modello non raggiungibile o risposta inattesa ({type(e).__name__}).") from None
    finally:
        if proprio:
            client.close()


# --- Funzione pubblica --------------------------------------------------------------------------

def chat(messaggi: list[dict], schema: type[BaseModel] | None = None, *, chiave: str,
         config: Config | None = None, client: httpx.Client | None = None) -> RispostaLLM:
    """Manda i messaggi al modello e, se c'è `schema`, restituisce l'output validato.

    `chiave` identifica la chiamata (es. "estrazione_riu-001"): nomina il file del mock e la
    risposta registrata. Solleva `LLMNonDisponibile` o `OutputNonValido`: mai un risultato parziale.
    """
    if not _CHIAVE_VALIDA.match(chiave):
        raise ValueError(f"Chiave non valida: {chiave!r} (solo a-z, 0-9, _ e -)")
    cfg = config or Config.da_ambiente()
    inizio = time.monotonic()
    storia = list(messaggi)
    ultimo_errore = ""

    for tentativo in (1, 2):
        if cfg.provider == "mock":
            grezzo = _chiama_mock(cfg, chiave, tentativo)
        else:
            grezzo = _chiama_openai(cfg, storia, schema, client)
        testo = _pulisci(grezzo)
        if cfg.registra and cfg.provider != "mock":
            cfg.cartella_mock.mkdir(parents=True, exist_ok=True)
            _file_mock(cfg, chiave).write_text(testo, encoding="utf-8")

        dati = None
        if schema is not None:
            try:
                dati = _valida(testo, schema)
            except ValidationError as e:
                ultimo_errore = _errore_breve(e)
                storia += [
                    {"role": "assistant", "content": testo},
                    {"role": "user", "content": "La risposta non rispetta lo schema JSON "
                                                f"({ultimo_errore}). Rispondi solo con il JSON corretto."},
                ]
                continue
        return RispostaLLM(testo=testo, dati=dati, provider=cfg.provider, modello=cfg.modello or "mock",
                           tentativi=tentativo, durata_ms=int((time.monotonic() - inizio) * 1000))

    raise OutputNonValido(f"Output non valido dopo 2 tentativi: {ultimo_errore}")


def json_compatto(dati: object) -> str:
    """Serializza per il prompt senza spazi inutili (il contesto locale è di 16k token)."""
    return json.dumps(dati, ensure_ascii=False, separators=(",", ":"))
