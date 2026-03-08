import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { code, language, runtimeInputs, runtimeInputSequence } = await req.json();
    if (!code || !language) {
      return new Response(JSON.stringify({ error: "Missing code or language" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

const systemPrompt = `You are an expert code execution analyzer. Analyze code line by line and return concise JSON very quickly.

Return a JSON object with this structure:
{
  "steps": [
    {
      "step": 1,
      "line": <line number in the code>,
      "code": "<the exact code on this line>",
      "description": "<very short summary (max 12 words)>",
      "purpose": "<one short sentence>",
      "importance": "<one short sentence>",
      "whatIfRemoved": "<one short sentence>",
      "concept": "<very short concept label>",
      "variables": { "<varName>": "<current value>", ... }
    }
  ],
  "output": "<the complete final program output as a string>"
}

CRITICAL RULES:
1. Include all meaningful executable lines. Blank/comment-only lines are optional.
2. For loops up to 8 iterations: include all. For longer loops: include first 2, one middle, and last 2.
3. For user input code (input/scanf/readline/prompt/Scanner/cin, etc.):
   - If runtime input values are provided by the client, you MUST use those exact values in order.
   - If no values are provided, simulate realistic inputs and clearly mention assumptions in output.
4. The "variables" object should include key live variables and values.
5. Keep each text field concise and specific.
6. Maximum 22 steps.
7. NEVER invent alternate input values (example: if provided value is "Lokis", do not output "Alice").
8. Prefer compact wording and avoid redundant narrative.
9. Return ONLY valid JSON. No markdown. No code blocks. No extra text.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Language: ${language}\n\nCode:\n${code}\n\nRuntime Inputs (use exactly if provided):\n${JSON.stringify(runtimeInputs || {})}\n\nRuntime Input Sequence (first input call gets first value, and so on):\n${JSON.stringify(runtimeInputSequence || [])}`,
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_analysis",
              description: "Return the step-by-step code execution analysis",
              parameters: {
                type: "object",
                properties: {
                  steps: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        step: { type: "number" },
                        line: { type: "number" },
                        code: { type: "string" },
                        description: { type: "string" },
                        purpose: { type: "string" },
                        importance: { type: "string" },
                        whatIfRemoved: { type: "string" },
                        concept: { type: "string" },
                        variables: { type: "object" },
                      },
                      required: ["step", "line", "code", "description", "purpose", "importance", "whatIfRemoved", "concept", "variables"],
                    },
                  },
                  output: { type: "string" },
                },
                required: ["steps", "output"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "return_analysis" } },
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Usage limit reached. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    let result;
    if (toolCall?.function?.arguments) {
      result = typeof toolCall.function.arguments === "string"
        ? JSON.parse(toolCall.function.arguments)
        : toolCall.function.arguments;
    } else {
      const content = data.choices?.[0]?.message?.content || "";
      result = JSON.parse(content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
