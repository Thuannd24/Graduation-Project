package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "category_attributes", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"category_id", "attribute_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CategoryAttribute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "category_id", nullable = false)
    private Long categoryId;

    @Column(name = "attribute_id", nullable = false)
    private Long attributeId;

    @Column(name = "is_variant", nullable = false)
    @Builder.Default
    private Boolean isVariant = false; // True: dùng làm biến thể (ram, size). False: thông số tĩnh (cpu, material)

    @Column(name = "is_required", nullable = false)
    @Builder.Default
    private Boolean isRequired = false;
}
