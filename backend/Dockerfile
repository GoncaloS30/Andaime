FROM eclipse-temurin:25-jdk AS build
WORKDIR /workspace
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -DskipTests dependency:go-offline
COPY src src
RUN ./mvnw -q -DskipTests package

FROM eclipse-temurin:25-jre
RUN useradd --system --uid 10001 --home /app andaime
WORKDIR /app
COPY --from=build /workspace/target/andaime-api-*.jar app.jar
USER andaime
EXPOSE 8088
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
