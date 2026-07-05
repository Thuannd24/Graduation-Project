FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY product-service/target/*.jar app.jar
EXPOSE 8089
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]

