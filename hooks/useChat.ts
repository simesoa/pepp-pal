import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { Message } from '@/types';

interface ChatMeta {
  partnerLastReadMessageId: string | null;
  partnerLastReadAt: string | null;
}

interface UseChatResult {
  messages: Message[];
  isLoading: boolean;
  fetchError: string | null;
  partnerTyping: boolean;
  /** Partner read state (null fields when they disabled read receipts) */
  chatMeta: ChatMeta;
  sendMessage: (content: string) => Promise<{ error: string | null }>;
  sendTyping: () => void;
  retry: () => void;
}

/** Human-readable messages for server-side rate limit / cooldown errors. */
function describeSendError(code: string): string {
  switch (code) {
    case 'rate_limited_minute':
      return "You're sending messages too quickly. Try again in a minute.";
    case 'rate_limited_day':
      return "You've hit today's message limit. Take a breather — it resets tomorrow.";
    case 'cooldown_active':
      return "You've tried to share identifying info several times. Take a break and review the anonymity rules.";
    default:
      return 'Message failed to send. Check your connection.';
  }
}

export function useChat(pairId: string | null, userId: string | null): UseChatResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [chatMeta, setChatMeta] = useState<ChatMeta>({
    partnerLastReadMessageId: null,
    partnerLastReadAt: null,
  });
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Read receipts: mark read + fetch partner state ─────────────────────
  const markRead = useCallback(async () => {
    if (!pairId) return;
    // Fire-and-forget; requires migration 006 (ignore errors before it runs)
    supabase.rpc('mark_pair_read', { p_pair_id: pairId }).then(undefined, () => {});
  }, [pairId]);

  const fetchChatMeta = useCallback(async () => {
    if (!pairId) return;
    const { data, error } = await supabase.rpc('get_chat_meta', { p_pair_id: pairId });
    if (!error && data) {
      setChatMeta({
        partnerLastReadMessageId: data.partner_last_read_message_id ?? null,
        partnerLastReadAt: data.partner_last_read_at ?? null,
      });
    }
  }, [pairId]);

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
    markRead();
    fetchChatMeta();
    // Poll partner read state every 10s (no realtime channel on that table)
    const interval = setInterval(fetchChatMeta, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages, markRead, fetchChatMeta]);

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
          // Reading the incoming message right now — mark it read
          if (newMsg.sender_id !== userId) markRead();
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
  }, [pairId, userId, markRead]);

  // ── Send message (server-side send_message RPC: rate limits + push) ────
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

      const { data, error } = await supabase.rpc('send_message', {
        p_pair_id: pairId,
        p_content: content,
      });

      // Server-enforced limits come back as {error: code}, not exceptions
      const limitCode = !error && data && typeof data === 'object' && 'error' in data
        ? String((data as { error: string }).error)
        : null;

      if (error || limitCode) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        if (limitCode) {
          track('rate_limit_hit', { kind: limitCode });
          return { error: describeSendError(limitCode) };
        }
        return { error: describeSendError('') };
      }

      const saved = data as Message;
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? saved : m)),
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

  return {
    messages,
    isLoading,
    fetchError,
    partnerTyping,
    chatMeta,
    sendMessage,
    sendTyping,
    retry: fetchMessages,
  };
}
