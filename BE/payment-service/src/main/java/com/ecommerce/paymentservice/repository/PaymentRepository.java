package com.ecommerce.paymentservice.repository;

import com.ecommerce.paymentservice.entity.Payment;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByTxnRef(String txnRef);
    Optional<Payment> findByOrderId(Long orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.txnRef = :txnRef")
    Optional<Payment> findByTxnRefWithLock(@Param("txnRef") String txnRef);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.orderId = :orderId")
    Optional<Payment> findByOrderIdWithLock(@Param("orderId") Long orderId);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from Payment p where p.id = :id")
    Optional<Payment> findByIdWithLock(@Param("id") Long id);

    List<Payment> findAllByStatusAndCreatedAtBefore(String status, LocalDateTime createdAt);
}
