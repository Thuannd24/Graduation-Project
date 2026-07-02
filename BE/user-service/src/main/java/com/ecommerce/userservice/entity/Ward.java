package com.ecommerce.userservice.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "wards", indexes = @Index(name = "idx_ward_province", columnList = "province_code"))
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Ward {

    @Id
    private Integer code;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(name = "province_code", nullable = false)
    private Integer provinceCode;
}
