'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { useChatStream, type ChatMessage } from '@/lib/use-chat-stream'
import { Button } from './button'
import { ScrollArea } from './scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { MessageSquare, Send, Square, Copy, Check, ThumbsUp, ThumbsDown, Minimize2 } from 'lucide-react'

/* ── FloatingChatButton ──────────────────────────
 *  각 탭 우하단에 표시되는 AI 채팅 버튼 + 사이드 패널
 *  chatbot_profiles 테이블에 활성 프로파일이 있는 탭에서만 표시
 *
 *  사용법:
 *    <FloatingChatButton tabId="products" userEmail="tony@havehad.kr" />
 * ──────────────────────────────────────────────────── */

interface StarterItem {
  label: string
  message: string
}

interface ChatbotProfile {
  id: string
  name: string
  tab_id: string
  model: string
  max_tokens: number
  starters?: StarterItem[]
  input_guides?: { context: string; guide_text: string }[]
}

interface FloatingChatButtonProps {
  tabId: string
  userEmail: string
  className?: string
}

// ── localStorage 캐시 (탭별) ──

function loadMessages(tabId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`fc_msgs_${tabId}`)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveMessagesToStorage(tabId: string, msgs: ChatMessage[]) {
  try {
    localStorage.setItem(`fc_msgs_${tabId}`, JSON.stringify(msgs.slice(-50)))
  } catch {}
}

