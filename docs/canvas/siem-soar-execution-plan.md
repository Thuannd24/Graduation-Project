# Kế hoạch thực thi — SIEM + SOAR mini (nhánh `feature/siem-soar-mini`)

> **Plan này làm gì, nói một câu:** tận dụng đúng hạ tầng event-driven đã có (Kafka + Redis +
> Elasticsearch/Kibana, đang chạy cho product search) để dựng 1 bộ SIEM+SOAR application-level —
> không dựng Security Onion đầy đủ (Suricata/Zeek/Wazuh/TheHive, cần VM riêng), chỉ nhắm log ứng
> dụng + Keycloak.
>
> Bối cảnh & lý do chọn phạm vi: xem hội thoại lập plan; số đo/so sánh sẽ ghi tiếp vào file này theo
> đúng convention nhật ký của [`churn-risk-log.md`](churn-risk-log.md).

---

## 1. Vì sao plan này, phạm vi này

Hệ thống đã có 1 pipeline event-driven kiểm chứng thật (`user-risk-events` → `PromotionKafkaConsumer`
→ Camunda → voucher, xem `churn-risk-log.md` 2026-07-27). SIEM+SOAR mini là áp dụng lại **đúng kiến
trúc đó** sang domain bảo mật: sinh event → Kafka → rule engine → alert → Kafka → auto-action.

**Phạm vi đã chốt** (qua thảo luận, xem lý do đầy đủ ở mục 7 — So sánh với hệ thống chuẩn):
- Application-level (log ứng dụng + Keycloak identity) — **không** network sensor (Suricata/Zeek),
  **không** host agent (Wazuh/osquery).
- Có thêm 1 tầng correlation (risk-score tích lũy) và threat-intel (danh sách công khai, không cần
  API key) để không chỉ là "1 rule = 1 counter" quá đơn giản.

**Phát hiện quan trọng ảnh hưởng thiết kế:** Keycloak (`BE/keycloak-data/ecommerce-realm-realm.json:1285-1288`)
hiện có `eventsEnabled: false`, `adminEventsEnabled: false`, `bruteForceProtected: false`; đăng nhập
100% qua trang hosted của Keycloak nên **BE Java không bao giờ thấy raw login attempt/fail**. Tín hiệu
brute-force/admin-escalation bắt buộc phải lấy từ Keycloak Admin REST Events API (polling), sau khi
bật 2 cờ trên — không có cách nào suy ra từ code BE hiện tại.

---

## 2. Kiến trúc tổng quan

```
BE Java (gateway / promotion / user / payment)      Keycloak Admin Events API
        │ SecurityEventProducer                          │ poll định kỳ (APScheduler)
        ▼                                                 ▼
                    Kafka topic: security-events (raw, nhiều eventType)
                          │                          │
                          │ (a) Logstash consume      │ (b) security-service consume
                          ▼                          ▼
        Elasticsearch security-events-*      detection/rules.py (counter/SET theo pattern)
        (log thô, full-text search/audit)     detection/risk_score.py (correlation nhiều tín hiệu)
                                               integrations/threat_intel.py (enrich IP)
                                                     │
                                                     ▼
                                    Kafka topic: security-alerts
                                    │                          │
                                    ▼                          ▼
                        Logstash → Elasticsearch      SOAR responder (alert_consumer.py)
                        security-alerts-*             detection/policy.py → tier
                        (_id = eventId)                ├─ AUTO_DISABLE_USER_AND_REVOKE
                                                        ├─ AUTO_BLOCK_IP
                                                        ├─ AUTO_DISABLE_USER
                                                        └─ ALERT_ONLY (chờ /resolve)
                                                              │
                                                              ▼
                                    update_alert(eventId, actionTaken, status)
                                    ghi ĐÈ đúng doc Logstash đã tạo (cùng _id, upsert)
                                                              │
                                                              ▼
                                    Kibana dashboard đọc security-alerts-*
```

**Vì sao thêm Logstash** (bám mô hình Security Onion hơn — Logstash làm tầng normalize/enrich, tách
khỏi business logic): Logstash nhận trực tiếp từ Kafka (không qua code Python), parse JSON, chuẩn hoá
`@timestamp`, enrich GeoIP theo `ip`, ghi Elasticsearch. `security-service` không tự viết code index
từng field — chỉ còn 1 việc ES-side: `update_alert()` sau khi SOAR chạy, dùng `document_id =>
"%{eventId}"` ở Logstash output để update đúng `_id`, không phải query-then-write. Có 2 người viết
cùng doc alert (Logstash tạo khung, SOAR bổ sung `actionTaken`) → bắt buộc dùng
`update(..., doc_as_upsert=True)` để tránh `document_missing_exception` khi thứ tự tới không đảm bảo.

