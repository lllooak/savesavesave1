import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface OrderNotificationRequest {
  requestId?: string;
  fanEmail?: string;
  fanName?: string;
  creatorEmail?: string;
  creatorName?: string;
  orderType?: string;
  orderPrice?: number | string;
  orderMessage?: string;
  recipient?: string;
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
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "orders@mystar.co.il";

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("Missing Supabase environment variables");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Server configuration error",
          code: "service_config_error",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!resendApiKey) {
      console.error("Missing Resend API key");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email service not configured",
          code: "email_service_unavailable",
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
    const requestBody = await req.json() as OrderNotificationRequest;
    const { requestId, fanEmail, fanName, creatorEmail, creatorName, orderType, orderPrice, orderMessage, recipient } = requestBody;

    // If requestId is provided, fetch the request details from the database
    let request: any = null;
    let fan: any = null;
    let creator: any = null;
    let finalFanEmail: string | undefined = fanEmail;
    let finalFanName: string | undefined = fanName;
    let finalCreatorEmail: string | undefined = creatorEmail;
    let finalCreatorName: string | undefined = creatorName;
    let finalOrderType: string | undefined = orderType;
    let finalOrderPrice: number | string | undefined = orderPrice;
    let finalOrderMessage: string | undefined = orderMessage;
    let finalRecipient: string | undefined = recipient;

    if (requestId) {
      console.log(`Fetching request details for requestId: ${requestId}`);
      
      // Fetch request details
      const { data: requestData, error: requestError } = await supabase
        .from('requests')
        .select(`
          *,
          creator:creator_profiles!requests_creator_id_fkey(id, name),
          fan:fan_id(id, email, name)
        `)
        .eq('id', requestId)
        .single();

      if (requestError) {
        console.error("Error fetching request:", requestError);
        return new Response(
          JSON.stringify({
            success: false,
            error: "Request not found",
            code: "request_not_found",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      request = requestData;
      
      // Get creator email
      if (request.creator?.id) {
        const { data: creatorData, error: creatorError } = await supabase
          .from('users')
          .select('email')
          .eq('id', request.creator.id)
          .single();

        if (!creatorError && creatorData) {
          creator = creatorData;
        }
      }

      // Set values from database if not provided in request
      finalFanEmail = fanEmail || request.fan?.email;
      finalFanName = fanName || request.fan?.name || request.fan?.email?.split('@')[0] || 'Fan';
      finalCreatorEmail = creatorEmail || creator?.email;
      finalCreatorName = creatorName || request.creator?.name || 'Creator';
      finalOrderType = orderType || request.request_type;
      finalOrderPrice = orderPrice || request.price;
      finalOrderMessage = orderMessage || request.message || '';
      finalRecipient = recipient || request.recipient || '';
    }

    // Validate required fields
    if (!finalFanEmail || !finalCreatorEmail) {
      console.error("Missing required email addresses", { finalFanEmail, finalCreatorEmail });
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required email addresses",
          code: "missing_emails",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send emails using Resend
    let fanEmailSent = false;
    let creatorEmailSent = false;

    try {
      // Send email to fan
      const fanEmailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: finalFanEmail,
          subject: `הזמנתך התקבלה - ${finalOrderType}`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h1 style="color: #eaaf0f;">תודה על הזמנתך!</h1>
              <p>שלום ${finalFanName},</p>
              <p>הזמנתך התקבלה בהצלחה ונשלחה ל${finalCreatorName}.</p>
              <p><strong>פרטי ההזמנה:</strong></p>
              <ul>
                <li>סוג בקשה: ${finalOrderType}</li>
                <li>מחיר: ₪${typeof finalOrderPrice === 'number' ? finalOrderPrice.toFixed(2) : finalOrderPrice}</li>
                ${finalRecipient ? `<li>נמען: ${finalRecipient}</li>` : ''}
              </ul>
              ${finalOrderMessage ? `<p><strong>הודעה:</strong> ${finalOrderMessage}</p>` : ''}
              <p>אנו נעדכן אותך כאשר הסרטון שלך יהיה מוכן.</p>
              <p>בברכה,<br>צוות MyStar</p>
            </div>
          `,
        }),
      });

      if (fanEmailResponse.ok) {
        fanEmailSent = true;
        console.log("Fan email sent successfully");
      } else {
        const fanEmailError = await fanEmailResponse.json();
        console.error("Error sending fan email:", fanEmailError);
      }

      // Send email to creator
      const creatorEmailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: finalCreatorEmail,
          subject: `בקשת וידאו חדשה - ${finalOrderType}`,
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
              <h1 style="color: #eaaf0f;">בקשת וידאו חדשה!</h1>
              <p>שלום ${finalCreatorName},</p>
              <p>קיבלת בקשת וידאו חדשה מ${finalFanName}.</p>
              <p><strong>פרטי הבקשה:</strong></p>
              <ul>
                <li>סוג בקשה: ${finalOrderType}</li>
                <li>מחיר: ₪${typeof finalOrderPrice === 'number' ? finalOrderPrice.toFixed(2) : finalOrderPrice}</li>
                ${finalRecipient ? `<li>נמען: ${finalRecipient}</li>` : ''}
              </ul>
              ${finalOrderMessage ? `<p><strong>הודעה:</strong> ${finalOrderMessage}</p>` : ''}
              <p>אנא היכנס ללוח הבקרה שלך כדי לאשר או לדחות את הבקשה.</p>
              <p>בברכה,<br>צוות MyStar</p>
            </div>
          `,
        }),
      });

      if (creatorEmailResponse.ok) {
        creatorEmailSent = true;
        console.log("Creator email sent successfully");
      } else {
        const creatorEmailError = await creatorEmailResponse.json();
        console.error("Error sending creator email:", creatorEmailError);
      }
    } catch (emailError) {
      console.error("Error sending emails:", emailError);
    }

    // Return success even if emails failed, but include email status
    return new Response(
      JSON.stringify({
        success: true,
        emailSent: fanEmailSent || creatorEmailSent,
        fanEmailSent,
        creatorEmailSent,
        message: "Order notification processed",
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