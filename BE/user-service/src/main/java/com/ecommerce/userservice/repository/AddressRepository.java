package com.ecommerce.userservice.repository;

import com.ecommerce.userservice.entity.Address;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AddressRepository extends JpaRepository<Address, Long> {

    List<Address> findByUserId(Long userId);

    Optional<Address> findByUserIdAndId(Long userId, Long id);

    /**
     * Bulk update: đặt tất cả địa chỉ của user về is_default=false (1 query thay vì N queries).
     * Cần @Modifying vì đây là write operation, và @Transactional phải có ở caller.
     */
    @Modifying
    @Query("UPDATE Address a SET a.isDefault = false WHERE a.userId = :userId")
    void unsetDefaultByUserId(@Param("userId") Long userId);
}
