# TEST CASE CHI TIẾT: PROMOTION & CAMPAIGN SERVICE

> Nguồn tham chiếu chính: mã nguồn thực tế `BE/promotion-service/src/main/java/com/ecommerce/promotionservice/**`
> (đặc biệt `service/WorkflowValidatorService.java`, `service/BpmnCompilerService.java`,
> `service/CampaignTriggerService.java`, `service/CampaignVariableEnricher.java`,
> `service/impl/CampaignServiceImpl.java`, `service/impl/VoucherIssuanceServiceImpl.java`,
> `service/impl/VoucherRedemptionServiceImpl.java`, `service/impl/VoucherQueryServiceImpl.java`,
> `service/impl/VoucherMaintenanceServiceImpl.java`, `service/impl/CampaignBudgetServiceImpl.java`,
> `delegate/*.java`, `controller/*.java`, `entity/Campaign.java`, `entity/IssuedVoucher.java`).
> Tài liệu `docs/services/07_PROMOTION_SERVICE.md` (đã đồng bộ lại với code) được dùng làm bối cảnh
> nghiệp vụ. Test case dưới đây bám theo code thật — **không** còn module chống gian lận
> (`FraudCheckDelegate`, `Condition_AntiFraudScore`, bảng `fraud_logs`), **không** còn AI Price
> Sensitivity Scoring, **không** còn Cost Price Guard/Budget Deduct qua Redis — các mô-đun này đã
> bị loại bỏ hoàn toàn khỏi hệ thống nên không được đưa vào phạm vi test.
>
> **Ghi chú rút gọn:** Bộ test case này đã được rút gọn theo yêu cầu tập trung vào các luồng
> nghiệp vụ quan trọng (trigger campaign, issue/redeem voucher, nâng hạng, loyalty, ngân sách,
> validate workflow graph). Các test case chỉ kiểm tra thiếu 1 tham số/field đơn lẻ lặp lại cho
> nhiều node type đã được gộp thành 1 dòng đại diện; các test case rau ria (định dạng hiển thị,
> sắp xếp, thao tác CRUD phụ, edge-case hạ tầng ít giá trị) đã được loại bỏ.

---

## 0. PHẠM VI (SCOPE) VÀ GHI CHÚ MÔI TRƯỜNG TEST

### 0.1. Các module trong phạm vi

| # | Module | Class/Method liên quan |
|---|---|---|
| 1 | CRUD Campaign (tạo/sửa/xoá/toggle/liệt kê/dashboard/stats) | `CampaignServiceImpl`, `CampaignController` |
| 2 | Validate workflow graph | `WorkflowValidatorService.validate()` |
| 3 | Compile workflow graph → BPMN 2.0 XML | `BpmnCompilerService.compile()` |
| 4 | Deploy campaign lên Camunda Engine | `CampaignServiceImpl.createCampaign()`/`updateCampaign()` (`RepositoryService.createDeployment()`) |
| 5 | Trigger campaign theo sự kiện (Kafka) | `CampaignTriggerService.triggerByEventType()`, `PromotionKafkaConsumer` |
| 6 | Trigger campaign theo lịch trình (Timer) | `Trigger_Timer_Schedule` → `BpmnCompilerService` sinh `timerEventDefinition`, do Camunda Engine tự kích hoạt |
| 7 | Enrich biến process trước khi chạy workflow | `CampaignVariableEnricher.enrich()` |
| 8 | Phát hành voucher (Percent/Fixed/Freeship) | `IssueVoucherPercentDelegate`, `IssueVoucherFixedDelegate`, `IssueVoucherFreeshippingDelegate`, `VoucherIssuanceServiceImpl` |
| 9 | Redeem voucher khi checkout (preview/apply/redeem/release) | `VoucherRedemptionServiceImpl`, `VoucherController`, `InternalVoucherController` |
| 10 | Nâng hạng thành viên | `UpgradeMemberRankDelegate` |
| 11 | Tặng điểm loyalty | `LoyaltyPointDelegate` |
| 12 | Gửi email khuyến mãi | `SendEmailDelegate` |
| 13 | Ngân sách chiến dịch (reserve/release, hết ngân sách) | `CampaignBudgetServiceImpl` |
| 14 | Tra cứu voucher của user + trạng thái | `VoucherQueryServiceImpl` (`VoucherController.getMyVouchers`) |
| 15 | Tự động hết hạn voucher (scheduler) | `VoucherMaintenanceServiceImpl` |

### 0.2. Cần mock ở tầng Unit Test

Các Feign Client gọi ra service khác **phải mock** trong Unit Test (không có network thật):

- `UserClient` (`getAiProfile`, `getProfileByKeycloakId`, `updateTier`, `updatePoints`)
- `OrderClient` (`getTotalSpending`, `getOrderSummary`)
- `ProductClient` (`getBulkProducts`)
- `NotificationClient` (`sendNotification`)
- Camunda `RuntimeService`/`RepositoryService`/`HistoryService` (mock hoặc dùng Camunda test engine trong-memory H2 cho phần liên quan compile/deploy)
- `StringRedisTemplate` (dùng cho lock chống trigger trùng và lock scheduler)

### 0.3. Test được với DB/Engine thật (Integration Test)

- Deploy BPMN XML thật lên Camunda Engine test (H2 in-memory hoặc MariaDB Testcontainers) và verify `ProcessDefinition` được tạo.
- Start process instance thật, đi qua Service Task thật (delegate) với Feign Client mock qua WireMock, verify biến process cuối cùng và bản ghi `issued_vouchers`.
- Pessimistic lock ngân sách (`CampaignRepository.findByIdForUpdate`) dưới race condition — cần DB thật hỗ trợ `SELECT ... FOR UPDATE`.
- Redis lock chống trigger trùng (`CampaignTriggerService`) và lock scheduler (`VoucherMaintenanceServiceImpl`) — cần Redis thật hoặc Testcontainers Redis.

### 0.4. Quy ước Test ID

- `UT-PROMO-0xx`: Unit Test — mock toàn bộ dependency (Repository, Feign Client, Camunda Service, Redis).
- `IT-PROMO-0xx`: Integration Test — DB thật (Testcontainers MariaDB/H2), Camunda Engine thật, mock các service ngoài qua WireMock, Redis thật khi cần.

---

