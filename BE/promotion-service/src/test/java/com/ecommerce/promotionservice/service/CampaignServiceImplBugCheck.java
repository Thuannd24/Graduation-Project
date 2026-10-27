package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.CampaignDto;
import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.impl.CampaignServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.camunda.bpm.engine.RepositoryService;
import org.camunda.bpm.engine.RuntimeService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

/**
 * Bug thật ở CampaignServiceImpl.updateCampaign. Chạy riêng: mvn -pl promotion-service test -Dtest=*BugCheck
 */
@ExtendWith(MockitoExtension.class)
class CampaignServiceImplBugCheck {

    @Mock private CampaignRepository campaignRepository;
    @Mock private IssuedVoucherRepository voucherRepository;
    @Mock private RuntimeService runtimeService;
    @Mock private RepositoryService repositoryService;
    @Mock private VoucherMaintenanceService voucherMaintenanceService;

    private CampaignServiceImpl service;
    private Campaign existing;

    @BeforeEach
    void setUp() {
        ObjectMapper om = new ObjectMapper();
        service = new CampaignServiceImpl(campaignRepository, voucherRepository, runtimeService, repositoryService,
                new WorkflowValidatorService(), new BpmnCompilerService(), om, new WorkflowTriggerResolver(om), voucherMaintenanceService);
        existing = Campaign.builder().id(5L).name("Sale 11/11").bpmnProcessDefinitionKey("sale_11_11")
                .startDate(LocalDateTime.of(2026, 11, 1, 0, 0)).endDate(LocalDateTime.of(2026, 11, 30, 0, 0)).active(true).build();
        when(campaignRepository.findById(5L)).thenReturn(Optional.of(existing));
        lenient().when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    @DisplayName("TC_PH6_CAMP_05: Cập nhật chỉ endDate = 15/10 (trước startDate hiện có 01/11) phải bị từ chối 'Ngày kết thúc phải sau ngày bắt đầu'")
    void updateOnlyEndDate_beforeExistingStart_mustBeRejected() {
        CampaignDto dto = CampaignDto.builder().endDate(LocalDateTime.of(2026, 10, 15, 0, 0)).build();

        assertThrows(IllegalArgumentException.class, () -> service.updateCampaign(5L, dto));
    }

    @Test
    @DisplayName("TC_PH6_CAMP_06: Cập nhật active=false phải suspend process definition trên Camunda như toggleCampaignActive (nếu không chiến dịch Timer vẫn tiếp tục chạy)")
    void updateActiveFalse_mustSuspendCamundaProcess() {
        service.updateCampaign(5L, CampaignDto.builder().active(false).build());

        verify(repositoryService).suspendProcessDefinitionByKey("sale_11_11", true, null);
    }
}
