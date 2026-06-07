CREATE TABLE IF NOT EXISTS chat_users (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  timed_out_until TIMESTAMPTZ,
  banned_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_channels (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  group_label TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  kind TEXT NOT NULL,
  read_only BOOLEAN NOT NULL DEFAULT false,
  slow_mode_seconds INTEGER NOT NULL DEFAULT 5,
  server_id TEXT,
  position INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  author_user_id TEXT NOT NULL REFERENCES chat_users(id),
  body TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'launcher',
  hidden BOOLEAN NOT NULL DEFAULT false,
  pinned BOOLEAN NOT NULL DEFAULT false,
  nonce TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS chat_messages_channel_created_idx ON chat_messages (channel_id, created_at, id);
CREATE INDEX IF NOT EXISTS chat_messages_author_channel_idx ON chat_messages (author_user_id, channel_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_reports (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES chat_messages(id),
  reporter_user_id TEXT NOT NULL REFERENCES chat_users(id),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_moderation_actions (
  id TEXT PRIMARY KEY,
  moderator_user_id TEXT NOT NULL REFERENCES chat_users(id),
  target_user_id TEXT REFERENCES chat_users(id),
  message_id TEXT REFERENCES chat_messages(id),
  action_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  duration_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_read_states (
  user_id TEXT NOT NULL REFERENCES chat_users(id),
  channel_id TEXT NOT NULL REFERENCES chat_channels(id),
  last_read_message_id TEXT,
  read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel_id)
);

INSERT INTO chat_channels (id, group_id, group_label, name, description, kind, read_only, slow_mode_seconds, server_id, position)
VALUES
  ('announcements', 'official', 'Official', 'announcements', 'Official ECHO launcher and Ashfall updates.', 'announcement', true, 0, null, 10),
  ('status', 'official', 'Official', 'status', 'Live status, maintenance, and release readiness notes.', 'system', true, 0, null, 20),
  ('rules', 'official', 'Official', 'rules', 'Community rules and moderation expectations.', 'announcement', true, 0, null, 30),
  ('general', 'community', 'Community', 'general', 'General ECHO community chat.', 'community', false, 5, null, 40),
  ('support', 'community', 'Community', 'support', 'Install, handoff, and crash help.', 'community', false, 10, null, 50),
  ('modpacks', 'community', 'Community', 'modpacks', 'Pack feedback, builds, and module discussion.', 'community', false, 5, null, 60),
  ('server-ashfall', 'servers', 'Official Servers', 'ashfall-official', 'Bidirectional launcher and in-game chat for the official server.', 'minecraft_server', false, 5, 'official-ashfall', 70)
ON CONFLICT (id) DO UPDATE SET
  group_id = EXCLUDED.group_id,
  group_label = EXCLUDED.group_label,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  kind = EXCLUDED.kind,
  read_only = EXCLUDED.read_only,
  slow_mode_seconds = EXCLUDED.slow_mode_seconds,
  server_id = EXCLUDED.server_id,
  position = EXCLUDED.position;
