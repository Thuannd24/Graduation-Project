package com.ecommerce.userservice.controller;

import com.ecommerce.userservice.dto.ApiResponse;
import com.ecommerce.userservice.entity.Province;
import com.ecommerce.userservice.entity.Ward;
import com.ecommerce.userservice.service.LocationService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/public/locations")
@RequiredArgsConstructor
public class LocationController {

    private final LocationService locationService;

    @GetMapping("/provinces")
    public ResponseEntity<ApiResponse<List<Province>>> getProvinces() {
        return ResponseEntity.ok(ApiResponse.success(locationService.getProvinces()));
    }

    @GetMapping("/provinces/{code}/wards")
    public ResponseEntity<ApiResponse<List<Ward>>> getWards(@PathVariable Integer code) {
        return ResponseEntity.ok(ApiResponse.success(locationService.getWards(code)));
    }
}
