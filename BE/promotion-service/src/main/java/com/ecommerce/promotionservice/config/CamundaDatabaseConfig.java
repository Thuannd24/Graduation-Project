package com.ecommerce.promotionservice.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;

@Configuration
public class CamundaDatabaseConfig implements BeanPostProcessor {

    private boolean initialized = false;

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) throws BeansException {
        if (bean instanceof DataSource && !initialized) {
            DataSource dataSource = (DataSource) bean;
            initializeCamundaSchema(dataSource);
            initialized = true;
        }
        return bean;
    }

    private void initializeCamundaSchema(DataSource dataSource) {
        try (Connection conn = dataSource.getConnection()) {
            boolean tableExists = false;

            // Check table existence by attempting a simple select query
            try (Statement stmt = conn.createStatement()) {
                stmt.executeQuery("SELECT 1 FROM ACT_GE_PROPERTY LIMIT 1");
                tableExists = true;
            } catch (Exception e) {
                // Table does not exist or schema query failed
            }

            if (!tableExists) {
                System.out.println("Initializing Camunda database schema manually for ecommerce_promotion_db...");
                ResourceDatabasePopulator populator = new ResourceDatabasePopulator();
                populator.addScript(
                        new ClassPathResource("org/camunda/bpm/engine/db/create/activiti.mysql.create.engine.sql"));
                populator.addScript(
                        new ClassPathResource("org/camunda/bpm/engine/db/create/activiti.mysql.create.history.sql"));
                populator.addScript(
                        new ClassPathResource("org/camunda/bpm/engine/db/create/activiti.mysql.create.identity.sql"));
                populator.addScript(new ClassPathResource(
                        "org/camunda/bpm/engine/db/create/activiti.mysql.create.case.engine.sql"));
                populator.addScript(new ClassPathResource(
                        "org/camunda/bpm/engine/db/create/activiti.mysql.create.case.history.sql"));
                populator.addScript(new ClassPathResource(
                        "org/camunda/bpm/engine/db/create/activiti.mysql.create.decision.engine.sql"));
                populator.addScript(new ClassPathResource(
                        "org/camunda/bpm/engine/db/create/activiti.mysql.create.decision.history.sql"));
                populator.execute(dataSource);
                System.out.println("Camunda database schema initialized successfully!");
            } else {
                System.out.println("Camunda database schema already exists. Skipping manual initialization.");
            }
        } catch (Exception e) {
            System.err.println("Failed to check or initialize Camunda database schema: " + e.getMessage());
            e.printStackTrace();
        }
    }
}
