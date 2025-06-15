import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCartStore } from '../stores/cartStore';
import { supabase } from '../lib/supabase';
import { Clock, DollarSign, MessageCircle, Calendar } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import toast from 'react-hot-toast';
import { BookingForm, BookingFormData } from '../components/BookingForm';
import { trackAffiliateBooking } from '../utils/affiliate';
import { sendOrderNotification } from '../lib/emailService';

interface VideoAd {
  id: string;
  title: string;
  description: string;
  price: number;
  duration: string;
  thumbnail_url: string | null;
  sample_video_url: string | null;
  requirements: string | null;
  active: boolean;
  creator: {
    id: string;
    name: string;
    avatar_url: string | null;
  } | null;
}

export function VideoAdDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const [ad, setAd] = useState<VideoAd | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    fetchVideoAd();
    checkUser();
  }, [id, refreshTrigger]);

  // Set up a refresh interval to periodically check for updates
  useEffect(() => {
    const intervalId = setInterval(() => {
      setRefreshTrigger(prev => prev + 1);
    }, 60000); // Refresh every minute
    
    return () => clearInterval(intervalId);
  }, []);

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  }

  async function fetchVideoAd() {
    try {
      if (!id) return;

      const { data, error } = await supabase
        .from('video_ads')
        .select(`
          *,
          creator:creator_profiles(
            id,
            name,
            avatar_url
          )
        `)
        .eq('id', id)
        .eq('active', true)
        .maybeSingle();

      if (error) throw error;
      
      if (!data) {
        toast.error('מודעת הוידאו לא נמצאה');
        navigate('/explore');
        return;
      }

      setAd(data);
    } catch (error: any) {
      console.error('Error fetching video ad:', error);
      toast.error('טעינת פרטי המודעה נכשלה');
      navigate('/explore');
    } finally {
      setLoading(false);
    }
  }

  const handleAddToCart = () => {
    if (!ad || !ad.creator) return;
    
    addItem({
      id: ad.id,
      title: ad.title,
      price: ad.price,
      creator_name: ad.creator.name,
      creator_id: ad.creator.id,
      thumbnail_url: ad.thumbnail_url || undefined,
    });
    
    toast.success('נוסף לסל!');
  };

  const handleBookingSubmit = async (formData: BookingFormData) => {
    if (!user) {
      toast.error('עליך להתחבר כדי להזמין סרטון');
      navigate('/login');
      return;
    }

    if (!ad || !ad.creator) {
      toast.error('מידע חסר על המודעה');
      return;
    }

    setIsSubmitting(true);

    try {
      // Check user wallet balance
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('wallet_balance, email, name')
        .eq('id', user.id)
        .single();

      if (userError) throw userError;

      if (!userData || userData.wallet_balance < ad.price) {
        toast.error('אין מספיק כסף בארנק. אנא טען את הארנק שלך.');
        navigate('/dashboard/fan');
        return;
      }

      // Create request
      const { data: request, error: requestError } = await supabase
        .from('requests')
        .insert({
          creator_id: ad.creator.id,
          fan_id: user.id,
          request_type: formData.request_type,
          status: 'pending',
          price: ad.price,
          message: formData.message,
          deadline: new Date(formData.deadline).toISOString(),
          recipient: formData.recipient
        })
        .select()
        .single();

      if (requestError) throw requestError;

      // Process payment
      const { data: payment, error: paymentError } = await supabase.rpc('process_request_payment', {
        p_request_id: request.id,
        p_fan_id: user.id,
        p_creator_id: ad.creator.id,
        p_amount: ad.price
      });

      if (paymentError || !payment?.success) {
        throw new Error(paymentError?.message || payment?.error || 'Failed to process payment');
      }
      
      // Track affiliate booking if applicable
      await trackAffiliateBooking(user.id, request.id, ad.price);

      // Get creator email
      const { data: creatorData, error: creatorError } = await supabase
        .from('users')
        .select('email')
        .eq('id', ad.creator.id)
        .single();

      if (creatorError) {
        console.error('Error fetching creator email:', creatorError);
      } else {
        // Send email notifications
        try {
          const emailResult = await sendOrderEmails({
            fanEmail: userData.email,
            fanName: userData.name || user.user_metadata?.name || 'Fan',
            creatorEmail: creatorData.email,
            creatorName: ad.creator.name,
            requestType: formData.request_type,
            orderId: request.id,
            price: ad.price,
            message: formData.message,
            recipient: formData.recipient
          });

          if (!emailResult?.success) {
            console.error('Error sending order emails:', emailResult?.error);
          }
        } catch (emailError) {
          console.error('Error sending order emails:', emailError);
        }
      }

      toast.success('ההזמנה בוצעה בהצלחה!');
      
      // Navigate to thank you page with order info
      navigate('/thank-you', { 
        state: { 
          orderComplete: true,
          orderInfo: {
            requestId: request.id,
            creatorName: ad.creator.name,
            price: ad.price,
            requestType: formData.request_type,
            recipient: formData.recipient
          }
        } 
      });
      
    } catch (error: any) {
      console.error('Error submitting booking:', error);
      toast.error(error.message || 'שגיאה בביצוע ההזמנה');
      setIsSubmitting(false);
    }
  };

  // Function to format delivery time to show only hours
  const formatDeliveryTime = (duration: string) => {
    if (!duration) return '';
    
    // If it's already in the format "X hours", extract the hours
    if (duration.includes('hours')) {
      const hours = duration.split(' ')[0];
      return `${hours} שעות`;
    }
    
    // If it's in the format "HH:MM:SS", extract the hours
    if (duration.includes(':')) {
      const hours = parseInt(duration.split(':')[0], 10);
      return `${hours} שעות`;
    }
    
    // If it's just a number, assume it's hours
    if (!isNaN(parseInt(duration, 10))) {
      return `${parseInt(duration, 10)} שעות`;
    }
    
    return duration;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!ad) {
    return (
      <div className="max-w-4xl mx-auto p-4 text-center" dir="rtl">
        <h2 className="text-2xl font-bold text-gray-900">מודעת הוידאו לא נמצאה</h2>
        <p className="mt-2 text-gray-600">מודעת הוידאו שחיפשת לא קיימת או הוסרה.</p>
        <button
          onClick={() => navigate('/explore')}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700"
        >
          חזרה לדף החיפוש
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4" dir="rtl">
      <div className="bg-white rounded-lg shadow-lg overflow-hidden">
        {ad.thumbnail_url && (
          <img 
            src={ad.thumbnail_url} 
            alt={ad.title} 
            className="w-full h-64 object-cover"
          />
        )}
        
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-gray-900">{ad.title}</h1>
            <div className="text-left">
              <p className="text-sm text-gray-500">מחיר</p>
              <p className="text-2xl font-bold text-primary-600">{formatCurrency(ad.price)}</p>
            </div>
          </div>

          {ad.creator && (
            <div className="flex items-center mb-6">
              <img
                src={ad.creator.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(ad.creator.name)}`}
                alt={ad.creator.name}
                className="h-10 w-10 rounded-full object-cover"
              />
              <div className="mr-3">
                <p className="text-sm font-medium text-gray-900">{ad.creator.name}</p>
              </div>
            </div>
          )}
          
          <div className="mb-6">
            <p className="text-gray-600">{ad.description}</p>
          </div>

          <div className="flex items-center mb-6">
            <Clock className="h-5 w-5 text-gray-400 ml-2" />
            <span className="text-gray-600">זמן אספקה: {formatDeliveryTime(ad.duration)}</span>
          </div>

          {ad.requirements && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">דרישות</h2>
              <p className="text-gray-600">{ad.requirements}</p>
            </div>
          )}

          {ad.sample_video_url && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold mb-2">סרטון לדוגמה</h2>
              <div className="aspect-video">
                <video
                  src={ad.sample_video_url}
                  controls
                  className="w-full h-full rounded-lg"
                />
              </div>
            </div>
          )}

          {showBookingForm ? (
            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold mb-4">הזמן סרטון מותאם אישית</h2>
              <BookingForm
                creatorId={ad.creator?.id || ''}
                creatorName={ad.creator?.name || ''}
                price={ad.price}
                onSubmit={handleBookingSubmit}
                onCancel={() => setShowBookingForm(false)}
                isSubmitting={isSubmitting}
              />
            </div>
          ) : (
            <button
              onClick={() => {
                if (!user) {
                  toast.error('עליך להתחבר כדי להזמין סרטון');
                  navigate('/login');
                  return;
                }
                setShowBookingForm(true);
              }}
              className="w-full bg-primary-600 text-white py-3 px-4 rounded-lg hover:bg-primary-700 transition duration-150 flex items-center justify-center"
            >
              הזמן עכשיו
            </button>
          )}
        </div>
      </div>
    </div>
  );
}