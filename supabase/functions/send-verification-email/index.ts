import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  email: string;
  redirectTo?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Get environment variables
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing environment variables");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server configuration error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { email, redirectTo } = await req.json() as RequestBody;

    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email is required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Set default redirect URL if not provided
    const finalRedirectTo = redirectTo || 'https://mystar.co.il/auth/callback';

    console.log(`Sending verification email to ${email} with redirect to ${finalRedirectTo}`);

    // Send verification email
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: finalRedirectTo
      }
    });

    if (error) {
      console.error("Error sending verification email:", error);
      
      // For rate limiting errors, return a graceful response
      if (error.message.includes("rate limit") || error.message.includes("Too many requests")) {
        return new Response(
          JSON.stringify({
            success: true,
            note: "Rate limited, but handled gracefully",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
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
        error: error.message || "An unexpected error occurred",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});