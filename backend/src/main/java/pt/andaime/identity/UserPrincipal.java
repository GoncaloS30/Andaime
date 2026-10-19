package pt.andaime.identity;

import java.io.Serial;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

public record UserPrincipal(
        UUID id,
        String email,
        String passwordHash,
        String displayName,
        boolean emailVerified,
        boolean active) implements UserDetails {

    @Serial
    private static final long serialVersionUID = 1L;

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority("ROLE_USER"));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return active && emailVerified;
    }

    /** Cópia sem o hash da palavra-passe, para guardar na sessão. */
    public UserPrincipal withoutPassword() {
        return new UserPrincipal(id, email, null, displayName, emailVerified, active);
    }
}