**Vì sao 1 service Python mới (`AI/security-service`), không phải Java:** khuôn mẫu "consumer +
APScheduler job định kỳ + Kafka producer" đã proven 100% ở `AI/forecast-service` (aiokafka +
`max_instances=1` + `shared_common.pool`/`contracts`). Poll Keycloak Admin Events API định kỳ giống
hệt cấu trúc `RiskScheduler`. Java hiện chưa có module scheduler+consumer tương tự, và chưa có
`shared-common`-style package.

**Vì sao vẫn sửa Java** (gateway, promotion-service, user-service, payment-service): tín hiệu
app-level chỉ sinh ra được tại đúng nơi request đi qua — không có Java thì `security-service` không
có gì để đọc. Producer nhỏ, đúng pattern `ProductViewEventProducer`/`CartEventProducer` đã có
(`@Component` + `KafkaTemplate<String,String>` + JSON qua `ObjectMapper`, fire-and-forget try/catch-log).

---

## 3. Hợp đồng dữ liệu — Kafka topics chi tiết

Theo đúng convention `AI/shared-common/shared_common/contracts.py` (nguồn sự thật duy nhất cho tên
Redis key + Kafka topic, xem docstring file đó). Thêm vào file này (không tạo file mới):

```python
TOPIC_SECURITY_EVENTS = "security-events"   # producer: gateway, promotion/user/payment-service, security-service (Keycloak poller)
TOPIC_SECURITY_ALERTS = "security-alerts"   # producer: security-service (rule engine); consumer: security-service (SOAR, self)
```

### 3.1 Topic `security-events` — envelope chung

```json
{"eventId": "uuid", "eventType": "<xem bảng>", "timestamp": "ISO8601 UTC", "...": "field riêng theo loại"}
```

| `eventType` | Producer | Field riêng | Ghi chú |
|---|---|---|---|
| `KeycloakLoginFailed` | `security-service` (`keycloak_poller.py`, đọc `type=LOGIN_ERROR`) | `ip`, `username`, `clientId` | |
| `KeycloakLoginSuccess` | `security-service` (poller, `type=LOGIN`) | `ip`, `username`, `keycloakUserId` | cần cho pattern "compromise xác nhận" — so khớp với `KeycloakLoginFailed` liền trước |
| `KeycloakAdminEvent` | `security-service` (poller, `/admin-events`) | `operationType` (CREATE/UPDATE/DELETE), `resourceType`, `resourcePath`, `authAdminId`, `representation` (JSON thô từ Keycloak — chứa role name khi `resourceType=REALM_ROLE_MAPPING`) | |
| `RateLimitExceededEvent` | `api-gateway` (`SecurityEventProducer.java`, hook `RequestRateLimiter` deny) | `ip`, `userId` (nullable), `path`, `method` | `path` dùng để tính trọng số endpoint |
| `VoucherApplyFailedEvent` | `promotion-service` (`VoucherRedemptionServiceImpl.evaluate()`, nhánh `invalid(...)`) | `userId`, `voucherCode`, `reason` | |
| `VoucherRedeemedEvent` | `promotion-service` (cùng hàm, nhánh `reserve=true` thành công) | `userId`, `voucherCode`, `orderId`, `discountAmount` | |
| `AccountChangedEvent` | `user-service` (hook đổi email/password, `AdminUserController.updateBlacklist`) | `userId`, `changeType` (`EMAIL_CHANGED`/`PASSWORD_CHANGED`/`BLACKLIST_TOGGLED`), `actorId` | **Không** log email/password thật — chỉ boolean/changeType, tránh PII lộ vào log bảo mật |
| `PaymentFailedEvent` | `payment-service` (hook xử lý thanh toán thất bại) | `userId`, `sessionId`, `orderId`, `failureReason` | dùng cho card-testing |

### 3.2 Topic `security-alerts` — envelope chung

```json
{"eventId": "uuid-mới", "alertType": "<xem bảng>", "severity": "low|medium|high|critical",
 "entityType": "ip|userId", "entityId": "...", "timestamp": "ISO8601 UTC",
 "relatedEvents": ["eventId gốc đã cộng vào"], "reason": "mô tả ngắn cho Kibana/người đọc"}
```

`eventId` ở đây **là ID mới** (không phải id của event gốc) — dùng làm `_id` khi Logstash index vào
`security-alerts-*`, và `security-service` update lại đúng `_id` này sau khi SOAR chạy.

