package pt.andaime.identity.application;

public interface IdentityMailGateway {

    void sendVerification(String email, String displayName, String token);

    void sendExistingAccountNotice(String email);
}
