import {
  buildChildBotConfig,
  builderDefaultWelcome,
  builderHelpText,
  builderMenuMarkup,
  builderOwnerOpenId,
  builderPrivateOnlyText,
  builderWelcomeText,
  isBotFatherTokenCandidate,
  isPrivateBuilderChat,
  managementLink,
  parseBuilderCallback,
  validateBuilderName,
  validateBuilderWelcome,
} from './builder.mjs'
import { telegramCall } from './telegram.mjs'
import { parseBotCommand, validateBotToken } from './validation.mjs'

const SESSION_TTL_MINUTES = 30
const BUILDER_MENU_ACTIONS = new Set(['start', 'newbot', 'mybots', 'cancel', 'help'])

async function sendMessage(token, chatId, text, extra = {}) {
  return telegramCall(token, 'sendMessage', { chat_id: chatId, text, ...extra })
}

async function bestEffortDelete(token, chatId, messageId) {
  if (chatId === undefined || messageId === undefined) return
  try {
    await telegramCall(token, 'deleteMessage', { chat_id: chatId, message_id: messageId })
  } catch {
    // Token and provider errors must never be logged or returned to the user.
  }
}

async function clearSession(pool, botId, creatorHash) {
  await pool.execute(
    'DELETE FROM onyx_bot_builder_sessions WHERE parent_bot_id = ? AND creator_hash = ?',
    [botId, creatorHash],
  )
}

async function saveSession(pool, botId, creatorHash, { step, botLabel = null, welcomeMessage = null }) {
  await pool.execute(
    `INSERT INTO onyx_bot_builder_sessions
       (parent_bot_id, creator_hash, step, bot_label, welcome_message, expires_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_TTL_MINUTES} MINUTE))
     ON DUPLICATE KEY UPDATE step = VALUES(step), bot_label = VALUES(bot_label),
       welcome_message = VALUES(welcome_message),
       expires_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ${SESSION_TTL_MINUTES} MINUTE)`,
    [botId, creatorHash, step, botLabel, welcomeMessage],
  )
}

async function loadSession(pool, botId, creatorHash) {
  const [rows] = await pool.execute(
    `SELECT step, bot_label, welcome_message FROM onyx_bot_builder_sessions
     WHERE parent_bot_id = ? AND creator_hash = ? AND expires_at > UTC_TIMESTAMP(3) LIMIT 1`,
    [botId, creatorHash],
  )
  if (rows[0]) return rows[0]
  await clearSession(pool, botId, creatorHash)
  return null
}

async function beginWizard(pool, bot, message, parentToken) {
  const creatorHash = builderOwnerOpenId(bot.id, message.from.id).slice('telegram:'.length)
  await pool.execute('DELETE FROM onyx_bot_builder_sessions WHERE expires_at < UTC_TIMESTAMP(3)')
  await saveSession(pool, bot.id, creatorHash, { step: 'name' })
  await sendMessage(
    parentToken,
    message.chat.id,
    '🆕 Step 1 of 3 — choose a display name for your bot.\n\nYou can change it later in your private ONYX dashboard. Send /cancel to stop.',
  )
}

async function sendMyBots(pool, bot, message, parentToken, ownerOpenId) {
  const [rows] = await pool.execute(
    `SELECT id, telegram_username, bot_label, status, total_messages, unique_users, last_activity_at
     FROM onyx_bots WHERE owner_open_id = ? AND id <> ?
     ORDER BY updated_at DESC LIMIT 20`,
    [ownerOpenId, bot.id],
  )
  if (!rows.length) {
    await sendMessage(parentToken, message.chat.id,
      '📦 You do not have any bots connected yet. Tap Create a bot to get started.',
      { reply_markup: builderMenuMarkup() })
    return
  }

  const lines = ['📦 Your bots', '']
  for (const [index, row] of rows.entries()) {
    const username = row.telegram_username ? `@${row.telegram_username}` : row.bot_label
    lines.push(`${index + 1}. ${username} — ${row.status}; ${Number(row.unique_users || 0)} unique chats; ${Number(row.total_messages || 0)} messages`)
  }
  lines.push('', 'Choose a dashboard button to issue a fresh private link. It replaces the previous link.')
  const keyboard = rows.map((row) => {
    const username = row.telegram_username ? `@${row.telegram_username}` : row.bot_label
    return [
      { text: `🔗 Dashboard: ${username}`.slice(0, 64), callback_data: `ob:link:${row.id}` },
      { text: '📊 Stats', callback_data: `ob:stats:${row.id}` },
    ]
  })
  keyboard.push([
    { text: '➕ Create another', callback_data: 'ob:create' },
    { text: '❔ Help', callback_data: 'ob:help' },
  ])
  await sendMessage(parentToken, message.chat.id, lines.join('\n'), {
    reply_markup: { inline_keyboard: keyboard },
  })
}

