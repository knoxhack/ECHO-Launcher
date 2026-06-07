CREATE UNIQUE INDEX IF NOT EXISTS chat_messages_channel_nonce_unique_idx
  ON chat_messages (channel_id, nonce)
  WHERE nonce IS NOT NULL;
