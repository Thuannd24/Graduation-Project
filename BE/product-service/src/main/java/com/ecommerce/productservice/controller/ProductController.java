package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.dto.ProductReviewDto;
import com.ecommerce.productservice.entity.ProductDocument;
import com.ecommerce.productservice.service.ProductService;
import com.ecommerce.productservice.service.ReviewService;
import com.ecommerce.productservice.service.SearchService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Slice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;
    private final SearchService searchService;
    private final ReviewService reviewService;

    @GetMapping("/api/v1/public/products")
    public ApiResponse<Slice<ProductDto>> getAllProducts(
            @RequestParam(value = "active", required = false) Boolean active,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.success(productService.getAllProducts(active, pageable));
    }

    @GetMapping("/api/v1/public/products/category/{categoryId}")
    public ApiResponse<Slice<ProductDto>> getProductsByCategory(
            @PathVariable Long categoryId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.success(productService.getProductsByCategory(categoryId, pageable));
    }

    @GetMapping("/api/v1/public/products/{id}")
    public ApiResponse<ProductDto> getProductById(@PathVariable Long id) {
        ProductDto product = productService.getProductById(id);
        if (product == null) {
            throw new RuntimeException("Product not found with id: " + id);
        }
        return ApiResponse.success(product);
    }

    @GetMapping("/api/v1/public/products/slug/{slug}")
    public ApiResponse<ProductDto> getProductBySlug(@PathVariable String slug) {
        ProductDto product = productService.getProductBySlug(slug);
        if (product == null) {
            throw new RuntimeException("Product not found with slug: " + slug);
        }
        return ApiResponse.success(product);
    }

    @GetMapping("/api/v1/public/products/search")
    public ApiResponse<Page<ProductDocument>> searchProducts(
            @RequestParam("q") String query,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.success(searchService.searchProducts(query, pageable));
    }

    @GetMapping("/api/v1/public/products/{productId}/reviews")
    public ApiResponse<List<ProductReviewDto>> getReviews(@PathVariable Long productId) {
        return ApiResponse.success(reviewService.getReviewsByProduct(productId));
    }

    // Secured API - requires user header
    @PostMapping("/api/v1/products/reviews")
    public ApiResponse<ProductReviewDto> addReview(
            @RequestHeader(value = "X-User-Id", required = false) String userId,
            @RequestBody ProductReviewDto reviewDto) {
        if (userId != null) {
            reviewDto.setUserId(userId);
        }
        return ApiResponse.success(reviewService.addReview(reviewDto));
    }
}
