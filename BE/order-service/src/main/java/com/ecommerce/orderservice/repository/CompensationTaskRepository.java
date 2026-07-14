package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.CompensationTask;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CompensationTaskRepository extends JpaRepository<CompensationTask, Long> {

    List<CompensationTask> findByStatus(String status);

    boolean existsByOrderIdAndTaskTypeAndStatus(Long orderId, String taskType, String status);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT c FROM CompensationTask c WHERE c.id = :id")
    Optional<CompensationTask> findByIdForUpdate(@Param("id") Long id);
}
