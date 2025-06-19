import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get PayPal credentials from environment variables
    const clientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const clientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      console.error("PayPal credentials are not configured");
      return new Response(
        JSON.stringify({
          success: false,
          connected: false,
          error: "PayPal credentials are not configured",
        }),
        {
          status: 200, // Return 200 even for configuration issues
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Encode credentials for Basic Auth
    const auth = btoa(`${clientId}:${clientSecret}`);

    // Test connection to PayPal API by getting an access token
    const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${auth}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("PayPal API error:", errorData);
      
      return new Response(
        JSON.stringify({
          success: false,
          connected: false,
          error: `PayPal API error: ${errorData.error_description || "Unknown error"}`,
        }),
        {
          status: 200, // Return 200 even for API errors
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        connected: true,
        message: "Successfully connected to PayPal API",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    
    return new Response(
      JSON.stringify({
        success: false,
        connected: false,
        error: error.message || "An unexpected error occurred",
      }),
      {
        status: 200, // Return 200 even for unexpected errors
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});