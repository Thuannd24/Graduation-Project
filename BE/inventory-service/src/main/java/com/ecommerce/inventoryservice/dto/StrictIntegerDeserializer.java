package com.ecommerce.inventoryservice.dto;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.JsonDeserializer;
import com.fasterxml.jackson.databind.JsonMappingException;

import java.io.IOException;

/**
 * Chỉ nhận số nguyên cho số lượng tồn kho.
 *
 * <p>Mặc định Jackson cắt 2.5 thành 2 (ACCEPT_FLOAT_AS_INT) nên nhập kho số lẻ vẫn "thành công" và sổ kho
 * lệch hàng thực nhận (UI_PH4_FR02_004). Chuỗi rỗng được trả về null để {@code @NotNull} báo "bắt buộc nhập"
 * thay vì âm thầm thành 0 (UI_PH4_FR02_007).
 */
public class StrictIntegerDeserializer extends JsonDeserializer<Integer> {

    static final String MESSAGE = "Số lượng phải là số nguyên (không nhập số thập phân hoặc chữ).";

    @Override
    public Integer deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
        JsonToken token = p.currentToken();
        if (token == JsonToken.VALUE_NUMBER_INT) {
            long value = p.getLongValue();
            if (value > Integer.MAX_VALUE || value < Integer.MIN_VALUE) {
                throw JsonMappingException.from(p, "Số lượng vượt quá giới hạn cho phép.");
            }
            return (int) value;
        }
        if (token == JsonToken.VALUE_STRING) {
            String text = p.getText().trim();
            if (text.isEmpty()) {
                return null;
            }
            if (text.matches("[-+]?[0-9]{1,9}")) {
                return Integer.parseInt(text);
            }
            throw JsonMappingException.from(p, MESSAGE);
        }
        if (token == JsonToken.VALUE_NULL) {
            return null;
        }
        throw JsonMappingException.from(p, MESSAGE);
    }
}
