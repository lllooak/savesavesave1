import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ContactFormRequest {
  name: string;
  email: string;
  subject: string;
  message: string;
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
    const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "support@mystar.co.il";
    const supportEmail = Deno.env.get("SUPPORT_EMAIL") || "support@mystar.co.il";

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

    // Create Supabase admin client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { name, email, subject, message } = await req.json() as ContactFormRequest;

    // Validate request
    if (!name || !email || !message) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Name, email, and message are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create support ticket in database
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        subject: subject || 'Contact Form Submission',
        description: message,
        email: email,
        status: 'open',
        priority: 'medium',
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating support ticket:", ticketError);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to create support ticket",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Send email notification if Resend API key is available
    let emailSent = false;
    if (resendApiKey) {
      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromEmail,
            to: supportEmail,
            subject: `New Contact Form: ${subject || 'Contact Form Submission'}`,
            html: `
              <div>
                <h1>New Contact Form Submission</h1>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Subject:</strong> ${subject || 'N/A'}</p>
                <p><strong>Message:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
                <p><strong>Ticket ID:</strong> ${ticket.id}</p>
              </div>
            `,
          }),
        });

        if (emailResponse.ok) {
          emailSent = true;
        } else {
          const emailError = await emailResponse.json();
          console.error("Error sending email notification:", emailError);
        }
      } catch (emailError) {
        console.error("Error sending email notification:", emailError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ticket_id: ticket.id,
        emailSent,
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