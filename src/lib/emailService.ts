import { supabase } from './supabase';

// Function to send a welcome email using the Resend API directly
export async function sendWelcomeEmail(email: string, name: string) {
  try {
    const apiKey = import.meta.env.VITE_RESEND_API_KEY;
    const fromEmail = import.meta.env.VITE_RESEND_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      console.error('Resend API not configured:', { 
        hasApiKey: !!apiKey, 
        hasFromEmail: !!fromEmail 
      });
      return { 
        success: false, 
        error: { message: 'Resend API not configured' } 
      };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: email,
        subject: 'ברוך הבא ל-MyStar!',
        html: `<div dir="rtl">
  <h1>ברוך הבא ל-MyStar, ${name || 'משתמש יקר'}!</h1>
  <p>תודה שנרשמת לאתר. לחץ <a href="${window.location.origin}">כאן</a> כדי להתחבר.</p>
</div>`
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error sending welcome email:', errorData);
      return { success: false, error: errorData };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    console.error('Error in sendWelcomeEmail:', error);
    return { 
      success: false, 
      error: error instanceof Error ? { message: error.message } : { message: 'Unknown error' } 
    };
  }
}

// Function to send a verification email
export async function resendVerificationEmail(email: string) {
  try {
    // Get the base URL without any query parameters or hash
    const baseUrl = window.location.origin;
    
    // Create a complete URL with the correct path
    const redirectTo = `${baseUrl}/auth/callback`;

    // Check if Supabase is properly configured
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.error('Supabase environment variables not configured');
      return { 
        success: false, 
        error: { message: 'Authentication service not properly configured' } 
      };
    }

    // Try using the Edge Function first
    try {
      console.log('Attempting to use edge function for verification email');
      const { data, error } = await supabase.functions.invoke('send-verification-email', {
        body: { email, redirectTo }
      });

      if (error) {
        console.warn('Edge function error, falling back to direct method:', error);
        // Fall through to direct method
      } else if (data?.success) {
        return { success: true };
      }
    } catch (edgeFunctionError) {
      console.warn('Edge function failed, falling back to direct method:', edgeFunctionError);
      // Fall through to direct method
    }

    // Direct method as fallback
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: redirectTo
      }
    });

    if (error) {
      console.error('Error resending verification email:', error);
      
      // Handle rate limiting
      if (error.message?.includes('rate limit') || error.message?.includes('Too many requests')) {
        return { 
          success: false, 
          error: {
            message: 'יותר מדי בקשות. אנא המתן מספר דקות ונסה שוב.',
            isRateLimit: true
          }
        };
      }
      
      return { 
        success: false, 
        error: {
          message: error.message || 'שגיאה בשליחת אימייל אימות',
          details: error
        }
      };
    }

    return { success: true };
  } catch (error) {
    console.error('Error in resendVerificationEmail:', error);
    return { 
      success: false, 
      error: {
        message: 'שגיאת מערכת. אנא נסה שוב מאוחר יותר.',
        details: error
      }
    };
  }
}

// Function to validate email domain for password reset
function isValidEmailForPasswordReset(email: string): boolean {
  const invalidDomains = [
    'example.com',
    'test.com',
    'demo.com',
    'sample.com',
    'fake.com',
    'invalid.com',
    'localhost'
  ];
  
  const domain = email.split('@')[1]?.toLowerCase();
  return domain && !invalidDomains.includes(domain);
}

