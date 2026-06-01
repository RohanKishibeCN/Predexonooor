from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Literal

import requests


class PredexonApiError(RuntimeError):
    def __init__(self, *, status_code: int, error: str | None, message: str | None, request_id: str | None):
        super().__init__(f"Predexon API error {status_code}: {error} {message} ({request_id})")
        self.status_code = status_code
        self.error = error
        self.message = message
        self.request_id = request_id


def _raise_for_error(resp: requests.Response) -> None:
    if 200 <= resp.status_code < 300:
        return
    try:
        payload = resp.json()
    except Exception:
        payload = {}
    raise PredexonApiError(
        status_code=resp.status_code,
        error=payload.get("error"),
        message=payload.get("message"),
        request_id=payload.get("requestId") or resp.headers.get("x-request-id"),
    )


@dataclass(frozen=True)
class DataClient:
    session: requests.Session
    base_url: str = "https://api.predexon.com"
    timeout_seconds: float = 20.0

    def health(self) -> dict[str, Any]:
        r = self.session.get(f"{self.base_url}/health", timeout=self.timeout_seconds)
        _raise_for_error(r)
        return r.json()

    def list_polymarket_markets(self, *, status: str = "open", sort: str = "volume", limit: int = 30) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/v2/polymarket/markets",
            params={"status": status, "sort": sort, "limit": limit},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def get_outcome(self, *, predexon_id: str, routable_only: bool = True) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/v2/outcomes/{predexon_id}",
            params={"routable_only": str(routable_only).lower()},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def polymarket_orderbooks(self, *, token_id: str, start_ms: int, end_ms: int, limit: int = 1) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/v2/polymarket/orderbooks",
            params={"token_id": token_id, "start_time": start_ms, "end_time": end_ms, "limit": limit},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def limitless_orderbooks(self, *, market_slug: str, start_ms: int, end_ms: int, limit: int = 1) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/v2/limitless/orderbooks",
            params={"market_slug": market_slug, "start_time": start_ms, "end_time": end_ms, "limit": limit},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()


Venue = Literal["polymarket", "limitless", "predict", "opinion", "hyperliquid"]


@dataclass(frozen=True)
class TradeClient:
    session: requests.Session
    base_url: str = "https://trade.predexon.com"
    timeout_seconds: float = 20.0

    def health(self) -> dict[str, Any]:
        r = self.session.get(f"{self.base_url}/health", timeout=self.timeout_seconds)
        _raise_for_error(r)
        return r.json()

    def create_account(self) -> dict[str, Any]:
        r = self.session.post(f"{self.base_url}/api/accounts/create", timeout=self.timeout_seconds)
        _raise_for_error(r)
        return r.json()

    def list_accounts(self) -> dict[str, Any]:
        r = self.session.get(f"{self.base_url}/api/accounts", timeout=self.timeout_seconds)
        _raise_for_error(r)
        return r.json()

    def get_account(self, *, account_id: str) -> dict[str, Any]:
        r = self.session.get(f"{self.base_url}/api/accounts/{account_id}", timeout=self.timeout_seconds)
        _raise_for_error(r)
        return r.json()

    def enable_venue(self, *, account_id: str, venue: Venue) -> dict[str, Any]:
        r = self.session.post(
            f"{self.base_url}/api/accounts/{account_id}/enable",
            json={"venue": venue},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def get_balance(self, *, account_id: str, aggregated: bool = False) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/api/accounts/{account_id}/balance",
            params={"aggregated": str(aggregated).lower()},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def get_positions(self, *, account_id: str, aggregated: bool = False) -> dict[str, Any]:
        r = self.session.get(
            f"{self.base_url}/api/accounts/{account_id}/positions",
            params={"aggregated": str(aggregated).lower()},
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def place_order(
        self,
        *,
        account_id: str,
        venue: Venue,
        token_id: str,
        side: Literal["buy", "sell"],
        order_type: Literal["market", "limit"],
        size: float,
        price: float | None = None,
        client_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "venue": venue,
            "market": {"tokenId": token_id},
            "side": side,
            "type": order_type,
            "size": str(size),
        }
        if price is not None:
            payload["price"] = str(price)
        if client_id:
            payload["clientId"] = client_id

        r = self.session.post(
            f"{self.base_url}/api/accounts/{account_id}/orders",
            json=payload,
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        return r.json()

    def router_place_order(
        self,
        *,
        account_id: str,
        predexon_id: str,
        side: Literal["buy", "sell"],
        order_type: Literal["market", "limit"],
        amount: float | None = None,
        size: float | None = None,
        price: float | None = None,
        bridge_enabled: bool | None = None,
        client_order_id: str | None = None,
        explain: bool = False,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"predexonId": predexon_id, "side": side, "type": order_type}
        if amount is not None:
            payload["amount"] = amount
        if size is not None:
            payload["size"] = size
        if price is not None:
            payload["price"] = price
        if bridge_enabled is not None:
            payload["bridgeEnabled"] = bool(bridge_enabled)
        if client_order_id:
            payload["clientOrderId"] = client_order_id

        r = self.session.post(
            f"{self.base_url}/api/accounts/{account_id}/router/orders",
            params={"explain": str(explain).lower()},
            json=payload,
            timeout=self.timeout_seconds,
        )
        _raise_for_error(r)
        body = r.json()
        if isinstance(body, dict) and body.get("status") == "failed":
            return body
        return body


def now_ms() -> int:
    return int(time.time() * 1000)
