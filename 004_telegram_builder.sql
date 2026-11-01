ALTER TABLE onyx_bots
  ADD COLUMN public_origin VARCHAR(512) NULL,
  ADD COLUMN builder_enabled TINYINT(1) NOT NULL DEFAULT 0;

UPDATE onyx_bots
SET public_origin = 'https://onyxdash-ujcmxi7d.manus.space'
WHERE public_origin IS NULL;

UPDATE onyx_bots
SET builder_enabled = 1
WHERE LOWER(telegram_username) = 'botmarkerso_bot'
  AND status = 'active';

ALTER TABLE onyx_bot_updates
  ADD KEY idx_onyx_bot_updates_bot_received (bot_id, received_at);

CREATE TABLE IF NOT EXISTS onyx_bot_builder_sessions (
  parent_bot_id CHAR(36) NOT NULL,
  creator_hash CHAR(64) NOT NULL,
  step ENUM('name', 'welcome', 'token') NOT NULL DEFAULT 'name',
  bot_label VARCHAR(120) NULL,
  welcome_message TEXT NULL,
  expires_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (parent_bot_id, creator_hash),
  KEY idx_onyx_builder_sessions_expires (expires_at),
  CONSTRAINT fk_onyx_builder_sessions_parent FOREIGN KEY (parent_bot_id)
    REFERENCES onyx_bots (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