| `alertType` | Sinh từ | Severity | Tier SOAR (mục 5) |
|---|---|---|---|
| `BruteForceDetected` | counter `sec:fail-count:{ip}:{username}` | high | `AUTO_BLOCK_IP` |
| `CredentialStuffingDetected` | SET `sec:fail-ips:{username}` | high | `AUTO_DISABLE_USER` |
| `PasswordSprayingDetected` | SET `sec:fail-users:{ip}` | medium | `ALERT_ONLY` |
| `AccountCompromiseConfirmed` | `LOGIN` thành công sau chuỗi `LOGIN_ERROR` cùng identity | **critical** | `AUTO_DISABLE_USER_AND_REVOKE` |
| `ApiAbuseDetected` | điểm tích lũy Σweight(path) theo IP/user | medium | `AUTO_BLOCK_IP` |
| `ResourceEnumerationDetected` | độ lệch id liên tiếp trong path, theo IP | medium | `AUTO_BLOCK_IP` |
| `ProxyRotationDetected` | SET `sec:sig-ips:{hash(UA+path)}` | medium | `AUTO_BLOCK_IP` (từng IP trong set) |
| `VoucherEnumerationDetected` | counter theo user, đếm mã khác nhau thử sai | medium | `ALERT_ONLY` |
| `VoucherCodeLeaked` | SET `sec:voucher-users:{code}` | medium | `ALERT_ONLY` |
| `VoucherSpikeDetected` | counter tổng toàn hệ thống vs baseline | medium | `ALERT_ONLY` |
| `PrivilegeEscalationDetected` | `KeycloakAdminEvent` gán `ROLE_ADMIN` | high | `ALERT_ONLY` |
| `AccountTakeoverDetected` | `AccountChangedEvent` bất thường | medium | `ALERT_ONLY` |
| `CardTestingDetected` | counter `sec:payfail-count:{userId}` | high | `ALERT_ONLY` |
| `CorrelatedRiskDetected` | sorted set `sec:risk-score:{entity}` vượt ngưỡng tổng | tuỳ tổng điểm | tuỳ severity suy ra |

Sau enrich threat-intel: thêm field `knownMalicious: bool` (nâng severity 1 cấp nếu `true`). Sau SOAR:
thêm `actionTaken`, `status` (`PENDING`/`RESOLVED_AUTO`/`RESOLVED_MANUAL`), `resolvedBy`, `resolvedAt`.

### 3.3 Redis — bảng key đầy đủ

| Key pattern | Kiểu | TTL | Ghi | Đọc | Mục đích |
|---|---|---|---|---|---|
| `sec:fail-count:{ip}:{username}` | counter (`INCR`) | window (vd 5 phút) | `rules.py` | `rules.py` | brute-force cổ điển |
| `sec:fail-ips:{username}` | SET (`SADD`) | window | `rules.py` | `rules.py` | credential stuffing (cardinality IP) |
| `sec:fail-users:{ip}` | SET (`SADD`) | window | `rules.py` | `rules.py` | password spraying (cardinality username) |
| `sec:sig-ips:{hash}` | SET (`SADD`) | window | `rules.py` | `rules.py` | proxy rotation |
| `sec:voucher-users:{code}` | SET (`SADD`) | window | `rules.py` | `rules.py` | voucher leak (cardinality user) |
| `sec:payfail-count:{userId}` | counter | window ngắn | `rules.py` | `rules.py` | card testing |
| `sec:risk-score:{entity}` | sorted set (`ZADD`, member=`{ts}:{eventType}`, score=điểm) | tự "quên" qua `ZREMRANGEBYSCORE` | `risk_score.py` | `risk_score.py` | correlation nhiều tín hiệu |
| `sec:alert-cooldown:{alertType}:{entityId}` | flag (`SETNX`+TTL) | vd 10 phút | `rules.py`/`risk_score.py` | cùng | chống spam alert trùng khi chuỗi event dài tiếp diễn |
| `security:blocklist:ip:{ip}` | flag (`SETEX`) | `SECURITY_IP_BLOCK_TTL_SECONDS` | `soar/actions.py` | `IpBlocklistFilter` (gateway) | enforcement thật |
| `sec:threat-intel:tor-exit` / `sec:threat-intel:spamhaus` | SET | refresh hàng ngày (APScheduler) | `threat_intel.py` (job nạp) | `threat_intel.py` (check membership) | threat-intel tĩnh |
| `sec:keycloak-poll-checkpoint` | string (timestamp) | không TTL | `keycloak_poller.py` | `keycloak_poller.py` | checkpoint poll, tránh đọc trùng/miss event |

### 3.4 Elasticsearch indices

| Index | Ghi bởi | Đọc bởi | Ghi chú |
|---|---|---|---|
| `security-events-%{+YYYY.MM.dd}` | Logstash (từ topic `security-events`) | Người (Kibana Discover) — tra cứu/điều tra thủ công, không consumer tự động nào đọc lại | log thô, không `document_id` cố định |
| `security-alerts-%{+YYYY.MM.dd}` | Logstash (tạo khung, `_id=eventId`) **và** `security-service` (`update_alert`, cùng `_id`) | API `GET /api/v1/security/alerts`, Kibana dashboard | doc "sống" — bị sửa lại sau khi tạo |

