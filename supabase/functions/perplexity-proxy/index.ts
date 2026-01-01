import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface QueryRequest {
  systemPrompt?: string;
  context?: string;
  question?: string;
  prompt?: string;
  model?: string;
  temperature?: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const apiKey = Deno.env.get("PERPLEXITY_API_KEY");

    if (!apiKey) {
      console.error("PERPLEXITY_API_KEY environment variable is not set in Supabase");
      return new Response(
        JSON.stringify({
          error: "API key not configured on server. Please add PERPLEXITY_API_KEY as a secret in Supabase Dashboard → Settings → Edge Functions → Secrets."
        }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const body: QueryRequest = await req.json();
    const model = body.model || "sonar-reasoning-pro";
    const temperature = body.temperature ?? 0.3;

    let messages: Array<{ role: string; content: string }>;

    if (body.systemPrompt && body.context && body.question) {
      messages = [
        {
          role: "system",
          content: body.systemPrompt,
        },
        {
          role: "user",
          content: `Context:\n\n${body.context}\n\nQuestion: ${body.question}`,
        },
      ];
    } else if (body.prompt) {
      messages = [
        {
          role: "user",
          content: body.prompt,
        },
      ];
    } else {
      return new Response(
        JSON.stringify({
          error: "Either provide (systemPrompt, context, question) or (prompt)",
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const response = await fetch(
      "https://api.perplexity.com/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Perplexity API error: ${response.status}`, errorText);

      let errorMessage = `Perplexity API error: ${response.status}`;

      if (response.status === 401) {
        errorMessage = "Perplexity API authentication failed. The PERPLEXITY_API_KEY secret may be invalid or expired.";
      } else if (response.status === 429) {
        errorMessage = "Perplexity API rate limit exceeded. Please wait and try again.";
      } else if (response.status === 500) {
        errorMessage = "Perplexity API is experiencing server issues. Please try again later.";
      } else {
        errorMessage = `Perplexity API error: ${response.status} - ${errorText}`;
      }

      return new Response(
        JSON.stringify({ error: errorMessage }),
        {
          status: response.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
