package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductReviewDto;
import com.ecommerce.productservice.dto.request.ReviewReplyRequest;
import com.ecommerce.productservice.service.ReviewService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/admin/reviews")
@RequiredArgsConstructor
public class AdminReviewController {

    private final ReviewService reviewService;

    @GetMapping
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<Page<ProductReviewDto>> getAllReviews(
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "10") int size) {
        Pageable pageable = PageRequest.of(page, size);
        return ApiResponse.success(reviewService.getAllReviews(pageable));
    }

    @PostMapping("/{id}/reply")
    @PreAuthorize("hasAnyRole('ROLE_ADMIN', 'ROLE_STAFF')")
    public ApiResponse<ProductReviewDto> replyToReview(
            @PathVariable("id") Long reviewId,
            @RequestHeader(value = "X-User-Id", required = false) String staffUserId,
            @Valid @RequestBody ReviewReplyRequest request) {
        if (staffUserId == null || staffUserId.isBlank()) {
            throw new IllegalArgumentException("Không xác định được nhân viên thực hiện phản hồi.");
        }
        return ApiResponse.success(reviewService.replyToReview(reviewId, staffUserId, request.getContent()));
    }
}