## 1. MODULE: CRUD CAMPAIGN

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-001 | `createCampaign` | Unit | Tạo campaign hợp lệ: validate workflow OK, compile OK, deploy OK → lưu DB | `workflowJson` hợp lệ (1 Trigger, 1 Condition đủ nhánh, 1 Action voucher, 1 End); mock `validatorService.validate()` trả `valid=true`; mock `compilerService.compile()` trả XML; mock `repositoryService.createDeployment()` thành công | Gọi `createCampaign(dto)` với `name`, `totalBudget=10000000`, `startDate < endDate` | - `campaignRepository.save()` được gọi với `remainingBudget = totalBudget`, `active=true` (default)<br>- `bpmnProcessDefinitionKey` được auto-gen nếu không truyền (qua `BpmnKeyGenerator.ensureUnique`)<br>- `triggerType` được set từ `WorkflowTriggerResolver` | Cao |
| UT-PROMO-002 | `createCampaign` — thiếu workflowJson | Unit | Từ chối tạo campaign nếu không có `workflowJson` (server không nhận `bpmnXml` gửi trực tiếp từ client) | `dto.workflowJson = null`, `dto.bpmnXml` có giá trị (giả mạo) | Gọi `createCampaign(dto)` | Ném `IllegalArgumentException` "Thiếu workflowJson..."; **không** gọi `repositoryService.createDeployment()` với `dto.bpmnXml` | Cao |
| UT-PROMO-003 | `createCampaign` — workflow không hợp lệ | Unit | Nếu `validatorService.validate()` trả `valid=false` → không compile, không deploy | Mock validate trả lỗi (node thiếu tham số) | Gọi `createCampaign(dto)` | Ném `IllegalArgumentException` "Workflow không hợp lệ, không thể deploy: [nodeId] message..."; không gọi `compilerService.compile()` | Cao |
| UT-PROMO-004 | `createCampaign` — deploy Camunda lỗi | Unit | `repositoryService.createDeployment()` ném exception | Validate/compile OK, deploy thất bại | Gọi `createCampaign(dto)` | Ném `RuntimeException` "Camunda deployment failed: ..."; **không** lưu Campaign vào DB (rollback transaction) | Cao |
| UT-PROMO-005 | `updateCampaign` — đổi `totalBudget` giữ nguyên phần đã dùng | Unit | Tăng/giảm `totalBudget`, `remainingBudget` phải điều chỉnh giữ nguyên số đã tiêu (`used = oldTotal - oldRemaining`) | `oldTotal=1000000`, `oldRemaining=400000` (đã dùng 600000); `newTotal=2000000` | Gọi `updateCampaign` với `totalBudget=2000000` | `remainingBudget = 2000000 - 600000 = 1400000` | Cao |
| UT-PROMO-006 | `updateCampaign` — workflow đổi → validate + compile + redeploy revision mới | Unit | `dto.workflowJson` khác `existing.workflowJson` | Workflow mới hợp lệ | Gọi `updateCampaign` với `workflowJson` mới | `validatorService.validate()` được gọi; `compilerService.compile()` được gọi; `repositoryService.createDeployment()` gọi tạo **revision mới** (không xoá version cũ); `existing.bpmnXml`, `triggerType` được cập nhật | Cao |
| UT-PROMO-007 | `updateCampaign` — workflow mới không hợp lệ | Unit | Validate thất bại khi update | Mock validate trả lỗi | Gọi `updateCampaign` với `workflowJson` lỗi | Ném `IllegalArgumentException` "Workflow không hợp lệ: ..."; entity gốc **không** bị thay đổi (transaction rollback) | Cao |
| UT-PROMO-008 | `toggleCampaignActive` — bật/tắt đồng bộ 2 chiều với Camunda | Unit | `active=true→false` phải suspend, `active=false→true` phải activate process definition trên Camunda | Campaign tồn tại, đổi trạng thái cả 2 chiều | Gọi `toggleCampaignActive(5, true)` rồi `toggleCampaignActive(5, false)` | Mỗi lần `campaign.active` lưu DB đúng giá trị; `repositoryService.activateProcessDefinitionByKey(...)`/`suspendProcessDefinitionByKey(...)` được gọi tương ứng | Trung bình |
| UT-PROMO-009 | `getActiveCampaigns` (public) | Unit | Chỉ trả campaign `active=true` và đang trong khoảng `startDate <= now <= endDate`, không lộ `budget`/`bpmnXml` | 3 campaign: 1 active trong hạn, 1 active hết hạn, 1 inactive | Gọi `getActiveCampaigns()` | Chỉ trả 1 campaign (active + trong hạn); `PublicCampaignDto` chỉ có `id/name/startDate/endDate/active`, không có field budget | Cao |
| IT-PROMO-001 | `POST /api/v1/admin/campaigns` | Integration | Tạo campaign thành công end-to-end, deploy thật lên Camunda test engine | DB thật, Camunda engine thật (test), JWT ADMIN | Gọi API với `workflowJson` hợp lệ đầy đủ (Trigger → Condition → Action Voucher → End) | HTTP 201; bản ghi `campaigns` có `bpmn_xml` không rỗng; `ACT_RE_PROCDEF` có 1 definition mới với key tương ứng | Cao |
| IT-PROMO-002 | `PUT /api/v1/admin/campaigns/{id}` | Integration | Redeploy revision mới khi đổi workflow, version tăng | Campaign đã tồn tại (revision 1) | Gọi API update với `workflowJson` khác | Camunda có process definition version 2 cùng key; `campaigns.bpmn_xml` cập nhật nội dung mới | Cao |

---

## 2. MODULE: VALIDATE WORKFLOW GRAPH (`WorkflowValidatorService`)

> Module này là logic nghiệp vụ core của campaign builder (không phải validate field thông thường) nên được giữ đầy đủ nhất trong tài liệu; chỉ gộp các test case "thiếu 1 tham số" lặp lại cho từng node type thành các dòng đại diện.

### 2.1. Quy tắc cấu trúc toàn cục

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-010 | `validate` — graph null/thiếu nodes/edges | Unit | Graph không có `nodes` hoặc `edges` | `graph.nodes = null` | Gọi `validate(graph)` | `valid=false`; 1 lỗi `missing_parameter` field `graph` | Cao |
| UT-PROMO-011 | `validate` — node type không hợp lệ | Unit | Node có `type` không thuộc danh sách đã biết (ví dụ `"Condition_AntiFraudScore"` — đã bị xoá khỏi hệ thống) | Graph có 1 node `type="Condition_AntiFraudScore"` | Gọi `validate(graph)` | `valid=false`; lỗi `invalid_connectivity` field `type`, message nêu rõ type không hợp lệ | Cao |
| UT-PROMO-012 | `validate` — thiếu Trigger | Unit | Không có node Trigger nào | Graph chỉ có Condition/Action/End | Gọi `validate(graph)` | Lỗi global `missing_parameter` field `trigger` | Cao |
| UT-PROMO-013 | `validate` — nhiều hơn 1 Trigger | Unit | 2 node Trigger trong cùng graph | Graph có `Trigger_Event_NewUser` + `Trigger_Timer_Schedule` | Gọi `validate(graph)` | Lỗi global `invalid_connectivity` field `trigger`, "chỉ được có DUY NHẤT 1 Node Kích hoạt" | Cao |
| UT-PROMO-014 | `validate` — thiếu End Event | Unit | Không có node `End_Event` | Graph có Trigger + Action, không có End | Gọi `validate(graph)` | Lỗi global `missing_parameter` field `end_event` | Cao |
| UT-PROMO-015 | `validate` — có node voucher nhưng thiếu `meta.totalBudget` | Unit | Workflow có `Action_IssueVoucher_Percent` nhưng `meta.totalBudget` null/≤0 | `WorkflowBudgetHelper.requiresVoucherBudget()=true` | Gọi `validate(graph)` | Lỗi `missing_parameter` field `meta.totalBudget` | Cao |
| UT-PROMO-016 | `validate` — `meta.totalBudget` nhỏ hơn tổng trần voucher tối thiểu | Unit | `meta.totalBudget=10000` nhưng tổng `maxDiscountAmount` của các node voucher = 100000 | 1 node `Action_IssueVoucher_Percent` với `maxDiscountAmount=100000` | Gọi `validate(graph)` | Lỗi `invalid_data` field `meta.totalBudget`, gợi ý nên ≥ tổng trừ tối đa | Trung bình |

