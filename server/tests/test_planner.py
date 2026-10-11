"""The shared plan/ask flow with a mocked provider: validate, retry once, fall back, log."""

from __future__ import annotations

import asyncio
import json

from app.providers.base import ASK_FALLBACK, ProviderError, build_plan_prompt, trim_words
from app.schemas import AskRequest

from .conftest import FakeProvider, good_plan_json


def run(coro):
    return asyncio.run(coro)


def read_log(log_dir) -> list[dict]:
    return [json.loads(line) for line in (log_dir / "model_calls.jsonl").read_text().splitlines()]


def test_valid_first_reply_is_used(req, _logs_to_tmp) -> None:
    p = FakeProvider([good_plan_json(req)])
    res = run(p.plan(req))
    assert res.source == "gemma"
    assert len(p.calls) == 1
    rec = read_log(_logs_to_tmp)[-1]
    assert rec["provider"] == "fake" and rec["model"] == "fake-model"
    assert rec["fallback"] is False and rec["attempts"] == 1
    assert isinstance(rec["latency_ms"], int)


def test_retry_once_with_validation_errors_appended(req) -> None:
    bad = json.loads(good_plan_json(req))
    bad["steps"] = bad["steps"][:-1]  # region 6 never painted
    p = FakeProvider([json.dumps(bad), good_plan_json(req)])
    res = run(p.plan(req))
    assert res.source == "gemma"
    assert len(p.calls) == 2
    retry_msg = p.calls[1][-1].content
    assert "failed validation" in retry_msg and "regions [6]" in retry_msg
    assert p.calls[1][-2].role == "assistant"


def test_two_failures_use_the_fallback(req, _logs_to_tmp) -> None:
    bad = good_plan_json(req).replace("Mix the color shown", "Mix 2 parts blue")
    p = FakeProvider([bad, bad])
    res = run(p.plan(req))
    assert res.source == "fallback"
    assert {rid for s in res.steps for rid in s.region_ids} == {r.id for r in req.regions}
    rec = read_log(_logs_to_tmp)[-1]
    assert rec["fallback"] is True and rec["attempts"] == 2
    assert any("mixing amount" in p for p in rec["problems"])


def test_non_json_reply_is_retried(req) -> None:
    p = FakeProvider(["Sure! Here is your plan: paint the sky first.", good_plan_json(req)])
    assert run(p.plan(req)).source == "gemma"
    assert "not valid JSON" in p.calls[1][-1].content


def test_fenced_json_is_accepted(req) -> None:
    p = FakeProvider(["```json\n" + good_plan_json(req) + "\n```"])
    assert run(p.plan(req)).source == "gemma"


def test_transport_error_falls_back_without_retry(req, _logs_to_tmp) -> None:
    p = FakeProvider([ProviderError("connection refused")])
    res = run(p.plan(req))
    assert res.source == "fallback"
    assert len(p.calls) == 1
    assert read_log(_logs_to_tmp)[-1]["error"] == "connection refused"


def test_image_and_context_are_sent(req) -> None:
    req.image_b64 = "aGVsbG8="
    p = FakeProvider([good_plan_json(req)])
    run(p.plan(req))
    system, user = p.calls[0]
    assert system.role == "system" and "never state mixing ratios" in system.content.lower()
    assert user.image_b64 == "aGVsbG8="
    prompt = build_plan_prompt(req)
    assert "Medium: acrylic" in prompt and "Minutes available: 60" in prompt
    assert "- 1: #9cc3e6, lightness 77" in prompt and "top center" in prompt
    assert "Ultramarine Blue, Titanium White" in prompt
    assert " parts" not in prompt  # recipe amounts never reach the model


def _ask_req(req, **kw) -> AskRequest:
    plan = run(FakeProvider([good_plan_json(req)]).plan(req))
    return AskRequest(question="Is my sky too dark?", plan=plan, current_step=1, **kw)


def test_ask_answers_and_trims_to_80_words(req) -> None:
    long_answer = " ".join(["Soften the edge with a damp brush."] * 20)
    p = FakeProvider([long_answer])
    answer = run(p.ask(_ask_req(req)))
    assert len(answer.split()) <= 80
    assert answer.endswith(".")


def test_ask_retries_ratio_answer_then_falls_back(req, _logs_to_tmp) -> None:
    p = FakeProvider(["Use 3 parts white.", "Use 2 parts white."])
    assert run(p.ask(_ask_req(req))) == ASK_FALLBACK
    assert len(p.calls) == 2
    assert read_log(_logs_to_tmp)[-1]["fallback"] is True


def test_ask_with_photo_attaches_it(req) -> None:
    p = FakeProvider(["Your sky looks lovely; lift a little paint near the horizon."])
    run(p.ask(_ask_req(req, image_b64="cGhvdG8=")))
    user = p.calls[0][-1]
    assert user.image_b64 == "cGhvdG8="
    assert "photo of the painting in progress" in user.content
    assert "Current step: 1." in user.content


def test_trim_words_keeps_short_text() -> None:
    assert trim_words("Keep going.") == "Keep going."


def test_trailing_characters_after_the_json_are_ignored(req) -> None:
    p = FakeProvider([good_plan_json(req) + "}"])
    assert run(p.plan(req)).source == "gemma"
    assert len(p.calls) == 1


def test_text_before_the_json_is_ignored(req) -> None:
    p = FakeProvider(["Here is the plan:\n" + good_plan_json(req)])
    assert run(p.plan(req)).source == "gemma"


def test_premature_close_after_labels_is_repaired(req) -> None:
    """Real Gemma reply shape: `{"labels": [...]}, "steps": [...]}`."""
    good = good_plan_json(req)
    broken = good.replace('}], "steps":', '}]}, "steps":', 1)
    assert broken != good
    p = FakeProvider([broken])
    assert run(p.plan(req)).source == "gemma"
    assert len(p.calls) == 1