async function sendStats(pool, bot, chatId, botId, ownerOpenId, parentToken) {
  const [rows] = await pool.execute(
    `SELECT telegram_username, bot_label, status, total_messages, unique_users, last_activity_at
     FROM onyx_bots WHERE id = ? AND owner_open_id = ? LIMIT 1`,
    [botId, ownerOpenId],
  )
  const row = rows[0]
  if (!row) {
    await sendMessage(parentToken, chatId, '⚠️ I could not find that bot in your account. Send /mybots to refresh your list.')
    return
  }
  const username = row.telegram_username ? `@${row.telegram_username}` : row.bot_label
  const lastActivity = row.last_activity_at
    ? new Date(row.last_activity_at).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'No messages yet'
  await sendMessage(parentToken, chatId, [
    `📊 ${username}`,
    `Status: ${row.status}`,
    `Unique chats: ${Number(row.unique_users || 0)}`,
    `Messages: ${Number(row.total_messages || 0)}`,
    `Last activity: ${lastActivity}`,
  ].join('\n'))
}

async function handleCallback({ pool, bot, callback, parentToken, ownerOpenId, issueManagementLink }) {
  try {
    await telegramCall(parentToken, 'answerCallbackQuery', { callback_query_id: callback.id })
  } catch {
    // A stale callback should not prevent the menu from continuing.
  }

  const chat = callback.message?.chat
  if (!isPrivateBuilderChat(chat, callback.from)) {
    return true
  }
  const syntheticMessage = { chat, from: callback.from }
  const action = parseBuilderCallback(callback.data)
  if (!action) {
    await sendMessage(parentToken, chat.id, 'That button has expired. Send /start to open the menu again.')
    return true
  }
  if (action.action === 'create') {
    await beginWizard(pool, bot, syntheticMessage, parentToken)
    return true
  }
  if (action.action === 'list') {
    await sendMyBots(pool, bot, syntheticMessage, parentToken, ownerOpenId)
    return true
  }
  if (action.action === 'help') {
    await sendMessage(parentToken, chat.id, builderHelpText(), { reply_markup: builderMenuMarkup() })
    return true
  }
  if (action.action === 'cancel') {
    const creatorHash = ownerOpenId.slice('telegram:'.length)
    await clearSession(pool, bot.id, creatorHash)
    await sendMessage(parentToken, chat.id, '🧹 Setup cancelled. Your existing bots were not changed.', {
      reply_markup: builderMenuMarkup(),
    })
    return true
  }
  if (action.action === 'link') {
    const link = await issueManagementLink(action.botId, ownerOpenId)
    if (!link) {
      await sendMessage(parentToken, chat.id, '⚠️ I could not find that bot in your account. Send /mybots to refresh your list.')
      return true
    }
    await sendMessage(parentToken, chat.id,
      '🔐 Your fresh private dashboard link is ready. The previous link has been revoked; keep this one private.',
      { reply_markup: { inline_keyboard: [[{ text: '🛠 Open secure dashboard', url: link }]] } })
    return true
  }
  if (action.action === 'stats') {
    await sendStats(pool, bot, chat.id, action.botId, ownerOpenId, parentToken)
    return true
  }
  return true
}