---

## 4. Detection — bảng đầy đủ (tóm gọn từ mục 3.2, xem `app/detection/rules.py` khi code)

Mỗi nhóm gốc có nhiều pattern con vì mỗi kiểu tấn công có "hình dạng" số liệu khác nhau — dùng cả
Redis **counter** (đếm số lần) và Redis **SET** (đếm cardinality — số thực thể khác nhau) tuỳ pattern,
không dùng 1 counter thô cho cả nhóm:

- **Brute-force/credential**: brute-force cổ điển, credential stuffing, password spraying, compromise
  xác nhận (4 pattern, xem mục 3.2 để biết cơ chế phân biệt).
- **API abuse/rate anomaly**: rate có trọng số endpoint, enumeration ID tuần tự, proxy rotation.
- **Business-logic abuse (voucher)**: dò mã ngẫu nhiên, mã bị leak (theo `code` không theo `user` —
  không cần IP/device), đột biến toàn hệ thống.
- **Admin/privilege escalation**: gán `ROLE_ADMIN` bất thường qua admin-event.
- **Account takeover** *(mới)*: đổi email/password bất thường từ `user-service`.
- **Card testing/carding** *(mới)*: nhiều lần thanh toán thất bại liên tiếp từ `payment-service` — 1
  trong các pattern abuse phổ biến nhất của e-commerce thật.
- **Correlated risk** *(tầng 2, mới)*: risk-score tích lũy nhiều tín hiệu yếu khác loại (`sec:risk-score`)
  — bắt được case không rule đơn lẻ nào tự đủ ngưỡng nhưng nhiều dấu hiệu cùng lúc thì đáng ngờ. Trọng
  số ví dụ: login fail +1, rate-limit hit +1, voucher fail +2, payment fail +3.

**Threat-intel enrichment**: check `ip` trong danh sách tĩnh công khai (Tor exit node / Spamhaus DROP
list, nạp 1 lần khi start + refresh hàng ngày, **không cần API key**) → `knownMalicious=true` thì nâng
severity 1 cấp. AbuseIPDB/feed trả phí — **không làm ở v1** (cần user tự đăng ký key, ghi vào hướng
phát triển).

Trước khi ghi alert (mọi pattern): cooldown `SETNX`+TTL theo `(alertType, entityId)` — tái dùng ý
tưởng dedupe `businessKey` đã kiểm chứng ở `CampaignTriggerService.java`.

---

## 5. SOAR — policy & action

`app/detection/policy.py` map `(alertType, severity)` → tier:

| Tier | Alert types | Action (`app/soar/actions.py`) |
|---|---|---|
| `AUTO_DISABLE_USER_AND_REVOKE` | `AccountCompromiseConfirmed` | `disable_user()` (Keycloak `enabled:false`) **+** revoke session (`UserResource.logout()` — hiện Java cũng chưa wire, xem trade-off mục 6) |
| `AUTO_BLOCK_IP` | `BruteForceDetected`, `ApiAbuseDetected`, `ResourceEnumerationDetected`, `ProxyRotationDetected` | `block_ip(ip)` — `SETEX security:blocklist:ip:{ip}` |
| `AUTO_DISABLE_USER` | `CredentialStuffingDetected` | `disable_user()` (không revoke ngay — nhẹ hơn tier trên) |
| `ALERT_ONLY` | `PasswordSprayingDetected`, `VoucherEnumerationDetected`, `VoucherCodeLeaked`, `VoucherSpikeDetected`, `PrivilegeEscalationDetected`, `AccountTakeoverDetected`, `CardTestingDetected`, `CorrelatedRiskDetected` (mức thấp) | chỉ `notify_admin()`, chờ `POST /api/v1/security/alerts/{id}/resolve` |

Mọi action ghi lại `actionTaken`/`status` vào chính alert doc (audit trail = "case"), qua
`update_alert(eventId, ..., doc_as_upsert=True)`.

---

## 6. Lớp phòng thủ & giới hạn latency (queue có trễ — cần nói rõ)

**Lớp 0 — đã có, đồng bộ, không qua Kafka:** `RequestRateLimiter` ở gateway (Redis token-bucket,
`replenishRate=20, burstCapacity=50`) chặn burst **ngay trong chính request đó**. Đây là lớp phòng thủ
thật-thời-gian-thực, độc lập hoàn toàn với pipeline SIEM/SOAR.

**Lớp 1 — pipeline Kafka, vai trò "nhớ dai + tương quan", không phải "chặn nhanh":** lớp 0 chỉ nhớ
trong 1 window ngắn rồi quên — hết bị limit lại thử được ngay. Pipeline biến "bị rate-limit nhiều lần"
thành block dài hạn (TTL riêng) + case để tra cứu. Không cần nhanh hơn lớp 0 vì lớp 0 đã hứng cú đầu.

