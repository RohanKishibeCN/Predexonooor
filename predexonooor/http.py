from __future__ import annotations

import os
from dataclasses import dataclass

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


@dataclass(frozen=True)
class HttpConfig:
    api_key_env: str = "PREDEXON_API_KEY"
    timeout_seconds: float = 20.0
    retries_total: int = 5
    backoff_factor: float = 0.5


def make_session(cfg: HttpConfig = HttpConfig()) -> requests.Session:
    api_key = os.environ.get(cfg.api_key_env)
    if not api_key:
        raise RuntimeError(f"Missing {cfg.api_key_env} environment variable")

    s = requests.Session()
    s.headers.update({"x-api-key": api_key})

    retry = Retry(
        total=cfg.retries_total,
        backoff_factor=cfg.backoff_factor,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST", "PUT", "DELETE"],
        respect_retry_after_header=True,
    )
    s.mount("https://", HTTPAdapter(max_retries=retry))
    return s
