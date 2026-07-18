package com.ecommerce.orderservice.repository;

import com.ecommerce.orderservice.entity.Order;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    List<Order> findByUserIdOrderByCreatedAtDesc(String userId);

    Optional<Order> findByIdAndUserId(Long id, String userId);

    Optional<Order> findByTrackingCode(String trackingCode);

    List<Order> findByUserIdAndStatus(String userId, String status);
    
    List<Order> findAllByStatusInAndCreatedAtBefore(List<String> statuses, LocalDateTime dateTime);
    
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.id = :id")
    Optional<Order> findByIdForUpdate(@Param("id") Long id);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT o FROM Order o WHERE o.trackingCode = :trackingCode")
    Optional<Order> findByTrackingCodeForUpdate(@Param("trackingCode") String trackingCode);

    @Query("SELECT COALESCE(SUM(o.finalAmount), 0) FROM Order o WHERE o.userId = :userId AND o.createdAt >= :startDate AND o.status IN ('DELIVERED', 'COMPLETED', 'SHIPPED', 'CONFIRMED')")
    BigDecimal sumFinalAmountByUserIdAndCreatedAtAfter(
            @Param("userId") String userId,
            @Param("startDate") LocalDateTime startDate
    );
}