export function FloatingChatButton({ tabId, userEmail, className }: FloatingChatButtonProps) {
  const [profile, setProfile] = useState<ChatbotProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [feedbacks, setFeedbacks] = useState<Record<string, 'up' | 'down' | undefined>>({})

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const justSentRef = useRef(false)

  // ── useChatStream 훅 ──
  const {
    messages, sending, statusText, streamingMsgId,
    sendMessage, stopStreaming, setMessages, clearMessages,
  } = useChatStream({
    userEmail,
    profileId: profile?.id,
    onSave: (msgs) => saveMessagesToStorage(tabId, msgs),
  })

  // ── 프로파일 로드 ──
  useEffect(() => {
    let cancelled = false
    async function loadProfile() {
      try {
        const res = await fetch(`/api/workspace/chat/profile?tab_id=${tabId}`)
        if (!res.ok) { setProfileLoaded(true); return }
        const json = await res.json()
        if (!cancelled && json.profile) setProfile(json.profile)
      } catch {}
      if (!cancelled) setProfileLoaded(true)
    }
    setProfile(null)
    setProfileLoaded(false)
    loadProfile()
    return () => { cancelled = true }
  }, [tabId])

  // ── 메시지 로드 (탭 변경 시) ──
  useEffect(() => {
    setMessages(loadMessages(tabId))
  }, [tabId, setMessages])

  // ── 스크롤 ──
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── 패널 열릴 때 포커스 ──
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 100)
  }, [open])

  // ── 전송 ──
  const handleSend = useCallback(() => {
    if (!input.trim() || !profile) return
    const text = input.trim()
    justSentRef.current = true
    setInput('')
    if (textareaRef.current) { textareaRef.current.value = ''; textareaRef.current.style.height = 'auto' }
    setTimeout(() => { justSentRef.current = false }, 100)
    sendMessage(text)
  }, [input, profile, sendMessage])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.nativeEvent.isComposing || composingRef.current) return
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }, [handleSend])

  const handleClearChat = useCallback(() => {
    clearMessages()
    saveMessagesToStorage(tabId, [])
  }, [tabId, clearMessages])

  // 프로파일 없으면 버튼 숨김
  if (!profileLoaded || !profile) return null

  const userInitial = userEmail.charAt(0).toUpperCase()

  return (
    <>
      {/* 플로팅 버튼 */}
      {!open && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setOpen(true)}
                className={cn(
                  'fixed bottom-6 right-6 z-50 flex h-12 w-12 items-center justify-center rounded-full',
                  'bg-hh-blue text-white shadow-lg transition-all hover:scale-105 hover:shadow-xl',
                  'active:scale-95',
                  className,
                )}
              >
                <MessageSquare className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">
              <p>{profile.name}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}

      {/* 채팅 패널 */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[560px] w-[380px] flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-2xl">
          {/* 헤더 */}
          <div className="flex items-center gap-2.5 border-b border-border-light px-4 py-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-hh-blue to-hh-green">
              <MessageSquare className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{profile.name}</div>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleClearChat}
                  className="h-7 w-7 text-muted-foreground"
                  title="대화 초기화"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M2 4h12M5 4V2.5A.5.5 0 015.5 2h5a.5.5 0 01.5.5V4M6 7v5M10 7v5M3 4l1 10a1 1 0 001 1h6a1 1 0 001-1l1-10" />
                  </svg>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                className="h-7 w-7 text-muted-foreground"
              >
                <Minimize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* 메시지 영역 */}
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-bg border border-blue-200">
                    <span className="text-xs font-extrabold text-hh-blue">AI</span>
                  </div>
                  <div className="text-sm font-medium mb-1">무엇을 도와드릴까요?</div>
                  <div className="text-xs text-muted-foreground max-w-[240px] mb-4">
                    이 탭의 데이터를 조회하고 분석할 수 있어요
                  </div>
                  {profile.starters && profile.starters.length > 0 && (
                    <div className="w-full space-y-1.5 px-2">
                      {profile.starters.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s.message)}
                          className="w-full rounded-lg border border-border-light px-3 py-2 text-left text-[13px] text-[#444] transition-colors hover:border-hh-blue hover:bg-blue-bg hover:text-hh-blue"
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={cn(
                    'ws-msg-group flex gap-2',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  <div className={cn(
                    'flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-[9px] font-bold',
                    msg.role === 'user'
                      ? 'bg-hh-blue text-white'
                      : 'bg-blue-bg border border-blue-200 text-hh-blue',
                  )}>
                    {msg.role === 'user' ? userInitial : 'AI'}
                  </div>

                  <div className="max-w-[85%] min-w-0">
                    {msg.role === 'user' ? (
                      <div className="rounded-xl rounded-br-sm bg-hh-blue px-3 py-2 text-[13px] text-white leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="text-[13px] leading-relaxed">
                        <div className="ws-markdown">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                        {streamingMsgId === msg.id && sending && msg.content.length > 0 && (
                          <span className="ws-stream-cursor" />
                        )}
                        {msg.content && streamingMsgId !== msg.id && (
                          <div className="ws-msg-actions mt-1 flex gap-0.5">
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(msg.content)
                                setCopiedId(msg.id)
                                setTimeout(() => setCopiedId(null), 2000)
                              }}
                              className="ws-action-btn !h-6 !w-6"
                              title="복사"
                            >
                              {copiedId === msg.id
                                ? <Check className="h-3 w-3 text-emerald-500" />
                                : <Copy className="h-3 w-3" />}
                            </button>
                            <button
                              onClick={() => setFeedbacks(prev => ({ ...prev, [msg.id]: prev[msg.id] === 'up' ? undefined : 'up' }))}
                              className="ws-action-btn !h-6 !w-6"
                              style={{ color: feedbacks[msg.id] === 'up' ? '#2959FD' : undefined }}
                              title="좋은 답변"
                            >
                              <ThumbsUp className="h-3 w-3" fill={feedbacks[msg.id] === 'up' ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              onClick={() => setFeedbacks(prev => ({ ...prev, [msg.id]: prev[msg.id] === 'down' ? undefined : 'down' }))}
                              className="ws-action-btn !h-6 !w-6"
                              style={{ color: feedbacks[msg.id] === 'down' ? '#FD5046' : undefined }}
                              title="개선 필요"
                            >
                              <ThumbsDown className="h-3 w-3" fill={feedbacks[msg.id] === 'down' ? 'currentColor' : 'none'} />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    <div className={cn(
                      'ws-msg-time mt-0.5 text-[10px] text-muted-foreground',
                      msg.role === 'user' ? 'text-right' : 'text-left',
                    )}>
                      {new Date(msg.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}

              {statusText && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground pl-8">
                  <span className="ws-status-spinner" />
                  {statusText}
                </div>
              )}

              {sending && streamingMsgId && messages.find(m => m.id === streamingMsgId)?.content === '' && !statusText && (
                <div className="flex gap-2">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-blue-bg border border-blue-200">
                    <span className="text-[9px] font-extrabold text-hh-blue">AI</span>
                  </div>
                  <div className="flex items-center gap-1 rounded-xl border border-border-light px-3 py-2">
                    <span className="ws-typing-dot" />
                    <span className="ws-typing-dot" />
                    <span className="ws-typing-dot" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {/* 입력 영역 */}
          <div className="border-t border-border-light px-3 py-2">
            <div className="ws-compose flex items-end gap-1 px-3 py-1">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { if (!justSentRef.current) setInput(e.target.value) }}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={() => { composingRef.current = false }}
                onKeyDown={handleKeyDown}
                placeholder="질문을 입력하세요..."
                rows={1}
                className="flex-1 resize-none border-none bg-transparent py-2 text-[13px] leading-snug outline-none placeholder:text-muted-foreground"
                style={{ maxHeight: 80 }}
                onInput={e => {
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = Math.min(el.scrollHeight, 80) + 'px'
                }}
              />
              {sending ? (
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={stopStreaming}
                  className="h-8 w-8 flex-shrink-0 rounded-lg"
                  title="응답 중지"
                >
                  <Square className="h-3 w-3" fill="currentColor" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  onClick={handleSend}
                  disabled={!input.trim()}
                  className="h-8 w-8 flex-shrink-0 rounded-lg"
                  title="전송"
                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <div className="mt-1 text-center text-[10px] text-[#ccc]">
              AI 응답은 부정확할 수 있습니다
            </div>
          </div>
        </div>
      )}
    </>
  )
}
