"""
LLM integration — ReAct agent loop powered by Google Gemini.

The ``ReActAgent`` implements a multi-turn Thought → Action → Observation loop
with mid-thought tool calling:

1. Agent feeds an observation (price, budget, etc.) to Gemini
2. Gemini responds with Thought + Action
3. If Action is ``CALL_TOOL`` — the tool is invoked from the registry, the
   result is injected as the next observation, and Gemini reasons again
4. Final non-tool Action (TRIGGER_BUY, WAIT, etc.) is returned to the caller

Multi-turn ``self.history`` lets the LLM see price trends across ticks.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Callable

import google.generativeai as genai

from member2.shared.config import GEMINI_API_KEY

log = logging.getLogger(__name__)

# ── Gemini SDK configuration ──────────────────────────────────────────────
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

DEFAULT_MODEL = "gemini-1.5-flash"


# ── ReAct Agent ────────────────────────────────────────────────────────────


class ReActAgent:
    """
    Multi-turn ReAct reasoning agent backed by Gemini.

    Parameters
    ----------
    system_prompt : str
        Persona / rules injected as ``system_instruction``.
    tool_registry : dict[str, Callable]
        ``{tool_name: async fn(args_dict) -> dict}``.  When the LLM emits
        ``CALL_TOOL`` the matching function is invoked and the result is
        fed back automatically.
    temperature : float
        Gemini sampling temperature (default 0.2 for deterministic).
    """

    def __init__(
        self,
        system_prompt: str,
        tool_registry: dict[str, Callable] | None = None,
        temperature: float = 0.2,
    ) -> None:
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

        # Multi-turn history — the LLM sees past ticks so it can spot trends
        self.history: list[dict[str, Any]] = []

    # ------------------------------------------------------------------ #

    async def step(self, observation: str) -> tuple[str, str, str]:
        """
        Run one ReAct decision cycle.

        Returns ``(thought, action, raw_text)`` where *action* is the final
        non-tool action string (e.g. ``"TRIGGER_BUY | reason: ..."``)
        """
        # 1. Append observation
        self.history.append({"role": "user", "parts": [observation]})

        # 2. Call Gemini (sync SDK → run in executor)
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self.model.generate_content(self.history),
        )
        raw_text = response.text
        self.history.append({"role": "model", "parts": [raw_text]})

        # 3. Parse Thought / Action
        thought, action = self._parse(raw_text)

        # 4. CALL_TOOL handling
        if action.upper().startswith("CALL_TOOL"):
            tool_name, tool_args = self._parse_tool_action(action)

            if tool_name in self.tool_registry:
                tool_result = await self.tool_registry[tool_name](tool_args)
                tool_obs = f"Tool result for {tool_name}: {json.dumps(tool_result, default=str)}"

                # Re-enter with tool result
                self.history.append({"role": "user", "parts": [tool_obs]})
                response2 = await loop.run_in_executor(
                    None,
                    lambda: self.model.generate_content(self.history),
                )
                raw_text = response2.text
                self.history.append({"role": "model", "parts": [raw_text]})
                thought, action = self._parse(raw_text)
            else:
                action = f"ERROR: unknown tool {tool_name}"

        # 5. Trim history to prevent token overflow
        if len(self.history) > 20:
            self.history = self.history[-20:]

        return thought, action, raw_text

    def reset_history(self) -> None:
        """Clear conversation memory (call between lots / cycles)."""
        self.history = []

    # ------------------------------------------------------------------ #
    #  Internals                                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _parse(raw: str) -> tuple[str, str]:
        """Extract ``(thought, action)`` from LLM output."""
        thought = ""
        action = raw.strip()

        if "Thought:" in raw and "Action:" in raw:
            thought_start = raw.index("Thought:") + len("Thought:")
            action_idx = raw.index("Action:")
            thought = raw[thought_start:action_idx].strip()
            action = raw[action_idx + len("Action:"):].strip()

        return thought, action

    @staticmethod
    def _parse_tool_action(action: str) -> tuple[str, dict]:
        """Parse ``CALL_TOOL | tool: <name> | args: {...}``."""
        parts = action.split("|")
        tool_name = ""
        args: dict = {}

        if len(parts) >= 2:
            tool_name = parts[1].replace("tool:", "").strip()
        if len(parts) >= 3:
            args_str = parts[2].replace("args:", "").strip()
            try:
                args = json.loads(args_str)
            except json.JSONDecodeError:
                args = {}

        return tool_name, args
