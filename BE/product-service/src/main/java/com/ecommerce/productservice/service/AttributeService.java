package com.ecommerce.productservice.service;

import com.ecommerce.productservice.dto.AttributeDto;
import com.ecommerce.productservice.dto.CategoryAttributeDto;

import java.util.List;

public interface AttributeService {
    AttributeDto createAttribute(AttributeDto dto);
    AttributeDto updateAttribute(Long id, AttributeDto dto);
    List<AttributeDto> getAllAttributes();
    AttributeDto getAttributeById(Long id);
    void deleteAttribute(Long id);

    CategoryAttributeDto assignAttributeToCategory(CategoryAttributeDto dto);
    void removeAttributeFromCategory(Long categoryId, Long attributeId);
    List<CategoryAttributeDto> getAttributesByCategory(Long categoryId);
}
