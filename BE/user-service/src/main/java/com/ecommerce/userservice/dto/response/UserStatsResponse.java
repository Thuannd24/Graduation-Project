package com.ecommerce.userservice.dto.response;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserStatsResponse {
    private long totalUsers;
    private long blacklistedUsers;
    private long activeUsers;
    private Map<String, Long> tierDistribution;
    private long newUsersThisWeek;
    private long newUsersThisMonth;
}
