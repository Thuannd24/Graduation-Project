package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "attributes")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Attribute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code; // v.d: 'cpu', 'color', 'ram', 'size'

    @Column(nullable = false)
    private String name; // v.d: 'Bộ vi xử lý', 'Màu sắc'

    @Column(name = "value_type", nullable = false)
    private String valueType; // v.d: 'text', 'select', 'boolean'

    @Column(name = "allowed_values", columnDefinition = "TEXT")
    private String allowedValues; // v.d: '4GB,8GB,16GB' hoặc '#ffffff,#000000'

    @Column(name = "is_color")
    private Boolean isColor;
}
