package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "product_attribute_values", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"product_id", "attribute_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductAttributeValue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "attribute_id", nullable = false)
    private Long attributeId;

    @Column(nullable = false)
    private String value; // Giá trị của thuộc tính tĩnh (v.d: 'Ryzen 9')
}
