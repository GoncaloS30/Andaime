CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    email citext NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    email_verified_at timestamptz,
    status text NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'DISABLED')),
    locale varchar(16) NOT NULL DEFAULT 'pt-PT',
    last_active_org_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
    CONSTRAINT users_email_uk UNIQUE (email)
);

CREATE TRIGGER users_touch_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

CREATE TABLE platform_admins (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    granted_by_user_id uuid REFERENCES users (id)
);
