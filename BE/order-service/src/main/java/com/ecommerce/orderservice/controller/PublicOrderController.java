package com.ecommerce.orderservice.controller;

import com.ecommerce.orderservice.dto.ApiResponse;
import com.ecommerce.orderservice.dto.response.WarrantyItemResponse;
import com.ecommerce.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/orders")
@RequiredArgsConstructor
public class PublicOrderController {

    private final OrderService orderService;

    /**
     * Tra cứu bảo hành theo số điện thoại — không cần đăng nhập.
     * GET /api/v1/public/orders/warranty?phone=0909123456
     */
    @GetMapping("/warranty")
    public ApiResponse<List<WarrantyItemResponse>> lookupWarranty(@RequestParam("phone") String phone) {
        return ApiResponse.success(orderService.lookupWarrantyByPhone(phone.trim()));
    }
}