**Floor latency của Keycloak — không che được bằng Kafka nhanh:** vì Keycloak không có event listener
tức thời (chỉ poll Admin REST API), floor latency của brute-force/credential-stuffing/priv-escalation
= chu kỳ poll (`SECURITY_POLL_INTERVAL_SECONDS`, mặc định 30s), bất kể Kafka xử lý nhanh cỡ nào. Đây
là trade-off có chủ đích (Admin REST API thay vì build custom event-listener SPI, nặng hơn) — ghi rõ
trong báo cáo, không phải lỗi thiết kế.

**Consumer lag — rủi ro thật cần giám sát:** nếu `security_event_consumer`/SOAR responder chậm hoặc
crash, message dồn trong topic → action trễ đúng bằng lượng lag. Giảm nhẹ: giám sát qua Kafka UI đã có
sẵn (`:8090`, xem consumer group `security-service-*`), `restart: always` cho service để tự hồi phục.

---

## 7. So sánh với hệ thống SOC chuẩn (Security Onion đầy đủ)

| Khía cạnh | Mini (đang làm) | Chuẩn |
|---|---|---|
| Nguồn log | Application + Keycloak (đã mở rộng: +user-service, +payment-service) | + Network (Suricata/Zeek), + Host (Wazuh/osquery) |
| Correlation | Rule theo pattern + 1 tầng risk-score tích lũy | Multi-stage, Sigma rules, ATT&CK mapping |
| Threat intel | Danh sách tĩnh công khai | Feed trả phí, real-time (MISP, VirusTotal...) |
| Case management | 1 field status/actionTaken trên doc ES | Hệ thống case đầy đủ (TheHive/Cortex), RBAC, ticketing |
| HA/scale | Single-node ES/Kafka (tái dùng hạ tầng có sẵn) | Cluster multi-node, replication |
| Enforcement latency | Lớp 0 (gateway) tức thời; lớp 1 (Kafka) có floor latency Keycloak ~30s | NIDS inline, ms-level cho network |

Khoảng cách lớn nhất: **mù hoàn toàn ở tầng network/host** — compromise trực tiếp 1 container qua lỗ
hổng OS/lib (không qua HTTP request nào) sẽ không thấy được. Đây là giới hạn cấu trúc của lựa chọn
phạm vi, không phải thiếu công — ghi vào hướng phát triển.

---

## 8. Kế hoạch triển khai theo phase

- **Phase -1 (đã xong)**: commit `ai/behavoir`, tạo nhánh `feature/siem-soar-mini`.
- **Phase 0**: `contracts.py` (mục 3), bật `eventsEnabled`/`adminEventsEnabled` Keycloak, thêm Logstash
  (`docker-compose-infra.yml` + `BE/logstash-pipeline/security.conf`).
- **Phase 1**: service mới `AI/security-service` — `core/config.py`, `integrations/keycloak_client.py`,
  `services/keycloak_poller.py`, `kafka/security_event_producer.py`, `kafka/security_event_consumer.py`,
  `detection/rules.py`, `detection/risk_score.py`, `integrations/threat_intel.py`, `detection/policy.py`,
  `kafka/alert_producer.py`/`alert_consumer.py`, `soar/actions.py`, `integrations/elasticsearch_client.py`,
  `api/endpoints/security.py`, `requirements.txt`, entry trong `AI/docker-compose.yml` (port 8005).
- **Phase 2**: Java — `SecurityEventProducer` ở gateway/promotion-service/user-service/payment-service;
  `IpBlocklistFilter` + route `/api/v1/security/**` ở gateway.
- **Phase 3**: Kibana — index pattern `security-alerts-*`, 2-3 dashboard, xuất saved-object NDJSON.

Mỗi phase = 1 commit riêng để dễ review.

---

## 9. Verification (kiểm chứng thật)

1. Brute-force → block IP thật qua gateway (403).
2. Privilege escalation → alert `PENDING` → `/resolve` → action ghi vào doc.
3. Voucher enumeration (1 user nhiều mã sai) → alert đúng ngưỡng, không sớm hơn.
4. Voucher leak (≥2 account, 1 mã) → `VoucherCodeLeaked`, khác biệt với #3.
5. Card testing → alert `PENDING`, không tự khoá.
6. Correlated risk (nhiều tín hiệu yếu khác loại, không đủ ngưỡng riêng lẻ) → `CorrelatedRiskDetected`
   vẫn xuất hiện.
7. Threat-intel: IP nằm trong danh sách tĩnh → `knownMalicious=true`, severity nâng 1 cấp.
8. Hồi quy: `mvn package` (JDK 17) cho 4 service Java, luồng churn-risk/voucher cũ không đổi hành vi.

---

## 10. Giới hạn đã biết / hướng phát triển

