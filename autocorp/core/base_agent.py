"""
Base Agent — universal ReAct agent base class that ALL category agents inherit from.
Completely category-agnostic.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from typing import Any, Callable

import google.generativeai as genai

from autocorp.core.a2a import A2AMessage, send_a2a
from autocorp.core.event_bus import publish


class BaseAgent:
    """Category-agnostic ReAct agent with A2A and tool support."""

    def __init__(self, agent_name: str, charter: dict, tools: dict[str, Callable]):
        self.agent_name = agent_name
        self.charter = charter
        self.tools = tools
        self.history: list[dict[str, Any]] = []
        self.running = False

        api_key = os.getenv("GEMINI_API_KEY", "")
        if api_key:
            genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash")

    def build_system_prompt(self, role_description: str, actions: list[str]) -> str:
        return f"""You are {self.agent_name} for AutoCorp.

Business Charter:
{json.dumps(self.charter, indent=2, default=str)}

Your Role: {role_description}

You reason using the ReAct framework:
  Thought: <your reasoning about current market state>
  Action: <exactly one action from the list below>

Available Actions:
{chr(10).join(f'  - {a}' for a in actions)}

CALL_TOOL format (use when you need live data):
  Action: CALL_TOOL | tool: <tool_name> | args: {{"key": "value"}}

Rules:
- Always reason about fees, margins, and risk before acting
- Never exceed max_single_trade_pct of budget in one trade
- Apply stop_loss_pct if position moves against you
- Mark simulated actions with [SIMULATED] in your thought
- Be concise — one Thought + one Action per step
"""

    async def react_step(self, observation: str, system_prompt: str) -> tuple[str, str]:
        """Run one ReAct cycle. Returns (thought, action)."""
        self.history.append({"role": "user", "parts": [observation]})

        full_prompt = system_prompt + "\n\nCurrent Observation:\n" + observation
        if len(self.history) > 1:
            full_prompt += "\n\nRecent History:\n"
            for h in self.history[-4:]:
                content = h["parts"][0] if h["parts"] else ""
                full_prompt += f"{h['role']}: {str(content)[:200]}\n"

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: self.model.generate_content(full_prompt)
        )
        text = response.text.strip()

        thought, action = self._parse_response(text)

        # Handle CALL_TOOL
        if action.startswith("CALL_TOOL"):
            tool_result = await self._execute_tool(action)
            follow_up = f"Tool result: {tool_result}\nNow make your final decision."
            self.history.append({"role": "model", "parts": [text]})
            self.history.append({"role": "user", "parts": [follow_up]})
            response2 = await loop.run_in_executor(
                None, lambda: self.model.generate_content(
                    system_prompt + "\n\n" + follow_up
                )
            )
            text2 = response2.text.strip()
            thought, action = self._parse_response(text2)

        await publish({
            "agent": self.agent_name,
            "type": "react_step",
            "thought": thought,
            "action": action,
            "observation": observation[:300],
            "ts": time.time(),
        })

        self.history.append({"role": "model", "parts": [text]})
        return thought, action

    def _parse_response(self, text: str) -> tuple[str, str]:
        thought = ""
        action = ""
        for line in text.split("\n"):
            stripped = line.strip()
            if stripped.lower().startswith("thought:"):
                thought = stripped[8:].strip()
            elif stripped.lower().startswith("action:"):
                action = stripped[7:].strip()
        return thought, action

    async def _execute_tool(self, action_str: str) -> str:
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
            if tool_name in self.tools:
                fn = self.tools[tool_name]
                if asyncio.iscoroutinefunction(fn):
                    result = await fn(**args)
                else:
                    result = fn(**args)
                return json.dumps(result, default=str)
            return f"Tool '{tool_name}' not found. Available: {list(self.tools.keys())}"
        except Exception as e:
            return f"Tool execution error: {e}"

    async def send_a2a_message(self, to_agent_url: str, capability: str, payload: dict):
        """Send an A2A message to another agent."""
        msg = A2AMessage(
            task_id=f"{self.agent_name}-{int(time.time() * 1000)}",
            from_agent=self.agent_name,
            to_agent=to_agent_url,
            capability=capability,
            payload=payload,
            timestamp=time.time(),
        )
        try:
            await send_a2a(to_agent_url, msg)
        except Exception as e:
            print(f"[{self.agent_name}] A2A send failed: {e}")

        await publish({
            "agent": self.agent_name,
            "type": "a2a_sent",
            "to": to_agent_url,
            "capability": capability,
            "payload": payload,
            "ts": time.time(),
        })

    def reset_history(self):
        self.history = []
