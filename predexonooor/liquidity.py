from __future__ import annotations

import math
from dataclasses import dataclass

from .quotes import TopOfBook


@dataclass(frozen=True)
class LiquidityScore:
    venue: str
    score: float
    spread: float
    top_depth: float


def score_top_of_book(q: TopOfBook) -> LiquidityScore:
    top_depth = min(q.bid_size, q.ask_size)
    spread = q.spread
    score = (-spread * 100.0) + math.log1p(max(top_depth, 0.0))
    return LiquidityScore(venue=q.venue, score=score, spread=spread, top_depth=top_depth)
