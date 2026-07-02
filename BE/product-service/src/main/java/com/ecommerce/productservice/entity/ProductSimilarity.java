package com.ecommerce.productservice.entity;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.index.Indexed;
import org.springframework.data.mongodb.core.mapping.Document;

import java.time.LocalDateTime;
import java.util.List;

@Document(collection = "product_similarities")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ProductSimilarity {

    @Id
    private String id;

    @Indexed(unique = true)
    private Long productId;

    private List<SimilarItem> similarItems;

    private LocalDateTime updatedAt;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class SimilarItem {
        private Long similarProductId;
        private Double similarityScore;
    }
}
