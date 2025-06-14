import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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

    // Create Supabase client
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey)

    // Create user with email confirmation
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
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
    const { error: userError } = await createUserRecord(supabaseUrl, supabaseKey, {
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
      const { error: creatorError } = await createCreatorProfile(supabaseUrl, supabaseKey, {
        id: userId,
        name,
        category
      })

      if (creatorError) {
        console.error('Error creating creator profile:', creatorError)
        // Continue anyway, as the auth user was created successfully
      }
    }

    // Send verification email with redirect to production domain
    const { error: emailError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: 'https://mystar.co.il/auth/callback'
      }
    })

    if (emailError) {
      console.error('Error sending verification email:', emailError)
      // Continue anyway, as the user was created successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})

// Helper to create Supabase client
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    auth: {
      admin: {
        createUser: async (userData: any) => {
          const url = `${supabaseUrl}/auth/v1/admin/users`
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            },
            body: JSON.stringify(userData)
          })

          const data = await res.json()
          if (!res.ok) {
            return { error: data }
          }
          return { data }
        },
        generateLink: async ({ type, email, options }: { type: string, email: string, options?: { redirectTo?: string } }) => {
          const url = `${supabaseUrl}/auth/v1/admin/generate-link`
          const res = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabaseKey}`,
              'apikey': supabaseKey
            },
            body: JSON.stringify({
              type,
              email,
              options
            })
          })

          const data = await res.json()
          if (!res.ok) {
            return { error: data }
          }
          return { data }
        }
      }
    }
  }
}

// Helper to create user record in public schema
async function createUserRecord(supabaseUrl: string, supabaseKey: string, userData: any) {
  const url = `${supabaseUrl}/rest/v1/users`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify(userData)
  })

  if (!res.ok) {
    const error = await res.json()
    return { error }
  }
  return { data: {} }
}

// Helper to create creator profile
async function createCreatorProfile(supabaseUrl: string, supabaseKey: string, profileData: any) {
  const url = `${supabaseUrl}/rest/v1/creator_profiles`
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({
      ...profileData,
      price: 100, // Default price
      delivery_time: '24:00:00', // Default delivery time (24 hours)
      social_links: {}
    })
  })

  if (!res.ok) {
    const error = await res.json()
    return { error }
  }
  return { data: {} }
}