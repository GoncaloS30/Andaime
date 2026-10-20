package pt.andaime.privacy.application;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import pt.andaime.audit.AuditLog;
import pt.andaime.shared.api.ApiException;
import pt.andaime.shared.storage.ObjectStorage;
import pt.andaime.shared.tenant.OrgRole;
import pt.andaime.shared.tenant.TenantContext;
import tools.jackson.databind.json.JsonMapper;

/**
 * RGPD, direito de acesso e portabilidade (arts. 15.º e 20.º): tudo o que a empresa guarda sobre um trabalhador num
 * ZIP com {@code dados.json}, os ficheiros dos documentos e da fotografia, e um {@code LEIA-ME.txt}.
 *
 * <p>Os dados são lidos e a exportação auditada no pedido (onde existe o contexto da empresa e a RLS); o ZIP é depois
 * escrito em streaming, já fora da transação: o JSON (só um trabalhador) fica em memória, os ficheiros passam do
 * armazenamento para a resposta sem serem carregados por inteiro nem gravados em disco.
 */
@Service
public class PrivacyExportService {

    private static final Logger log = LoggerFactory.getLogger(PrivacyExportService.class);

    /** Pacote pronto a escrever: nome do ZIP, JSON já serializado e ficheiros a copiar do armazenamento. */
    public record ExportPackage(String filename, byte[] json, List<StoredFile> files) {
    }

    /** Ficheiro a incluir no ZIP: caminho dentro do arquivo e chave no armazenamento privado. */
    public record StoredFile(String path, String storageKey) {
    }

    private final PrivacyDataReader reader;
    private final AuditLog auditLog;
    private final ObjectStorage storage;
    private final JsonMapper jsonMapper;
    private final Clock clock;

    public PrivacyExportService(PrivacyDataReader reader, AuditLog auditLog, ObjectStorage storage, JsonMapper jsonMapper, Clock clock) {
        this.reader = reader;
        this.auditLog = auditLog;
        this.storage = storage;
        this.jsonMapper = jsonMapper;
        this.clock = clock;
    }

    /** Pedido feito pela empresa (dono ou administrador) em nome do titular. */
    public ExportPackage forEmployee(UUID employeeId) {
        OrgRole.require(OrgRole.ADMIN);
        if (!reader.isOrganizationAdmin()) {
            throw new ApiException(HttpStatus.FORBIDDEN, "forbidden",
                    "A exportação de dados pessoais não está disponível no acesso de suporte.");
        }
        return build(employeeId, "admin");
    }

    /** O próprio titular: a ficha ligada à sua conta nesta empresa. */
    public ExportPackage forCurrentUser() {
        var employeeId = TenantContext.employeeId().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "no-employee",
                "A sua conta não está ligada a uma ficha de trabalhador nesta empresa."));
        return build(employeeId, "self");
    }

    private ExportPackage build(UUID employeeId, String by) {
        var collected = reader.collect(employeeId);
        var json = jsonMapper.writerWithDefaultPrettyPrinter().writeValueAsBytes(collected.data());
        auditLog.record("employee.exported", "employee", employeeId, Map.of("by", by));
        var filename = "dados-" + PrivacyDataReader.safeFilename(collected.employeeNumber()).replace(' ', '_') + "-"
                + TenantContext.today(clock) + ".zip";
        return new ExportPackage(filename, json, collected.files());
    }

    /** Escreve o ZIP. Um ficheiro em falta no armazenamento não estraga a exportação: fica indicado no LEIA-ME. */
    public void write(ExportPackage export, OutputStream output) throws IOException {
        var missing = new ArrayList<String>();
        var zip = new ZipOutputStream(output, StandardCharsets.UTF_8);
        zip.putNextEntry(new ZipEntry("dados.json"));
        zip.write(export.json());
        zip.closeEntry();
        for (var file : export.files()) {
            try (var content = storage.open(file.storageKey())) {
                zip.putNextEntry(new ZipEntry(file.path()));
                content.transferTo(zip);
                zip.closeEntry();
            } catch (RuntimeException exception) {
                // O SDK falha ao abrir (antes de criar a entrada) quando o objeto não existe.
                log.warn("Ficheiro em falta na exportação RGPD ({}): {}", file.path(), exception.getMessage());
                missing.add(file.path());
            }
        }
        zip.putNextEntry(new ZipEntry("LEIA-ME.txt"));
        zip.write(readme(missing).getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
        zip.finish();
        zip.flush();
    }

    private static String readme(List<String> missing) {
        var text = new StringBuilder("""
                Exportação de dados pessoais (RGPD, artigos 15.º e 20.º)
                ========================================================

                Este arquivo contém os dados pessoais que a empresa guarda sobre si na aplicação Andaime, num formato
                estruturado e de leitura automática, para consulta ou para os entregar a outra entidade.

                dados.json
                  Ficheiro JSON (UTF-8) com as secções:
                  - geradoEm: data e hora em que a exportação foi gerada (UTC, ISO 8601);
                  - empresa: a empresa responsável pelo tratamento;
                  - titular: a sua ficha (identificação, contactos, categoria, admissão, capacidade diária, custo/hora,
                    competências, tamanhos de fardamento, notas, estado e datas de arquivo/anonimização);
                  - contratos e equipas: contratos e histórico de equipas, com datas;
                  - planeamento: obras e horários planeados para si (com a viatura atribuída);
                  - picagens e registosDeHoras: o registo de ponto e as horas registadas, com as correções feitas
                    (revisoes: quem, quando, porquê, valores antes e depois);
                  - folhasDeHoras: as folhas semanais, com submissão e decisão;
                  - ausencias: pedidos de férias e outras ausências, com a decisão;
                  - documentos: os seus documentos e todas as versões (datas, tamanho, impressão digital SHA-256);
                  - equipamento: fardamento e EPI entregues, devolvidos e em seu poder;
                  - notificacoes: as notificações enviadas à sua conta nesta empresa;
                  - auditoria: o registo de alterações à sua ficha (ação, quando e por quem).
                  Datas no formato AAAA-MM-DD; instantes em UTC; durações em minutos.

                documentos/
                  Os ficheiros da versão atual de cada documento (tipo-vN-nome) e a sua fotografia, se existir.
                  O campo "ficheiroNoZip" de cada versão em dados.json indica o ficheiro correspondente.

                Para pedir a retificação ou o apagamento dos seus dados, contacte a sua empresa.
                """);
        if (!missing.isEmpty()) {
            text.append("\nNão foi possível incluir estes ficheiros (indisponíveis no armazenamento):\n");
            missing.forEach(path -> text.append("  - ").append(path).append('\n'));
        }
        return text.toString().replace("\n", "\r\n");
    }
}
