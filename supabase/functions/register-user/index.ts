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
    const { email, password, name, role, category } = await req.json()

    // Validate required fields
    if (!email || !password) {
      return new Response(
        JSON.stringify({ success: false, error: 'Email and password are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the origin for the redirect URL
    const origin = req.headers.get('origin') || 'https://mystar.co.il'
    
    // Create user with email confirmation
    const { data, error } = await supabase.auth.admin.createUser({
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
      },
      // Use the main site URL for email confirmation redirect
      email_confirm_redirect_url: 'https://mystar.co.il/auth/callback'
    })

    if (error) {
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // If user is a creator, create a creator profile
    if (role === 'creator' && data.user) {
      const { error: creatorError } = await supabase
        .from('creator_profiles')
        .insert([
          {
            id: data.user.id,
            name: name || '',
            category: category || '',
            bio: '',
            price: 0,
            delivery_time: '24:00:00',
            active: true
          }
        ])

      if (creatorError) {
        console.error('Error creating creator profile:', creatorError)
        // Continue anyway, as the user was created successfully
      }
    }

    // Create user record in public schema
    const { error: userError } = await supabase
      .from('users')
      .insert([
        {
          id: data.user.id,
          email: email,
          name: name || '',
          role: role || 'user',
          status: 'pending', // Will be updated to 'active' after email confirmation
          wallet_balance: 0
        }
      ])

    if (userError) {
      console.error('Error creating user record:', userError)
      // Continue anyway, as the auth user was created successfully
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: data.user,
        message: 'User created successfully. Please check your email to confirm your account.'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in register-user function:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})