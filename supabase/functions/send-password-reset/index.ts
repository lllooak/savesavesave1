import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Password reset request received')
    const { email, redirectTo } = await req.json()

    if (!email) {
      console.error('Email is required but was not provided')
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
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      console.error('Invalid email format:', email)
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
      )
    }

    // Get Supabase credentials from environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials missing:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseServiceKey
      })
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Supabase credentials are not configured',
          code: 'missing_supabase_config'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    console.log('Checking if user exists')
    // Check if user exists first
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers({
      filter: {
        email: email
      }
    })

    if (userError) {
      console.error('Error checking if user exists:', userError)
      return new Response(
        JSON.stringify({
          success: false,
          error: userError.message,
          code: 'user_check_error'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // If no users found with this email, still return success for security reasons
    if (!userData.users || userData.users.length === 0) {
      console.log('No user found with this email, returning success for security')
      return new Response(
        JSON.stringify({
          success: true,
          message: 'If a user with this email exists, a password reset link has been sent',
          note: 'No user found but returning success for security reasons'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        }
      )
    }

    console.log('User found, generating password reset link')
    
    // Determine the correct redirect URL
    const finalRedirectTo = redirectTo || 'https://mystar.co.il/reset-password'
    console.log('Using redirect URL:', finalRedirectTo)
    
    // Generate password reset link
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: finalRedirectTo
      }
    })

    if (error) {
      console.error('Error generating password reset link:', error)
      
      // Check for rate limiting
      if (error.message?.includes('rate limit') || 
          error.message?.includes('Too many requests') ||
          error.message?.includes('for security purposes')) {
        console.log('Rate limiting detected, returning graceful response')
        return new Response(
          JSON.stringify({
            success: true,
            message: 'If a user with this email exists, a password reset link has been sent',
            note: 'Rate limited but returning success for security reasons'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          }
        )
      }
      
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message,
          code: 'generate_link_error'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    console.log('Password reset link generated successfully')
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Password reset email sent successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Unexpected error in send-password-reset function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred',
        code: 'unexpected_error',
        stack: error.stack
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})