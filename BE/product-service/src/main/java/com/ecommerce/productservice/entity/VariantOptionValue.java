package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "variant_option_values", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"variant_id", "attribute_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VariantOptionValue {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "variant_id", nullable = false)
    private Long variantId;

    @Column(name = "attribute_id", nullable = false)
    private Long attributeId;

    @Column(nullable = false)
    private String value; // Giá trị chọn của biến thể (v.d: '16GB', 'Đỏ')
}
