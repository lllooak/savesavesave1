import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateOrderRequest {
  amount: number;
  currency: string;
  description: string;
  return_url: string;
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
    const paypalClientId = Deno.env.get("PAYPAL_CLIENT_ID");
    const paypalClientSecret = Deno.env.get("PAYPAL_CLIENT_SECRET");

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
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

    if (!paypalClientId || !paypalClientSecret) {
      console.error("Missing PayPal credentials");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payment service not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing authorization header",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      console.error("Error getting user:", userError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Unauthorized",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Parse request body
    const { amount, currency, description, return_url } = await req.json() as CreateOrderRequest;

    // Validate request
    if (!amount || amount <= 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid amount",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get PayPal access token
    const tokenResponse = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`,
      },
      body: "grant_type=client_credentials",
    });

    if (!tokenResponse.ok) {
      const tokenError = await tokenResponse.json();
      console.error("PayPal token error:", tokenError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to authenticate with payment provider",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { access_token } = await tokenResponse.json();

    // Create PayPal order
    const orderResponse = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency || "ILS",
              value: amount.toFixed(2),
            },
            description: description || "Wallet top-up",
          },
        ],
        application_context: {
          return_url: return_url || "https://mystar.co.il/payment-success",
          cancel_url: "https://mystar.co.il/payment-cancel",
        },
      }),
    });

    if (!orderResponse.ok) {
      const orderError = await orderResponse.json();
      console.error("PayPal order creation error:", orderError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create payment order",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const orderData = await orderResponse.json();
    
    // Create transaction record in database
    const { data: transaction, error: transactionError } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: user.id,
        type: 'top_up',
        amount: amount,
        payment_method: 'paypal',
        payment_status: 'pending',
        reference_id: orderData.id,
        description: description || "PayPal wallet top-up",
      })
      .select()
      .single();

    if (transactionError) {
      console.error("Error creating transaction record:", transactionError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to record transaction",
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
        order_id: orderData.id,
        transaction_id: transaction.id,
        links: orderData.links,
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