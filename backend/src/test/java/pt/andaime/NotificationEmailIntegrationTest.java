package pt.andaime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;

import com.jayway.jsonpath.JsonPath;

import pt.andaime.notifications.application.NotificationEmailSender;
import pt.andaime.notifications.application.NotificationMailGateway.NotificationMail;

/** Avisos por email: só depois do commit, só para quem os tem ligados, com novas tentativas quando o SMTP falha. */
class NotificationEmailIntegrationTest extends ApiTestSupport {

    private static final LocalDate LAST_MONDAY = LocalDate.now(ZoneId.of("Europe/Lisbon"))
            .with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).minusDays(7);

    @Autowired
    NotificationEmailSender sender;

    @Test
    void folhaDevolvidaSegueComEmailERespeitaPreferencia() throws Exception {
        var owner = newUser("dono-avisos-email");
        var orgId = createOrganization(owner, "Avisos por Email");
        var ana = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/employees", orgId)
                .content("{\"fullName\":\"Ana Email\",\"category\":\"Pedreiro\"}")).andExpect(status().isCreated())), "$.id"));
        var site = UUID.fromString(JsonPath.read(body(perform(owner, post("/api/orgs/{orgId}/sites", orgId)
                .content("{\"name\":\"Obra Email\",\"country\":\"PT\",\"status\":\"ACTIVE\"}")).andExpect(status().isCreated())), "$.id"));
        var worker = joinAs(owner, orgId, "WORKER", "trabalhadora-avisos");
        linkEmployee(owner, orgId, worker, ana);
        perform(owner, post("/api/orgs/{orgId}/time-entries", orgId).content("""
                {"employeeId":"%s","siteId":"%s","date":"%s","start":"08:00","end":"12:00","reason":"Registo de teste"}"""
                .formatted(ana, site, LAST_MONDAY))).andExpect(status().isCreated());
        var path = "/api/orgs/{orgId}/timesheets/{employeeId}/{week}/{action}";
        var toWorker = (org.mockito.ArgumentMatcher<NotificationMail>) mail -> mail.to().equalsIgnoreCase(worker.email());

        // Por omissão os avisos por email estão ligados.
        perform(worker, get("/api/orgs/{orgId}/notifications/preferences", orgId)).andExpect(jsonPath("$.email").value(true));

        perform(worker, post(path, orgId, ana, LAST_MONDAY, "submit")).andExpect(status().isOk());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reject").content("{\"note\":\"Falta a obra de terça\"}"))
                .andExpect(status().isOk());
        sender.sendPending();
        var mail = ArgumentCaptor.forClass(NotificationMail.class);
        verify(notificationMailGateway, times(1)).send(argThat(toWorker));
        verify(notificationMailGateway, org.mockito.Mockito.atLeastOnce()).send(mail.capture());
        var sent = mail.getAllValues().stream().filter(toWorker::matches).findFirst().orElseThrow();
        assertThat(sent.title()).isEqualTo("Folha de horas devolvida");
        assertThat(sent.body()).contains("Falta a obra de terça");
        assertThat(sent.organizationName()).isEqualTo("Avisos por Email");
        assertThat(sent.link()).isEqualTo("/app");
        // Já enviado: nova passagem não repete.
        sender.sendPending();
        verify(notificationMailGateway, times(1)).send(argThat(toWorker));

        // SMTP em baixo: o aviso fica na fila com recuo (não é tentado de imediato outra vez).
        doThrow(new IllegalStateException("SMTP indisponível")).when(notificationMailGateway).send(argThat(toWorker));
        perform(worker, post(path, orgId, ana, LAST_MONDAY, "submit")).andExpect(status().isOk());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reject").content("{\"note\":\"Ainda falta\"}")).andExpect(status().isOk());
        sender.sendPending();
        sender.sendPending();
        verify(notificationMailGateway, times(2)).send(argThat(toWorker));

        // A trabalhadora desliga os avisos por email: a notificação continua na aplicação, mas não segue por email.
        perform(worker, put("/api/orgs/{orgId}/notifications/preferences", orgId).content("{\"email\":false}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.email").value(false));
        org.mockito.Mockito.reset(notificationMailGateway);
        perform(worker, post(path, orgId, ana, LAST_MONDAY, "submit")).andExpect(status().isOk());
        perform(owner, post(path, orgId, ana, LAST_MONDAY, "reject").content("{\"note\":\"Terceira vez\"}")).andExpect(status().isOk());
        sender.sendPending();
        verify(notificationMailGateway, never()).send(argThat(toWorker));
        perform(worker, get("/api/orgs/{orgId}/notifications", orgId)).andExpect(jsonPath("$.unread").value(3));

        // Outra empresa não vê nem altera estas preferências.
        var stranger = newUser("estranho-avisos");
        perform(stranger, get("/api/orgs/{orgId}/notifications/preferences", orgId)).andExpect(status().isNotFound());
    }
}