### 2.2. Trigger node — tham số bắt buộc theo loại

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-017 | `validate` — Trigger in/out-degree sai | Unit | Trigger có `in-degree != 0` hoặc `out-degree != 1` | Có 1 edge trỏ **vào** node Trigger; node Trigger có 0 hoặc 2 edge ra | Gọi `validate(graph)` | 2 lỗi `invalid_connectivity` (field `in_degree`, `out_degree`) | Cao |
| UT-PROMO-018 | `validate` — thiếu tham số bắt buộc theo từng loại Trigger node | Unit | Đại diện cho các Trigger cần tham số riêng: `Trigger_Event_OrderSuccess` thiếu `minOrderValue`; `Trigger_Timer_Schedule` thiếu cả `cronExpression` và cặp `startDate`+`endDate` | `properties = {}` cho từng loại | Gọi `validate(graph)` với từng node type | Mỗi trường hợp trả lỗi `missing_parameter` đúng field (`minOrderValue`, `cronExpression / startDate+endDate`) | Cao |
| UT-PROMO-019 | `validate` — `Trigger_Event_ReviewProduct` — `minRating` ngoài khoảng | Unit | `minRating=6` (ngoài 1–5) | `properties = { minRating: 6 }` | Gọi `validate(graph)` | Lỗi `wrong_data_type` field `minRating`, "phải nằm trong khoảng 1–5" | Cao |

### 2.3. Condition node (Gateway) — cấu trúc & tham số nhánh

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-020 | `validate` — Condition in-degree = 0 | Unit | Node Condition không có edge vào | — | Gọi `validate(graph)` | Lỗi `invalid_connectivity` field `in_degree` | Cao |
| UT-PROMO-021 | `validate` — Condition chỉ có 1 nhánh ra | Unit | `out-degree = 1` (< 2) | 1 edge ra duy nhất | Gọi `validate(graph)` | Lỗi `invalid_connectivity` field `out_degree`, "phải có ít nhất 2 nhánh ra" | Cao |
| UT-PROMO-022 | `validate` — thiếu nhánh `isDefault` | Unit | Không có edge nào `isDefault=true` | 2 nhánh, cả hai đều `isDefault=false/null` | Gọi `validate(graph)` | Lỗi `missing_parameter` field `isDefault`, "BẮT BUỘC phải có đúng 1 nhánh ra... Else" | Cao |
| UT-PROMO-023 | `validate` — 2 nhánh cùng `isDefault=true` | Unit | 2 edge cùng đánh dấu default | — | Gọi `validate(graph)` | Lỗi `invalid_connectivity` field `isDefault`, "chỉ được có ĐÚNG 1 nhánh Else" | Cao |
| UT-PROMO-024 | `validate` — thiếu tham số bắt buộc theo từng loại Condition node | Unit | Đại diện: `Condition_MemberRank` thiếu `allowedRanks`; `Condition_TotalSpending` thiếu `minSpendingAmount`/`daysLookback` | `properties = {}` cho từng loại | Gọi `validate(graph)` với từng node type | Mỗi trường hợp trả đúng lỗi `missing_parameter` cho field tương ứng | Trung bình |
| UT-PROMO-025 | `validate` — nhánh thiếu `condition` (JUEL) | Unit | Edge không phải default nhưng `condition = null/blank` | — | Gọi `validate(graph)` | Lỗi `missing_parameter` field `edge[...].condition` | Cao |
| UT-PROMO-026 | `validate` — nhánh sai `operator`/`value` theo từng loại Condition | Unit | Đại diện: `Condition_MemberRank` với `operator="EQUALS"` (không thuộc {IN, NOT_IN}); hoặc `value="PLATINUM"` (không thuộc MEMBER/SILVER/GOLD/VIP) | `edgeProps` cấu hình sai từng trường hợp | Gọi `validate(graph)` | Lỗi `missing_parameter` field `edge[...].operator` (sai operator) hoặc `invalid_data` field `edge[...].value` (sai value) | Cao |
| UT-PROMO-027 | `validate` — 2 nhánh IF trùng điều kiện (dead branch) | Unit | 2 edge không-default cùng `Condition_MemberRank`, cùng `operator=IN`, cùng `value=["GOLD"]` | — | Gọi `validate(graph)` | Lỗi `invalid_data` field `branches`, "có ít nhất 2 nhánh IF cấu hình điều kiện giống hệt nhau" (chỉ báo 1 lần) | Cao |

### 2.4. Action node — tham số theo loại

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-028 | `validate` — Action in/out-degree sai | Unit | `in-degree=0` hoặc `out-degree != 1` | — | Gọi `validate(graph)` | 2 lỗi `invalid_connectivity` | Cao |
| UT-PROMO-029 | `validate` — `Action_IssueVoucher_Percent` — `discountPercent` ngoài (0,100] | Unit | `discountPercent=150` hoặc `0` | — | Gọi `validate(graph)` | Lỗi `wrong_data_type` field `discountPercent` | Cao |
| UT-PROMO-030 | `validate` — giá trị số phải > 0 theo từng loại Action Voucher | Unit | Đại diện cho trần/giảm giá của cả 3 loại voucher: `Action_IssueVoucher_Percent.maxDiscountAmount=0`; `Action_IssueVoucher_Fixed.discountAmount<=0`; `Action_IssueVoucher_Freeship.maxShippingDiscount=0` | — | Gọi `validate(graph)` với từng loại | Mỗi trường hợp trả lỗi `wrong_data_type` đúng field, message "phải > 0" | Cao |
| UT-PROMO-031 | `validate` — thiếu tham số bắt buộc theo từng loại Action node | Unit | Đại diện: `Action_IssueVoucher_Fixed` thiếu `minOrderValue`; `Action_Send_Email` thiếu cả `templateId` và `rawContent` | `properties = {}` cho từng loại | Gọi `validate(graph)` với từng node type | Mỗi trường hợp trả đúng lỗi `missing_parameter` cho field tương ứng | Trung bình |
| UT-PROMO-032 | `validate` — `Action_Loyalty_Point` mode `ORDER_SPEND` nhưng Trigger không phải OrderSuccess | Unit | `calculationMode="ORDER_SPEND"`, Trigger là `Trigger_Event_NewUser` | — | Gọi `validate(graph)` | Lỗi `invalid_data` field `calculationMode` | Trung bình |
| UT-PROMO-033 | `validate` — `Action_Loyalty_Point` mode `FIXED` với `pointAmount=0` | Unit | `calculationMode="FIXED"`, `pointAmount=0` | — | Gọi `validate(graph)` | Lỗi `invalid_data` field `pointAmount`, "FIXED yêu cầu pointAmount khác 0" | Trung bình |
| UT-PROMO-034 | `validate` — `Action_Upgrade_MemberRank` — `targetTier` không hợp lệ | Unit | `targetTier="PLATINUM"` (không thuộc SILVER/GOLD/VIP) | — | Gọi `validate(graph)` | Lỗi `invalid_data` field `targetTier` | Trung bình |

