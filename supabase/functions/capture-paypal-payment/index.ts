import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CapturePaymentRequest {
  order_id: string;
  transaction_id: string;
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
    const { order_id, transaction_id } = await req.json() as CapturePaymentRequest;

    // Validate request
    if (!order_id || !transaction_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Order ID and transaction ID are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify transaction belongs to user
    const { data: transaction, error: transactionError } = await supabase
      .from('wallet_transactions')
      .select('*')
      .eq('id', transaction_id)
      .eq('user_id', user.id)
      .eq('reference_id', order_id)
      .single();

    if (transactionError || !transaction) {
      console.error("Error verifying transaction:", transactionError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid transaction",
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

    // Capture PayPal payment
    const captureResponse = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${order_id}/capture`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${access_token}`,
      },
    });

    if (!captureResponse.ok) {
      const captureError = await captureResponse.json();
      console.error("PayPal capture error:", captureError);
      
      // Update transaction status to failed
      await supabase
        .from('wallet_transactions')
        .update({
          payment_status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', transaction_id);
        
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to capture payment",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const captureData = await captureResponse.json();
    
    // Update transaction status to completed
    const { error: updateError } = await supabase
      .from('wallet_transactions')
      .update({
        payment_status: 'completed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction_id);

    if (updateError) {
      console.error("Error updating transaction:", updateError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update transaction status",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update user's wallet balance
    const { error: walletError } = await supabase.rpc(
      'update_wallet_balance',
      {
        p_user_id: user.id,
        p_amount: transaction.amount
      }
    );

    if (walletError) {
      console.error("Error updating wallet balance:", walletError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to update wallet balance",
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
        message: "Payment captured successfully",
        capture_id: captureData.id,
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