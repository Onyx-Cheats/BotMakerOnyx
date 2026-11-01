import { useCallback, useEffect, useRef, useState } from 'react'

export interface BotCommand {
  id?: number
  name: string
  response: string
}

export interface BotDraft {
  token: string
  name: string
  description: string
  start: string
  help: string
}

export interface ManagedBot {
  id: string
  telegramUsername: string | null
  name: string
  description: string
  start: string
  help: string
  commands: BotCommand[]
  status: 'draft' | 'provisioning' | 'active' | 'error' | string
  totalMessages: number
  uniqueUsers: number
  lastActivityAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface BotMetrics {
  bots: number
  messages: number
  users: number
  lastActivityAt: string | null
  activity: { week: string; messages: number }[]
}

interface BotAccess {
  botId: string
  key: string
}

interface BotResult {
  bot: ManagedBot
  accessKey?: string
  warning?: string | null
}

const ACCESS_STORAGE_KEY = 'onyx.bot-access.v1'
const BOT_ID_PATTERN = /^[0-9a-f-]{36}$/i
const ACCESS_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const emptyMetrics: BotMetrics = { bots: 0, messages: 0, users: 0, lastActivityAt: null, activity: [] }

async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown; accessKey?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (options.accessKey) headers.authorization = `Bearer ${options.accessKey}`

  const response = await fetch(path, {
    method: options.method || 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const code = typeof payload?.error === 'string' ? payload.error : 'request_failed'
    throw new Error(code)
  }
  return payload as T
}

function parseAccess(value: unknown): BotAccess | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as { botId?: unknown; key?: unknown }
  if (typeof candidate.botId !== 'string' || !BOT_ID_PATTERN.test(candidate.botId)) return null
  if (typeof candidate.key !== 'string' || !ACCESS_KEY_PATTERN.test(candidate.key)) return null
  return { botId: candidate.botId, key: candidate.key }
}

function accessFromFragment(): BotAccess | null {
  const prefix = '#manage='
  if (!window.location.hash.startsWith(prefix)) return null
  const fragment = window.location.hash.slice(prefix.length)
  const separator = fragment.indexOf('.')
  const candidate = separator > 0
    ? parseAccess({ botId: fragment.slice(0, separator), key: fragment.slice(separator + 1) })
    : null
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`)
  return candidate
}

function linkFor(access: BotAccess) {
  return `${window.location.origin}/#manage=${access.botId}.${access.key}`
}

