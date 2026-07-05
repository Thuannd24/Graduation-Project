FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY notification-service/target/*.jar app.jar
EXPOSE 8086
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

