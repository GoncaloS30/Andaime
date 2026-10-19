package pt.andaime.documents.application;

import java.io.InputStream;
import java.net.URI;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.ResponseInputStream;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.urlconnection.UrlConnectionHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.NoSuchBucketException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Armazenamento privado de ficheiros compatível com S3 (SeaweedFS em desenvolvimento e testes; qualquer S3 em
 * produção). Os ficheiros nunca são públicos: o download passa sempre pela API, que verifica o acesso.
 */
@Component
public class ObjectStorage {

    private static final Logger log = LoggerFactory.getLogger(ObjectStorage.class);

    private final S3Client client;
    private final String bucket;
    private volatile boolean bucketReady;

    public ObjectStorage(
            @Value("${andaime.storage.endpoint}") String endpoint,
            @Value("${andaime.storage.region}") String region,
            @Value("${andaime.storage.bucket}") String bucket,
            @Value("${andaime.storage.access-key}") String accessKey,
            @Value("${andaime.storage.secret-key}") String secretKey) {
        this.bucket = bucket;
        this.client = S3Client.builder()
                .endpointOverride(URI.create(endpoint))
                .region(Region.of(region))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(accessKey, secretKey)))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(true).build())
                .httpClientBuilder(UrlConnectionHttpClient.builder())
                // Servidores compatíveis com S3 nem sempre suportam os checksums por omissão do SDK.
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .build();
    }

    public void put(String key, byte[] content, String contentType) {
        ensureBucket();
        client.putObject(request -> request.bucket(bucket).key(key).contentType(contentType).contentLength((long) content.length),
                RequestBody.fromBytes(content));
    }

    public ResponseInputStream<GetObjectResponse> get(String key) {
        return client.getObject(request -> request.bucket(bucket).key(key));
    }

    public void delete(String key) {
        try {
            client.deleteObject(request -> request.bucket(bucket).key(key));
        } catch (S3Exception exception) {
            log.warn("Não foi possível apagar o objeto {}: {}", key, exception.getMessage());
        }
    }

    public InputStream open(String key) {
        return get(key);
    }

    private void ensureBucket() {
        if (bucketReady) {
            return;
        }
        synchronized (this) {
            if (bucketReady) {
                return;
            }
            try {
                client.headBucket(request -> request.bucket(bucket));
            } catch (NoSuchBucketException exception) {
                client.createBucket(request -> request.bucket(bucket));
            } catch (S3Exception exception) {
                if (exception.statusCode() != 404) {
                    throw exception;
                }
                client.createBucket(request -> request.bucket(bucket));
            }
            bucketReady = true;
        }
    }
}
