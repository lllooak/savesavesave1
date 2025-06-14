// User types
export interface User {
  id: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  name?: string | null;
  status: string;
  wallet_balance: number;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string | null;
  last_seen_at?: string | null;
  login_count?: number;
  failed_login_attempts?: number;
  metadata?: Record<string, any>;
}

// Creator profile types
export interface CreatorProfile {
  id: string;
  name: string;
  category: string;
  bio?: string;
  price: number;
  delivery_time: string;
  avatar_url?: string;
  banner_url?: string;
  social_links?: {
    website?: string;
    facebook?: string;
    twitter?: string;
    instagram?: string;
    youtube?: string;
  };
  created_at?: string;
  updated_at?: string;
}

// Video ad types
export interface VideoAd {
  id: string;
  creator_id: string;
  title: string;
  description?: string;
  price: number;
  duration: string;
  thumbnail_url?: string | null;
  sample_video_url?: string | null;
  requirements?: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Request types
export interface Request {
  id: string;
  creator_id: string;
  fan_id: string;
  request_type: string;
  status: string;
  price: number;
  message?: string;
  deadline: string;
  created_at: string;
  updated_at: string;
}

// Earnings types
export interface Earning {
  id: string;
  creator_id: string;
  request_id: string;
  amount: number;
  status: string;
  created_at: string;
}

// Review types
export interface Review {
  id: string;
  creator_id: string;
  fan_id: string;
  request_id: string;
  rating: number;
  comment?: string;
  created_at: string;
}

// Message types
export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  created_at: string;
}

// Transaction types
export interface Transaction {
  id: string;
  user_id: string;
  type: 'top_up' | 'purchase' | 'refund';
  amount: number;
  payment_method?: string;
  payment_status: 'pending' | 'completed' | 'failed';
  reference_id?: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// Support ticket types
export interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  description: string;
  status: 'open' | 'in-progress' | 'resolved';
  priority: 'low' | 'medium' | 'high';
  assigned_to?: string;
  created_at: string;
  updated_at: string;
}

// Platform config types
export interface PlatformConfig {
  key: string;
  value: any;
  updated_at: string;
  updated_by?: string;
}

// Creator stats
export interface CreatorStats {
  completedRequests: number;
  averageRating: number;
  totalEarnings: number;
}

// Settings types
export interface NotificationSettings {
  email: boolean;
  push: boolean;
  sms: boolean;
}

export interface PrivacySettings {
  profileVisibility: 'public' | 'private';
  showEarnings: boolean;
  allowMessages: boolean;
}

export interface AvailabilitySettings {
  autoAcceptRequests: boolean;
  maxRequestsPerDay: number;
  deliveryTime: number;
}

export interface PaymentSettings {
  minimumPrice: number;
  currency: string;
  paymentMethods?: string[];
}

export interface CreatorSettings {
  notifications: NotificationSettings;
  privacy: PrivacySettings;
  availability: AvailabilitySettings;
  payments: PaymentSettings;
}
