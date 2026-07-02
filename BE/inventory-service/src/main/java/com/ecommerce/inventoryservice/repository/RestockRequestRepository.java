package com.ecommerce.inventoryservice.repository;

import com.ecommerce.inventoryservice.entity.RestockRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface RestockRequestRepository extends JpaRepository<RestockRequest, Long> {

    List<RestockRequest> findByProductId(Long productId);

    List<RestockRequest> findByStatus(String status);
}
