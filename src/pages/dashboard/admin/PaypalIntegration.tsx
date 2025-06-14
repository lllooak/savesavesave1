import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';

export function PaypalIntegration() {
  const [connectionStatus, setConnectionStatus] = useState<'checking' | 'connected' | 'error'>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkConnection = async () => {
    setConnectionStatus('checking');
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.functions.invoke('test-paypal-connection');
      
      if (error) throw error;
      
      if (data.connected) {
        setConnectionStatus('connected');
      } else {
        setConnectionStatus('error');
        setErrorMessage(data.message || 'Could not verify PayPal connection');
      }
    } catch (err) {
      setConnectionStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    }

    setLastChecked(new Date());
  };

  useEffect(() => {
    checkConnection();
  }, []);

  return (
    <div className="p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">שילוב PayPal</h1>
        <p className="text-gray-600">ניהול הגדרות שילוב PayPal והגדרת חשבון מסחר</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">סטטוס חיבור</h2>
          <button
            onClick={checkConnection}
            className="flex items-center text-sm text-gray-600 hover:text-gray-900"
          >
            <RefreshCw className="h-4 w-4 ml-2" />
            רענן בדיקה
          </button>
        </div>

        <div className="flex items-center mb-4">
          {connectionStatus === 'checking' ? (
            <div className="flex items-center text-gray-600">
              <RefreshCw className="h-5 w-5 ml-2 animate-spin" />
              בודק חיבור...
            </div>
          ) : connectionStatus === 'connected' ? (
            <div className="flex items-center text-green-600">
              <CheckCircle className="h-5 w-5 ml-2" />
              מחובר בהצלחה
            </div>
          ) : (
            <div className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 ml-2" />
              שגיאת חיבור
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4">
            {errorMessage}
          </div>
        )}

        {lastChecked && (
          <p className="text-sm text-gray-500">
            נבדק לאחרונה: {lastChecked.toLocaleString('he-IL')}
          </p>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">הגדרות PayPal</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              מזהה לקוח PayPal
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="הזן את מזהה הלקוח שלך"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סוד לקוח PayPal
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
              placeholder="הזן את סוד הלקוח שלך"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              סביבת PayPal
            </label>
            <select
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="sandbox">Sandbox (פיתוח)</option>
              <option value="production">Production (ייצור)</option>
            </select>
          </div>

          <div className="pt-4">
            <button
              className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              שמור הגדרות
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
