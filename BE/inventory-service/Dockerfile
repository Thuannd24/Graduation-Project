FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY inventory-service/target/*.jar app.jar
EXPOSE 8093
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

