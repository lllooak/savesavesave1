// Follow the edge function format
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

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
    const { email, redirectTo } = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Email is required'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Get Supabase client from environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Supabase environment variables not configured'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // Create Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey)

    // Send verification email
    const { error } = await supabaseClient.auth.admin.generateLink({
      type: 'signup',
      email,
      options: {
        redirectTo: redirectTo || `${new URL(req.url).origin}/auth/callback`
      }
    })

    if (error) {
      console.error('Error sending verification email:', error)
      return new Response(
        JSON.stringify({
          success: false,
          error: error.message
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Verification email sent successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})

// Helper to create Supabase client
function createClient(supabaseUrl: string, supabaseKey: string) {
  return {
    auth: {
      admin: {
        generateLink: async ({ type, email, options }: { type: string, email: string, options?: any }) => {
          const url = `${supabaseUrl}/auth/v1/admin/generate_link`
          const response = await fetch(url, {
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

          const data = await response.json()
          if (!response.ok) {
            return { error: data }
          }
          return { data }
        }
      }
    }
  }
}