import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'npm:@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, password, name, role, category } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email and password are required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    if (!supabaseUrl || !supabaseKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Supabase credentials are not configured'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // Create Supabase client with service role key
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Create user with email confirmation required
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // Require email confirmation
      user_metadata: {
        name,
        role,
        category
      },
      app_metadata: {
        role
      }
    })

    if (authError) {
      return new Response(
        JSON.stringify({
          success: false,
          error: authError.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Create user record in public schema
    const userId = authData.user.id
    
    const { error: userError } = await supabase
      .from('users')
      .insert({
        id: userId,
        email,
        name,
        role
      })

    if (userError) {
      console.error('Error creating user record:', userError)
      // Continue anyway, as the auth user was created successfully
    }

    // If role is creator, create creator profile
    if (role === 'creator' && category) {
      const { error: creatorError } = await supabase
        .from('creator_profiles')
        .insert({
          id: userId,
          name,
          category,
          price: 100, // Default price
          delivery_time: '24:00:00', // Default delivery time (24 hours)
          social_links: {}
        })

      if (creatorError) {
        console.error('Error creating creator profile:', creatorError)
        // Continue anyway, as the auth user was created successfully
      }
    }

    // Send verification email with absolute URL to the email confirmation page
    const { error: emailError } = await supabase.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: 'https://mystar.co.il/email-confirmation'
      }
    })

    if (emailError) {
      console.error('Error sending verification email:', emailError)
      // Continue anyway, as the user was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        message: 'Verification email sent. Please check your inbox to confirm your email address.'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in register-user function:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'An unexpected error occurred'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})