### 2.5. Quy tắc toàn cục (orphan / cycle / reachability)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-035 | `validate` — node cô lập (orphan) | Unit | 1 node Action không có edge vào lẫn ra, không kết nối vào flow chính | — | Gọi `validate(graph)` | Lỗi `invalid_connectivity` field `connectivity`, "bị mồ côi" | Cao |
| UT-PROMO-036 | `validate` — vòng lặp vô hạn không có node ngắt quãng | Unit | Condition A → Condition B → Condition A (cycle), không có Timer/`Action_Send_*` trong vòng | — | Gọi `validate(graph)` | Lỗi global `invalid_connectivity` field `cycle`, "Phát hiện vòng lặp vô hạn" | Cao |
| UT-PROMO-037 | `validate` — vòng lặp có node ngắt quãng (hợp lệ) | Unit | Cycle A → B(`Action_Send_Email`) → A | — | Gọi `validate(graph)` | Không có lỗi `cycle` (vòng có "wait state" được coi là hợp lệ) | Trung bình |
| UT-PROMO-038 | `validate` — node không phải End nhưng out-degree = 0 | Unit | 1 node Action là điểm cuối (không nối tới End_Event) | — | Gọi `validate(graph)` | Lỗi `invalid_connectivity` field `reachability`, "Mọi nhánh đều phải dẫn về một Node Kết thúc" | Cao |
| UT-PROMO-039 | `validate` — End Event sai in/out-degree | Unit | `End_Event` có `in-degree=0` hoặc `out-degree>0` | — | Gọi `validate(graph)` | Lỗi `invalid_connectivity` (field `in_degree` hoặc `out_degree`) | Cao |
| UT-PROMO-040 | `validate` — workflow hoàn toàn hợp lệ (happy path) | Unit | Trigger đủ tham số → Condition đủ 2 nhánh (1 default) → Action Voucher đủ tham số → End; `meta.totalBudget` đủ | Graph chuẩn | Gọi `validate(graph)` | `valid=true`; `errors` rỗng; `summary` = "✅ Workflow hợp lệ..." | Cao |

---

## 3. MODULE: COMPILE WORKFLOW → BPMN XML (`BpmnCompilerService`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-041 | `compile` — Trigger thường → `startEvent` | Unit | Node `Trigger_Event_OrderSuccess` | Graph hợp lệ | Gọi `compile(graph, key, name)` | XML chứa `<bpmn:startEvent id="...">` không có `timerEventDefinition` | Cao |
| UT-PROMO-042 | `compile` — `Trigger_Timer_Schedule` với `cronExpression` → `timeCycle` | Unit | `properties.cronExpression="0 0 12 * * ?"` | — | Gọi `compile(...)` | XML chứa `<bpmn:timerEventDefinition>` với `<bpmn:timeCycle>0 0 12 * * ?</bpmn:timeCycle>` | Cao |
| UT-PROMO-043 | `compile` — Condition → `exclusiveGateway` với `default=` | Unit | Node Condition có 1 nhánh `isDefault=true` với id `e3` | — | Gọi `compile(...)` | `<bpmn:exclusiveGateway id="..." default="e3">` | Cao |
| UT-PROMO-044 | `compile` — Action → `serviceTask` với `delegateExpression` đúng | Unit | Node `Action_IssueVoucher_Percent` | — | Gọi `compile(...)` | `<bpmn:serviceTask ... camunda:delegateExpression="${issueVoucherPercentDelegate}">`; tất cả `properties` (discountPercent, maxDiscountAmount, expireDays) xuất hiện dưới dạng `camunda:inputParameter` | Cao |
| UT-PROMO-045 | `compile` — Sequence Flow có condition (không phải default) | Unit | Edge không default, `condition="${memberRank == 'GOLD'}"` | — | Gọi `compile(...)` | `<bpmn:sequenceFlow ...><bpmn:conditionExpression ...>${memberRank == 'GOLD'}</bpmn:conditionExpression></bpmn:sequenceFlow>` | Cao |
| UT-PROMO-046 | `compile` — Sequence Flow default không có conditionExpression | Unit | Edge `isDefault=true` | — | Gọi `compile(...)` | `<bpmn:sequenceFlow .../>` tự đóng, không có `conditionExpression` | Cao |
| IT-PROMO-003 | Compile + Deploy | Integration | XML sinh ra từ `compile()` deploy được thật lên Camunda Engine không lỗi parse | Graph hợp lệ đầy đủ loại node | `compile()` → `repositoryService.createDeployment().addString(...).deploy()` | Deploy thành công, không ném `ParseException`/`XMLException`; `ProcessDefinition` mới xuất hiện trong `ACT_RE_PROCDEF` | Cao |

---

## 4. MODULE: TRIGGER CAMPAIGN

