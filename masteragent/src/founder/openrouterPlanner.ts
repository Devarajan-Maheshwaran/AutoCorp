import { FounderPlan, FounderPlanSchema } from "../types.js";

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
}

function buildPrompt(objective: string): string {
  return [
    "You are the Founder Agent for AutoCorp.",
    "Output STRICT JSON only. No markdown.",
    "Scenario is fixed: dal arbitrage from Jodhpur to Mumbai.",
    "Return object shape exactly: { objective, charter, taskDag, agentAssignments }",
    "charter.businessName must be: AutoCorp — Dal Arbitrage: Jodhpur → Mumbai",
    "charter.commodity=dal, sourceMandi=Jodhpur, destinationMarket=Mumbai",
    "taskDag should include ordered flow: price_monitor -> procurement -> logistics -> sales and accountant aggregation",
    "agentAssignments must include capabilities: business_orchestration, price_monitoring, procurement, logistics, sales, accounting",
    `Investor objective: ${objective}`,
  ].join("\n");
}

export async function generateFounderPlanWithOpenRouter(objective: string): Promise<FounderPlan> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:free";
  const enableReasoning = (process.env.OPENROUTER_REASONING_ENABLED ?? "true").toLowerCase() === "true";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "system",
          content: "Return valid JSON only. No extra text.",
        },
        {
          role: "user",
          content: buildPrompt(objective),
        },
      ],
      reasoning: { enabled: enableReasoning },
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter request failed (${response.status}): ${errorBody}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter response missing message content");
  }

  const cleaned = stripCodeFences(content);
  const parsed = JSON.parse(cleaned) as FounderPlan;
  return FounderPlanSchema.parse(parsed);
}