export function useBotServer() {
  const accessRef = useRef<BotAccess | null>(null)
  const [serverReady, setServerReady] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [bot, setBot] = useState<ManagedBot | null>(null)
  const [managementLink, setManagementLink] = useState<string | null>(null)
  const [linkError, setLinkError] = useState(false)
  const [metrics, setMetrics] = useState<BotMetrics | null>(null)
  const [busy, setBusy] = useState(false)

  const setAccess = useCallback((next: BotAccess | null) => {
    accessRef.current = next
    setManagementLink(next ? linkFor(next) : null)
    try {
      if (next) window.sessionStorage.setItem(ACCESS_STORAGE_KEY, JSON.stringify(next))
      else window.sessionStorage.removeItem(ACCESS_STORAGE_KEY)
    } catch {}
  }, [])

  const refresh = useCallback(async () => {
    let healthy = false
    try {
      const health = await fetch('/api/health', { cache: 'no-store', credentials: 'same-origin' })
      healthy = health.ok
    } catch {}
    setServerReady(healthy)
    if (!healthy) {
      setBot(null)
      setMetrics(null)
      setInitialized(true)
      return
    }

    const access = accessRef.current
    if (!access) {
      setBot(null)
      setMetrics(null)
      setInitialized(true)
      return
    }

    try {
      const encodedId = encodeURIComponent(access.botId)
      const [botResult, nextMetrics] = await Promise.all([
        apiRequest<{ bot: ManagedBot }>(`/api/bots/${encodedId}`, { accessKey: access.key }),
        apiRequest<BotMetrics>(`/api/bots/${encodedId}/analytics`, { accessKey: access.key }),
      ])
      setBot(botResult.bot)
      setMetrics(nextMetrics)
      setLinkError(false)
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'bot_access_invalid' || code === 'bot_access_required') {
        setAccess(null)
        setBot(null)
        setMetrics(null)
        setLinkError(true)
      }
    } finally {
      setInitialized(true)
    }
  }, [setAccess])

  useEffect(() => {
    const hadManagementFragment = window.location.hash.startsWith('#manage=')
    let initial = accessFromFragment()
    if (initial) setAccess(initial)
    else if (hadManagementFragment) {
      setAccess(null)
      setLinkError(true)
    } else {
      try { initial = parseAccess(JSON.parse(window.sessionStorage.getItem(ACCESS_STORAGE_KEY) || 'null')) } catch {}
      if (initial) setAccess(initial)
    }
    void refresh()
  }, [refresh, setAccess])

  const deployBot = useCallback(async (
    config: BotDraft,
    commands: BotCommand[],
    selectedBotId: string | null,
  ) => {
    setBusy(true)
    const commandData = commands.map(({ name, response }) => ({ name, response }))
    const configData = {
      name: config.name,
      description: config.description,
      start: config.start,
      help: config.help,
      commands: commandData,
    }
    const currentAccess = accessRef.current

    try {
      let result: BotResult
      let link: string | null = null
      if (config.token.trim()) {
        result = await apiRequest<BotResult>('/api/bots', {
          method: 'POST',
          body: { ...configData, token: config.token.trim() },
        })
        if (!result.accessKey) throw new Error('management_link_unavailable')
        const nextAccess = { botId: result.bot.id, key: result.accessKey }
        setAccess(nextAccess)
        link = linkFor(nextAccess)
      } else if (selectedBotId && currentAccess?.botId === selectedBotId) {
        await apiRequest(`/api/bots/${encodeURIComponent(selectedBotId)}`, {
          method: 'PUT', body: configData, accessKey: currentAccess.key,
        })
        result = await apiRequest<BotResult>(
          `/api/bots/${encodeURIComponent(selectedBotId)}/deploy`,
          { method: 'POST', body: {}, accessKey: currentAccess.key },
        )
        link = linkFor(currentAccess)
      } else {
        throw new Error('token_required')
      }
      setBot(result.bot)
      await refresh()
      return { bot: result.bot, managementLink: link, warning: result.warning || null }
    } finally {
      setBusy(false)
    }
  }, [refresh, setAccess])

  const recoverAccess = useCallback(async (token: string) => {
    setBusy(true)
    try {
      const result = await apiRequest<BotResult>('/api/access/recover', {
        method: 'POST', body: { token: token.trim() },
      })
      if (!result.accessKey) throw new Error('management_link_unavailable')
      const nextAccess = { botId: result.bot.id, key: result.accessKey }
      setAccess(nextAccess)
      setBot(result.bot)
      await refresh()
      return { bot: result.bot, managementLink: linkFor(nextAccess) }
    } finally {
      setBusy(false)
    }
  }, [refresh, setAccess])

  const rotateAccess = useCallback(async () => {
    const access = accessRef.current
    if (!access) throw new Error('bot_access_required')
    setBusy(true)
    try {
      const result = await apiRequest<{ accessKey: string }>(
        `/api/bots/${encodeURIComponent(access.botId)}/access/rotate`,
        { method: 'POST', body: {}, accessKey: access.key },
      )
      const nextAccess = { botId: access.botId, key: result.accessKey }
      setAccess(nextAccess)
      return linkFor(nextAccess)
    } finally {
      setBusy(false)
    }
  }, [setAccess])

  const deactivateBot = useCallback(async (botId: string) => {
    const access = accessRef.current
    if (!access || access.botId !== botId) throw new Error('bot_access_required')
    setBusy(true)
    try {
      await apiRequest(`/api/bots/${encodeURIComponent(botId)}`, {
        method: 'DELETE', accessKey: access.key,
      })
      setAccess(null)
      setBot(null)
      setMetrics(emptyMetrics)
    } finally {
      setBusy(false)
    }
  }, [setAccess])

  const lockAccess = useCallback(() => {
    setAccess(null)
    setBot(null)
    setMetrics(null)
  }, [setAccess])

  return {
    serverReady, initialized, bot, managementLink, linkError, metrics, busy,
    refresh, deployBot, recoverAccess, rotateAccess, deactivateBot, lockAccess,
  }
}
