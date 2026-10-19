package pt.andaime;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.modulith.Modulith;

@Modulith
@SpringBootApplication
public class AndaimeApplication {

    public static void main(String[] args) {
        SpringApplication.run(AndaimeApplication.class, args);
    }
}
