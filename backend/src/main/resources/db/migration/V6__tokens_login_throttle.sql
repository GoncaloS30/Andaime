CREATE TABLE email_verification_tokens (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT email_verification_tokens_hash_uk UNIQUE (token_hash)
);

CREATE INDEX email_verification_tokens_user_idx
    ON email_verification_tokens (user_id, expires_at DESC);

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT password_reset_tokens_hash_uk UNIQUE (token_hash)
);

CREATE INDEX password_reset_tokens_user_idx
    ON password_reset_tokens (user_id, expires_at DESC);

CREATE TABLE login_throttle (
    email_key citext PRIMARY KEY,
    failures integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
    locked_until timestamptz,
    last_failure_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
);
