import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase, handleAuthCallback } from '../../lib/supabase';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import toast from 'react-hot-toast';

export function EmailConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const confirmEmail = async () => {
      try {
        setLoading(true);
        
        // Parse URL parameters
        const urlParams = new URLSearchParams(location.search);
        const token = urlParams.get('token');
        const type = urlParams.get('type');
        
        console.log('URL params:', { 
          token: token ? token.substring(0, 10) + '...' : null, 
          type 
        });
        
        // Handle auth callback (from hash fragment or query params)
        const { success, error, type: callbackType } = await handleAuthCallback();
        
        console.log('Auth callback result:', { success, type: callbackType, error });
        
        if (success) {
          // If this is a recovery (password reset)
          if (type === 'recovery' || callbackType === 'recovery' || 
              urlParams.get('error_description')?.includes('recovery') ||
              location.hash.includes('type=recovery')) {
            setIsRecovery(true);
            setSuccess(true);
            // Redirect to reset password page
            setTimeout(() => {
              navigate('/reset-password');
            }, 1000);
            return;
          }
          
          // For signup verification
          setSuccess(true);
          toast.success('האימייל אומת בהצלחה!');
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            navigate('/login');
          }, 3000);
          return;
        }
        
        // If we get here, there was an error or no tokens
        if (error) {
          setError(error.message || 'שגיאה באימות האימייל');
        } else {
          setError('לא נמצא טוקן אימות בכתובת URL');
        }
      } catch (error: any) {
        console.error('Error confirming email:', error);
        setError(error.message || 'שגיאה באימות האימייל');
        toast.error('שגיאה באימות האימייל');
      } finally {
        setLoading(false);
      }
    };
    
    confirmEmail();
  }, [location, navigate]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full">
        <div className="text-center">
          {loading ? (
            <>
              <Loader className="h-16 w-16 text-primary-600 mx-auto animate-spin" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">מאמת את האימייל שלך...</h2>
              <p className="mt-2 text-gray-600">אנא המתן בזמן שאנו מאמתים את האימייל שלך.</p>
            </>
          ) : success ? (
            <>
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">
                {isRecovery ? 'אימות הצליח! מעביר לאיפוס סיסמה...' : 'האימייל אומת בהצלחה!'}
              </h2>
              <p className="mt-2 text-gray-600">
                {isRecovery 
                  ? 'אתה מועבר לדף איפוס הסיסמה...' 
                  : 'תודה שאימתת את האימייל שלך. אתה מועבר לדף ההתחברות...'}
              </p>
            </>
          ) : (
            <>
              <XCircle className="h-16 w-16 text-red-500 mx-auto" />
              <h2 className="mt-4 text-2xl font-bold text-gray-900">שגיאה באימות האימייל</h2>
              <p className="mt-2 text-gray-600">{error || 'אירעה שגיאה בלתי צפויה. אנא נסה שוב מאוחר יותר.'}</p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/login')}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                >
                  חזרה לדף ההתחברות
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