### 4.1. Trigger theo sự kiện (Event-based, qua Kafka)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-047 | `PromotionKafkaConsumer.consumeUserCreated` | Unit | Nhận `user-created-events` với `eventType=UserRegisteredEvent` → trigger `Trigger_Event_NewUser` | Message JSON hợp lệ có `userId`, `keycloakUserId`, `email` | Gọi `consumeUserCreated(message, ack)` | `campaignTriggerService.triggerByEventType("Trigger_Event_NewUser", vars)` được gọi với `vars` chứa `userDbId`, `userId`, `email`; `ack.acknowledge()` được gọi | Cao |
| UT-PROMO-048 | `PromotionKafkaConsumer.consumeUserCreated` — eventType khác bị bỏ qua | Unit | `eventType != "UserRegisteredEvent"` | — | Gọi `consumeUserCreated` | `triggerByEventType` **không** được gọi; vẫn `ack.acknowledge()` | Trung bình |
| UT-PROMO-049 | `PromotionKafkaConsumer.consumePaymentEvent` | Unit | `payment-events` với `eventType=PaymentSuccessEvent` → trigger `Trigger_Event_OrderSuccess` | Message có `orderId`, `amount` | Gọi `consumePaymentEvent` | `triggerByEventType("Trigger_Event_OrderSuccess", vars)` với `vars.totalAmount`/`finalAmount` = `amount` | Cao |
| UT-PROMO-050 | `PromotionKafkaConsumer.consumeProductReviewed` | Unit | `product-reviewed-events` với `eventType=ProductReviewedEvent` → trigger `Trigger_Event_ReviewProduct` | Message có `reviewId`, `rating`, `productId` | Gọi `consumeProductReviewed` | `triggerByEventType("Trigger_Event_ReviewProduct", vars)` với `vars.rating` đúng | Cao |
| UT-PROMO-051 | `CampaignTriggerService.triggerByEventType` — không có campaign active | Unit | Không có campaign nào `active=true` + `triggerType` khớp + trong khoảng ngày | Repository trả rỗng | Gọi `triggerByEventType(...)` | Không gọi `startCampaignProcess`; log debug, không lỗi | Trung bình |
| UT-PROMO-052 | `triggerByEventType` — trigger filter `minOrderValue` không đạt | Unit | Trigger `Trigger_Event_OrderSuccess` với `minOrderValue=500000`; event có `totalAmount=100000` | — | Gọi `triggerByEventType` | `passesTriggerFilter` trả `false`; campaign bị skip, không start process | Cao |
| UT-PROMO-053 | `triggerByEventType` — trigger filter `minRating` không đạt | Unit | `Trigger_Event_ReviewProduct` với `minRating=5`; event có `rating=3` | — | Gọi `triggerByEventType` | Campaign bị skip | Cao |
| UT-PROMO-054 | `triggerByEventType` — chống trigger trùng lặp (idempotency theo businessKey) | Unit | Cùng `orderId` gửi 2 lần (duplicate Kafka at-least-once) | `businessKey = campaignId:triggerType:orderId`; lần 1 đã có `historicCount>0` | Gọi `triggerByEventType` 2 lần liên tiếp cho cùng orderId | Lần 2: `runtimeService.startProcessInstanceById`/`ByKey` **không** được gọi lại (skip do đã có instance active/historic với cùng businessKey) | Cao |
| UT-PROMO-055 | `triggerByEventType` — Redis lock chống race 2 request đồng thời | Unit | 2 luồng gọi song song cùng businessKey; mock `setIfAbsent` trả `false` cho luồng thứ 2 | — | Gọi `triggerByEventType` từ 2 thread | Luồng thứ 2 log "Another in-flight trigger..." và **không** start process; chỉ 1 process instance được tạo | Cao |
| IT-PROMO-004 | End-to-end trigger theo Kafka event | Integration | Publish message thật lên topic `payment-events` (Testcontainers Kafka hoặc embedded), campaign `Trigger_Event_OrderSuccess` đủ điều kiện | DB thật có campaign active, Camunda engine thật, WireMock cho UserClient/OrderClient/ProductClient | Publish `PaymentSuccessEvent` cho `orderId=100`, `amount=1000000` | Process instance được start; voucher được ghi vào `issued_vouchers`; `campaigns.remaining_budget` giảm | Cao |

### 4.2. Trigger theo lịch trình (Timer)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| IT-PROMO-005 | Timer-based trigger tự chạy theo cron | Integration | Campaign deploy với `Trigger_Timer_Schedule` có `cronExpression` ngắn (test) | Camunda Engine thật với Job Executor bật | Deploy campaign, đợi tới thời điểm cron khớp | Camunda tự sinh Job và start process instance mới **không cần gọi API nào từ ứng dụng** (do `timeCycle` trong BPMN) | Cao |
| IT-PROMO-006 | Timer-based với `startDate`/`endDate` (one-shot) | Integration | `properties` có `startDate` trong tương lai gần, không có `cronExpression` | Camunda Engine thật | Deploy, đợi tới `startDate` | Process instance start đúng 1 lần tại thời điểm `startDate`, không lặp lại | Trung bình |

### 4.3. Enrich biến process (`CampaignVariableEnricher`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-056 | `enrich` — resolve Keycloak UUID → DB user id | Unit | `variables.userId` là UUID (chứa `-`), chưa có `userDbId` | Mock `userClient.getProfileByKeycloakId` trả `{ data: { id: 123, email, phoneNumber } }` | Gọi `enrich(variables)` | `variables.userDbId=123`; `variables.userId="123"`; `email`/`phone` được set nếu chưa có | Cao |
| UT-PROMO-057 | `enrich` — set `memberRank` từ `customerTier` | Unit | Mock `userClient.getAiProfile(userDbId)` trả `{ data: { customerTier: "GOLD" } }` | — | Gọi `enrich(variables)` | `variables.memberRank = "GOLD"` | Cao |
| UT-PROMO-058 | `enrich` — enrich context đơn hàng: `orderProductIds`, `orderCategoryIds`, `targetProvince` | Unit | `variables.orderId` có giá trị; mock `orderClient.getOrderSummary` trả `shippingAddress="123 Đường ABC, Hà Nội"`, `productIds=[1,2]`; mock `productClient.getBulkProducts` trả `categoryId` tương ứng | — | Gọi `enrich(variables)` | `variables.orderProductIds=[1,2]`, `orderCategoryIds` chứa categoryId, `targetProvince="Hanoi"` (suy từ địa chỉ chứa "Hà Nội") | Cao |

---

