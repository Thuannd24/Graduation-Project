package com.ecommerce.promotionservice.delegate.support;

import org.camunda.bpm.engine.delegate.DelegateExecution;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class DelegateVariableHelper {

    private DelegateVariableHelper() {
    }

    /** Reads a List<Long> process variable (e.g. voucherRestrictedCategoryIds), tolerating any
     *  numeric/string element type Camunda may have deserialized it as. */
    public static List<Long> getLongList(DelegateExecution execution, String key) {
        Object v = execution.getVariable(key);
        if (!(v instanceof List<?> list)) {
            return Collections.emptyList();
        }
        List<Long> result = new ArrayList<>();
        for (Object item : list) {
            if (item == null) {
                continue;
            }
            try {
                result.add(Long.parseLong(item.toString().trim()));
            } catch (NumberFormatException ignored) {
                // skip malformed entries
            }
        }
        return result;
    }

    public static String getStr(DelegateExecution execution, String key) {
        Object v = execution.getVariable(key);
        return v != null ? v.toString() : "";
    }

    public static int getInt(DelegateExecution execution, String key, int defaultValue) {
        Object v = execution.getVariable(key);
        try {
            return v != null ? Integer.parseInt(v.toString()) : defaultValue;
        } catch (NumberFormatException e) {
            return defaultValue;
        }
    }

    public static BigDecimal getBigDecimal(DelegateExecution execution, String key) {
        Object v = execution.getVariable(key);
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal bd) {
            return bd;
        }
        if (v instanceof Number n) {
            return BigDecimal.valueOf(n.doubleValue());
        }
        try {
            return new BigDecimal(v.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static BigDecimal firstBigDecimal(DelegateExecution execution, String... keys) {
        for (String key : keys) {
            BigDecimal value = getBigDecimal(execution, key);
            if (value != null && value.compareTo(BigDecimal.ZERO) > 0) {
                return value;
            }
        }
        return null;
    }
}
