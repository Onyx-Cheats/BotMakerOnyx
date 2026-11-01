import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChildBotConfig,
  builderOwnerOpenId,
  builderWelcomeText,
  isBotFatherTokenCandidate,
  isPrivateBuilderChat,
  managementLink,
  parseBuilderCallback,
  telegramCommandsForBot,
  validateBuilderName,
  validateBuilderWelcome,
} from '../server/builder.mjs'

const previousKey = process.env.BOT_TOKEN_ENCRYPTION_KEY
process.env.BOT_TOKEN_ENCRYPTION_KEY = 'b'.repeat(64)

const parentBotId = '17367b9b-2082-4026-8bf4-0bdb4bafcb2d'
const childBotId = 'a41cf594-48c0-4fc4-8bb1-5bc4c4ad80f0'

test('Telegram ownership IDs are HMAC-derived and scoped to parent bot and sender', () => {
  const owner = builderOwnerOpenId(parentBotId, 123456789)
  assert.match(owner, /^telegram:[a-f0-9]{64}$/)
  assert.equal(owner.includes('123456789'), false)
  assert.notEqual(owner, builderOwnerOpenId(parentBotId, 123456788))
  assert.notEqual(owner, builderOwnerOpenId('b41cf594-48c0-4fc4-8bb1-5bc4c4ad80f', 123456789))
})

test('builder requires a private chat with its matching Telegram sender', () => {
  assert.equal(isPrivateBuilderChat({ id: 42, type: 'private' }, { id: 42 }), true)
  assert.equal(isPrivateBuilderChat({ id: -42, type: 'group' }, { id: 42 }), false)
  assert.equal(isPrivateBuilderChat({ id: 42, type: 'private' }, { id: 7 }), false)
  assert.equal(isBotFatherTokenCandidate('123456:abcdefghijklmnopqrstuvwxyz_012345'), true)
  assert.equal(isBotFatherTokenCandidate('Token: 123456:abcdefghijklmnopqrstuvwxyz_012345'), true)
  assert.equal(isBotFatherTokenCandidate('not a token'), false)
  assert.match(builderWelcomeText(), /MADE WITH @onyxbotsofficial/)
})

test('callback parser accepts only known actions and well-formed bot IDs', () => {
  assert.deepEqual(parseBuilderCallback('ob:create'), { action: 'create' })
  assert.deepEqual(parseBuilderCallback(`ob:link:${childBotId}`), { action: 'link', botId: childBotId })
  assert.equal(parseBuilderCallback('ob:link:not-an-id'), null)
  assert.equal(parseBuilderCallback('ob:unknown'), null)
})

test('wizard validates display text and builds a branded-compatible child configuration', () => {
  assert.equal(validateBuilderName('  Helper bot  '), 'Helper bot')
  assert.throws(() => validateBuilderName('  '), /builder_name_invalid/)
  assert.throws(() => validateBuilderName('n'.repeat(121)), /builder_name_invalid/)
  assert.throws(() => validateBuilderName('123456:abcdefghijklmnopqrstuvwxyz_012345'), /builder_name_invalid/)
  assert.throws(() => validateBuilderWelcome('w'.repeat(3901)), /builder_welcome_invalid/)
  assert.throws(() => validateBuilderWelcome('Welcome: 123456:abcdefghijklmnopqrstuvwxyz_012345'), /builder_welcome_invalid/)
  const config = buildChildBotConfig({ name: 'Helper bot', welcome: 'Hello, #username$!' })
  assert.equal(config.start, 'Hello, #username$!')
  assert.equal(config.commands.length, 2)
  assert.match(config.help, /private ONYX dashboard/)
  assert.deepEqual(telegramCommandsForBot({ builder_enabled: 1 }), [
    { command: 'start', description: 'Open the ONYX Bot Builder menu' },
    { command: 'newbot', description: 'Create or reconnect a Telegram bot' },
    { command: 'mybots', description: 'View and manage your bots' },
    { command: 'cancel', description: 'Cancel the current setup' },
    { command: 'help', description: 'Get beginner setup instructions' },
  ])
})

test('management link matches the dashboard fragment format and requires HTTPS', () => {
  assert.equal(
    managementLink('https://onyxdash.example.com', childBotId, 'a'.repeat(43)),
    `https://onyxdash.example.com/#manage=${childBotId}.${'a'.repeat(43)}`,
  )
  assert.throws(() => managementLink('http://example.com', childBotId, 'a'.repeat(43)), /public_origin_invalid/)
})

test.after(() => {
  if (previousKey === undefined) delete process.env.BOT_TOKEN_ENCRYPTION_KEY
  else process.env.BOT_TOKEN_ENCRYPTION_KEY = previousKey
})
