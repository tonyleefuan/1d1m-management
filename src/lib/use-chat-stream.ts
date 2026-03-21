'use client'

import { useState, useCallback, useRef } from 'react'

/* ── useChatStream ──────────────────────────────────
 *  SSE 기반 채팅 스트리밍 공통 훅
 *  WorkspaceTab, FloatingChatButton에서 공유
 *
 *  사용법:
 *    const { messages, sending, statusText, streamingMsgId,
 *            sendMessage, stopStreaming, clearMessages } = useChatStream({
 *      userEmail: 'tony@havehad.kr',
 *      profileId: 'uuid',
 *      onSave: (msgs) => saveToStorage(msgs),
 *    })
 * ──────────────────────────────────────────────────── */

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface UseChatStreamOptions {
  userEmail: string
  profileId?: string
  /** 메시지 저장 콜백 (localStorage 등) */
  onSave?: (messages: ChatMessage[]) => void
}

function generateMsgId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function useChatStream({ userEmail, profileId, onSave }: UseChatStreamOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const sendingRef = useRef(false)

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort()
    setSending(false)
    sendingRef.current = false
    setStatusText(null)
    setStreamingMsgId(null)
  }, [])

  const sendMessage = useCallback(async (text: string, history?: ChatMessage[]) => {
    if (!text.trim() || sendingRef.current) return

    sendingRef.current = true
    setSending(true)
    setStatusText(null)

    const userMsg: ChatMessage = { id: generateMsgId(), role: 'user', content: text.trim(), created_at: new Date().toISOString() }
    const streamId = generateMsgId()
    const aiMsg: ChatMessage = { id: streamId, role: 'assistant', content: '', created_at: new Date().toISOString() }
    setStreamingMsgId(streamId)

    const currentMessages = history ?? messages
    const newMsgs = [...currentMessages, userMsg, aiMsg]
    setMessages(newMsgs)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const historyForAPI = currentMessages
        .filter(m => m.content && m.content.trim() && !m.content.startsWith('오류:'))
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }))

      const body: Record<string, unknown> = {
        user_email: userEmail,
        message: text.trim(),
        history: historyForAPI,
      }
      if (profileId) body.profile_id = profileId

      const res = await fetch('/api/workspace/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: '서버 오류' }))
        throw new Error(errData.error || '서버 오류')
      }

      if (!res.body) throw new Error('응답 본문이 비어있습니다')
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'delta') {
              accText += event.text
              setStatusText(null)
              setMessages(prev => prev.map(m => m.id === streamId ? { ...m, content: accText } : m))
            } else if (event.type === 'status') {
              setStatusText(event.text)
            } else if (event.type === 'done') {
              setMessages(prev => {
                const final = prev.map(m => m.id === streamId ? { ...m, content: accText } : m)
                onSave?.(final)
                return final
              })
            } else if (event.type === 'error') {
              throw new Error(event.text)
            }
          } catch (e: any) {
            if (e.message && !e.message.includes('JSON')) throw e
          }
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => { onSave?.(prev); return prev })
      } else {
        setMessages(prev => {
          const updated = prev.map(m => m.id === streamId ? { ...m, content: `오류: ${err.message}` } : m)
          onSave?.(updated)
          return updated
        })
      }
    } finally {
      setSending(false)
      sendingRef.current = false
      setStatusText(null)
      setStreamingMsgId(null)
      abortRef.current = null
    }
  }, [messages, userEmail, profileId, onSave])

  const setMessagesExternal = useCallback((msgs: ChatMessage[]) => {
    if (!sendingRef.current) setMessages(msgs)
  }, [])

  const clearMessages = useCallback(() => {
    setMessages([])
  }, [])

  return {
    messages,
    sending,
    statusText,
    streamingMsgId,
    sendMessage,
    stopStreaming,
    setMessages: setMessagesExternal,
    clearMessages,
    sendingRef,
  }
}