export async function handleBuilderUpdate({ pool, bot, update, parentToken, createChildBot, issueManagementLink }) {
  const callback = update?.callback_query
  if (callback) {
    const from = callback.from
    if (from?.id === undefined) return true
    const ownerOpenId = builderOwnerOpenId(bot.id, from.id)
    return handleCallback({ pool, bot, callback, parentToken, ownerOpenId, issueManagementLink })
  }

  const message = update?.message || update?.edited_message
  if (!message?.chat?.id) return false
  const command = parseBotCommand(message, bot.telegram_username)
  const privateChat = isPrivateBuilderChat(message.chat, message.from)

  if (!privateChat) {
    if (isBotFatherTokenCandidate(message.text)) {
      await bestEffortDelete(parentToken, message.chat.id, message.message_id)
      try {
        await sendMessage(parentToken, message.chat.id,
          '⚠️ I did not process that token. It may be visible to group members. Revoke it with @BotFather, then restart setup in a private chat.')
      } catch {
        // Do not retry group replies indefinitely if this bot lacks permission.
      }
      return true
    }
    if (command && BUILDER_MENU_ACTIONS.has(command.name)) {
      try { await sendMessage(parentToken, message.chat.id, builderPrivateOnlyText()) } catch {}
      return true
    }
    return false
  }

  if (command?.name === 'start') {
    await sendMessage(parentToken, message.chat.id, builderWelcomeText(), { reply_markup: builderMenuMarkup() })
    return true
  }
  if (command?.name === 'help') {
    await sendMessage(parentToken, message.chat.id, builderHelpText(), { reply_markup: builderMenuMarkup() })
    return true
  }
  if (command?.name === 'newbot') {
    await beginWizard(pool, bot, message, parentToken)
    return true
  }

  const creatorHash = builderOwnerOpenId(bot.id, message.from.id).slice('telegram:'.length)
  if (command?.name === 'cancel') {
    await clearSession(pool, bot.id, creatorHash)
    await sendMessage(parentToken, message.chat.id, '🧹 Setup cancelled. Your existing bots were not changed.', {
      reply_markup: builderMenuMarkup(),
    })
    return true
  }
  if (command?.name === 'mybots') {
    await sendMyBots(pool, bot, message, parentToken, `telegram:${creatorHash}`)
    return true
  }

  const session = await loadSession(pool, bot.id, creatorHash)
  if (!session) return false
  const text = typeof message.text === 'string' ? message.text.trim() : ''
  if (!text) {
    await sendMessage(parentToken, message.chat.id, 'Please send a text reply to continue, or send /cancel.')
    return true
  }

  if (session.step === 'name') {
    if (isBotFatherTokenCandidate(text)) {
      await bestEffortDelete(parentToken, message.chat.id, message.message_id)
      await sendMessage(parentToken, message.chat.id,
        '🔒 I did not save that token-looking message. This step needs only a bot name. If the message is still visible, delete it from the chat.')
      return true
    }
    let name
    try { name = validateBuilderName(text) } catch {
      await sendMessage(parentToken, message.chat.id, 'Please send a bot name from 1 to 120 characters, or send /cancel.')
      return true
    }
    await saveSession(pool, bot.id, creatorHash, { step: 'welcome', botLabel: name })
    await sendMessage(parentToken, message.chat.id,
      '✍️ Step 2 of 3 — what should your bot say when someone sends /start? Send /default for a friendly starter message. The ONYX brand footer is added automatically.')
    return true
  }

  if (session.step === 'welcome') {
    if (isBotFatherTokenCandidate(text)) {
      await bestEffortDelete(parentToken, message.chat.id, message.message_id)
      await sendMessage(parentToken, message.chat.id,
        '🔒 I did not save that token-looking message. This step needs welcome text; the BotFather token is requested in Step 3. If the message is still visible, delete it from the chat.')
      return true
    }
    const welcomeText = text.toLowerCase() === '/default'
      ? builderDefaultWelcome(session.bot_label)
      : text
    let welcome
    try { welcome = validateBuilderWelcome(welcomeText) } catch {
      await sendMessage(parentToken, message.chat.id, 'Please send welcome text up to 3,900 characters, or send /default. Use /cancel to stop.')
      return true
    }
    await saveSession(pool, bot.id, creatorHash, {
      step: 'token', botLabel: session.bot_label, welcomeMessage: welcome,
    })
    await sendMessage(parentToken, message.chat.id, [
      '🔑 Step 3 of 3 — connect your bot',
      '',
      'Open @BotFather, send /newbot, finish the name and username steps, then copy its API token.',
      'Paste the token here only in this private chat. ONYX validates it and stores it encrypted; the token is never saved in wizard progress or repeated in replies.',
      '',
      'If you cancel or change your mind, send /cancel.',
    ].join('\n'))
    return true
  }

  if (session.step === 'token') {
    let token
    try { token = validateBotToken(text) } catch {
      if (isBotFatherTokenCandidate(text)) await bestEffortDelete(parentToken, message.chat.id, message.message_id)
      await sendMessage(parentToken, message.chat.id,
        '⚠️ That does not look like a valid BotFather token. Copy the API token from @BotFather and try again. I will not repeat it here.')
      return true
    }
    await bestEffortDelete(parentToken, message.chat.id, message.message_id)
    try {
      const config = buildChildBotConfig({ name: session.bot_label, welcome: session.welcome_message })
      const result = await createChildBot({
        token,
        config,
        ownerOpenId: `telegram:${creatorHash}`,
        publicOrigin: bot.public_origin,
      })
      await clearSession(pool, bot.id, creatorHash)
      const link = managementLink(result.bot.public_origin, result.bot.id, result.accessKey)
      const introduction = result.updated
        ? `♻️ Existing bot updated: @${result.bot.telegram_username}. Its name and /start welcome were changed; its existing help and custom commands were kept.`
        : result.warning
          ? `✅ Your bot was saved: @${result.bot.telegram_username}`
          : `🎉 Your bot is live: @${result.bot.telegram_username}`
      const deploymentNote = result.warning
        ? '\n\n⚠️ The bot is saved, but Telegram could not finish webhook setup. Open the dashboard and retry deployment.'
        : ''
      await sendMessage(parentToken, message.chat.id,
        `${introduction}\n\n🔐 Your private ONYX dashboard link is ready. Anyone with it can manage this bot, so keep it secret. If your token message is still visible above, delete it from the chat.${deploymentNote}`,
        { reply_markup: { inline_keyboard: [
          [{ text: '🛠 Open secure dashboard', url: link }],
          [
            { text: '➕ Create another', callback_data: 'ob:create' },
            { text: '📦 My bots', callback_data: 'ob:list' },
          ],
        ] } })
    } catch (error) {
      const safeMessage = error?.message === 'telegram_request_failed' || error?.message === 'invalid_bot_token'
        ? '⚠️ Telegram could not verify that token. Check it in @BotFather and try again. I will not repeat it here.'
        : '⚠️ I could not connect that bot just now. Your token was not shown in the reply. Try again in a moment, or send /cancel.'
      await sendMessage(parentToken, message.chat.id, safeMessage)
    }
    return true
  }

  await clearSession(pool, bot.id, creatorHash)
  await sendMessage(parentToken, message.chat.id, 'Your setup expired. Send /newbot to start again.')
  return true
}
