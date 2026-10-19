package pt.andaime.organization.application;

public interface OrganizationMailGateway {

    void sendInvitation(String email, String organizationName, String inviterName, String role, String token);
}
