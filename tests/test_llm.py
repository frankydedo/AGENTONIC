"""F1: provider del modello. Nessuna chiamata di rete: il provider vero usa un trasporto finto."""

import json

import httpx
import pytest
from pydantic import BaseModel

from backend.llm import Config, LLMNonDisponibile, OutputNonValido, chat

MSG = [{"role": "user", "content": "ciao"}]


class Esempio(BaseModel):
    risposta: str
    sicurezza: str


def finto_server(risposte: list[str], ricevuti: list[dict]) -> httpx.Client:
    def gestisci(req: httpx.Request) -> httpx.Response:
        ricevuti.append({"corpo": json.loads(req.content), "auth": req.headers.get("authorization")})
        return httpx.Response(200, json={"choices": [{"message": {"content": risposte[len(ricevuti) - 1]}}]})
    return httpx.Client(transport=httpx.MockTransport(gestisci))


def cfg_locale(**k) -> Config:
    return Config(provider="locale", base_url="http://air.local:1234/v1", modello="qwen", api_key="SEGRETO", **k)


def test_mock_valido(tmp_path):
    (tmp_path / "prova.json").write_text('{"risposta": "sì", "sicurezza": "alta"}')
    r = chat(MSG, Esempio, chiave="prova", config=Config(cartella_mock=tmp_path))
    assert r.dati == Esempio(risposta="sì", sicurezza="alta") and r.provider == "mock" and r.tentativi == 1


def test_mock_mancante_e_un_errore(tmp_path):
    with pytest.raises(LLMNonDisponibile):
        chat(MSG, Esempio, chiave="non-ce", config=Config(cartella_mock=tmp_path))


def test_nuovo_tentativo_poi_valido(tmp_path):
    (tmp_path / "prova.json").write_text('{"risposta": "sì"}')                 # manca un campo
    (tmp_path / "prova.2.json").write_text('{"risposta": "sì", "sicurezza": "bassa"}')
    r = chat(MSG, Esempio, chiave="prova", config=Config(cartella_mock=tmp_path))
    assert r.tentativi == 2 and r.dati.sicurezza == "bassa"


def test_fail_closed_dopo_due_tentativi(tmp_path):
    (tmp_path / "prova.json").write_text("non è JSON")
    with pytest.raises(OutputNonValido):
        chat(MSG, Esempio, chiave="prova", config=Config(cartella_mock=tmp_path))


def test_provider_locale_schema_temperatura_e_pulizia():
    ricevuti: list[dict] = []
    client = finto_server(['<think>...</think>```json\n{"risposta": "ok", "sicurezza": "media"}\n```'], ricevuti)
    r = chat(MSG, Esempio, chiave="prova", config=cfg_locale(), client=client)
    assert r.dati.risposta == "ok" and r.provider == "locale"
    corpo = ricevuti[0]["corpo"]
    assert corpo["temperature"] == 0.3 and corpo["response_format"]["json_schema"]["name"] == "Esempio"
    assert ricevuti[0]["auth"] == "Bearer SEGRETO"


def test_nuovo_tentativo_manda_l_errore_al_modello():
    ricevuti: list[dict] = []
    client = finto_server(['{"risposta": 1}', '{"risposta": "ok", "sicurezza": "alta"}'], ricevuti)
    r = chat(MSG, Esempio, chiave="prova", config=cfg_locale(), client=client)
    assert r.tentativi == 2 and "non rispetta lo schema" in ricevuti[1]["corpo"]["messages"][-1]["content"]


def test_errori_di_rete_senza_segreti():
    def giu(req):
        raise httpx.ConnectError("rete giù")
    client = httpx.Client(transport=httpx.MockTransport(giu))
    with pytest.raises(LLMNonDisponibile) as e:
        chat(MSG, chiave="prova", config=cfg_locale(), client=client)
    assert "SEGRETO" not in str(e.value)
    assert "SEGRETO" not in repr(cfg_locale())


def test_registra_salva_il_mock(tmp_path):
    client = finto_server(['{"risposta": "ok", "sicurezza": "alta"}'], [])
    chat(MSG, Esempio, chiave="estrazione_riu-001", config=cfg_locale(registra=True, cartella_mock=tmp_path), client=client)
    r = chat(MSG, Esempio, chiave="estrazione_riu-001", config=Config(cartella_mock=tmp_path))
    assert r.dati.risposta == "ok"


def test_chiave_non_valida():
    with pytest.raises(ValueError):
        chat(MSG, chiave="../../etc/passwd", config=Config())


def test_alias_openai_compat(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "openai_compat")
    assert Config.da_ambiente().provider == "locale"
    monkeypatch.setenv("LLM_PROVIDER", "boh")
    with pytest.raises(ValueError):
        Config.da_ambiente()