- Không tương quan multi-account theo IP/device cho voucher (thiếu field `ip`/`deviceId` trên
  `VoucherApplyRequest`) — chỉ bắt enumeration theo tốc độ của 1 user và leak theo mã.
- Floor latency Keycloak = chu kỳ poll (~30s) — không tức thời cho brute-force/priv-escalation.
- Single-node Elasticsearch/Kafka (tái dùng hạ tầng có sẵn) — single point of failure, cần giám sát
  consumer lag qua Kafka UI thủ công.
- Threat-intel chỉ danh sách tĩnh — không có feed trả phí/real-time (AbuseIPDB...).
- Revoke session (`UserResource.logout()`) hiện chưa wire ở cả Java (`KeycloakAdminClient`) lẫn plan
  Python — chỉ có `setEnabled(false)`, không tự động invalidate access token đang có hiệu lực (tối đa
  15 phút theo cấu hình Keycloak hiện tại).

---

## 11. Rà soát plan so với code hiện tại — 2026-10-07 (trước Phase 0)

Đối chiếu từng giả định của plan với code/cấu hình thật trên nhánh này (chỉ đọc, chưa sửa gì). Docker đang
tắt (theo yêu cầu 2026-10-06, `.wslconfig` = 2GB) nên các mục cần Keycloak/Kafka chạy được ghi ở
"Chưa xác minh được".

### 11.1 Khớp với plan (đã xác minh)

- Keycloak: `eventsEnabled/adminEventsEnabled/bruteForceProtected = false`
  (`BE/keycloak-data/ecommerce-realm-realm.json:50,1285-1288`); `accessTokenLifespan=900` → khớp ghi chú
  "token còn hiệu lực tối đa 15 phút" ở mục 10.
- Mẫu producer Java có sẵn: `ProductViewEventProducer`, `CartEventProducer`, `UserEventProducer`.
- `RequestRateLimiter` 20/50 là *default-filter* cho mọi route (`api-gateway/application.yml:23-29`).
- `VoucherRedemptionServiceImpl.evaluate()` đúng vị trí hook, có cả nhánh `reserve=true` thành công
  (`:83-153`); `request.getUserId()` là **Keycloak UUID** (được `resolveDbUserId` đổi ra id DB) → cùng không
  gian ID với JWT `sub` ở gateway.
- `KeycloakAdminClient.setEnabled(userId, enabled)` có sẵn (`:103-108`); `UserResource.logout()` chưa dùng.
- Hạ tầng: Elasticsearch + Kibana 8.10.2 đã có (`docker-compose-infra.yml:194-207,314-323`); Kafka dùng
  mặc định tự tạo topic; `contracts.py` đúng convention; port 8005 chưa bị chiếm (AI dùng 8001-8004);
  `CampaignTriggerService` có dedupe `businessKey` + khoá Redis (`:104-115`); `BE/pom.xml` target Java 17
  (README nói JRE 21 — không mâu thuẫn).
- Chưa có: Logstash, `AI/security-service`, `IpBlocklistFilter`, entry security trong `contracts.py`.

### 11.2 Điểm lệch / lỗ hổng của plan — CẦN SỬA TRƯỚC KHI CODE

**Cao**

1. **Route `/api/v1/security/**` sẽ mở cho mọi khách đã đăng nhập.** `SecurityConfig.java:41-45` chỉ yêu cầu
   ADMIN/STAFF cho `/api/v1/admin/**`; mọi path khác chỉ `authenticated()`. → đặt API bảo mật dưới
   `/api/v1/admin/security/**` (hoặc thêm `pathMatchers(...).hasRole("ADMIN")` trước `anyExchange()`).
   Cùng mẫu lỗi đã có sẵn ở forecast-service: route `/api/v1/risk/**`, `/api/v1/models/**`
   (`application.yml:146`) cũng chỉ `authenticated()` → khách đăng nhập gọi được `trigger-scan`/`train`
   qua gateway. Ngoài phạm vi plan này nhưng nên sửa cùng lúc.
2. **`AUTO_BLOCK_IP` ở gateway không chặn được tấn công đăng nhập.** FE đăng nhập thẳng Keycloak
   `localhost:8083` bằng keycloak-js (`FE/.env.example:2`, `FE/src/services/keycloak.js:3-6`), không qua
   gateway → chặn IP ở gateway không ngăn được brute-force/credential-stuffing/compromise. Verification #1
   ("brute-force → block IP → 403 qua gateway") chỉ đúng cho nhóm API-abuse. → đổi tier hành động của các
   alert Keycloak (khoá tài khoản có điều kiện / bật Keycloak native brute-force protection / đặt Keycloak
   sau proxy có blocklist) và viết lại verification #1.
