package pt.andaime.privacy.application;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import tools.jackson.databind.JsonNode;

/**
 * Conteúdo de {@code dados.json} na exportação RGPD (arts. 15.º e 20.º). As chaves são em português porque o ficheiro
 * é entregue ao próprio titular; datas e instantes em ISO 8601, durações em minutos inteiros.
 */
public final class PrivacyViews {

    private PrivacyViews() {
    }

    public record Export(
            Instant geradoEm,
            Empresa empresa,
            Titular titular,
            List<Contrato> contratos,
            List<Equipa> equipas,
            List<Atribuicao> planeamento,
            List<Picagem> picagens,
            List<RegistoHoras> registosDeHoras,
            List<FolhaHoras> folhasDeHoras,
            List<Ausencia> ausencias,
            List<Documento> documentos,
            Equipamento equipamento,
            List<Notificacao> notificacoes,
            List<EventoAuditoria> auditoria) {
    }

    public record Empresa(String nome) {
    }

    public record Titular(
            UUID id,
            String numero,
            String nome,
            String categoria,
            String telefone,
            String email,
            String nacionalidade,
            String localidade,
            LocalDate dataAdmissao,
            int capacidadeDiariaMin,
            BigDecimal custoHora,
            List<String> competencias,
            Map<String, String> tamanhos,
            String notas,
            String estado,
            Instant criadoEm,
            Instant atualizadoEm,
            Instant arquivadoEm,
            Instant anonimizadoEm,
            String fotografia) {
    }

    public record Contrato(String tipo, LocalDate inicio, LocalDate fim, Integer minutosSemanais, String notas, Instant criadoEm) {
    }

    public record Equipa(String equipa, LocalDate entrada, LocalDate saida) {
    }

    public record Atribuicao(
            LocalDate data,
            String obraCodigo,
            String obraNome,
            LocalTime inicio,
            LocalTime fim,
            int pausaMin,
            int minutosPlaneados,
            String fuso,
            String equipa,
            String viatura,
            boolean encarregado,
            String nota) {
    }

    public record Picagem(String tipo, Instant ocorreuEm, Instant horaDoDispositivo, String obraCodigo, Instant registadaEm) {
    }

    public record RegistoHoras(
            UUID id,
            LocalDate data,
            String obraCodigo,
            String obraNome,
            String fuso,
            Instant inicio,
            Instant fim,
            int pausaMin,
            Integer minutosTrabalhados,
            String estado,
            String origem,
            String nota,
            List<Revisao> revisoes) {
    }

    public record Revisao(Instant em, String autor, String motivo, JsonNode antes, JsonNode depois) {
    }

    public record FolhaHoras(
            LocalDate semana,
            String estado,
            Instant submetidaEm,
            String submetidaPor,
            Instant decididaEm,
            String decididaPor,
            String notaDecisao) {
    }

    public record Ausencia(
            String tipo,
            LocalDate inicio,
            LocalDate fim,
            Integer minutosParciais,
            String estado,
            String nota,
            Instant pedidaEm,
            Instant decididaEm,
            String decididaPor,
            String notaDecisao) {
    }

    public record Documento(String tipo, Instant criadoEm, Instant arquivadoEm, List<VersaoDocumento> versoes) {
    }

    public record VersaoDocumento(
            int versao,
            boolean atual,
            String ficheiro,
            String tipoConteudo,
            long tamanhoBytes,
            String sha256,
            LocalDate emitidoEm,
            LocalDate expiraEm,
            Instant carregadoEm,
            Instant verificadoEm,
            String estadoAnalise,
            String ficheiroNoZip) {
    }

    public record Equipamento(List<MovimentoEquipamento> movimentos, List<EquipamentoEmPosse> emPosse) {
    }

    public record MovimentoEquipamento(
            Instant em, String tipo, String artigo, String categoria, String tamanho, int quantidade, String numeroSerie, String nota) {
    }

    public record EquipamentoEmPosse(String artigo, String categoria, String tamanho, int quantidade, String numeroSerie) {
    }

    public record Notificacao(String tipo, String titulo, String texto, Instant criadaEm, Instant lidaEm) {
    }

    public record EventoAuditoria(String acao, Instant em, String autor, String papel) {
    }
}