## 5. MODULE: PHÁT HÀNH VOUCHER (ISSUE VOUCHER)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-059 | `VoucherIssuanceServiceImpl.issuePercent` — happy path | Unit | Phát voucher % hợp lệ | `discountPercent=10`, `maxDiscountAmount=50000`, `expireDays=7`, ngân sách còn đủ | Gọi `issuePercent(userId, campaignId, 10, 50000, 7, null, null)` | `budgetService.reserveBudget(campaignId, 50000)` được gọi; voucher lưu DB với `code` bắt đầu `VPC-`, `status=UNUSED`, `expiresAt = now+7d` | Cao |
| UT-PROMO-060 | `issuePercent` — `discountPercent` ngoài (0,100] | Unit | `discountPercent=0` hoặc `101` | — | Gọi `issuePercent(...)` | Ném `IllegalArgumentException` "discountPercent phải trong khoảng (0, 100]." | Cao |
| UT-PROMO-061 | `issuePercent` — ngân sách không đủ | Unit | `budgetService.reserveBudget` ném `IllegalStateException` ("Ngân sách chiến dịch không đủ...") | Campaign `remainingBudget=10000`, cần reserve `50000` | Gọi `issuePercent(...)` | Exception được ném lên trên (không tạo voucher, không lưu DB) | Cao |
| UT-PROMO-062 | `issuePercent` — gắn `restrictedCategoryIds`/`restrictedProductIds` | Unit | Campaign có node `Condition_ContainsCategory` với `targetIds=[10]` | `restrictedCategoryIds=[10]` truyền vào | Gọi `issuePercent(..., [10], null)` | Voucher lưu `restrictedCategoryIds="10"` (CSV) | Trung bình |
| UT-PROMO-063 | `VoucherIssuanceServiceImpl.issueFixed` — happy path | Unit | `discountAmount=20000`, `minOrderValue=150000` | — | Gọi `issueFixed(...)` | Voucher `voucherType=FIXED`, code prefix `VPF-`, `minOrderValue` lưu đúng | Cao |
| UT-PROMO-064 | `issueFixed` — `discountAmount <= 0` | Unit | `discountAmount=0` | — | Gọi `issueFixed(...)` | Ném `IllegalArgumentException` "discountAmount phải > 0." | Cao |
| UT-PROMO-065 | `VoucherIssuanceServiceImpl.issueFreeship` — happy path | Unit | `maxShippingDiscount=30000` | — | Gọi `issueFreeship(...)` | Voucher `voucherType=FREESHIP`, code prefix `VFS-` | Cao |
| UT-PROMO-066 | `issueFreeship` — `maxShippingDiscount <= 0` | Unit | `maxShippingDiscount=0` | — | Gọi `issueFreeship(...)` | Ném `IllegalArgumentException` "maxShippingDiscount phải > 0." | Cao |
| UT-PROMO-067 | `IssueVoucherPercentDelegate.execute` — thiếu `userDbId` | Unit | `userContextResolver.resolveUserDbId` trả `Optional.empty()` | — | Gọi `execute(execution)` | `execution.setVariable("voucherIssued", false)`; **không** gọi `voucherIssuanceService.issuePercent` | Cao |
| UT-PROMO-068 | `IssueVoucherPercentDelegate.execute` — thành công | Unit | Đủ biến `discountPercent`, `maxDiscountAmount`, `expireDays`, `userDbId` | — | Gọi `execute(execution)` | `execution` có `voucherCode`, `voucherId`, `voucherExpiresAt`, `voucherIssued=true` | Cao |
| UT-PROMO-069 | `IssueVoucherFreeshippingDelegate.execute` — service ném exception (VD ngân sách hết) | Unit | `voucherIssuanceService.issueFreeship` ném `IllegalStateException` | — | Gọi `execute(execution)` | Exception bị catch trong delegate; `execution.setVariable("voucherIssued", false)`; **process Camunda không bị fail toàn bộ** (log error, tiếp tục flow) | Cao |
| IT-PROMO-007 | End-to-end phát voucher qua process Camunda | Integration | Deploy + start process với node `Action_IssueVoucher_Percent` | DB thật, Camunda thật | Start process với `userId` hợp lệ | Bản ghi `issued_vouchers` mới xuất hiện; `campaigns.remaining_budget` giảm đúng `maxDiscountAmount` | Cao |
| IT-PROMO-008 | Voucher issue dừng phát khi hết ngân sách campaign | Integration | `campaign.remainingBudget = 10000`, node voucher yêu cầu reserve `50000` | DB thật | Start process | `CampaignBudgetServiceImpl.reserveBudget` ném `IllegalStateException`; delegate catch, set `voucherIssued=false`; **không có** bản ghi `issued_vouchers` mới; `remaining_budget` không đổi | Cao |

---

## 6. MODULE: REDEEM VOUCHER KHI CHECKOUT

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-070 | `VoucherRedemptionServiceImpl.preview` — PERCENT hợp lệ | Unit | Voucher `PERCENT` `discountPercent=10`, `maxDiscountAmount=50000`, `status=UNUSED`, chưa hết hạn, đúng user | `orderTotal=1000000` | Gọi `preview(request)` | `applied=true`; `productDiscountAmount = min(100000, 50000) = 50000`; `finalAmount = 950000`; **không** đổi trạng thái voucher trong DB (readOnly) | Cao |
| UT-PROMO-071 | `preview` — PERCENT vượt trần `maxDiscountAmount` | Unit | `discountPercent=50`, `orderTotal=2000000` (raw discount=1000000), `maxDiscountAmount=50000` | — | Gọi `preview(request)` | `productDiscountAmount = 50000` (bị chặn ở trần, không phải 1000000) | Cao |
| UT-PROMO-072 | `preview`/`apply` — FIXED chưa đạt `minOrderValue` | Unit | Voucher FIXED `minOrderValue=150000`, `orderTotal=100000` | — | Gọi `preview(request)` | `applied=false`, message "Đơn hàng chưa đạt giá trị tối thiểu 150000 VND..." | Cao |
| UT-PROMO-073 | `apply` — FIXED đủ điều kiện, giảm không vượt `orderTotal` | Unit | `discountAmount=1000000`, `orderTotal=500000` | — | Gọi `apply(request)` với `orderId=99` | `productDiscountAmount = min(1000000, 500000) = 500000`; `finalAmount=0`; voucher chuyển `RESERVED`, `usedOrderId=99` | Cao |
| UT-PROMO-074 | `preview`/`apply` — FREESHIP thiếu `shippingFee` | Unit | Voucher FREESHIP, `request.shippingFee = null/0` | — | Gọi `preview(request)` | Ném lỗi nội bộ được bắt và trả `applied=false`, "Đơn hàng không có phí vận chuyển để áp dụng voucher freeship." | Trung bình |
| UT-PROMO-075 | `apply` — FREESHIP giảm bị chặn theo `maxShippingDiscount` | Unit | `maxShippingDiscount=20000`, `shippingFee=35000` | — | Gọi `apply(request)` | `shippingDiscountAmount = min(35000, 20000) = 20000` | Cao |
| UT-PROMO-076 | `apply` — voucher không thuộc user hiện tại | Unit | `voucher.userId != userDbId` resolve từ request | — | Gọi `apply(request)` | `applied=false`, "Mã voucher không thuộc tài khoản của bạn." | Cao |
| UT-PROMO-077 | `apply` — voucher đã hết hạn | Unit | `voucher.expiresAt` trước `now`; `voucher.status=UNUSED` | — | Gọi `apply(request)` | `voucherMaintenanceService.expireIfNeeded` chuyển status → `EXPIRED`; trả `applied=false`, "Mã voucher đã hết hạn." | Cao |
| UT-PROMO-078 | `apply` — voucher đã `USED` | Unit | `voucher.status=USED` | — | Gọi `apply(request)` | `applied=false`, "Mã voucher đã được sử dụng." | Cao |
| UT-PROMO-079 | `apply` — voucher đang `RESERVED` cho đơn khác (không áp dụng 2 lần) | Unit | `voucher.status=RESERVED`, `usedOrderId=50` (khác đơn hiện tại) | Gọi `apply(request)` với `orderId=60` | `applied=false`, "Mã voucher đang được giữ cho một đơn hàng khác." — voucher **không** được áp dụng lần thứ 2 | Cao |
| UT-PROMO-080 | `apply` — mã voucher không tồn tại | Unit | `voucherRepository.findWithLockByCode` trả `empty` | — | Gọi `apply(request)` | `applied=false`, "Mã voucher không tồn tại." | Cao |
| UT-PROMO-081 | `apply` — ràng buộc category/product không thỏa | Unit | Voucher có `restrictedProductIds="10,11"`; `request.productIds=[99]` | — | Gọi `apply(request)` | `applied=false`, "Đơn hàng hiện tại không thuộc danh mục/sản phẩm được áp dụng cho voucher này." | Cao |
| UT-PROMO-082 | `apply` — ràng buộc product thỏa (match trực tiếp) | Unit | `restrictedProductIds="10,11"`; `request.productIds=[11, 20]` | — | Gọi `apply(request)` | Không bị chặn bởi ràng buộc, tiếp tục tính discount | Cao |
| UT-PROMO-083 | `apply` — `orderId` bắt buộc khi apply | Unit | `request.orderId = null` | — | Gọi `apply(request)` | `applied=false`, "orderId bắt buộc khi apply voucher." (chặn ngay từ `VoucherRedemptionServiceImpl.apply`, không gọi `evaluate`) | Cao |
| UT-PROMO-084 | `redeemByOrderId` — chuyển RESERVED → USED khi thanh toán thành công | Unit | Voucher `status=RESERVED`, `usedOrderId=99` | Gọi `redeemByOrderId(99)` | `voucher.status=USED`, `usedAt` được set | Cao |
| UT-PROMO-085 | `releaseByOrderId` — hoàn UNUSED khi hủy đơn/thanh toán thất bại | Unit | Voucher `status=RESERVED`, `usedOrderId=99` | Gọi `releaseByOrderId(99)` | `voucher.status=UNUSED`, `usedOrderId=null`, `usedAt=null` — voucher có thể dùng lại | Cao |
| IT-PROMO-009 | `POST /api/v1/promotions/vouchers/preview` | Integration | Endpoint public cho user (yêu cầu `X-User-Id`) trả preview đúng | DB thật có voucher UNUSED của user | Gọi API với `code`, `orderTotal` | HTTP 200, `data.applied=true`, số tiền đúng | Cao |
| IT-PROMO-010 | `POST /api/internal/vouchers/apply` → `redeem` → verify DB | Integration | Toàn luồng checkout: apply lúc tạo đơn, redeem lúc thanh toán xong | DB thật | Gọi `apply` (status→RESERVED), sau đó gọi `redeem` cho cùng `orderId` | Trạng thái cuối cùng trong DB là `USED`, `usedAt` không null | Cao |
| IT-PROMO-011 | Apply → Release (hủy đơn) → Apply lại (voucher dùng lại được) | Integration | DB thật | `apply` (RESERVED) → `release` (UNUSED) → `apply` lại với `orderId` khác | Lần apply thứ 2 thành công (`applied=true`), voucher không bị chặn bởi trạng thái RESERVED cũ | Cao |
| IT-PROMO-012 | Race condition: 2 request `apply` đồng thời cùng 1 voucher | Integration | DB thật, 2 thread gọi `apply` song song cho cùng `code`, 2 `orderId` khác nhau | Bắn 2 request đồng thời | Nhờ `findWithLockByCode` (pessimistic lock), chỉ 1 request thành công (`applied=true`), request còn lại nhận "đang được giữ cho một đơn hàng khác" hoặc tương tự — voucher **không bị áp dụng 2 lần** | Cao |

