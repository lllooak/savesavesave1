import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface RequestBody {
  affiliateCode: string;
  visitorId: string;
  ipAddress?: string;
  userAgent?: string;
  referralUrl?: string;
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
    const { affiliateCode, visitorId, userAgent, referralUrl } = await req.json() as RequestBody;
    
    // Get IP address from request headers
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";

    if (!affiliateCode || !visitorId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Affiliate code and visitor ID are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get affiliate ID from code
    const { data: affiliateData, error: affiliateError } = await supabase
      .from('affiliate_links')
      .select('user_id')
      .eq('code', affiliateCode)
      .eq('is_active', true)
      .single();

    if (affiliateError) {
      console.error("Error finding affiliate:", affiliateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid affiliate code",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if this visitor has already been tracked for this affiliate
    const { data: existingVisit, error: existingVisitError } = await supabase
      .from('affiliate_tracking')
      .select('id')
      .eq('affiliate_id', affiliateData.user_id)
      .eq('visitor_id', visitorId)
      .eq('event_type', 'visit')
      .maybeSingle();

    if (existingVisitError) {
      console.error("Error checking existing visit:", existingVisitError);
    }

    // If this is a new visit, record it
    if (!existingVisit) {
      const { error: trackingError } = await supabase
        .from('affiliate_tracking')
        .insert({
          affiliate_id: affiliateData.user_id,
          event_type: 'visit',
          visitor_id: visitorId,
          ip_address: ipAddress,
          user_agent: userAgent,
          referral_url: referralUrl,
          metadata: {
            timestamp: new Date().toISOString()
          }
        });

      if (trackingError) {
        console.error("Error recording visit:", trackingError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Failed to record visit",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Visit recorded successfully",
        isNewVisit: !existingVisit
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