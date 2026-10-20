-- Avisos por email. A notificação é gravada na transação da alteração que a origina e fica com email_status
-- PENDING; um job envia depois do commit (outbox), com novas tentativas e recuo exponencial.

ALTER TABLE memberships ADD COLUMN email_notifications boolean NOT NULL DEFAULT true;

ALTER TABLE notifications
    ADD COLUMN email_status text CHECK (email_status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
    ADD COLUMN email_attempts integer NOT NULL DEFAULT 0 CHECK (email_attempts >= 0),
    ADD COLUMN email_next_at timestamptz,
    ADD COLUMN email_sent_at timestamptz,
    ADD COLUMN email_error text CHECK (email_error IS NULL OR length(email_error) <= 500);

CREATE INDEX notifications_email_queue_idx ON notifications (email_next_at)
    WHERE email_status IN ('PENDING', 'SENDING');

-- O job reclama emails de todas as empresas antes de conhecer o tenant: a função corre como o owner, é mínima e
-- devolve só o necessário para enviar. Quem desligou os avisos ou perdeu o acesso entretanto já não recebe.
CREATE FUNCTION app.claim_notification_emails(p_limit integer)
RETURNS TABLE (notification_id uuid, email text, display_name text, organization_name text,
               title text, body text, link text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE notifications notification
       SET email_status = 'SKIPPED', email_next_at = NULL
     WHERE notification.email_status = 'PENDING'
       AND (NOT EXISTS (
            SELECT 1 FROM memberships membership
             WHERE membership.organization_id = notification.organization_id
               AND membership.user_id = notification.user_id
               AND membership.status = 'ACTIVE' AND membership.email_notifications)
        OR NOT EXISTS (
            SELECT 1 FROM users account WHERE account.id = notification.user_id AND account.status = 'ACTIVE'));

    RETURN QUERY
    WITH candidate AS (
        SELECT notification.id
          FROM notifications notification
         WHERE (notification.email_status = 'PENDING' AND notification.email_next_at <= now())
            OR (notification.email_status = 'SENDING' AND notification.email_next_at < now() - interval '10 minutes')
         ORDER BY notification.email_next_at
         FOR UPDATE SKIP LOCKED
         LIMIT greatest(1, least(p_limit, 100))
    ), claimed AS (
        UPDATE notifications notification
           SET email_status = 'SENDING', email_attempts = notification.email_attempts + 1, email_next_at = now()
          FROM candidate
         WHERE notification.id = candidate.id
        RETURNING notification.id, notification.organization_id, notification.user_id,
                  notification.title, notification.body, notification.link
    )
    SELECT claimed.id, account.email::text, account.display_name, organization.name,
           claimed.title, claimed.body, claimed.link
      FROM claimed
      JOIN users account ON account.id = claimed.user_id
      JOIN organizations organization ON organization.id = claimed.organization_id;
END
$$;

-- Fecha um envio: sem erro fica SENT; com erro volta a PENDING com recuo (2, 4, 8, 16 min) e falha à 5.ª tentativa.
CREATE FUNCTION app.finish_notification_email(p_id uuid, p_error text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    UPDATE notifications
       SET email_status = CASE WHEN p_error IS NULL THEN 'SENT'
                               WHEN email_attempts >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           email_sent_at = CASE WHEN p_error IS NULL THEN now() END,
           email_next_at = CASE WHEN p_error IS NULL OR email_attempts >= 5 THEN NULL
                                ELSE now() + make_interval(mins => (2 ^ email_attempts)::integer) END,
           email_error = left(p_error, 500)
     WHERE id = p_id AND email_status = 'SENDING';
END
$$;

REVOKE ALL ON FUNCTION app.claim_notification_emails(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.finish_notification_email(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_notification_emails(integer) TO andaime_app;
GRANT EXECUTE ON FUNCTION app.finish_notification_email(uuid, text) TO andaime_app;
