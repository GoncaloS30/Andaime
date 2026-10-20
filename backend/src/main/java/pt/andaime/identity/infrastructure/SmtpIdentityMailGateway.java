package pt.andaime.identity.infrastructure;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import pt.andaime.identity.application.IdentityMailGateway;

@Component
final class SmtpIdentityMailGateway implements IdentityMailGateway {

    private final JavaMailSender mailSender;
    private final String publicUrl;
    private final String from;

    SmtpIdentityMailGateway(
            JavaMailSender mailSender,
            @Value("${andaime.public-url:http://localhost:5173}") String publicUrl,
            @Value("${andaime.mail.from}") String from) {
        this.mailSender = mailSender;
        this.publicUrl = publicUrl;
        this.from = from;
    }

    @Override
    public void sendVerification(String email, String displayName, String token) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Confirme o seu email no Andaime");
        message.setText("Olá " + displayName + ",\n\nConfirme o email em:\n"
                + publicUrl + "/verificar-email?token=" + token);
        mailSender.send(message);
    }

    @Override
    public void sendExistingAccountNotice(String email) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Tentativa de registo no Andaime");
        message.setText("Foi tentado um novo registo com este endereço. A sua conta existente não foi alterada.");
        mailSender.send(message);
    }

    @Override
    public void sendPasswordReset(String email, String token) {
        var message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(email);
        message.setSubject("Reponha a palavra-passe do Andaime");
        message.setText("Foi pedida a reposição da sua palavra-passe. Continue em:\n"
                + publicUrl + "/repor-palavra-passe?token=" + token
                + "\n\nSe não fez este pedido, ignore esta mensagem.");
        mailSender.send(message);
    }
}
