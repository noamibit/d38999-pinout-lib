"""Unit tests for AIVisionReader against a fake Anthropic client -- no real API
calls, no network, no API key needed. Only response-parsing logic is under test;
the CV/box-detection side is exercised elsewhere (test_roundtrip.py)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from d38999conv.text import AIVisionReader


class _FakeBlock:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class _FakeMessages:
    def __init__(self, reply: str) -> None:
        self._reply = reply
        self.last_call: dict | None = None

    def create(self, **kwargs):
        self.last_call = kwargs
        return type("Resp", (), {"content": [_FakeBlock(self._reply)]})()


class _FakeClient:
    def __init__(self, reply: str) -> None:
        self.messages = _FakeMessages(reply)


def _crops(n: int) -> list[np.ndarray]:
    return [np.zeros((10, 10), dtype=np.uint8) for _ in range(n)]


def test_read_batch_happy_path():
    client = _FakeClient(json.dumps(["A", "b", "AA"]))
    reader = AIVisionReader(client=client)
    result = reader.read_batch(_crops(3))
    assert result == [("A", 0.9), ("b", 0.9), ("AA", 0.9)]


def test_read_batch_strips_markdown_fence():
    client = _FakeClient('Here you go:\n```json\n["A", "B"]\n```')
    reader = AIVisionReader(client=client)
    assert reader.read_batch(_crops(2)) == [("A", 0.9), ("B", 0.9)]


def test_read_batch_question_mark_gets_zero_confidence():
    client = _FakeClient(json.dumps(["A", "?"]))
    reader = AIVisionReader(client=client)
    assert reader.read_batch(_crops(2)) == [("A", 0.9), ("?", 0.0)]


def test_read_batch_pads_short_response():
    client = _FakeClient(json.dumps(["A"]))  # model only returned 1 of 3
    reader = AIVisionReader(client=client)
    assert reader.read_batch(_crops(3)) == [("A", 0.9), ("?", 0.0), ("?", 0.0)]


def test_read_batch_truncates_long_response():
    client = _FakeClient(json.dumps(["A", "B", "C", "D"]))  # model returned 4 of 2
    reader = AIVisionReader(client=client)
    assert reader.read_batch(_crops(2)) == [("A", 0.9), ("B", 0.9)]


def test_read_batch_garbage_response_falls_back_to_unknown():
    client = _FakeClient("not json at all")
    reader = AIVisionReader(client=client)
    assert reader.read_batch(_crops(2)) == [("?", 0.0), ("?", 0.0)]


def test_read_batch_empty_input_short_circuits():
    client = _FakeClient(json.dumps([]))
    reader = AIVisionReader(client=client)
    assert reader.read_batch([]) == []
    assert client.messages.last_call is None  # no API call made for empty input


def test_read_single_delegates_to_batch():
    client = _FakeClient(json.dumps(["Z"]))
    reader = AIVisionReader(client=client)
    assert reader.read(_crops(1)[0]) == ("Z", 0.9)


def test_one_request_sent_for_whole_batch():
    client = _FakeClient(json.dumps(["A", "B", "C", "D", "E"]))
    reader = AIVisionReader(client=client)
    reader.read_batch(_crops(5))
    assert client.messages.last_call is not None
    content = client.messages.last_call["messages"][0]["content"]
    images = [c for c in content if c["type"] == "image"]
    assert len(images) == 5  # all 5 crops in one request, not five requests


def test_missing_api_key_raises_without_client(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY"):
        AIVisionReader()
