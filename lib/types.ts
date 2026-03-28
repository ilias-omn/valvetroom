export interface User {
  id: string;
  username: string;
  email: string;
  role: 'customer' | 'performer' | 'admin';
  age_verified: number;
  created_at: string;
}

export interface DaySchedule {
  enabled: boolean;
  start: string;
  end: string;
}

// availability is now a map of day name → DaySchedule
export type Availability = Record<string, DaySchedule>;

export interface Performer {
  id: string;
  user_id: string;
  display_name: string;
  bio: string;
  rate_per_minute: number;
  is_online: number;
  is_available: number;
  total_earnings: number;
  avatar_color: string;
  availability?: Availability;
  services?: string[];
  pricing?: Record<string, number>;
  location?: string;
  tagline?: string;
  subscription_price?: number;
  photos?: Array<{ id: string; url: string }>;
  username?: string;
  email?: string;
  created_at?: string;
}

export interface Booking {
  id: string;
  customer_id: string;
  performer_id: string;
  date: string;
  time: string;
  duration_minutes: number;
  note: string;
  status: 'pending' | 'confirmed' | 'rejected' | 'cancelled';
  created_at: string;
  customer_name?: string;
  performer_name?: string;
}

export interface TokenBalance {
  id: string;
  user_id: string;
  balance: number;
}

export interface Call {
  id: string;
  customer_id: string;
  performer_id: string;
  status: 'pending' | 'active' | 'ended' | 'rejected';
  start_time: string | null;
  end_time: string | null;
  duration_seconds: number;
  tokens_charged: number;
  created_at: string;
  performer_name?: string;
  customer_name?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  amount: number;
  type: 'purchase' | 'call_charge' | 'earning' | 'payout';
  description: string;
  created_at: string;
}

export interface Message {
  id: string;
  call_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender_name?: string;
  isSelf?: boolean;
}

export interface PerformerPost {
  id: string;
  performer_id: string;
  title: string;
  description: string;
  created_at: string;
  performer_name?: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  performer_id: string;
  expires_at: string;
  created_at: string;
}

export interface AuthPayload {
  userId: string;
  role: string;
}
