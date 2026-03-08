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

    const systemPrompt = `You are a fast code execution tracer. Trace the given code line by line and output results as NDJSON (one JSON object per line, no markdown, no extra text).

Each execution step must be on its own line in this exact format:
{"step":1,"line":2,"code":"exact source line","description":"short summary max 10 words","variables":{"varName":"value"}}

After ALL steps, output ONE final line:
{"output":"complete program output string"}

RULES:
- One JSON per line. No markdown. No code fences. No extra text.
- Max 20 steps total.
- Descriptions: max 10 words, specific to what that line does.
- variables: snapshot of all live variables AFTER this line executes.
- For loops with >8 iterations: show first 2, one middle, last 2 iterations only.
- For runtime inputs: use provided values in sequence order. If none provided, simulate realistic values.
- Skip blank lines and comment-only lines.
- Output line at the very end (after all steps).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `Language: ${language}\n\nCode:\n${code}\n\nRuntime Inputs (use in order): ${JSON.stringify(runtimeInputSequence || [])}\nInput Map: ${JSON.stringify(runtimeInputs || {})}`,
          },
        ],
        stream: true,
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

    // Pipe the raw SSE stream straight to the client — frontend parses NDJSON from content tokens
    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch (e) {
    console.error("analyze-code error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
