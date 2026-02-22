"""
LLM integration — Gemini ReAct engine (kept from original, category-agnostic).
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable

import google.generativeai as genai

from autocorp.core.event_bus import publish
import os

log = logging.getLogger(__name__)

_configured = False


def _ensure_configured():
    global _configured
    if not _configured:
        key = os.getenv("GEMINI_API_KEY", "")
        if key:
            genai.configure(api_key=key)
            _configured = True


DEFAULT_MODEL = "gemini-2.0-flash"


class ReActAgent:
    """Multi-turn ReAct reasoning agent backed by Gemini."""

    def __init__(
        self,
        system_prompt: str,
        tool_registry: dict[str, Callable] | None = None,
        temperature: float = 0.2,
    ) -> None:
        _ensure_configured()
        self.system_prompt = system_prompt
        self.tool_registry: dict[str, Callable] = tool_registry or {}
        self.model = genai.GenerativeModel(
            model_name=DEFAULT_MODEL,
            system_instruction=self.system_prompt,
            generation_config=genai.GenerationConfig(
                temperature=temperature,
                max_output_tokens=512,
            ),
        )
        self.history: list[dict[str, Any]] = []

    async def step(self, observation: str) -> tuple[str, str, str]:
        """Run one ReAct decision cycle. Returns (thought, action, raw_text)."""
        self.history.append({"role": "user", "parts": [observation]})

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self.model.generate_content(self.history)
        )
        raw_text = response.text
        self.history.append({"role": "model", "parts": [raw_text]})

        thought, action = self._parse(raw_text)

        # CALL_TOOL handling
        max_tool_rounds = 3
        rounds = 0
        while action.startswith("CALL_TOOL") and rounds < max_tool_rounds:
            rounds += 1
            tool_result = await self._invoke_tool(action)
            tool_obs = f"Tool result: {tool_result}"
            self.history.append({"role": "user", "parts": [tool_obs]})
            response = await loop.run_in_executor(
                None, lambda: self.model.generate_content(self.history)
            )
            raw_text = response.text
            self.history.append({"role": "model", "parts": [raw_text]})
            thought, action = self._parse(raw_text)

        return thought, action, raw_text

    def _parse(self, text: str) -> tuple[str, str]:
        thought = ""
        action = ""
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.lower().startswith("thought:"):
                thought = stripped[8:].strip()
            elif stripped.lower().startswith("action:"):
                action = stripped[7:].strip()
        return thought, action

    async def _invoke_tool(self, action_str: str) -> str:
        try:
            parts = [p.strip() for p in action_str.split("|")]
            tool_name = ""
            args = {}
            for part in parts:
                if part.lower().startswith("tool:"):
                    tool_name = part.split(":", 1)[1].strip()
                elif part.lower().startswith("args:"):
                    args_str = part.split(":", 1)[1].strip()
                    args = json.loads(args_str)

            if tool_name in self.tool_registry:
                fn = self.tool_registry[tool_name]
                if asyncio.iscoroutinefunction(fn):
                    result = await fn(**args)
                else:
                    result = fn(**args)
                return json.dumps(result, default=str)
            return f"Tool '{tool_name}' not found. Available: {list(self.tool_registry.keys())}"
        except Exception as e:
            return f"Tool execution error: {e}"
