package com.ecommerce.productservice.controller;

import com.ecommerce.productservice.dto.ApiResponse;
import com.ecommerce.productservice.dto.ProductDto;
import com.ecommerce.productservice.service.ProductService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/internal/products")
@RequiredArgsConstructor
public class InternalProductController {

    private final ProductService productService;

    @GetMapping("/price-info")
    public ApiResponse<List<ProductDto>> getPriceInfo(@RequestParam("ids") List<Long> productIds) {
        List<ProductDto> products = productService.getProductsByIds(productIds);
        return ApiResponse.success(products);
    }

    @GetMapping("/bulk")
    public ApiResponse<List<ProductDto>> getBulkProducts(@RequestParam("ids") List<Long> productIds) {
        List<ProductDto> products = productService.getProductsByIds(productIds);
        return ApiResponse.success(products);
    }
}
