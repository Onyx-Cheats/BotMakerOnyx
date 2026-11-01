import { useState } from 'react'
import {
  Activity, Bot, Check, CircleHelp, Copy, Link2, MessageCircle, Rocket, Shield, Trash2, Users,
} from 'lucide-react'
import type { BotCommand, BotDraft, BotMetrics, ManagedBot } from '@/lib/useBotServer'

export function ServerAccount({
  serverReady,
  bot,
  busy,
  onLock,
}: {
  serverReady: boolean
  bot: ManagedBot | null
  busy: boolean
  onLock: () => void
}) {
  return <div className="flex flex-wrap items-center justify-end gap-2">
    <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground" role="status">
      <span className={`size-1.5 rounded-full ${serverReady ? 'bg-primary' : 'bg-amber-400'}`} />
      {serverReady ? 'Bot server ready' : 'Connecting to server'}
    </div>
    {bot ? <>
      <span className="hidden max-w-36 truncate text-xs text-muted-foreground sm:inline" title={bot.name}>Private link · {bot.name}</span>
      <button type="button" onClick={onLock} disabled={busy} className="min-h-10 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50">Lock tab</button>
    </> : <span className="hidden text-xs text-muted-foreground sm:inline">No private link open</span>}
  </div>
}

export function LiveAnalyticsPanel({ bot, metrics }: { bot: ManagedBot | null; metrics: BotMetrics | null }) {
  if (!bot) return <div className="rounded-2xl border border-border bg-card/75 p-6 text-sm text-muted-foreground">Open this bot’s private management link to view its live analytics. No sample numbers are shown.</div>
  if (!metrics) return <div className="rounded-2xl border border-border bg-card/75 p-6 text-sm text-muted-foreground">Waiting for the bot server to return live analytics.</div>

  const weeks = metrics.activity.slice(-12)
  const highest = Math.max(1, ...weeks.map((week) => week.messages))
  const hasActivity = weeks.some((week) => week.messages > 0)
  return <div className="space-y-5">
    <div className="grid gap-4 sm:grid-cols-2">
      <MetricCard icon={Users} label="Unique chats" value={metrics.users.toLocaleString()} detail={bot.name} />
      <MetricCard icon={MessageCircle} label="Messages received" value={metrics.messages.toLocaleString()} detail={bot.telegramUsername ? `@${bot.telegramUsername}` : 'Live totals'} />
    </div>
    <div className="rounded-2xl border border-border bg-card/75 p-5 sm:p-7">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-semibold">Message activity</h2><p className="mt-1 text-sm text-muted-foreground">Incoming messages · last 12 weeks</p></div>
        <span className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Live data</span>
      </div>
      {hasActivity ? <div className="flex h-48 items-end gap-2 sm:gap-4">
        {weeks.map((week, index) => <div key={`${week.week}-${index}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-3">
          <div className="w-full max-w-12 rounded-t-md bg-primary/70 transition-colors hover:bg-primary" style={{ height: `${Math.max(5, Math.round((week.messages / highest) * 100))}%` }} title={`${week.messages.toLocaleString()} messages · ${week.week}`} />
          <span className="text-[10px] text-muted-foreground">{week.week.slice(-2)}</span>
        </div>)}
      </div> : <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">No messages yet. Activity will appear here after someone sends a command to your bot.</div>}
      <div className="mt-6 flex items-center gap-2 border-t border-border pt-4 text-xs text-muted-foreground"><span className="size-2 rounded-sm bg-primary" />Messages received <span className="ml-auto">{metrics.lastActivityAt ? `Last activity ${new Date(metrics.lastActivityAt).toLocaleString()}` : 'Waiting for first activity'}</span></div>
    </div>
  </div>
}

export function ConnectedDeployPanel({
  config,
  commands,
  bot,
  serverReady,
  managementLink,
  busy,
  onNewBot,
  onRetry,
  onDeploy,
  onRecover,
  onRotateLink,
  onDeactivate,
}: {
  config: BotDraft
  commands: BotCommand[]
  bot: ManagedBot | null
  serverReady: boolean
  managementLink: string | null
  busy: boolean
  onNewBot: () => void
  onRetry: () => void
  onDeploy: () => void
  onRecover: () => void
  onRotateLink: () => void
  onDeactivate: () => void
}) {
  const [copied, setCopied] = useState(false)
  const checks = [
    { label: 'Bot name', done: Boolean(config.name.trim()) },
    { label: 'BotFather token', done: Boolean(config.token.trim() || bot) },
    { label: 'Welcome message', done: Boolean(config.start.trim()) },
    { label: 'Help message', done: Boolean(config.help.trim()) },
  ]
  const canDeploy = import.meta.env.PROD && serverReady && Boolean(config.name.trim()) && Boolean(config.start.trim()) && Boolean(config.help.trim()) && Boolean(config.token.trim() || bot)

  const copyLink = async () => {
    if (!managementLink) return
    try {
      await navigator.clipboard.writeText(managementLink)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card/75 p-5 sm:p-7">
        <div className="mb-6 flex items-start gap-4"><span className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary"><Rocket className="size-5" /></span><div><h2 className="text-lg font-semibold">Connect your Telegram bot</h2><p className="mt-1 text-sm text-muted-foreground">Save your settings, register a secure webhook, and start replying to commands. No account sign-in required.</p></div></div>

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background/40 px-4 py-3">
          <div className="flex items-center gap-3"><Link2 className="size-4 text-primary" /><div><p className="text-sm font-medium">{bot ? bot.name : 'No bot link loaded'}</p><p className="text-xs text-muted-foreground">{bot?.telegramUsername ? `@${bot.telegramUsername}` : bot ? 'Private management link active in this tab' : 'Deploy a bot or open its private link'}</p></div></div>
          <div className="flex items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs ${bot?.status === 'active' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{bot?.status === 'active' ? 'Webhook active' : bot?.status || 'Not connected'}</span><button type="button" onClick={onNewBot} disabled={busy} className="min-h-10 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground transition hover:bg-accent disabled:opacity-50">New bot</button></div>
        </div>

        <div className="space-y-3">{checks.map(({ label, done }) => <div key={label} className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3"><span className={`flex size-6 items-center justify-center rounded-full ${done ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'}`}>{done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}</span><span className="text-sm">{label}</span><span className={`ml-auto text-xs ${done ? 'text-primary' : 'text-muted-foreground'}`}>{done ? 'Ready' : 'Add in setup'}</span></div>)}
          <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 px-4 py-3"><span className={`size-2 rounded-full ${serverReady ? 'bg-primary' : 'bg-amber-400'}`} /><span className="text-sm">Bot server</span><span className={`ml-auto text-xs ${serverReady ? 'text-primary' : 'text-amber-200'}`}>{serverReady ? 'Connected' : 'Not ready'}</span>{!serverReady && <button type="button" onClick={onRetry} className="text-xs text-primary underline underline-offset-2">Retry</button>}</div>
        </div>

        {!import.meta.env.PROD && <div className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">Preview is read-only for bot changes. Open the published website to create a bot, recover or rotate its link, or change its webhook.</div>}
        {managementLink && <div className="mt-5 rounded-xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Shield className="size-4 text-primary" />Private management link</div><div className="mt-3 flex gap-2"><input aria-label="Private management link" readOnly value={managementLink} onFocus={(event) => event.currentTarget.select()} className="min-h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 font-mono text-xs text-foreground" /><button type="button" onClick={() => void copyLink()} className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 text-xs font-semibold text-primary hover:bg-primary/20"><Copy className="size-3.5" />{copied ? 'Copied' : 'Copy'}</button></div><p className="mt-3 text-xs leading-5 text-muted-foreground">Keep this link private: anyone who has it can manage this bot. The key is not stored in ONYX and the link is not recoverable unless you still have it or re-enter this bot’s BotFather token.</p><button type="button" onClick={onRotateLink} disabled={busy || !bot || !import.meta.env.PROD} className="mt-3 min-h-10 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-accent disabled:opacity-50">Rotate link and revoke the old one</button></div>}

        <div className="mt-5 rounded-xl border border-border bg-background/40 p-4"><div className="flex items-start gap-2"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-sm font-medium">Lost the management link?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Enter the matching BotFather token in Setup, then recover access. ONYX verifies it with Telegram and issues a new link that invalidates the old one.</p><button type="button" onClick={onRecover} disabled={busy || !serverReady || !config.token.trim() || !import.meta.env.PROD} className="mt-3 min-h-10 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-50">Recover access with this token</button></div></div></div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground"><Shield className="mt-0.5 size-4 shrink-0 text-primary" /><p>BotFather tokens are encrypted at rest and never returned to the browser after saving. A new management link is shown after successful bot creation. No bot is live until a valid token is entered and Telegram accepts its webhook.</p></div>

        <button type="button" onClick={onDeploy} disabled={busy || !canDeploy} className="mt-6 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-base font-bold text-primary-foreground shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_25%,transparent)] transition hover:-translate-y-0.5 hover:shadow-[0_0_40px_color-mix(in_oklch,var(--primary)_35%,transparent)] active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"><Rocket className="size-5" />{busy ? 'Connecting…' : bot && !config.token.trim() ? 'Save & Redeploy Bot' : 'Save & Deploy Bot'}</button>
        <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">The server replies to /start, /help, and custom commands. Keep the generated management link private.</p>
      </div>

      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive"><Trash2 className="size-4" /></span><div className="min-w-0"><h2 className="font-semibold text-destructive">Deactivate bot</h2><p className="mt-1 text-sm leading-5 text-muted-foreground">Remove the Telegram webhook and delete this bot’s encrypted token, settings, analytics, and private management link.</p><button type="button" onClick={() => { if (bot && window.confirm(`Deactivate @${bot.telegramUsername || bot.name}, remove its webhook, and delete its ONYX record?`)) onDeactivate() }} disabled={!bot || busy || !import.meta.env.PROD} className="mt-4 min-h-11 rounded-lg border border-destructive/40 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">Deactivate selected bot</button></div></div></div>
    </div>

    <div className="rounded-2xl border border-border bg-card/50 p-5 sm:p-6"><h2 className="font-semibold">After you deploy</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your bot responds when people open its Telegram profile and tap Start or send one of the configured commands.</p><div className="my-5 rounded-xl border border-border bg-background/60 p-4"><p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Add it to a channel</p><ol className="space-y-2 text-sm leading-5 text-muted-foreground"><li>1. Open your channel settings.</li><li>2. Choose Administrators, then Add Admin.</li><li>3. Search for your bot and choose its permissions.</li></ol></div><div className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><CircleHelp className="mt-0.5 size-4 shrink-0 text-primary" />Only add your bot to channels you own or manage.</div><div className="mt-6 border-t border-border pt-5"><p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Current draft</p><p className="truncate text-sm font-semibold">{config.name || 'Untitled bot'}</p><p className="mt-1 text-xs text-muted-foreground">{commands.length} custom command{commands.length === 1 ? '' : 's'}{bot ? ` · ${bot.status}` : ''}</p></div></div>
  </div>
}

function MetricCard({ icon: Icon, label, value, detail }: { icon: typeof Users; label: string; value: string; detail: string }) {
  return <article className="rounded-2xl border border-border bg-card/75 p-5 sm:p-6"><div className="mb-5 flex items-center justify-between"><span className="text-sm text-muted-foreground">{label}</span><span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="size-4" /></span></div><div className="flex items-end justify-between gap-2"><strong className="text-3xl font-semibold tracking-tight sm:text-4xl">{value}</strong><span className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">{detail}</span></div></article>
}
