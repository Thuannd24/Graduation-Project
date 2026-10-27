package com.ecommerce.promotionservice.service;

import com.ecommerce.promotionservice.dto.CampaignDto;
import com.ecommerce.promotionservice.dto.WorkflowGraphDto;
import com.ecommerce.promotionservice.entity.Campaign;
import com.ecommerce.promotionservice.repository.CampaignRepository;
import com.ecommerce.promotionservice.repository.IssuedVoucherRepository;
import com.ecommerce.promotionservice.service.impl.CampaignServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.camunda.bpm.engine.RepositoryService;
import org.camunda.bpm.engine.RuntimeService;
import org.camunda.bpm.engine.repository.Deployment;
import org.camunda.bpm.engine.repository.DeploymentBuilder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.Optional;

import static com.ecommerce.promotionservice.service.WorkflowFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Unit test CampaignServiceImpl (PH6): tạo chiến dịch (validate -> biên dịch -> deploy Camunda -> lưu), kiểm tra dữ liệu,
 * cập nhật ngân sách, bật/tắt chiến dịch. Validator/Compiler dùng bản thật (hàm thuần), Camunda + repository mock.
 */
@ExtendWith(MockitoExtension.class)
class CampaignServiceImplTest {

    @Mock private CampaignRepository campaignRepository;
    @Mock private IssuedVoucherRepository voucherRepository;
    @Mock private RuntimeService runtimeService;
    @Mock private RepositoryService repositoryService;
    @Mock private VoucherMaintenanceService voucherMaintenanceService;
    @Mock private DeploymentBuilder deploymentBuilder;
    @Mock private Deployment deployment;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private CampaignServiceImpl service;

    private static final LocalDateTime START = LocalDateTime.of(2026, 11, 1, 0, 0);
    private static final LocalDateTime END = LocalDateTime.of(2026, 11, 30, 23, 59);

    @BeforeEach
    void setUp() {
        service = new CampaignServiceImpl(campaignRepository, voucherRepository, runtimeService, repositoryService,
                new WorkflowValidatorService(), new BpmnCompilerService(), objectMapper,
                new WorkflowTriggerResolver(objectMapper), voucherMaintenanceService);
    }

    private String json(WorkflowGraphDto g) throws Exception {
        return objectMapper.writeValueAsString(g);
    }

    private void deployOk() {
        when(repositoryService.createDeployment()).thenReturn(deploymentBuilder);
        when(deploymentBuilder.name(anyString())).thenReturn(deploymentBuilder);
        when(deploymentBuilder.addString(anyString(), anyString())).thenReturn(deploymentBuilder);
        when(deploymentBuilder.deploy()).thenReturn(deployment);
        when(deployment.getId()).thenReturn("dep-1");
    }

    @Test
    @DisplayName("TC_PH6_CAMP_01: Tạo chiến dịch hợp lệ: tự sinh BPMN key không dấu & duy nhất (tri_an_khach_hang_gold_2), biên dịch từ workflowJson, deploy Camunda, lưu ngân sách còn lại = quỹ meta 1.000.000, triggerType từ workflow")
    void create_success() throws Exception {
        deployOk();
        when(campaignRepository.existsByBpmnProcessDefinitionKey("tri_an_khach_hang_gold")).thenReturn(true);
        when(campaignRepository.existsByBpmnProcessDefinitionKey("tri_an_khach_hang_gold_2")).thenReturn(false);
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> {
            Campaign c = inv.getArgument(0);
            c.setId(41L);
            return c;
        });
        CampaignDto dto = CampaignDto.builder().name("Tri ân khách hàng GOLD").startDate(START).endDate(END)
                .totalBudget(new BigDecimal("5")).bpmnXml("<hack/>").workflowJson(json(validGraph())).build();

        CampaignDto res = service.createCampaign(dto);