3. **`adminEventsDetailsEnabled` đang `false`** (`realm.json:1289`). Plan chỉ bật 2 cờ, nhưng
   `KeycloakAdminEvent.representation` (chứa tên role) chỉ có khi cờ này `true` → `PrivilegeEscalationDetected`
   không thấy `ROLE_ADMIN`. → bật thêm `adminEventsDetailsEnabled=true`; đặt `eventsExpiration` (store
   hiện không có hạn); liệt kê tường minh `enabledEventTypes` (LOGIN, LOGIN_ERROR, UPDATE_PASSWORD,
   UPDATE_EMAIL, RESET_PASSWORD…) thay vì để `[]` (hành vi mặc định khi rỗng cần xác minh).
4. **Áp cờ Keycloak bằng cách sửa JSON + restart có rủi ro mất dữ liệu.** Keycloak chạy `start-dev` với
   `keycloak.migration.strategy=OVERWRITE_EXISTING` (`docker-compose-infra.yml:228,238`), JSON không có khối
   `users` và không khai báo role-mapping của service account `ecommerce-backend` → mỗi lần restart
   re-import đè realm; quyền `view-events`/`manage-users` của service account (cần cho poller + SOAR) nếu
   đang gán tay ở runtime có thể mất, user tạo lúc chạy có thể mất. Phải kiểm chứng thực nghiệm trước (mục
   11.4) — và đây là thay đổi cấu hình bảo mật nên cần duyệt trước khi thực hiện (CLAUDE.md).
5. **IP nguồn không đáng tin → có thể tự khoá luôn admin.** `RateLimiterConfig.java:30-36` lấy
   `getRemoteAddress()`, không đọc `X-Forwarded-For`; gateway chạy Docker/localhost nên rất có thể mọi client
   cùng 1 IP (172.18.0.1 / 127.0.0.1). `AUTO_BLOCK_IP` trên IP đó chặn cả trang `/resolve`. → resolver IP có
   trusted-proxy/XFF, allowlist loopback + dải private, và chặn theo `(IP, user)` hoặc dải ngắn.
6. **SOAR tự động có thể bị biến thành công cụ DoS / khoá nhầm người thật.** `AccountCompromiseConfirmed`
   = "LOGIN thành công sau chuỗi LOGIN_ERROR cùng identity" → user thật gõ sai vài lần rồi đúng sẽ bị
   `disable + revoke`; kẻ tấn công cố tình sinh lỗi để khoá nạn nhân. → định nghĩa chặt hơn (≥N lỗi từ ≥2 IP
   khác nhau + login thành công từ IP chưa từng thấy / `knownMalicious`), allowlist tài khoản quản trị, và
   cân nhắc chạy `ALERT_ONLY`/dry-run trước khi bật tự động.

**Trung bình**

7. **`PaymentFailedEvent` đã có sẵn** qua Debezium outbox → topic `payment-events`
   (`PaymentServiceImpl.java:377-383,677-682,938-962`; payload `userId, orderId, paymentId, email, amount,
   message`). → bỏ producer mới ở payment-service; security-service consume `payment-events`, lọc
   `eventType=PaymentFailedEvent`, **loại** `message="Payment session expired"` (không phải card-testing),
   **không** chép `email` (PII) sang `security-events`/ES. Payload không có `sessionId` như plan ghi.
8. **Gateway không có hook "deny" của rate limiter.** `RedisRateLimiter.isAllowed` chỉ nhận key
   (`user:…`/`ip:…`), không có path/method. → dùng filter chạy TRƯỚC `RequestRateLimiter`, bọc
   `chain.filter(exchange).then(...)` và kiểm tra status 429 (có đủ exchange: path, method, IP). Cùng filter
   đó làm luôn bước kiểm tra blocklist (chạy trước `UserHeaderFilter`, vốn là WebFilter
   `LOWEST_PRECEDENCE-1`).
9. **`AccountChangedEvent` từ user-service chỉ thấy hành động của admin.** User tự đổi mật khẩu/email đi
   thẳng Keycloak Account, BE không thấy; BE chỉ có `adminResetPassword`, `updateUser` (email),
   `updateBlacklist` (`UserServiceImpl.java:242-251,374,420-424`). → nguồn đúng cho
   `AccountTakeoverDetected` là Keycloak user events (`UPDATE_PASSWORD`, `UPDATE_EMAIL`) qua poller; hook BE
   chỉ còn ý nghĩa audit hành động admin (`actorId`). Dùng `user.getKeycloakUserId()` chứ không phải
   `Long userId`, để cùng không gian ID với các event khác.
10. **Voucher chỉ có message tiếng Việt, không có reason code.** Nhiều nhánh `invalid()` là lỗi client
    (mã rỗng, `orderTotal` sai) không liên quan enumeration. → thêm enum reason (`CODE_NOT_FOUND`,
    `NOT_OWNER`, `EXPIRED`…) hoặc chỉ phát event ở 3-4 nhánh liên quan. Voucher do order-service gọi nội
    bộ → không có IP (plan mục 10 đã nêu).
