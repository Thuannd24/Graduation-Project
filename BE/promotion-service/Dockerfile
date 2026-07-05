FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY promotion-service/target/*.jar app.jar
EXPOSE 8087
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

