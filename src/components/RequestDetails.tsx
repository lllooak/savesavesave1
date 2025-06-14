import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Video, CheckCircle, X, Send, Check, Calendar, AlertCircle } from 'lucide-react';
import { format, isBefore, differenceInDays } from 'date-fns';
import toast from 'react-hot-toast';

interface RequestDetailsProps {
  request: {
    id: string;
    fan_name?: string;
    fan_id: string;
    request_type: string;
    status: string;
    price: number;
    message?: string;
    deadline: string;
    video_url?: string;
    creator?: {
      name: string;
      avatar_url: string | null;
    };
    recipient?: string;
  };
  onClose: () => void;
  onStatusUpdate: () => void;
}

export function RequestDetails({ request, onClose, onStatusUpdate }: RequestDetailsProps) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);

  // Calculate days remaining until deadline
  const deadlineDate = new Date(request.deadline);
  const today = new Date();
  const daysRemaining = differenceInDays(deadlineDate, today);
  
  // Determine deadline status
  const isPastDeadline = daysRemaining < 0;
  const isCloseToDeadline = daysRemaining >= 0 && daysRemaining <= 2;

  const handleApprove = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('requests')
        .update({ status: 'approved' })
        .eq('id', request.id);

      if (error) throw error;
      
      toast.success('הבקשה אושרה בהצלחה');
      onStatusUpdate();
    } catch (error) {
      console.error('Error approving request:', error);
      toast.error('שגיאה באישור הבקשה');
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('requests')
        .update({ status: 'declined' })
        .eq('id', request.id);

      if (error) throw error;
      
      toast.success('הבקשה נדחתה והכסף הוחזר למעריץ');
      onStatusUpdate();
    } catch (error) {
      console.error('Error declining request:', error);
      toast.error('שגיאה בדחיית הבקשה');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    try {
      if (!videoFile && !request.video_url) {
        setVideoError('נא לבחור קובץ וידאו לפני השלמת הבקשה');
        return;
      }
      
      setLoading(true);
      
      // If there's a new video file, upload it first
      let videoUrl = request.video_url;
      if (videoFile) {
        videoUrl = await handleVideoUpload();
        if (!videoUrl) {
          throw new Error('שגיאה בהעלאת הוידאו');
        }
      }
      
      // Update request with video URL and mark as completed
      const { data: updatedRequest, error: updateError } = await supabase.rpc(
        'complete_request_and_pay_creator',
        { p_request_id: request.id }
      );

      if (updateError) throw updateError;
      
      if (!updatedRequest?.success) {
        throw new Error(updatedRequest?.error || 'שגיאה בהשלמת הבקשה');
      }

      toast.success('הוידאו הועלה והבקשה הושלמה בהצלחה');
      onStatusUpdate();
    } catch (error) {
      console.error('Error completing request:', error);
      toast.error('שגיאה בהשלמת הבקשה');
    } finally {
      setLoading(false);
    }
  };

  const handleVideoUpload = async () => {
    if (!videoFile) {
      setVideoError('נא לבחור קובץ וידאו');
      return null;
    }

    try {
      setUploading(true);
      setVideoError(null);

      // Upload video to storage
      const fileExt = videoFile.name.split('.').pop();
      const filePath = `${request.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError, data } = await supabase.storage
        .from('request-videos')
        .upload(filePath, videoFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('request-videos')
        .getPublicUrl(filePath);

      // Update request with video URL
      const { error: updateError } = await supabase
        .from('requests')
        .update({
          video_url: publicUrl
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      return publicUrl;
    } catch (error) {
      console.error('Error uploading video:', error);
      toast.error('שגיאה בהעלאת הוידאו');
      return null;
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4" dir="rtl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold">פרטי בקשה</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">מעריץ</label>
            <p className="mt-1">{request.fan_name || 'לא ידוע'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">סוג בקשה</label>
            <p className="mt-1">{request.request_type}</p>
          </div>

          {request.recipient && (
            <div>
              <label className="block text-sm font-medium text-gray-700">נמען</label>
              <p className="mt-1">{request.recipient}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">מחיר</label>
            <p className="mt-1">₪{Number(request.price).toFixed(2)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">תאריך יעד</label>
            <div className="flex items-center mt-1">
              <Calendar className={`h-5 w-5 ml-2 ${isPastDeadline ? 'text-red-500' : isCloseToDeadline ? 'text-yellow-500' : 'text-gray-500'}`} />
              <p className={`${isPastDeadline ? 'text-red-600 font-bold' : isCloseToDeadline ? 'text-yellow-600 font-bold' : ''}`}>
                {format(new Date(request.deadline), 'dd/MM/yyyy')}
                {isPastDeadline ? ' (עבר התאריך!)' : 
                 isCloseToDeadline ? ` (${daysRemaining} ימים נותרו)` : 
                 ` (${daysRemaining} ימים נותרו)`}
              </p>
            </div>
          </div>

          {request.message && (
            <div>
              <label className="block text-sm font-medium text-gray-700">הודעה</label>
              <p className="mt-1 p-3 bg-gray-50 rounded-md">{request.message}</p>
            </div>
          )}

          {request.status === 'pending' && (
            <div className="flex space-x-4 space-x-reverse">
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="h-5 w-5 ml-2" />
                אשר בקשה
              </button>
              <button
                onClick={handleDecline}
                disabled={loading}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <X className="h-5 w-5 ml-2" />
                דחה בקשה
              </button>
            </div>
          )}

          {request.status === 'approved' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  העלה וידאו <span className="text-red-500">*</span>
                </label>
                <input
                  type="file"
                  accept="video/*"
                  onChange={(e) => {
                    setVideoFile(e.target.files?.[0] || null);
                    setVideoError(null);
                  }}
                  className={`block w-full text-sm text-gray-500
                     file:ml-4 file:py-2 file:px-4
                     file:rounded-full file:border-0
                     file:text-sm file:font-semibold
                     file:bg-primary-50 file:text-primary-700
                    hover:file:bg-primary-100 ${videoError ? 'border border-red-500 rounded-md' : ''}`}
                />
                {videoError && (
                  <p className="mt-1 text-sm text-red-600">{videoError}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  העלאת וידאו הינה חובה להשלמת הבקשה
                </p>
              </div>
              <div className="flex space-x-4 space-x-reverse">
                <button
                  onClick={handleComplete}
                  disabled={!videoFile && !request.video_url || uploading || loading}
                  className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      מעלה וידאו...
                    </>
                  ) : (
                    <>
                      <Send className="h-5 w-5 ml-2" />
                      {request.video_url ? 'השלם בקשה' : 'שלח וידאו והשלם'}
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {request.status === 'completed' && request.video_url && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                וידאו שנשלח
              </label>
              <video
                src={request.video_url}
                controls
                className="w-full rounded-lg"
                onError={(e) => {
                  console.error('Video error:', e);
                  toast.error('שגיאה בטעינת הוידאו');
                  (e.target as HTMLVideoElement).style.display = 'none';
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
