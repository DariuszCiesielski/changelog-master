import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2, X, Check, MessageSquare, Sparkles, Plus, Trash2, History } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { ChangelogVersion } from '../types';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

interface ChatPanelProps {
  versions: ChangelogVersion[];
  isOpen: boolean;
  onClose: () => void;
}

export function ChatPanel({ versions, isOpen, onClose }: ChatPanelProps) {
  const [selectedVersions, setSelectedVersions] = useState<Set<string>>(new Set());
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load conversations on open
  useEffect(() => {
    if (isOpen) {
      loadConversations();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, currentConversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const loadConversations = async () => {
    try {
      const res = await fetch('/api/conversations');
      const data = await res.json();
      setConversations(data);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    }
  };

  const loadConversation = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      setMessages(
        data.messages.map((m: { id: string; role: string; content: string; created_at: string }) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          created_at: m.created_at,
        }))
      );
      setCurrentConversationId(id);
      setShowHistory(false);
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  }, []);

  const createNewConversation = async () => {
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Chat' }),
      });
      const data = await res.json();
      setCurrentConversationId(data.id);
      setMessages([]);
      setShowHistory(false);
      await loadConversations();
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const deleteConversation = async (id: string) => {
    try {
      await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
      await loadConversations();
      if (currentConversationId === id) {
        setCurrentConversationId(null);
        setMessages([]);
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const saveMessage = async (conversationId: string, role: string, content: string) => {
    try {
      await fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, selectedVersions: Array.from(selectedVersions) }),
      });
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  };

  const toggleVersion = (version: string) => {
    setSelectedVersions((prev) => {
      const next = new Set(prev);
      if (next.has(version)) {
        next.delete(version);
      } else {
        next.add(version);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedVersions(new Set(versions.map((v) => v.version)));
  };

  const clearSelection = () => {
    setSelectedVersions(new Set());
  };

  const getSelectedContext = (): string => {
    const selected = versions.filter((v) => selectedVersions.has(v.version));
    if (selected.length === 0) return '';

    return selected
      .map((v) => {
        const items = v.items.map((item) => `- [${item.type}] ${item.content}`).join('\n');
        return `## Version ${v.version} (${v.date})\n${items}`;
      })
      .join('\n\n');
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    let convId = currentConversationId;

    // Create conversation if needed
    if (!convId) {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: input.slice(0, 50) + (input.length > 50 ? '...' : '') }),
      });
      const data = await res.json();
      convId = data.id;
      setCurrentConversationId(convId);
      await loadConversations();
    }

    const userMessage: Message = {
      id: `temp_${Date.now()}`,
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Save user message
    await saveMessage(convId!, 'user', userMessage.content);

    try {
      const context = getSelectedContext();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          context,
          history: messages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) throw new Error('Failed to get response');

      const data = await response.json();

      const assistantMessage: Message = {
        id: `temp_${Date.now() + 1}`,
        role: 'assistant',
        content: data.response,
        created_at: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, assistantMessage]);

      // Save assistant message
      await saveMessage(convId!, 'assistant', assistantMessage.content);

      // Update conversation title if it's the first message
      if (messages.length === 0) {
        await fetch(`/api/conversations/${convId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: userMessage.content.slice(0, 50) + (userMessage.content.length > 50 ? '...' : '') }),
        });
        await loadConversations();
      }
    } catch (error) {
      console.error('Chat error:', error);
      const errorMessage: Message = {
        id: `temp_${Date.now() + 1}`,
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl h-[85vh] bg-white dark:bg-charcoal-800 rounded-xl shadow-2xl z-50 flex overflow-hidden transition-colors duration-500">
        {/* Conversation History Sidebar */}
        {showHistory && (
          <div className="w-64 border-r border-cream-300 dark:border-charcoal-500 flex flex-col bg-cream-100 dark:bg-charcoal-900">
            <div className="p-4 border-b border-cream-300 dark:border-charcoal-500">
              <button
                onClick={createNewConversation}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-coral-500 hover:bg-coral-600 text-white rounded-xl transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <p className="text-sm text-charcoal-500 dark:text-charcoal-400 text-center py-4">No conversations yet</p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`group flex items-center gap-2 px-3 py-2 rounded-xl mb-1 cursor-pointer transition-colors ${
                      currentConversationId === conv.id
                        ? 'bg-coral-400/20 dark:bg-coral-600/20'
                        : 'hover:bg-cream-200 dark:hover:bg-charcoal-700'
                    }`}
                    onClick={() => loadConversation(conv.id)}
                  >
                    <MessageSquare className="w-4 h-4 text-charcoal-500 dark:text-charcoal-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-charcoal-900 dark:text-cream-50 truncate">{conv.title}</p>
                      <p className="text-xs text-charcoal-500 dark:text-charcoal-400">
                        {conv.message_count} messages
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteConversation(conv.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-coral-400/20 dark:hover:bg-coral-600/20 rounded transition-all"
                    >
                      <Trash2 className="w-3 h-3 text-coral-600" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Version Selector Sidebar */}
        <div className="w-56 border-r border-cream-300 dark:border-charcoal-500 flex flex-col">
          <div className="p-3 border-b border-cream-300 dark:border-charcoal-500">
            <h3 className="font-semibold text-charcoal-900 dark:text-cream-50 text-sm mb-1">Select Releases</h3>
            <p className="text-xs text-charcoal-500 dark:text-charcoal-400 mb-2">
              Tag versions as context
            </p>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="flex-1 text-xs px-2 py-1 bg-coral-400/20 dark:bg-coral-600/20 text-coral-700 dark:text-coral-400 rounded-lg hover:bg-coral-400/30 dark:hover:bg-coral-600/30 transition-colors"
              >
                All
              </button>
              <button
                onClick={clearSelection}
                className="flex-1 text-xs px-2 py-1 bg-cream-200 dark:bg-charcoal-700 text-charcoal-700 dark:text-cream-200 rounded-lg hover:bg-cream-300 dark:hover:bg-charcoal-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1">
            {versions.map((v) => (
              <button
                key={v.version}
                onClick={() => toggleVersion(v.version)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg mb-0.5 transition-colors text-left ${
                  selectedVersions.has(v.version)
                    ? 'bg-coral-400/20 dark:bg-coral-600/20 text-coral-700 dark:text-coral-400'
                    : 'hover:bg-cream-200 dark:hover:bg-charcoal-700 text-charcoal-700 dark:text-cream-200'
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 ${
                    selectedVersions.has(v.version)
                      ? 'bg-coral-500 border-coral-500'
                      : 'border-cream-400 dark:border-charcoal-500'
                  }`}
                >
                  {selectedVersions.has(v.version) && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className="font-mono text-xs">{v.version}</span>
              </button>
            ))}
          </div>
          <div className="p-2 border-t border-cream-300 dark:border-charcoal-500 bg-cream-100 dark:bg-charcoal-700/50">
            <div className="text-xs text-charcoal-500 dark:text-charcoal-400">
              {selectedVersions.size} selected
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b border-cream-300 dark:border-charcoal-500">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-xl transition-colors ${
                  showHistory ? 'bg-coral-400/20 dark:bg-coral-600/20 text-coral-600' : 'hover:bg-cream-200 dark:hover:bg-charcoal-700 text-charcoal-500'
                }`}
                title="Chat history"
              >
                <History className="w-5 h-5" />
              </button>
              <Sparkles className="w-5 h-5 text-coral-500" />
              <h2 className="text-lg font-semibold text-charcoal-900 dark:text-cream-50">
                Changelog Assistant
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={createNewConversation}
                className="p-2 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors text-charcoal-500"
                title="New chat"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-charcoal-500 hover:bg-cream-200 dark:hover:bg-charcoal-700 rounded-xl transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-charcoal-500 dark:text-charcoal-400">
                <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-center mb-2">Ask questions about Claude Code changelogs</p>
                <p className="text-sm text-center opacity-75 mb-6">
                  Select versions on the left to include them as context
                </p>
                <div className="grid grid-cols-1 gap-2 max-w-sm">
                  {[
                    'What breaking changes should I know about?',
                    'Summarize the new features',
                    'What bugs were fixed recently?',
                  ].map((suggestion) => (
                    <button
                      key={suggestion}
                      onClick={() => setInput(suggestion)}
                      className="text-left text-sm px-4 py-2 bg-cream-200 dark:bg-charcoal-700 rounded-xl hover:bg-cream-300 dark:hover:bg-charcoal-600 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                      message.role === 'user'
                        ? 'bg-coral-500 text-white'
                        : 'bg-cream-200 dark:bg-charcoal-700 text-charcoal-900 dark:text-cream-50'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    ) : (
                      <div className="prose prose-sm dark:prose-invert max-w-none prose-p:my-1 prose-ul:my-1 prose-li:my-0 prose-headings:my-2 prose-strong:text-coral-600 dark:prose-strong:text-coral-400">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                    )}
                    <p
                      className={`text-xs mt-1 ${
                        message.role === 'user'
                          ? 'text-coral-200'
                          : 'text-charcoal-500 dark:text-charcoal-400'
                      }`}
                    >
                      {new Date(message.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-cream-200 dark:bg-charcoal-700 rounded-2xl px-4 py-3">
                  <Loader2 className="w-5 h-5 animate-spin text-coral-500" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-cream-300 dark:border-charcoal-500">
            {selectedVersions.size === 0 && (
              <div className="mb-2 text-xs text-coral-600 dark:text-coral-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                Tip: Select versions to give the assistant more context
              </div>
            )}
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about the changelog..."
                rows={1}
                className="flex-1 resize-none bg-cream-100 dark:bg-charcoal-700 border-0 rounded-xl px-4 py-3 text-charcoal-900 dark:text-cream-50 placeholder-charcoal-500 focus:ring-2 focus:ring-teal-500 focus:outline-none transition-colors"
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || isLoading}
                className="px-4 py-2 bg-coral-500 text-white rounded-xl hover:bg-coral-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
