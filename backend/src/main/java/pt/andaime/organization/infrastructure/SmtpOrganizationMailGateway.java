package pt.andaime.organization.infrastructure;

import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import pt.andaime.organization.application.OrganizationMailGateway;

@Component
final class SmtpOrganizationMailGateway implements OrganizationMailGateway {

    private static final Map<String, String> ROLE_LABELS = Map.of(
            "OWNER", "proprietário",
            "ADMIN", "administrador",
            "MANAGER", "gestor",
            "FOREMAN", "encarregado",
            "WORKER", "trabalhador");

    private final JavaMailSender mailSender;
    private final String publicUrl;

    SmtpOrganizationMailGateway(
            JavaMailSender mailSender,
            @Value("${andaime.public-url:http://localhost:5173}") String publicUrl) {
        this.mailSender = mailSender;
        this.publicUrl = publicUrl;
    }

    @Override
    public void sendInvitation(String email, String organizationName, String inviterName, String role, String token) {
        var message = new SimpleMailMessage();
        message.setTo(email);
        message.setSubject("Convite para " + organizationName + " no Andaime");
        message.setText(inviterName + " convidou-o para a empresa " + organizationName
                + " como " + ROLE_LABELS.getOrDefault(role, role) + ".\n\nAceite o convite em:\n"
                + publicUrl + "/convite/" + token
                + "\n\nO convite é válido durante 7 dias. Se não esperava este email, ignore-o.");
        mailSender.send(message);
    }
}
