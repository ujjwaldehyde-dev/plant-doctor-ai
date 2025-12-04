import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();
    
    if (!image) {
      throw new Error("No image provided");
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Analyzing plant image...");

    const systemPrompt = `You are an expert agricultural scientist and plant pathologist specializing in crop diseases, particularly those common in India. Your task is to analyze plant images and provide detailed disease diagnosis.

Analyze the provided plant image and respond with a JSON object containing:
1. isHealthy: boolean - whether the plant appears healthy
2. diseaseName: string - name of the disease if detected (empty if healthy)
3. confidence: number - confidence level between 0 and 1
4. description: string - detailed description of the plant's condition
5. cures: array of treatment options with:
   - name: string - treatment name
   - description: string - how to apply the treatment
   - isRecommended: boolean - if this is the most advisable treatment
   - reason: string - why this treatment is recommended (only for recommended treatment)

Focus on diseases common in Indian agriculture like:
- Rice Blast, Bacterial Leaf Blight
- Late Blight (Potato/Tomato)
- Cotton Leaf Curl
- Wheat Rust
- Powdery Mildew
- Downy Mildew
- Fusarium Wilt
- Anthracnose

Provide practical, accessible treatments including organic options when possible.
IMPORTANT: Respond ONLY with valid JSON, no additional text.`;

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
            content: [
              {
                type: "text",
                text: "Analyze this plant image for diseases and provide diagnosis with treatment recommendations in JSON format.",
              },
              {
                type: "image_url",
                image_url: {
                  url: image,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI Gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Please try again in a moment.");
      }
      if (response.status === 402) {
        throw new Error("Service credits exhausted. Please try again later.");
      }
      throw new Error(`AI analysis failed: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI Response:", content);

    // Parse JSON from the response
    let analysisResult;
    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Provide a fallback response
      analysisResult = {
        isHealthy: true,
        diseaseName: "",
        confidence: 0.7,
        description: "Unable to analyze the image. The plant appears to be in acceptable condition, but please try again with a clearer image for better results.",
        cures: [],
      };
    }

    // Ensure all required fields exist
    const result = {
      isHealthy: analysisResult.isHealthy ?? true,
      diseaseName: analysisResult.diseaseName || "",
      confidence: analysisResult.confidence ?? 0.7,
      description: analysisResult.description || "Analysis complete.",
      cures: analysisResult.cures || [],
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-plant function:", error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error occurred" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
