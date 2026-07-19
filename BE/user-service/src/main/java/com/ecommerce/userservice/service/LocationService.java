package com.ecommerce.userservice.service;

import com.ecommerce.userservice.entity.Province;
import com.ecommerce.userservice.entity.Ward;
import com.ecommerce.userservice.exception.ResourceNotFoundException;
import com.ecommerce.userservice.repository.ProvinceRepository;
import com.ecommerce.userservice.repository.WardRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class LocationService {

    private final ProvinceRepository provinceRepository;
    private final WardRepository wardRepository;
    private final ObjectMapper objectMapper;

    @PostConstruct
    void syncIfEmpty() {
        if (provinceRepository.count() > 0)
            return;

        // Load from raw local vietnam_provinces.json (offline import)
        try {
            ClassPathResource resource = new ClassPathResource("vietnam_provinces.json");
            if (resource.exists()) {
                log.info("Loading provinces and wards from local vietnam_provinces.json...");
                try (InputStream stream = resource.getInputStream()) {
                    JsonNode data = objectMapper.readTree(stream);
                    int provinceCount = 0;
                    int wardCount = 0;
                    for (JsonNode p : data) {
                        int code = p.get("code").asInt();
                        provinceRepository.save(Province.builder().code(code).name(p.get("name").asText()).build());
                        provinceCount++;
                        
                        JsonNode items = null;
                        if (p.has("wards") && p.get("wards").isArray() && p.get("wards").size() > 0) {
                            items = p.get("wards");
                        } else if (p.has("districts") && p.get("districts").isArray() && p.get("districts").size() > 0) {
                            items = p.get("districts");
                        }
                        
                        if (items == null)
                            continue;
                        
                        wardRepository.deleteByProvinceCode(code);
                        for (JsonNode w : items) {
                            wardRepository.save(Ward.builder()
                                    .code(w.get("code").asInt())
                                    .name(w.get("name").asText())
                                    .provinceCode(code)
                                    .build());
                            wardCount++;
                        }
                    }
                    log.info("Successfully imported {} provinces and {} wards from local vietnam_provinces.json!", provinceCount, wardCount);
                }
            } else {
                log.warn("Local vietnam_provinces.json not found in classpath. Skipping import.");
            }
        } catch (Exception ex) {
            log.error("Failed to load local vietnam_provinces.json: {}", ex.getMessage());
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