// Function to send a password reset email
export async function sendPasswordResetEmail(email: string) {
  try {
    console.log('Attempting to send password reset email to:', email);
    
    // Validate email format first
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return { 
        success: false, 
        error: {
          message: 'כתובת אימייל לא תקינה',
          isValidationError: true
        }
      };
    }

    // Check for invalid domains that might cause Resend validation errors
    if (!isValidEmailForPasswordReset(email)) {
      return { 
        success: false, 
        error: {
          message: 'כתובת אימייל זו אינה נתמכת. אנא השתמש בכתובת אימייל אמיתית.',
          isValidationError: true
        }
      };
    }

    // Get the base URL without any query parameters or hash
    const baseUrl = window.location.origin;
    
    // Create a complete URL with the correct path
    const redirectTo = `${baseUrl}/reset-password`;

    // Check if Supabase is properly configured
    if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
      console.error('Supabase environment variables not configured');
      return { 
        success: false, 
        error: {
          message: 'שירות האימות אינו מוגדר כראוי',
          isServiceError: true
        }
      };
    }

    // Try using the Edge Function first
    try {
      console.log('Attempting to use edge function for password reset');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      const { data, error } = await supabase.functions.invoke('send-password-reset', {
        body: { 
          email, 
          redirectTo: 'https://mystar.co.il/reset-password' // Use absolute URL
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (error) {
        console.warn('Edge function error:', error);
        
        // If it's a rate limit error, return it directly
        if (error.message?.includes('rate limit') || error.message?.includes('Too many requests')) {
          return { 
            success: false, 
            error: {
              message: 'יותר מדי בקשות. אנא המתן מספר דקות ונסה שוב.',
              isRateLimit: true
            }
          };
        }
        
        // For other errors, fall through to direct method
        console.warn('Edge function failed, falling back to direct method');
      } else if (data?.success) {
        console.log('Password reset email sent successfully via edge function');
        return { success: true };
      } else if (data?.error) {
        console.warn('Edge function returned error:', data.error);
        
        // Check if it's a configuration issue
        if (data.code === 'email_service_unavailable' || data.code === 'service_config_error') {
          return { 
            success: false, 
            error: {
              message: 'שירות האימייל אינו זמין כרגע. אנא נסה שוב מאוחר יותר.',
              isServiceError: true
            }
          };
        }
        
        // Check for validation errors
        if (data.code === 'invalid_email_format') {
          return { 
            success: false, 
            error: {
              message: 'כתובת אימייל לא תקינה',
              isValidationError: true
            }
          };
        }
        
        // If edge function handled rate limiting gracefully, return success
        if (data.note && (data.note.includes('Rate limited') || data.note.includes('gracefully'))) {
          return { success: true };
        }
        
        // Fall through to direct method for other errors
      }
    } catch (edgeFunctionError) {
      if (edgeFunctionError.name === 'AbortError') {
        console.warn('Edge function request timed out');
        return { 
          success: false, 
          error: {
            message: 'בקשת איפוס הסיסמה נכשלה בשל זמן תגובה ארוך. אנא נסה שוב מאוחר יותר.',
            isTimeoutError: true
          }
        };
      }
      
      console.warn('Edge function failed with exception:', edgeFunctionError);
      // Fall through to direct method
    }

    // Standard Supabase method as fallback
    try {
      console.log('Falling back to direct Supabase resetPasswordForEmail method');
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://mystar.co.il/reset-password' // Use absolute URL
      });
      
      clearTimeout(timeoutId);

      if (error) {
        console.error('Error sending password reset email via direct method:', error);
        
        // Handle rate limiting
        if (error.message.includes('rate limit') || 
            error.message.includes('Too many requests') ||
            error.message.includes('security purposes') ||
            error.message.includes('after 0 seconds')) {
          // For rate limiting, return success to prevent information disclosure
          console.log('Rate limit detected, returning success for security');
          return { success: true };
        }
        
        return { 
          success: false, 
          error: {
            message: error.message || 'שגיאה בשליחת אימייל לאיפוס סיסמה',
            details: error
          }
        };
      }

      console.log('Password reset email sent successfully via direct method');
      return { success: true };
    } catch (directMethodError) {
      if (directMethodError.name === 'AbortError') {
        console.warn('Direct method request timed out');
        return { 
          success: false, 
          error: {
            message: 'בקשת איפוס הסיסמה נכשלה בשל זמן תגובה ארוך. אנא נסה שוב מאוחר יותר.',
            isTimeoutError: true
          }
        };
      }
      
      console.error('Error in direct method:', directMethodError);
      return { 
        success: false, 
        error: {
          message: 'שגיאה בשליחת אימייל לאיפוס סיסמה',
          details: directMethodError
        }
      };
    }
  } catch (error) {
    console.error('Error in sendPasswordResetEmail:', error);
    
    // Handle network or other unexpected errors
    return { 
      success: false, 
      error: {
        message: 'שגיאת רשת או שירות. אנא בדוק את החיבור לאינטרנט ונסה שוב.',
        details: error
      }
    };
  }
}

// Send order confirmation to fan and creator using Resend directly
export async function sendOrderEmails(options: {
  fanEmail: string;
  fanName?: string;
  creatorEmail: string;
  creatorName: string;
  requestType: string;
  orderId: string;
  price: string | number;
  message?: string;
  recipient?: string;
}) {
  try {
    console.log('Invoking send-order-notification edge function...');
    
    const { data, error } = await supabase.functions.invoke('send-order-notification', {
      body: {
        requestId: options.orderId,
        fanEmail: options.fanEmail,
        fanName: options.fanName,
        creatorEmail: options.creatorEmail,
        creatorName: options.creatorName,
        orderType: options.requestType,
        orderPrice: options.price,
        orderMessage: options.message || '',
        recipient: options.recipient || ''
      }
    });

    if (error) {
      console.error('Edge function error:', error);
      
      // Check if it's a FunctionsHttpError with status information
      if (error.message && error.message.includes('non-2xx')) {
        console.error('Edge function returned non-2xx status code');
        return { 
          success: false, 
          error: {
            message: 'Email service temporarily unavailable',
            code: 'edge_function_error',
            details: error
          }
        };
      }
      
      return { 
        success: false, 
        error: {
          message: 'Failed to send email notifications',
          code: 'edge_function_error',
          details: error
        }
      };
    }

    console.log('Edge function response:', data);
    return data as { success: boolean; [key: string]: any };
  } catch (err) {
    console.error('Error invoking send-order-notification:', err);
    
    // Handle network errors or other exceptions
    return { 
      success: false, 
      error: {
        message: 'Network error while sending email notifications',
        code: 'network_error',
        details: err
      }
    };
  }
}

// Invoke Supabase Edge Function to send order notifications to fan and creator
export async function sendOrderNotification(requestId: string) {
  try {
    console.log('Invoking send-order-notification edge function with requestId:', requestId);
    
    const { data, error } = await supabase.functions.invoke('send-order-notification', {
      body: { requestId }
    });

    if (error) {
      console.error('Edge function error:', error);
      
      // Check if it's a FunctionsHttpError with status information
      if (error.message && error.message.includes('non-2xx')) {
        console.error('Edge function returned non-2xx status code');
        return { 
          success: false, 
          error: {
            message: 'Email service temporarily unavailable',
            code: 'edge_function_error',
            details: error
          }
        };
      }
      
      return { 
        success: false, 
        error: {
          message: 'Failed to send email notifications',
          code: 'edge_function_error',
          details: error
        }
      };
    }

    console.log('Edge function response:', data);
    return data as { success: boolean; [key: string]: any };
  } catch (err) {
    console.error('Error invoking send-order-notification:', err);
    
    // Handle network errors or other exceptions
    return { 
      success: false, 
      error: {
        message: 'Network error while sending email notifications',
        code: 'network_error',
        details: err
      }
    };
  }
}