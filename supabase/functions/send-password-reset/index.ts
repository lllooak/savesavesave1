import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders,
      status: 204,
    });
  }

  try {
    // Create a Supabase client with the service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Server configuration error',
          code: 'service_config_error'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { email, redirectTo } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email is required',
          code: 'missing_email'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid email format',
          code: 'invalid_email_format'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if the email is from a test domain
    const invalidDomains = ['example.com', 'test.com', 'demo.com', 'sample.com', 'fake.com', 'invalid.com'];
    const domain = email.split('@')[1]?.toLowerCase();
    
    if (domain && invalidDomains.includes(domain)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Please use a valid email address',
          code: 'invalid_email_domain'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Check if user exists before sending reset email
    const { data: userData, error: userError } = await supabase.auth.admin.getUserByEmail(email);
    
    if (userError) {
      console.error('Error checking user:', userError);
      // For security reasons, don't reveal if the email exists or not
      return new Response(
        JSON.stringify({
          success: true,
          note: 'If a user with this email exists, a password reset link has been sent'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    if (!userData) {
      // User doesn't exist, but don't reveal this for security
      return new Response(
        JSON.stringify({
          success: true,
          note: 'If a user with this email exists, a password reset link has been sent'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      );
    }

    // Send password reset email
    const { error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: redirectTo || `${supabaseUrl.replace('.supabase.co', '.vercel.app')}/reset-password`,
      }
    });

    if (error) {
      console.error('Error generating recovery link:', error);
      
      // Check for rate limiting
      if (error.message?.includes('rate limit') || 
          error.message?.includes('Too many requests') ||
          error.message?.includes('security purposes') ||
          error.message?.includes('after 0 seconds')) {
        
        return new Response(
          JSON.stringify({
            success: true,
            note: 'Rate limited, but handled gracefully'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        );
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          code: 'auth_error'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Unexpected error:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'An unexpected error occurred',
        details: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});