11. **SOAR gọi thẳng Keycloak làm lệch cờ `blacklisted` trong DB user-service.** `updateBlacklist` hiện vừa
    ghi DB vừa `setEnabled` (`UserServiceImpl.java:242-251`). → hoặc SOAR gọi endpoint nội bộ của
    user-service (đã có cơ chế `X-Internal-Api-Key`), hoặc ghi rõ giới hạn trong báo cáo.
12. **Tài nguyên.** `.wslconfig` đang 2GB (đã gây treo Docker ngày 06/10). Thêm Logstash (JVM mặc định ~1GB) +
    `security-service` lên cạnh ES(512m)/Kibana/Keycloak/Debezium/Kafka là không đủ. → hoặc đặt
    `LS_JAVA_OPTS=-Xms256m -Xmx256m` và tăng RAM VM, hoặc bản v1 bỏ Logstash để `security-service` ghi ES
    trực tiếp (mất phần "enrich GeoIP bằng Logstash").
13. **Pin dependency + restart policy** (bài học numpy 2.2.6 vs 2.4.6 ngày 06/10): `search-service` đang
    `elasticsearch>=8.0.0` không chặn trên → cài mới sẽ ra bản 9.x lệch với server 8.10.2; forecast dùng
    `aiokafka>=0.10.0`, `apscheduler>=3.10.0` (image thực tế ra aiokafka 0.14.0). → `security-service` pin
    `elasticsearch>=8.10,<9` và pin chính xác các thư viện còn lại theo bản đã chạy; thêm `restart: always`
    tường minh vào entry compose (các service AI hiện không có — quan sát forecast-service không tự lên lại
    sau khi Docker restart; plan mục 6 đang giả định có).

**Thấp**

14. Phát hiện phụ (không thuộc plan): `KeycloakAdminClient.java:37` có client secret mặc định hardcode và
    gateway có `INTERNAL_API_KEY` mặc định `dev-internal-api-key` → `security-service` phải đọc secret từ
    env, không sao chép giá trị mặc định.
15. `contracts.py` theo mẫu `*_KEY_FMT` + hàm helper → khai báo các Redis key mục 3.3 dưới dạng
    `SEC_*_KEY_FMT` thay vì chuỗi rời.

### 11.3 Điều chỉnh đề xuất cho các phase (chưa áp dụng vào mục 8)

- **Phase 0**: thêm `adminEventsDetailsEnabled`, `eventsExpiration`, `enabledEventTypes` tường minh; kiểm
  chứng restart Keycloak (11.4) TRƯỚC khi đổi realm JSON; chốt phương án Logstash/RAM (điểm 12).
- **Phase 1**: consume thêm `payment-events` (thay cho producer Java mới); poller lấy cả user event
  `UPDATE_PASSWORD/UPDATE_EMAIL`; pin dependency; `restart: always`.
- **Phase 2**: bỏ payment-service khỏi danh sách Java phải sửa (còn gateway / promotion / user); gateway thêm
  1 filter (observer 429 + blocklist + resolver IP có XFF); route bảo mật dưới `/api/v1/admin/security/**`;
  thêm enum reason cho voucher.
- **Verification**: #1 tách đôi — API-abuse → block IP 403 qua gateway; brute-force → hành động đã chọn ở
  điểm 2 (khoá tài khoản có điều kiện / native lockout). Thêm ca âm: user thật gõ sai rồi đúng KHÔNG bị khoá.

### 11.4 Chưa xác minh được (cần Docker + Keycloak chạy)

- Service account `service-account-ecommerce-backend` thực tế có `view-events`, `manage-users`,
  `view-users` không (file JSON không khai báo).
- `OVERWRITE_EXISTING` có xoá user tạo lúc chạy khi restart Keycloak không; hành vi khi `enabledEventTypes`
  rỗng.
- Cách đo nhanh khi Docker lên: `docker restart infra-keycloak` rồi kiểm tra user đã đăng ký còn đăng nhập
  được không; gọi `GET /admin/realms/ecommerce-realm/events` bằng token service account.

### 11.5 Quyết định cần chủ dự án chọn trước khi vào Phase 0

1. Tier cho nhóm tấn công đăng nhập (điểm 2): khoá tài khoản có điều kiện, bật native brute-force protection,
   hay đặt Keycloak sau proxy?
2. Logstash hay ghi ES trực tiếp ở v1 (điểm 12)? Có tăng `.wslconfig` vĩnh viễn không?
3. SOAR mặc định tự động hay `ALERT_ONLY`/dry-run trong v1 (điểm 6)?
4. Có đồng ý sửa luôn quyền `/api/v1/risk/**`, `/api/v1/models/**` (điểm 1, phần phụ) trong nhánh này không?
