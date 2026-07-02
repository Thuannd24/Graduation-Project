# Stage 1: Build stage
FROM maven:3.8.4-openjdk-17-slim AS build
WORKDIR /app
COPY . .
RUN mvn -pl promotion-service -am clean package -DskipTests

# Stage 2: Runtime stage
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
COPY --from=build /app/promotion-service/target/*.jar app.jar
EXPOSE 8087
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=docker", "app.jar"]
