package com.ecommerce.userservice.repository;

import com.ecommerce.userservice.entity.Ward;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface WardRepository extends JpaRepository<Ward, Integer> {

    List<Ward> findByProvinceCodeOrderByNameAsc(Integer provinceCode);

    @Modifying
    @Transactional
    void deleteByProvinceCode(Integer provinceCode);
}
