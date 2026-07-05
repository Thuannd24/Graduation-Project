FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY order-service/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

