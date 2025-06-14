import React, { useState, useEffect } from 'react';
import { Users, Video, DollarSign, Activity, Wallet, Loader, AlertTriangle } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import { UserBalanceModal } from './UserBalanceModal';
import { checkAdminAccess } from '../../../lib/admin';

interface DashboardStats {
  totalUsers: number;
  activeCreators: number;
  totalRequests: number;
  totalRevenue: number;
  totalWalletBalance: number;
  recentSignups: {
    id: string;
    name: string;
    type: string;
    date: string;
  }[];
  pendingApprovals: {
    creators: number;
    videos: number;
    disputes: number;
  };
  platformHealth: {
    serverLoad: string;
    paymentGateway: string;
    storageUsage: string;
  };
}

export function Overview() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    activeCreators: 0,
    totalRequests: 0,
    totalRevenue: 0,
    totalWalletBalance: 0,
    recentSignups: [],
    pendingApprovals: {
      creators: 0,
      videos: 0,
      disputes: 0
    },
    platformHealth: {
      serverLoad: '0%',
      paymentGateway: 'פעיל',
      storageUsage: '0%'
    }
  });
  const [loading, setLoading] = useState(true);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const hasAccess = await checkAdminAccess();
      setIsAdmin(hasAccess);
      
      if (hasAccess) {
        fetchDashboardStats();
      } else {
        setLoading(false);
      }
    };
    
    checkAccess();
  }, []);

  async function fetchDashboardStats() {
    try {
      setLoading(true);
      
      // Fetch total users count
      const { count: totalUsers, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });
      
      if (usersError) throw usersError;

      // Fetch active creators count
      const { count: activeCreators, error: creatorsError } = await supabase
        .from('creator_profiles')
        .select('*', { count: 'exact', head: true });
      
      if (creatorsError) throw creatorsError;

      // Fetch total requests count
      const { count: totalRequests, error: requestsError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true });
      
      if (requestsError) throw requestsError;

      // Fetch total revenue (sum of completed transactions)
      const { data: revenueData, error: revenueError } = await supabase
        .from('wallet_transactions')
        .select('amount')
        .eq('payment_status', 'completed')
        .eq('type', 'purchase');
      
      if (revenueError) throw revenueError;
      
      const totalRevenue = revenueData?.reduce((sum, transaction) => sum + Number(transaction.amount), 0) || 0;

      // Fetch total wallet balance across all users
      const { data: balanceData, error: balanceError } = await supabase
        .from('users')
        .select('wallet_balance');
        
      if (balanceError) throw balanceError;
      
      const totalWalletBalance = balanceData?.reduce((sum, user) => sum + Number((user.wallet_balance || 0).toFixed(2)), 0) || 0;

      // Fetch recent signups
      const { data: recentUsers, error: recentUsersError } = await supabase
        .from('users')
        .select('id, name, email, role, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (recentUsersError) throw recentUsersError;

      const recentSignups = recentUsers?.map(user => ({
        id: user.id,
        name: user.name || user.email?.split('@')[0] || 'משתמש חדש',
        type: user.role || 'user',
        date: new Date(user.created_at).toLocaleDateString('he-IL')
      })) || [];

      // For pending creators, we'll just count new creator profiles
      const { count: newCreators, error: newCreatorsError } = await supabase
        .from('creator_profiles')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()); // Created in last 24 hours
      
      const creatorsPending = newCreatorsError ? 0 : newCreators || 0;

      // Fetch pending video requests
      const { count: pendingVideos, error: pendingVideosError } = await supabase
        .from('requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (pendingVideosError) throw pendingVideosError;

      // Fetch active disputes (if support_tickets table exists)
      let activeDisputes = 0;
      try {
        const { count: disputes } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');
        
        activeDisputes = disputes || 0;
      } catch (error) {
        console.log('Support tickets table may not exist or have different structure');
      }

      // Update stats state
      setStats({
        totalUsers: totalUsers || 0,
        activeCreators: activeCreators || 0,
        totalRequests: totalRequests || 0,
        totalRevenue,
        totalWalletBalance,
        recentSignups,
        pendingApprovals: {
          creators: creatorsPending,
          videos: pendingVideos || 0,
          disputes: activeDisputes
        },
        platformHealth: {
          serverLoad: '65%', // This would come from a server monitoring system in production
          paymentGateway: 'פעיל',
          storageUsage: '72%' // This would come from storage metrics in production
        }
      });
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast.error('שגיאה בטעינת נתוני לוח הבקרה');
    } finally {
      setLoading(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-center p-8 bg-white rounded-lg shadow-md">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">אין הרשאת גישה</h2>
          <p className="text-gray-600">אין לך הרשאות מנהל לצפות בדף זה.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <Loader className="h-8 w-8 animate-spin text-primary-600" />
        <span className="mr-2 text-gray-600">טוען נתונים...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">סקירה כללית</h1>
        <button 
          onClick={() => setIsBalanceModalOpen(true)}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
        >
          <DollarSign className="h-5 w-5 inline-block ml-1" />
          עדכון יתרת משתמש
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-blue-100 text-blue-600">
                  <Users className="h-6 w-6" />
                </div>
                <div className="mr-4">
                  <p className="text-sm font-medium text-gray-500">סה״כ משתמשים</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalUsers}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-green-100 text-green-600">
                  <Video className="h-6 w-6" />
                </div>
                <div className="mr-4">
                  <p className="text-sm font-medium text-gray-500">יוצרים פעילים</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.activeCreators}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-purple-100 text-purple-600">
                  <Activity className="h-6 w-6" />
                </div>
                <div className="mr-4">
                  <p className="text-sm font-medium text-gray-500">סה״כ בקשות</p>
                  <p className="text-2xl font-semibold text-gray-900">{stats.totalRequests}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-yellow-100 text-yellow-600">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div className="mr-4">
                  <p className="text-sm font-medium text-gray-500">סה״כ הכנסות</p>
                  <p className="text-2xl font-semibold text-gray-900">₪{stats.totalRevenue.toFixed(2)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center">
                <div className="p-3 rounded-full bg-indigo-100 text-indigo-600">
                  <Wallet className="h-6 w-6" />
                </div>
                <div className="mr-4">
                  <p className="text-sm font-medium text-gray-500">סה״כ יתרות ארנק</p>
                  <p className="text-2xl font-semibold text-gray-900">₪{stats.totalWalletBalance.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity and Platform Health */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Signups */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">הרשמות אחרונות</h2>
                {stats.recentSignups.length > 0 ? (
                  <div className="space-y-4">
                    {stats.recentSignups.map((signup) => (
                      <div key={signup.id} className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{signup.name}</p>
                          <p className="text-sm text-gray-500">
                            {signup.type === 'creator' ? 'יוצר' : 
                             signup.type === 'admin' ? 'מנהל' : 'מעריץ'}
                          </p>
                        </div>
                        <p className="text-sm text-gray-500">{signup.date}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-4">אין הרשמות אחרונות</p>
                )}
              </div>
            </div>

            {/* Platform Health */}
            <div className="bg-white rounded-lg shadow">
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">בריאות המערכת</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">עומס שרת</p>
                    <p className="text-sm font-medium text-gray-900">{stats.platformHealth.serverLoad}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">שער תשלומים</p>
                    <p className="text-sm font-medium text-green-600">{stats.platformHealth.paymentGateway}</p>
                  </div>
                  <div className="flex justify-between items-center">
                    <p className="text-sm text-gray-600">שימוש באחסון</p>
                    <p className="text-sm font-medium text-gray-900">{stats.platformHealth.storageUsage}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Pending Approvals */}
          <div className="bg-white rounded-lg shadow">
            <div className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">אישורים בהמתנה</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-gray-600">בקשות יוצרים</p>
                  <p className="text-2xl font-semibold text-blue-600">{stats.pendingApprovals.creators}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-gray-600">סרטונים לבדיקה</p>
                  <p className="text-2xl font-semibold text-green-600">{stats.pendingApprovals.videos}</p>
                </div>
                <div className="p-4 bg-red-50 rounded-lg">
                  <p className="text-sm text-gray-600">פניות פתוחות</p>
                  <p className="text-2xl font-semibold text-red-600">{stats.pendingApprovals.disputes}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <UserBalanceModal 
        isOpen={isBalanceModalOpen}
        onClose={() => setIsBalanceModalOpen(false)}
        onSuccess={() => fetchDashboardStats()}
      />
    </div>
  );
}
