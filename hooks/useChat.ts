import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Message } from '@/types';

interface UseChatResult {
  messages: Message[];
  isLoading: boolean;
  fetchError: string | null;
  partnerTyping: boolean;
  sendMessage: (content: string) => Promise<{ error: string | null }>;
  sendTyping: () => void;
  retry: () => void;
}

export function useChat(pairId: string | null, userId: string | null): UseChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch initial messages ──────────────────────────────────────────────
  const fetchMessages = useCallback(async () => {
    if (!pairId) return;
    setIsLoading(true);
    setFetchError(null);

    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('pair_id', pairId)
      .order('created_at', { ascending: true });

    if (error) {
      setFetchError('Could not load messages. Check your connection.');
    } else if (data) {
      setMessages(data as Message[]);
    }
    setIsLoading(false);
  }, [pairId]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  // ── Realtime subscription ───────────────────────────────────────────────
  useEffect(() => {
    if (!pairId) return;

    const channel = supabase
      .channel(`chat:${pairId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `pair_id=eq.${pairId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .on('broadcast', { event: 'typing' }, (payload) => {
        if (payload.payload?.sender_id !== userId) {
          setPartnerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [pairId, userId]);

  // ── Send message ────────────────────────────────────────────────────────
  const sendMessage = useCallback(
    async (content: string): Promise<{ error: string | null }> => {
      if (!pairId || !userId) return { error: 'Not connected' };

      const optimisticId = `optimistic-${Date.now()}`;
      const optimistic: Message = {
        id: optimisticId,
        pair_id: pairId,
        sender_id: userId,
        content,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimistic]);

      const { data, error } = await supabase
        .from('messages')
        .insert({ pair_id: pairId, sender_id: userId, content })
        .select()
        .single();

      if (error) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        return { error: 'Message failed to send. Check your connection.' };
      }

      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? (data as Message) : m)),
      );

      return { error: null };
    },
    [pairId, userId],
  );

  // ── Broadcast typing event ──────────────────────────────────────────────
  const sendTyping = useCallback(() => {
    if (!pairId || !userId) return;
    supabase.channel(`chat:${pairId}`).send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender_id: userId },
    });
  }, [pairId, userId]);

  return { messages, isLoading, fetchError, partnerTyping, sendMessage, sendTyping, retry: fetchMessages };
}