---

## 7. MODULE: NÂNG HẠNG THÀNH VIÊN (`UpgradeMemberRankDelegate`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-086 | `execute` — happy path | Unit | `targetTier="GOLD"`, `userDbId` resolve được | Mock `userClient.updateTier` thành công | Gọi `execute(execution)` | `userClient.updateTier(userId, {tier:"GOLD"})` được gọi; `execution.rankUpgraded=true`; `memberRank="GOLD"`; `previousMemberRank` lưu giá trị cũ | Cao |
| UT-PROMO-087 | `execute` — thiếu `userDbId` | Unit | `userContextResolver.resolveUserDbId` trả empty | — | Gọi `execute(execution)` | `rankUpgraded=false`; không gọi `userClient.updateTier` | Cao |
| UT-PROMO-088 | `execute` — user-service lỗi khi update | Unit | `userClient.updateTier` ném exception | — | Gọi `execute(execution)` | `rankUpgraded=false`; exception bị catch, không làm crash process | Cao |
| IT-PROMO-013 | End-to-end nâng hạng qua process | Integration | Deploy campaign có `Action_Upgrade_MemberRank`, WireMock cho `UserClient` | DB + Camunda thật | Start process với `targetTier=VIP` | WireMock ghi nhận `PUT /api/internal/users/{id}/tier` với body `{tier: VIP}` | Cao |

---

## 8. MODULE: TẶNG ĐIỂM LOYALTY (`LoyaltyPointDelegate`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-089 | `execute` — mode FIXED happy path | Unit | `calculationMode="FIXED"`, `pointAmount=100` | Mock `userClient.updatePoints` trả `{ data: { newPointBalance: 500, pointsApplied: 100 } }` | Gọi `execute(execution)` | `loyaltyPointApplied=true`; `newPointBalance=500`; request gửi đi có `sourceType=CAMPAIGN`, `campaignId`, `reason` | Cao |
| UT-PROMO-090 | `execute` — mode ORDER_SPEND thiếu `orderAmount` | Unit | `calculationMode="ORDER_SPEND"`, không có `finalAmount`/`totalAmount`/`amount` trong context | — | Gọi `execute(execution)` | `loyaltyPointApplied=false`; `loyaltyPointError="ORDER_SPEND requires finalAmount/totalAmount"` | Cao |
| UT-PROMO-091 | `execute` — mode ORDER_SPEND có `finalAmount` | Unit | `finalAmount=1000000` trong execution | Mock `updatePoints` trả kết quả | Gọi `execute(execution)` | Request gửi `orderAmount=1000000`; `loyaltyPointApplied=true` | Cao |
| UT-PROMO-092 | `execute` — thiếu `userDbId` | Unit | Không resolve được user | — | Gọi `execute(execution)` | `loyaltyPointApplied=false`; không gọi Feign | Cao |
| UT-PROMO-093 | `execute` — user-service ném exception | Unit | Mock `updatePoints` ném `Exception` | — | Gọi `execute(execution)` | `loyaltyPointApplied=false`; `loyaltyPointError` chứa message exception; không crash process | Cao |
| IT-PROMO-014 | End-to-end tặng điểm qua process (ORDER_SPEND) | Integration | Deploy campaign `Trigger_Event_OrderSuccess` → `Action_Loyalty_Point` (ORDER_SPEND) | DB + Camunda thật, WireMock UserClient | Trigger event `PaymentSuccessEvent` với `amount=2000000` | WireMock nhận `PUT /api/internal/users/{id}/points` với `orderAmount=2000000`; process hoàn tất không lỗi | Cao |

---

