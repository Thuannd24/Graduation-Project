package com.ecommerce.userservice.repository;

import com.ecommerce.userservice.entity.Province;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProvinceRepository extends JpaRepository<Province, Integer> {

    List<Province> findAllByOrderByNameAsc();
}