        assertEquals(41L, res.getId());
        assertEquals("tri_an_khach_hang_gold_2", res.getBpmnProcessDefinitionKey());
        ArgumentCaptor<String> xml = ArgumentCaptor.forClass(String.class);
        verify(deploymentBuilder).addString(eq("tri_an_khach_hang_gold_2.bpmn"), xml.capture());
        assertTrue(xml.getValue().contains("<bpmn:process id=\"tri_an_khach_hang_gold_2\""));
        assertNotEquals("<hack/>", res.getBpmnXml());
        ArgumentCaptor<Campaign> saved = ArgumentCaptor.forClass(Campaign.class);
        verify(campaignRepository).save(saved.capture());
        assertEquals(0, new BigDecimal("1000000").compareTo(saved.getValue().getTotalBudget()));
        assertEquals(0, new BigDecimal("1000000").compareTo(saved.getValue().getRemainingBudget()));
        assertEquals("Trigger_Event_NewUser", saved.getValue().getTriggerType());
        assertTrue(saved.getValue().getActive());
    }

    @Test
    @DisplayName("TC_PH6_CAMP_02: Tạo chiến dịch bị từ chối: tên trống; ngày kết thúc trước ngày bắt đầu; thiếu workflowJson; có node voucher mà không có quỹ; BPMN key trùng; workflow không hợp lệ -> IllegalArgumentException, không deploy, không lưu")
    void create_validationErrors() throws Exception {
        lenient().when(campaignRepository.existsByBpmnProcessDefinitionKey(anyString())).thenReturn(false);
        when(campaignRepository.existsByBpmnProcessDefinitionKey("dup_key")).thenReturn(true);
        String ok = json(validGraph());
        WorkflowGraphDto noMeta = validGraph();
        noMeta.setMeta(null);
        WorkflowGraphDto broken = validGraph();
        broken.getNodes().removeIf(n -> n.getId().equals("t1"));
        broken.getEdges().removeIf(e -> e.getId().equals("f1"));

        CampaignDto[] bad = {
                CampaignDto.builder().name("  ").startDate(START).endDate(END).workflowJson(ok).build(),
                CampaignDto.builder().name("A").startDate(END).endDate(START).workflowJson(ok).build(),
                CampaignDto.builder().name("A").startDate(START).endDate(END).bpmnXml("<bpmn/>").build(),
                CampaignDto.builder().name("A").startDate(START).endDate(END).workflowJson(json(noMeta)).build(),
                CampaignDto.builder().name("A").startDate(START).endDate(END).workflowJson(ok).bpmnProcessDefinitionKey(" dup_key ").build(),
                CampaignDto.builder().name("A").startDate(START).endDate(END).workflowJson(json(broken)).build(),
        };
        String[] expected = {"Tên chiến dịch", "Ngày kết thúc phải sau", "Thiếu workflowJson", "Quỹ ngân sách", "đã tồn tại", "Workflow không hợp lệ"};
        for (int i = 0; i < bad.length; i++) {
            CampaignDto d = bad[i];
            IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.createCampaign(d));
            assertTrue(ex.getMessage().contains(expected[i]), ex.getMessage());
        }
        verifyNoInteractions(repositoryService);
        verify(campaignRepository, never()).save(any());
    }

    @Test
    @DisplayName("TC_PH6_CAMP_03: Cập nhật ngân sách giữ phần đã dùng: tổng 1.000.000 còn 600.000 (đã dùng 400.000) -> tổng 1.500.000 còn 1.100.000; giảm tổng xuống 300.000 thì còn 0 (không âm); chiến dịch không tồn tại -> lỗi")
    void update_budgetRecalculation() throws Exception {
        WorkflowGraphDto g = validGraph();
        g.setMeta(null);
        Campaign c = Campaign.builder().id(5L).name("C").totalBudget(new BigDecimal("1000000")).remainingBudget(new BigDecimal("600000"))
                .startDate(START).endDate(END).bpmnProcessDefinitionKey("c5").workflowJson(json(g)).active(true).build();
        when(campaignRepository.findById(5L)).thenReturn(Optional.of(c));
        when(campaignRepository.findById(404L)).thenReturn(Optional.empty());
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));

        CampaignDto r1 = service.updateCampaign(5L, CampaignDto.builder().totalBudget(new BigDecimal("1500000")).build());
        assertEquals(0, new BigDecimal("1500000").compareTo(r1.getTotalBudget()));
        assertEquals(0, new BigDecimal("1100000").compareTo(r1.getRemainingBudget()));

        c.setTotalBudget(new BigDecimal("1000000"));
        c.setRemainingBudget(new BigDecimal("600000"));
        CampaignDto r2 = service.updateCampaign(5L, CampaignDto.builder().totalBudget(new BigDecimal("300000")).build());
        assertEquals(0, BigDecimal.ZERO.compareTo(r2.getRemainingBudget()));

        assertThrows(IllegalArgumentException.class, () -> service.updateCampaign(5L, CampaignDto.builder().name(" ").build()));
        assertThrows(IllegalArgumentException.class, () -> service.updateCampaign(404L, CampaignDto.builder().name("X").build()));
        verifyNoInteractions(repositoryService);
    }

    @Test
    @DisplayName("TC_PH6_CAMP_04: Tắt chiến dịch -> active=false và suspend process definition trên Camunda; bật lại -> activate; lỗi Camunda không làm hỏng thao tác")
    void toggleActive_syncsCamunda() {
        Campaign c = Campaign.builder().id(6L).name("C").bpmnProcessDefinitionKey("c6").active(true).build();
        when(campaignRepository.findById(6L)).thenReturn(Optional.of(c));
        when(campaignRepository.save(any(Campaign.class))).thenAnswer(inv -> inv.getArgument(0));

        assertFalse(service.toggleCampaignActive(6L, false).getActive());
        verify(repositoryService).suspendProcessDefinitionByKey("c6", true, null);

        doThrow(new RuntimeException("engine down")).when(repositoryService).activateProcessDefinitionByKey("c6", true, null);
        assertTrue(service.toggleCampaignActive(6L, true).getActive());
        verify(repositoryService).activateProcessDefinitionByKey("c6", true, null);
    }
}
