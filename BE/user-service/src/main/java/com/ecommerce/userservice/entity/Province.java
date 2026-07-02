package com.ecommerce.userservice.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "provinces")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Province {

    @Id
    private Integer code;

    @Column(nullable = false, length = 100)
    private String name;
}
