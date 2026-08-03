FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY chat-service/target/*.jar app.jar
EXPOSE 8088
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]
