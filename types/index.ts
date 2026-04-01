export type UserStatus = 'waiting' | 'matched';
export type ReportStatus = 'open' | 'reviewed' | 'resolved' | 'dismissed';

export interface User {
  id: string;
  email: string;
  grad_year: number;
  prompt: string | null;
  status: UserStatus;
  pair_id: string | null;
  is_banned: boolean;
  created_at: string;
}

export interface Pair {
  id: string;
  user1_id: string;
  user2_id: string;
  active: boolean;
  last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string;
  pair_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface Report {
  id: string;
  reporter_id: string;
  pair_id: string;
  reason: string;
  status: ReportStatus;
  created_at: string;
}

export interface Block {
  id: string;
  blocker_id: string;
  blocked_user_id: string;
  created_at: string;
}

export interface AuthState {
  userId: string | null;
  email: string | null;
  isLoading: boolean;
}
