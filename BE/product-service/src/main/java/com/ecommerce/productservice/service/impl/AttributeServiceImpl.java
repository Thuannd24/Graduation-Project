package com.ecommerce.productservice.service.impl;

import com.ecommerce.productservice.dto.AttributeDto;
import com.ecommerce.productservice.dto.CategoryAttributeDto;
import com.ecommerce.productservice.entity.Attribute;
import com.ecommerce.productservice.entity.CategoryAttribute;
import com.ecommerce.productservice.exception.ResourceNotFoundException;
import com.ecommerce.productservice.repository.AttributeRepository;
import com.ecommerce.productservice.repository.CategoryAttributeRepository;
import com.ecommerce.productservice.service.AttributeService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AttributeServiceImpl implements AttributeService {

    private final AttributeRepository attributeRepository;
    private final CategoryAttributeRepository categoryAttributeRepository;

    @Override
    @Transactional
    public AttributeDto createAttribute(AttributeDto dto) {
        if (attributeRepository.existsByCode(dto.getCode())) {
            throw new IllegalArgumentException("Attribute code '" + dto.getCode() + "' already exists");
        }
        
        validateAttribute(dto);
        
        Attribute attribute = Attribute.builder()
                .code(dto.getCode())
                .name(dto.getName())
                .valueType(dto.getValueType())
                .allowedValues(dto.getAllowedValues())
                .isColor(dto.getIsColor())
                .build();
        attribute = attributeRepository.save(attribute);
        return convertToDto(attribute);
    }

    @Override
    @Transactional
    public AttributeDto updateAttribute(Long id, AttributeDto dto) {
        Attribute attribute = attributeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Attribute", "id", id));
        
        validateAttribute(dto);
        
        attribute.setName(dto.getName());
        attribute.setValueType(dto.getValueType());
        attribute.setAllowedValues(dto.getAllowedValues());
        attribute.setIsColor(dto.getIsColor());
        attribute = attributeRepository.save(attribute);
        return convertToDto(attribute);
    }

    @Override
    public List<AttributeDto> getAllAttributes() {
        return attributeRepository.findAll().stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    @Override
    public AttributeDto getAttributeById(Long id) {
        return attributeRepository.findById(id)
                .map(this::convertToDto)
                .orElseThrow(() -> new ResourceNotFoundException("Attribute", "id", id));
    }

    @Override
    @Transactional
    public void deleteAttribute(Long id) {
        attributeRepository.deleteById(id);
    }

    @Override
    @Transactional
    public CategoryAttributeDto assignAttributeToCategory(CategoryAttributeDto dto) {
        // Verify attribute exists
        Attribute attribute = attributeRepository.findById(dto.getAttributeId())
                .orElseThrow(() -> new ResourceNotFoundException("Attribute", "id", dto.getAttributeId()));

        // Check if link already exists
        List<CategoryAttribute> existing = categoryAttributeRepository.findByCategoryId(dto.getCategoryId());
        CategoryAttribute link = existing.stream()
                .filter(ca -> ca.getAttributeId().equals(dto.getAttributeId()))
                .findFirst()
                .orElse(null);

        if (link == null) {
            link = CategoryAttribute.builder()
                    .categoryId(dto.getCategoryId())
                    .attributeId(dto.getAttributeId())
                    .isVariant(dto.getIsVariant() != null ? dto.getIsVariant() : false)
                    .isRequired(dto.getIsRequired() != null ? dto.getIsRequired() : false)
                    .isFilter(dto.getIsFilter() != null ? dto.getIsFilter() : false)
                    .build();
        } else {
            link.setIsVariant(dto.getIsVariant() != null ? dto.getIsVariant() : link.getIsVariant());
            link.setIsRequired(dto.getIsRequired() != null ? dto.getIsRequired() : link.getIsRequired());
            link.setIsFilter(dto.getIsFilter() != null ? dto.getIsFilter() : link.getIsFilter());
        }

        link = categoryAttributeRepository.save(link);
        return convertToDto(link, attribute);
    }

    @Override
    @Transactional
    public void removeAttributeFromCategory(Long categoryId, Long attributeId) {
        List<CategoryAttribute> links = categoryAttributeRepository.findByCategoryId(categoryId);
        CategoryAttribute target = links.stream()
                .filter(ca -> ca.getAttributeId().equals(attributeId))
                .findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("CategoryAttribute", "attributeId", attributeId));
        categoryAttributeRepository.delete(target);
    }

    @Override
    public List<CategoryAttributeDto> getAttributesByCategory(Long categoryId) {
        List<CategoryAttribute> links = categoryAttributeRepository.findByCategoryId(categoryId);
        Map<Long, Attribute> attributesMap = attributeRepository.findAll().stream()
                .collect(Collectors.toMap(Attribute::getId, a -> a));

        return links.stream()
                .map(link -> {
                    Attribute attr = attributesMap.get(link.getAttributeId());
                    return convertToDto(link, attr);
                })
                .collect(Collectors.toList());
    }

    private AttributeDto convertToDto(Attribute entity) {
        return AttributeDto.builder()
                .id(entity.getId())
                .code(entity.getCode())
                .name(entity.getName())
                .valueType(entity.getValueType())
                .allowedValues(entity.getAllowedValues())
                .isColor(entity.getIsColor())
                .build();
    }

    private CategoryAttributeDto convertToDto(CategoryAttribute link, Attribute attr) {
        return CategoryAttributeDto.builder()
                .id(link.getId())
                .categoryId(link.getCategoryId())
                .attributeId(link.getAttributeId())
                .attributeCode(attr != null ? attr.getCode() : null)
                .attributeName(attr != null ? attr.getName() : null)
                .attributeValueType(attr != null ? attr.getValueType() : null)
                .attributeAllowedValues(attr != null ? attr.getAllowedValues() : null)
                .attributeIsColor(attr != null ? attr.getIsColor() : null)
                .isVariant(link.getIsVariant())
                .isRequired(link.getIsRequired())
                .isFilter(link.getIsFilter())
                .build();
    }

    private void validateAttribute(AttributeDto dto) {
        if ("select".equals(dto.getValueType())) {
            String allowedValues = dto.getAllowedValues();
            if (allowedValues == null || allowedValues.trim().isEmpty()) {
                throw new IllegalArgumentException("Allowed values list cannot be empty for select-type attributes");
            }
            
            try {
                ObjectMapper mapper = new ObjectMapper();
                List<Map<String, Object>> options = mapper.readValue(allowedValues, 
                        new TypeReference<List<Map<String, Object>>>() {});
                
                if (options == null || options.isEmpty()) {
                    throw new IllegalArgumentException("At least one option must be defined");
                }
                
                for (Map<String, Object> opt : options) {
                    Object nameObj = opt.get("name");
                    if (nameObj == null || nameObj.toString().trim().isEmpty()) {
                        throw new IllegalArgumentException("Option name cannot be empty");
                    }
                    
                    if (Boolean.TRUE.equals(dto.getIsColor())) {
                        Object hexObj = opt.get("hex");
                        boolean hasHex = hexObj != null && !hexObj.toString().trim().isEmpty();
                        
                        if (!hasHex) {
                            throw new IllegalArgumentException("Color option '" + nameObj + "' must have a color code");
                        }
                        
                        String hexStr = hexObj.toString().trim();
                        // Auto prepend '#' if they write 3 or 6 digit hex
                        if (!hexStr.startsWith("#") && !hexStr.startsWith("rgb") && !hexStr.matches("^[a-zA-Z]+$")) {
                            if (hexStr.matches("^[A-Fa-f0-9]{3}$") || hexStr.matches("^[A-Fa-f0-9]{6}$")) {
                                hexStr = "#" + hexStr;
                                opt.put("hex", hexStr);
                            } else {
                                throw new IllegalArgumentException("Invalid color code '" + hexStr + "'. Must be hex (e.g. #ff0000), rgb, or standard color name.");
                            }
                        }
                    }
                }
                
                // Write back sanitized list
                dto.setAllowedValues(mapper.writeValueAsString(options));
            } catch (JsonProcessingException e) {
                if (Boolean.TRUE.equals(dto.getIsColor())) {
                    throw new IllegalArgumentException("Invalid JSON format for color attribute options: " + e.getMessage());
                }
            } catch (IllegalArgumentException e) {
                throw e;
            } catch (Exception e) {
                throw new IllegalArgumentException("Validation failed: " + e.getMessage());
            }
        }
    }
}
