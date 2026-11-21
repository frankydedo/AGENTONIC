"""F1: provider del modello. Nessuna chiamata di rete: il provider vero usa un trasporto finto."""

import json
import traceback

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


# --- REVISIONE 7 e 10: strict spento, ogni guasto diventa LLMNonDisponibile, mai segreti ----------

def risponde(risposta: httpx.Response) -> httpx.Client:
    return httpx.Client(transport=httpx.MockTransport(lambda req: risposta))


def test_strict_spento_nello_json_schema():
    ricevuti: list[dict] = []
    client = finto_server(['{"risposta": "ok", "sicurezza": "alta"}'], ricevuti)
    chat(MSG, Esempio, chiave="prova", config=cfg_locale(), client=client)
    assert ricevuti[0]["corpo"]["response_format"]["json_schema"]["strict"] is False


@pytest.mark.parametrize("risposta", [
    httpx.Response(200, json={"choices": [{"message": None}]}),                     # message null
    httpx.Response(200, json={"choices": []}),
    httpx.Response(200, json={"errore": "forma inattesa"}),
    httpx.Response(200, json={"choices": [{"message": {"content": ["non", "testo"]}}]}),
    httpx.Response(200, text="<html>non è JSON</html>"),
    httpx.Response(401, json={"error": "chiave SEGRETO rifiutata"}),
    httpx.Response(500, text="errore interno"),
])
def test_risposta_inattesa_llm_non_disponibile_senza_segreti(risposta):
    with pytest.raises(LLMNonDisponibile) as e:
        chat(MSG, Esempio, chiave="prova", config=cfg_locale(), client=risponde(risposta))
    traccia = "".join(traceback.format_exception(e.value))
    assert "SEGRETO" not in str(e.value) and "SEGRETO" not in repr(e.value) and "SEGRETO" not in traccia


def test_content_null_e_un_output_non_valido():
    risposta = httpx.Response(200, json={"choices": [{"message": {"content": None}}]})
    with pytest.raises(OutputNonValido):
        chat(MSG, Esempio, chiave="prova", config=cfg_locale(), client=risponde(risposta))


@pytest.mark.parametrize("url", ["http://[::1", "air.local:1234/v1", "ftp://air.local/v1"])
def test_url_non_valido_llm_non_disponibile(url):
    cfg = Config(provider="locale", base_url=url, modello="qwen", api_key="SEGRETO", timeout_s=1)
    with pytest.raises(LLMNonDisponibile) as e:        # fallisce prima di aprire una connessione
        chat(MSG, chiave="prova", config=cfg)
    assert "SEGRETO" not in str(e.value)


def test_client_che_non_si_crea_llm_non_disponibile(monkeypatch):
    def rotto(**_):
        raise ImportError("proxy SOCKS senza socksio")
    monkeypatch.setattr(httpx, "Client", rotto)
    with pytest.raises(LLMNonDisponibile):
        chat(MSG, chiave="prova", config=cfg_locale())


@pytest.mark.parametrize("variabile", ["LLM_TEMPERATURE", "LLM_TIMEOUT"])
def test_numero_non_valido_nel_env(monkeypatch, variabile):
    monkeypatch.setenv("LLM_PROVIDER", "mock")
    monkeypatch.setenv("LLM_API_KEY", "SEGRETO")
    monkeypatch.setenv(variabile, "SEGRETO-nel-posto-sbagliato")
    with pytest.raises(ValueError) as e:
        Config.da_ambiente()
    assert variabile in str(e.value) and "SEGRETO" not in str(e.value)
    with pytest.raises(LLMNonDisponibile) as e:        # da `chat` esce come modello non disponibile
        chat(MSG, chiave="prova")
    assert variabile in str(e.value) and "SEGRETO" not in str(e.value)


def test_chiave_api_mai_in_repr(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "cloud")
    monkeypatch.setenv("LLM_API_KEY", "SEGRETO")
    cfg = Config.da_ambiente()
    assert cfg.api_key == "SEGRETO" and "SEGRETO" not in repr(cfg) and "SEGRETO" not in str(cfg)
