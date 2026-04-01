export type UserStatus = 'waiting' | 'matched';

export interface User {
  id: string;
  email: string;
  grad_year: number;
  prompt: string | null;
  status: UserStatus;
  pair_id: string | null;
  created_at: string;
}

export interface Pair {
  id: string;
  user1_id: string;
  user2_id: string;
  created_at: string;
}

export interface Message {
  id: string;
  pair_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export interface AuthState {
  userId: string | null;
  email: string | null;
  isLoading: boolean;
}
