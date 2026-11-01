import { hashTelegramChat } from './crypto.mjs'

const BOT_ID_PATTERN = /^[0-9a-f-]{36}$/i
const COMMAND_PATTERN = /^[a-z0-9_]{1,32}$/

export const BUILDER_COMMAND_MENU = [
  { command: 'start', description: 'Open the ONYX Bot Builder menu' },
  { command: 'newbot', description: 'Create or reconnect a Telegram bot' },
  { command: 'mybots', description: 'View and manage your bots' },
  { command: 'cancel', description: 'Cancel the current setup' },
  { command: 'help', description: 'Get beginner setup instructions' },
]

export function builderMenuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '➕ Create a bot', callback_data: 'ob:create' },
        { text: '📦 My bots', callback_data: 'ob:list' },
      ],
      [{ text: '❔ Help', callback_data: 'ob:help' }],
    ],
  }
}

export function builderWelcomeText() {
  return [
    '🤖 ONYX Bot Builder',
    '',
    'Create and manage Telegram bots with a few guided steps—no coding needed.',
    '',
    'Choose an action below. Bot creation and BotFather tokens work only in this private chat.',
    '',
    'MADE WITH @onyxbotsofficial',
  ].join('\n')
}

export function builderHelpText() {
  return [
    '🧭 How to create your bot',
    '',
    '1. Tap Create a bot and choose a display name.',
    '2. Type the welcome text people should see with /start, or send /default.',
    '3. Open @BotFather, send /newbot, finish its steps, and copy the API token.',
    '4. Paste that token here only in this private chat. ONYX connects the webhook and sends you a private dashboard link.',
    '',
    '🔒 Never post a BotFather token or dashboard link in a group. If a token is exposed, revoke it in @BotFather and create a new one.',
    '',
    'Commands: /newbot, /mybots, /cancel, /help',
    'Use /mybots to see your bots, check their activity, or get a fresh dashboard link. A fresh link revokes the previous one.',
  ].join('\n')
}

export function builderPrivateOnlyText() {
  return [
    '🔒 Bot setup is available only in a private chat with @Botmarkerso_bot.',
    'Open the bot and tap Start before entering a BotFather token.',
    'If you posted a token in a group, revoke it with @BotFather immediately.',
  ].join('\n')
}

export function isPrivateBuilderChat(chat, from) {
  return chat?.type === 'private'
    && from?.id !== undefined
    && String(chat.id) === String(from.id)
}

export function isBotFatherTokenCandidate(text) {
  return typeof text === 'string' && /\d{5,}:[A-Za-z0-9_-]{20,200}/.test(text)
}

export function builderOwnerOpenId(parentBotId, telegramUserId) {
  if (typeof telegramUserId !== 'string' && typeof telegramUserId !== 'number') {
    throw new Error('invalid_telegram_user_id')
  }
  return `telegram:${hashTelegramChat(parentBotId, telegramUserId)}`
}

export function parseBuilderCallback(data) {
  if (typeof data !== 'string') return null
  const simple = new Map([
    ['ob:create', 'create'],
    ['ob:list', 'list'],
    ['ob:help', 'help'],
    ['ob:cancel', 'cancel'],
  ])
  if (simple.has(data)) return { action: simple.get(data) }
  const match = /^ob:(link|stats):([0-9a-f-]{36})$/i.exec(data)
  return match && BOT_ID_PATTERN.test(match[2])
    ? { action: match[1].toLowerCase(), botId: match[2] }
    : null
}

export function validateBuilderName(value) {
  if (typeof value !== 'string') throw new Error('builder_name_invalid')
  const name = value.trim()
  if (!name || name.length > 120 || isBotFatherTokenCandidate(name)) throw new Error('builder_name_invalid')
  return name
}

export function validateBuilderWelcome(value) {
  if (typeof value !== 'string') throw new Error('builder_welcome_invalid')
  const welcome = value.trim()
  if (!welcome || Array.from(welcome).length > 3900 || isBotFatherTokenCandidate(welcome)) {
    throw new Error('builder_welcome_invalid')
  }
  return welcome
}

export function builderDefaultWelcome(name) {
  return `👋 Hi! I'm ${name}.\n\nI'm ready to help. Send /help to see what I can do.`
}

export function buildChildBotConfig({ name, welcome }) {
  const defaultCommands = [
    {
      name: '/commands',
      response: '📋 Starter commands: /start, /help, /commands, and /about. Add your own commands from the private ONYX dashboard.',
    },
    {
      name: '/about',
      response: '✨ This bot is connected with ONYX Bot Builder. Open your private dashboard to customize it.',
    },
  ]
  return {
    name: validateBuilderName(name),
    description: 'Created with ONYX Bot Builder',
    start: validateBuilderWelcome(welcome),
    help: [
      '👋 Here are the starter commands:',
      '',
      '/start — Show the welcome message',
      '/help — Show this command list',
      '/commands — List starter commands',
      '/about — Learn about this bot',
      '',
      '🛠 Add or edit commands in your private ONYX dashboard.',
    ].join('\n'),
    commands: defaultCommands,
  }
}

function parseCommands(value) {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function telegramCommandsForBot(bot) {
  if (Number(bot?.builder_enabled) === 1) return BUILDER_COMMAND_MENU.map((item) => ({ ...item }))

  const commands = [
    { command: 'start', description: 'Show the welcome message' },
    { command: 'help', description: 'Show available commands' },
  ]
  const used = new Set(commands.map((item) => item.command))
  for (const item of parseCommands(bot?.commands_json)) {
    const command = typeof item?.name === 'string' ? item.name.replace(/^\//, '').toLowerCase() : ''
    if (!COMMAND_PATTERN.test(command) || used.has(command) || commands.length >= 100) continue
    used.add(command)
    commands.push({ command, description: `Run /${command}` })
  }
  return commands
}

export function managementLink(publicOrigin, botId, accessKey) {
  let origin
  try { origin = new URL(publicOrigin) } catch { throw new Error('public_origin_invalid') }
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.search || origin.hash || !BOT_ID_PATTERN.test(botId)) {
    throw new Error('public_origin_invalid')
  }
  if (typeof accessKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(accessKey)) {
    throw new Error('invalid_management_key')
  }
  return `${origin.origin}/#manage=${botId}.${accessKey}`
}
