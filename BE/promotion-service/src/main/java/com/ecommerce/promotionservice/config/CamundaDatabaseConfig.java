package com.ecommerce.promotionservice.config;

import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.sql.Connection;
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
            ensureUtf8mb4Database(conn);

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

            widenVariableTextColumns(conn);
        } catch (Exception e) {
            System.err.println("Failed to check or initialize Camunda database schema: " + e.getMessage());
            e.printStackTrace();
        }
    }

    // Camunda's stock schema caps variable value storage at VARCHAR(4000) for TEXT_/TEXT2_ on
    // ACT_RU_VARIABLE, ACT_HI_VARINST and ACT_HI_DETAIL. Runtime variable writes silently spill
    // over to a ByteArrayEntity when a String value exceeds that, but the historic copy does not -
    // so any process variable longer than 4000 chars (e.g. a full HTML email pasted into a
    // "Send Email" node's custom-content field) throws "Data too long for column 'TEXT_'" the
    // moment Camunda tries to write its history record, which fails the whole flush and rolls back
    // the process instance's completion. Widening to MEDIUMTEXT removes that ceiling; this is safe
    // to run every startup since these columns aren't part of any key/foreign key.
    private void widenVariableTextColumns(Connection conn) {
        String[] tables = {"ACT_RU_VARIABLE", "ACT_HI_VARINST", "ACT_HI_DETAIL"};
        for (String table : tables) {
            try (Statement stmt = conn.createStatement()) {
                stmt.execute("ALTER TABLE " + table + " MODIFY COLUMN TEXT_ MEDIUMTEXT, MODIFY COLUMN TEXT2_ MEDIUMTEXT");
            } catch (Exception e) {
                System.err.println("Could not widen TEXT_/TEXT2_ columns on " + table + ": " + e.getMessage());
            }
        }
    }

    // Camunda's stock activiti.mysql.create.*.sql scripts create TEXT_/VARCHAR_ columns without an
    // explicit charset, so they silently inherit whatever charset the database itself has. On a
    // fresh DB created via the JDBC url's createDatabaseIfNotExist=true (or a MariaDB server whose
    // default isn't utf8mb4), that ends up as 3-byte utf8/utf8mb3 - which cannot store 4-byte
    // characters (emoji) that show up in campaign workflow JSON or custom email content. Camunda
    // then fails to persist ANY process variable containing one, rolling back the whole process
    // instance (voucher/point/email nodes never run). Forcing the DB to utf8mb4 before the create
    // scripts run makes every new table inherit the right charset from the start.
    private void ensureUtf8mb4Database(Connection conn) {
        try {
            String dbName = conn.getCatalog();
            if (dbName == null || dbName.isBlank()) {
                return;
            }
            try (Statement stmt = conn.createStatement()) {
                stmt.execute("ALTER DATABASE `" + dbName + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            }
        } catch (Exception e) {
            System.err.println("Could not ensure utf8mb4 charset on database: " + e.getMessage());
        }
    }
}