## 9. MODULE: GỬI EMAIL KHUYẾN MÃI (`SendEmailDelegate`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-094 | `execute` — gửi theo `templateId` | Unit | `templateId="promotion_voucher_template"`, có `email`, `voucherCode` trong context (từ node voucher chạy trước) | Mock `notificationClient.sendNotification` thành công | Gọi `execute(execution)` | Request gửi có `templateId`, `templateVariables` chứa `voucherCode` (và các biến process khác trừ key hệ thống); `notificationSent=true` | Cao |
| UT-PROMO-095 | `execute` — notification-service lỗi | Unit | Mock `sendNotification` ném exception | — | Gọi `execute(execution)` | `notificationSent=false`; exception bị catch, không crash process | Cao |
| IT-PROMO-015 | End-to-end gửi email qua process kèm voucher | Integration | Workflow: Trigger → `Action_IssueVoucher_Percent` → `Action_Send_Email` (template voucher) → End | DB + Camunda thật, WireMock NotificationClient | Trigger campaign | WireMock nhận đúng 1 request `POST /api/internal/notifications/send` với `templateVariables.voucherCode` khớp voucher vừa phát | Cao |

---

## 10. MODULE: NGÂN SÁCH CHIẾN DỊCH (`CampaignBudgetServiceImpl`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-096 | `reserveBudget` — trừ dần đúng số tiền | Unit | `campaign.remainingBudget=1000000` | Gọi `reserveBudget(campaignId, 200000)` | `remainingBudget` sau khi lưu = `800000` | Cao |
| UT-PROMO-097 | `reserveBudget` — ngân sách không đủ | Unit | `remainingBudget=10000`, cần reserve `50000` | Gọi `reserveBudget(campaignId, 50000)` | Ném `IllegalStateException` "Ngân sách chiến dịch không đủ. Còn lại: 10000, cần: 50000"; DB không đổi | Cao |
| UT-PROMO-098 | `reserveBudget` — dừng phát voucher khi ngân sách còn đúng 0 | Unit | `remainingBudget=0` | Gọi `reserveBudget(campaignId, 1)` | Ném `IllegalStateException`; mọi lệnh phát voucher tiếp theo trong workflow đều thất bại (delegate set `voucherIssued=false`) | Cao |
| UT-PROMO-099 | `reserveBudget` — pessimistic lock chống lost-update | Unit/Integration | 2 lời gọi `reserveBudget` liên tiếp trên cùng campaign trong 2 transaction song song | Dùng `findByIdForUpdate` (SELECT FOR UPDATE) | 2 thread gọi đồng thời `reserveBudget(campaignId, X)` | Tổng `remainingBudget` giảm đúng tổng 2 lần reserve (không bị mất update do race) — cần DB thật để verify (IT), UT chỉ verify lock method được gọi | Cao |
| UT-PROMO-100 | `releaseReservedBudget` — hoàn đúng số tiền theo loại voucher | Unit | Voucher `PERCENT` với `maxDiscountAmount=50000`, `status=RESERVED`/`UNUSED` bị expire | Gọi `releaseReservedBudget(voucher)` | `campaign.remainingBudget` tăng thêm `50000` | Cao |
| UT-PROMO-101 | `releaseReservedBudget` — không vượt `totalBudget` | Unit | `remainingBudget` gần bằng `totalBudget`, hoàn thêm khiến vượt | Gọi `releaseReservedBudget(voucher)` | `remainingBudget` bị chặn (`min`) ở đúng `totalBudget`, không vượt | Trung bình |
| IT-PROMO-016 | Ngân sách dừng phát voucher khi hết trong luồng thật | Integration | Campaign `remainingBudget=50000`, mỗi lần trigger reserve `maxDiscountAmount=50000` | DB + Camunda thật | Trigger campaign 2 lần liên tiếp (2 order khác nhau) | Lần 1: phát voucher thành công, `remainingBudget=0`. Lần 2: `reserveBudget` ném lỗi ngân sách không đủ, delegate set `voucherIssued=false`, **không có** voucher mới trong DB | Cao |

---

## 11. MODULE: TRA CỨU VOUCHER (`VoucherQueryServiceImpl`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-102 | `getVouchersForUser` — trạng thái hiển thị `usable=true` khi UNUSED và chưa hết hạn | Unit | Voucher `status=UNUSED`, `expiresAt` trong tương lai | Gọi `getVouchersForUser(...)` | `UserVoucherDto.usable=true`, `status=UNUSED` | Cao |
| UT-PROMO-103 | `getVouchersForUser` — voucher UNUSED nhưng đã quá hạn hiển thị là EXPIRED (chưa chạy job) | Unit | Voucher `status=UNUSED` trong DB nhưng `expiresAt` đã qua (scheduler chưa kịp cập nhật) | Gọi `getVouchersForUser(...)` | DTO trả `status=EXPIRED` (tính lại tại thời điểm query, không phụ thuộc scheduler), `usable=false` | Cao |
| IT-PROMO-017 | `GET /api/v1/promotions/vouchers/me` | Integration | Endpoint trả danh sách voucher đầy đủ của user đăng nhập | DB thật có voucher đủ 3 trạng thái AVAILABLE(UNUSED)/USED/EXPIRED cho user | Gọi API với header `X-User-Id` | HTTP 200; `data` chứa đủ 3 voucher với `status` tương ứng đúng; response không lộ voucher của user khác | Cao |

---

## 12. MODULE: TỰ ĐỘNG HẾT HẠN VOUCHER (`VoucherMaintenanceServiceImpl`)

| Test ID | Module/Endpoint | Loại | Mô tả | Tiền điều kiện | Input/Steps | Kết quả mong đợi | Priority |
|---|---|---|---|---|---|---|---|
| UT-PROMO-104 | `expireStaleVouchers` | Unit | Có voucher `UNUSED`/`RESERVED` với `expiresAt` đã qua | `voucherRepository.findByStatusInAndExpiresAtBefore(...)` trả 3 bản ghi | Gọi `expireStaleVouchers()` | Cả 3 chuyển `status=EXPIRED`; hàm trả về `3`; với voucher đang `RESERVED`, `budgetService.releaseReservedBudget` được gọi để hoàn ngân sách | Cao |
| UT-PROMO-105 | `expireIfNeeded` — voucher `RESERVED` hết hạn: gỡ `usedOrderId` và hoàn ngân sách | Unit | `status=RESERVED`, `usedOrderId=77`, `expiresAt` đã qua | Gọi `expireIfNeeded(voucher)` | `status=EXPIRED`, `usedOrderId=null`, `usedAt=null`; `budgetService.releaseReservedBudget(voucher)` được gọi | Cao |
| IT-PROMO-018 | Job hết hạn thật chạy theo cron `0 15 * * * *` | Integration | DB thật có voucher hết hạn từ trước; Redis thật | Trigger scheduler thủ công (hoặc đợi cron trong môi trường test rút ngắn) | Voucher chuyển `EXPIRED` trong DB thật; `campaigns.remaining_budget` được hoàn nếu có voucher `RESERVED` hết hạn | Cao |
