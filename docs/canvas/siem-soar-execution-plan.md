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
