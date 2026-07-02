package com.ecommerce.productservice.entity;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "product_tags")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@IdClass(ProductTagId.class)
public class ProductTag {

    @Id
    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Id
    @Column(nullable = false)
    private String tag;
}
