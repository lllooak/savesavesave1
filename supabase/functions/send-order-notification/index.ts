import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get request data
    const { requestId, fanEmail, fanName, creatorEmail, creatorName, orderType, orderPrice, orderMessage, recipient } = await req.json()

    console.log('Processing order notification request:', {
      requestId,
      fanEmail: !!fanEmail,
      creatorEmail: !!creatorEmail,
      orderType,
      orderPrice
    })

    // If requestId is provided, fetch the request details
    let requestData = null
    let fanData = null
    let creatorData = null
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing Supabase credentials:', { supabaseUrl: !!supabaseUrl, supabaseKey: !!supabaseKey })
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
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    if (requestId) {
      // Fetch request details
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .select(`
          *,
          creator:creator_profiles(name, id),
          fan:fan_id(name, email)
        `)
        .eq('id', requestId)
        .single()

      if (requestError) {
        console.error('Error fetching request:', requestError)
        return new Response(
          JSON.stringify({
            success: false,
            error: `Error fetching request: ${requestError.message}`,
            code: 'request_fetch_error'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      }

      requestData = request

      // Get creator email
      const { data: creator, error: creatorError } = await supabase
        .from('users')
        .select('email')
        .eq('id', request.creator.id)
        .single()

      if (creatorError) {
        console.error('Error fetching creator email:', creatorError)
      } else {
        creatorData = {
          email: creator.email,
          name: request.creator.name
        }
      }

      // Use fan data from the request
      fanData = {
        email: request.fan?.email,
        name: request.fan?.name || 'Fan'
      }
    } else {
      // Use provided data
      creatorData = {
        email: creatorEmail,
        name: creatorName
      }
      
      fanData = {
        email: fanEmail,
        name: fanName || 'Fan'
      }
    }

    // Get Resend API key from environment - check multiple possible variable names
    const resendApiKey = Deno.env.get('RESEND_API_KEY') || Deno.env.get('VITE_RESEND_API_KEY')
    const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || Deno.env.get('VITE_RESEND_FROM_EMAIL') || 'orders@mystar.co.il'

    console.log('Environment check:', {
      resendApiKey: !!resendApiKey,
      fromEmail,
      envVarCount: Object.keys(Deno.env.toObject()).length
    })

    if (!resendApiKey) {
      console.error('RESEND_API_KEY not configured in environment variables')
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Email service not configured - missing API key',
          code: 'missing_resend_config',
          debug: {
            availableEnvVars: Object.keys(Deno.env.toObject()),
            resendApiKey: !!resendApiKey,
            fromEmail
          }
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Prepare email data
    const request = requestData || {
      id: requestId || 'N/A',
      request_type: orderType || 'N/A',
      price: orderPrice || 'N/A',
      message: orderMessage || 'N/A',
      recipient: recipient || 'N/A'
    }

    // Send email to creator
    let creatorEmailSent = false
    let creatorEmailError = null
    if (creatorData?.email) {
      try {
        console.log('Sending email to creator:', creatorData.email)
        const creatorEmailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: creatorData.email,
            subject: `הזמנה חדשה מ-${fanData?.name || 'מעריץ'} - MyStar`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h1 style="color: #eaaf0f;">הזמנה חדשה!</h1>
                <p>שלום ${creatorData.name},</p>
                <p>קיבלת הזמנה חדשה מ-${fanData?.name || 'מעריץ'}.</p>
                
                <div style="background-color: #f9f9f9; border-right: 4px solid #eaaf0f; padding: 15px; margin: 20px 0;">
                  <h2 style="margin-top: 0;">פרטי ההזמנה:</h2>
                  <ul style="list-style-type: none; padding: 0;">
                    <li><strong>סוג בקשה:</strong> ${request.request_type}</li>
                    <li><strong>מחיר:</strong> ₪${request.price}</li>
                    ${request.recipient ? `<li><strong>נמען:</strong> ${request.recipient}</li>` : ''}
                    <li><strong>הוראות:</strong> ${request.message}</li>
                  </ul>
                </div>
                
                <p>כדי לצפות בהזמנה ולהתחיל לעבוד עליה, היכנס ללוח הבקרה שלך:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://mystar.co.il/dashboard/creator" style="background-color: #eaaf0f; color: #000; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold;">צפה בהזמנה</a>
                </div>
                
                <p>זכור, ככל שתספק את הסרטון מהר יותר, כך תקבל דירוג גבוה יותר ותגדיל את הסיכויים להזמנות נוספות!</p>
                
                <p>בברכה,<br>צוות MyStar</p>
              </div>
            `
          })
        })

        if (!creatorEmailResponse.ok) {
          const errorData = await creatorEmailResponse.json()
          console.error('Error sending creator email:', errorData)
          creatorEmailError = errorData
        } else {
          creatorEmailSent = true
          console.log('Creator email sent successfully')
        }
      } catch (emailError) {
        console.error('Error sending creator email:', emailError)
        creatorEmailError = emailError.message
      }
    }

    // Send confirmation email to fan
    let fanEmailSent = false
    let fanEmailError = null
    if (fanData?.email) {
      try {
        console.log('Sending email to fan:', fanData.email)
        const fanEmailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromEmail,
            to: fanData.email,
            subject: `אישור הזמנה - MyStar`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h1 style="color: #eaaf0f;">תודה על הזמנתך!</h1>
                <p>שלום ${fanData.name},</p>
                <p>אנו מאשרים שהזמנתך התקבלה בהצלחה ונשלחה ל-${creatorData?.name || 'יוצר'}.</p>
                
                <div style="background-color: #f9f9f9; border-right: 4px solid #eaaf0f; padding: 15px; margin: 20px 0;">
                  <h2 style="margin-top: 0;">פרטי ההזמנה:</h2>
                  <ul style="list-style-type: none; padding: 0;">
                    <li><strong>סוג בקשה:</strong> ${request.request_type}</li>
                    <li><strong>מחיר:</strong> ₪${request.price}</li>
                    ${request.recipient ? `<li><strong>נמען:</strong> ${request.recipient}</li>` : ''}
                  </ul>
                </div>
                
                <p>תוכל לעקוב אחר סטטוס ההזמנה שלך בלוח הבקרה:</p>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://mystar.co.il/dashboard/fan" style="background-color: #eaaf0f; color: #000; text-decoration: none; padding: 12px 24px; border-radius: 4px; font-weight: bold;">צפה בהזמנה שלי</a>
                </div>
                
                <p>אנו נעדכן אותך כאשר הסרטון שלך יהיה מוכן להורדה.</p>
                
                <p>בברכה,<br>צוות MyStar</p>
              </div>
            `
          })
        })

        if (!fanEmailResponse.ok) {
          const errorData = await fanEmailResponse.json()
          console.error('Error sending fan email:', errorData)
          fanEmailError = errorData
        } else {
          fanEmailSent = true
          console.log('Fan email sent successfully')
        }
      } catch (emailError) {
        console.error('Error sending fan email:', emailError)
        fanEmailError = emailError.message
      }
    }

    // Return success even if emails failed, but include error details
    const response = {
      success: true,
      creatorEmailSent,
      fanEmailSent,
      message: 'Order notification processed',
      errors: {
        creatorEmailError,
        fanEmailError
      },
      debug: {
        hasResendApiKey: !!resendApiKey,
        fromEmail,
        creatorEmail: creatorData?.email,
        fanEmail: fanData?.email
      }
    }

    console.log('Returning response:', {
      success: response.success,
      creatorEmailSent: response.creatorEmailSent,
      fanEmailSent: response.fanEmailSent,
      hasErrors: !!(response.errors.creatorEmailError || response.errors.fanEmailError)
    })

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in send-order-notification function:', error)
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