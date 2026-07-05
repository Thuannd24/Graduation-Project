FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY payment-service/target/*.jar app.jar
EXPOSE 8084
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

