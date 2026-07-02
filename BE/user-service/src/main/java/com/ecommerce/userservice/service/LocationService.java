package com.ecommerce.userservice.service;

import com.ecommerce.userservice.entity.Province;
import com.ecommerce.userservice.entity.Ward;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.ProvinceRepository;
import com.ecommerce.userservice.repository.WardRepository;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class LocationService {

    private final ProvinceRepository provinceRepository;
    private final WardRepository wardRepository;
    private final RestTemplate restTemplate;

    @Value("${location.api-url}")
    private String apiUrl;

    @PostConstruct
    void syncIfEmpty() {
        if (provinceRepository.count() > 0)
            return;
        try {
            JsonNode provinces = restTemplate.getForObject(apiUrl + "?depth=1", JsonNode.class);
            if (provinces == null)
                return;
            for (JsonNode p : provinces) {
                int code = p.get("code").asInt();
                provinceRepository.save(Province.builder().code(code).name(p.get("name").asText()).build());
                JsonNode detail = restTemplate.getForObject(apiUrl + "/p/" + code + "?depth=2", JsonNode.class);
                if (detail == null || !detail.has("wards"))
                    continue;
                wardRepository.deleteByProvinceCode(code);
                for (JsonNode w : detail.get("wards")) {
                    wardRepository.save(Ward.builder()
                            .code(w.get("code").asInt())
                            .name(w.get("name").asText())
                            .provinceCode(code)
                            .build());
                }
            }
            log.info("Synced {} provinces", provinces.size());
        } catch (Exception ex) {
            log.error("Location sync failed: {}", ex.getMessage());
        }
    }

    public List<Province> getProvinces() {
        return provinceRepository.findAllByOrderByNameAsc();
    }

    public List<Ward> getWards(Integer provinceCode) {
        if (!provinceRepository.existsById(provinceCode)) {
            throw new ResourceNotFoundException("Province", "code", provinceCode);
        }
        return wardRepository.findByProvinceCodeOrderByNameAsc(provinceCode);
    }
}
