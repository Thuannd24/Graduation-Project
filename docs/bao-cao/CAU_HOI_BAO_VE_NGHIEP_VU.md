# Câu hỏi bảo vệ về nghiệp vụ và các tình huống xảy ra

Tài liệu chuẩn bị cho phần hỏi đáp khi bảo vệ. Mỗi câu gồm:
- **Tình huống** thầy cô hay hỏi.
- **Các trường hợp** có thể xảy ra và **hệ thống hiện tại xử lý thế nào**, theo code nhánh `develop` và kết quả kiểm thử ngày 17–18/10/2026.
- **Gợi ý trả lời.** Với những điểm yếu đã biết thì thừa nhận thẳng và nêu hướng sửa, đối chiếu với [THIEU_SOT_NGHIEP_VU.md](THIEU_SOT_NGHIEP_VU.md).

Ký hiệu:
- ✅ Hệ thống xử lý tốt.
- ⚠️ Có xử lý nhưng còn hạn chế.
- ❌ Chưa xử lý, nên chủ động nêu là hướng phát triển.

Nguyên tắc khi bị hỏi trúng điểm yếu: **thừa nhận, giải thích vì sao, nêu cách sửa cụ thể.** Không chống chế. Hội đồng đánh giá cao việc sinh viên biết giới hạn của hệ thống mình làm.

---

## A. Đặt hàng và tồn kho

### A1. Hai khách cùng mua món hàng cuối cùng thì sao?
| Trường hợp | Hệ thống xử lý |
|---|---|
| Hai người bấm đặt hàng gần như cùng lúc | ✅ Lúc checkout, order-service trừ tồn kho trên **Redis bằng Lua script**. Lua chạy nguyên tử nên chỉ một người trừ được; người còn lại nhận lỗi `OUT_OF_STOCK` |
| Redis và database bị lệch (Redis còn, DB hết) | ✅ inventory-service trừ kho trong DB bằng `SELECT … FOR UPDATE` (khóa dòng). DB không đủ thì phát sự kiện thất bại, đơn chuyển **CANCELLED** và Redis được hoàn lại |
| Redis chưa có số tồn của sản phẩm | ✅ order-service lấy tồn kho qua gRPC từ inventory-service, có khóa `SETNX` để tránh nhiều request cùng nạp |

**Gợi ý trả lời:** "Em giữ tồn kho ở 2 lớp. Redis chặn bán vượt ngay tức thì nhờ thao tác nguyên tử; database là sổ kho chính thức, có khóa bi quan. Hai lớp lệch nhau thì database quyết định, đơn bị hủy và hoàn kho tự động. Admin có nút **Đồng bộ Redis** để sửa lệch thủ công."

### A2. Khách bấm "Đặt hàng" hai lần hoặc mạng chập chờn gửi lại request?
| Trường hợp | Hệ thống xử lý |
|---|---|
| Gửi lại cùng request | ✅ Mỗi lần mở trang checkout sinh một **Idempotency-Key**. Server giữ khóa này trong Redis 15 phút và trả lại đúng đơn đã tạo (đã kiểm thử: `API_PH3_012`) |
| Request đầu đang xử lý dở thì request thứ hai tới | ✅ Trả lỗi 409 `DUPLICATE_REQUEST` |

### A3. Khách sửa giá hoặc phí ship trên trình duyệt thì sao?
✅ Server **tự tính lại toàn bộ**: giá lấy từ product-service qua gRPC, phí ship do server tính, voucher do promotion-service kiểm tra. Số tiền client gửi lên bị bỏ qua (đã kiểm thử: gửi `shippingFee=0` thì đơn vẫn tính 30.000đ, ca `API_PH3_019`).

### A4. Giá sản phẩm thay đổi khi khách đang để hàng trong giỏ?
✅ Giỏ hàng lấy giá mới mỗi lần mở, và checkout tính lại theo giá hiện tại. Khách luôn trả theo giá tại thời điểm đặt. Giá được "đóng băng" vào từng dòng của đơn (snapshot), nên sau này sản phẩm đổi giá thì đơn cũ không bị ảnh hưởng.

### A5. Khách đặt hàng VNPay nhưng không thanh toán?
| Thời điểm | Hệ thống xử lý |
|---|---|
| Ngay sau khi đặt | Hàng đã bị trừ (giữ chỗ), đơn ở **Chờ thanh toán** |
| Sau 15 phút | Giao dịch VNPay hết hạn |
| Sau 30 phút | ✅ `OrderExpiryScheduler` (chạy 5 phút một lần) tự hủy đơn, trả kho, trả voucher, hoàn điểm |

⚠️ Hạn chế: không giới hạn số đơn chờ thanh toán của một khách, nên về lý thuyết một tài khoản có thể "giữ" nhiều hàng trong 30 phút. Hướng sửa: giới hạn số đơn chưa thanh toán trên mỗi tài khoản.

### A6. Một service bị sập giữa lúc đặt hàng thì sao?
| Service sập | Hệ thống xử lý |
|---|---|
| inventory-service | ✅ Đơn vẫn được tạo (PENDING), sự kiện nằm trong Kafka. Service lên lại sẽ xử lý tiếp; quá 30 phút chưa xử lý thì đơn tự hủy |
| Kafka | ✅ Sự kiện đã nằm an toàn trong bảng `outbox_events` của database. Debezium đẩy lên khi Kafka chạy lại, không mất sự kiện |
| product-service (lấy giá) | ✅ Checkout trả 503, khách thử lại sau; không tạo đơn sai giá |
| Gateway gọi service đang sập | ✅ Circuit breaker trả 503 kèm thông báo "Dịch vụ tạm thời không khả dụng"; các phân hệ khác vẫn hoạt động |

### A7. ❓ "Giá trên web là 29,89 triệu, sao khách phải trả 32,9 triệu?" (câu dễ bị hỏi)
❌ Hệ thống đang **cộng thêm VAT 10%** lên giá niêm yết (`OrderPricingHelper.java:44-45`), cộng thêm phí ship 30.000đ.

**Gợi ý trả lời:** "Đây là điểm em đã nhận ra khi kiểm thử. Ở Việt Nam, giá bán lẻ thường đã gồm VAT. Hướng sửa là coi giá niêm yết là giá đã gồm VAT, chỉ tách VAT ra để in hóa đơn, không cộng thêm khi thanh toán."

### A8. Phí vận chuyển tính thế nào?
❌ Hiện **cố định 30.000đ**, và vận chuyển là giả lập (mã `MOCK-GHTK-*`). Webhook nhận trạng thái giao hàng đã có kiểm tra chữ ký HMAC.
**Gợi ý trả lời:** "Em đã thiết kế sẵn webhook có chữ ký để nhận trạng thái từ hãng vận chuyển. Bước tiếp theo là gọi API tính phí của GHTK hoặc GHN theo địa chỉ và khối lượng, và miễn phí ship theo ngưỡng giá trị đơn."

---

## B. Thanh toán

### B1. Làm sao biết kết quả VNPay gửi về là thật, không bị giả mạo?
| Trường hợp | Hệ thống xử lý (đã kiểm thử) |
|---|---|
| Không có chữ ký, hoặc chữ ký bị sửa | ✅ Từ chối, mã `97` (`API_PH5_004`, `API_PH5_005`) |
| Chữ ký đúng nhưng số tiền bị sửa | ✅ Từ chối, mã `04` (`API_PH5_006`) |
| VNPay gửi lại kết quả lần 2 | ✅ Không xử lý trùng, mã `02` (`API_PH5_009`) |
| Kết quả hợp lệ, mã `00` | ✅ Xác nhận đơn (CONFIRMED) |

**Gợi ý trả lời:** "Em kiểm tra chữ ký HMAC-SHA512 bằng secret chỉ server biết, so khớp số tiền với giao dịch trong DB, và khóa dòng giao dịch để không xác nhận hai lần. Mọi callback đều được ghi vào bảng `webhook_logs` để đối soát."

### B2. Khách trả tiền xong nhưng tắt trình duyệt, không quay về web?
✅ Kết quả thanh toán được xác nhận qua lời gọi từ server VNPay (IPN), không phụ thuộc trình duyệt của khách. payment-service còn có tác vụ định kỳ truy vấn lại VNPay cho các giao dịch còn treo.
⚠️ Khi chạy ở máy local, VNPay không gọi được địa chỉ `localhost`, nên lúc demo kết quả đi qua trang trả về của trình duyệt. Khi triển khai thật cần khai báo IPN URL công khai trong trang quản lý merchant.

### B3. Khách trả tiền khi đơn đã hết hạn hoặc đã bị hủy?
✅ Gọi là "thanh toán muộn". Hệ thống phát hiện giao dịch đã EXPIRED hoặc FAILED mà VNPay báo thành công, liền chuyển sang **REFUND_PENDING** và tự hoàn tiền, để khách không mất tiền.

### B4. Thanh toán VNPay thất bại (nhập sai OTP, hết hạn mức) thì sao?
⚠️ Đơn **bị hủy ngay**, kho được trả lại. Khách không được thanh toán lại hay đổi sang COD, phải đặt đơn mới.
⚠️ Thêm nữa: khách bấm "Hủy giao dịch" trên trang VNPay vẫn bị chuyển về trang báo "thành công" (`UI_PH5_FR02_007`), dù đơn thực tế đã bị hủy đúng.
**Gợi ý trả lời:** "Thực tế nên giữ đơn thêm một khoảng thời gian để khách thanh toán lại hoặc đổi phương thức, và trang kết quả phải lấy trạng thái từ server chứ không đọc tham số trên URL. Em đã ghi nhận đây là lỗi cần sửa."

### B5. Hoàn tiền diễn ra thế nào? Nếu hoàn tiền bị lỗi?
| Trường hợp | Hệ thống xử lý |
|---|---|
| Hủy đơn đã trả VNPay | ✅ Tự tạo yêu cầu hoàn tiền; scheduler chạy mỗi phút gọi API hoàn tiền của VNPay |
| VNPay lỗi tạm thời | ✅ Giữ trạng thái chờ và thử lại ở lần chạy sau |
| VNPay từ chối hẳn | ✅ Chuyển `PENDING_MANUAL` để nhân viên xử lý |
| Admin hoàn tiền thủ công | ✅ Chỉ ADMIN được làm (STAFF bị chặn 403); số tiền hoàn không được vượt số đã thanh toán; có hoàn một phần |

⚠️ Hạn chế đã phát hiện:
- Hệ thống gọi VNPay **trước** khi khóa bản ghi thanh toán, nên có rủi ro hoàn trùng khi hai luồng chạy cùng lúc (`TC_PH5_REFUND_05`).
- Khách không thấy tiến trình hoàn tiền, và không có email hoàn tiền.

### B6. Đơn COD thì khi nào tính là đã thanh toán?
✅ Đơn COD được xác nhận ngay khi đặt, nhưng khoản thanh toán chỉ chuyển **SUCCESS khi đơn đã giao** (lúc shipper thu tiền).

---

## C. Hủy đơn

### C1. Ai được hủy, hủy được lúc nào?
| Trạng thái đơn | Khách | Admin/Staff |
|---|---|---|
| Chờ xử lý / Chờ thanh toán / Đã xác nhận | ✅ Được hủy (giao diện giới hạn trong 2 giờ kể từ khi đặt) | ✅ Được hủy |
| Đang giao | ❌ Không được | ✅ Nút **Hủy Giao Hàng** |
| Đã giao / Đã hủy | ❌ Không đổi được nữa (trạng thái cuối) | ❌ |

⚠️ Giới hạn 2 giờ chỉ kiểm tra ở giao diện, backend không kiểm tra. Không có bước chọn lý do hủy.

### C2. Hủy đơn thì tiền, hàng, voucher, điểm xử lý ra sao?
| | Kho | Voucher | Điểm | Tiền |
|---|---|---|---|---|
| Đơn chưa xác nhận | ✅ Trả lại | ✅ Trả lại | ✅ Hoàn | Không phát sinh |
| Đơn VNPay đã trả | ✅ Trả lại | ❌ Không trả | ✅ Hoàn | ✅ Tự hoàn qua VNPay |
| Đơn COD (xác nhận ngay khi đặt) | ✅ Trả lại | ❌ **Không trả** | ✅ Hoàn | Không phát sinh |

**Câu dễ bị hỏi:** "Khách COD hủy sau 1 phút có mất voucher không?" Câu trả lời là **có**. Đây là điểm chưa hợp lý; hướng sửa là trả voucher nếu đơn bị hủy trước khi giao và voucher còn hạn.

### C3. Admin hủy đơn đang giao thì hàng về kho lúc nào?
❌ Kho được cộng lại **ngay lập tức**, trong khi hàng thực tế vẫn đang ở đơn vị vận chuyển, nên hệ thống có thể bán món chưa về kho.
**Gợi ý trả lời:** "Đúng ra nên có trạng thái 'chờ hoàn hàng'; kho chỉ cộng lại khi nhân viên xác nhận đã nhận hàng hoàn. Đây là điểm em ưu tiên sửa đầu tiên."

### C4. Nếu bước trả voucher hoặc hoàn điểm bị lỗi giữa chừng?
✅ Đơn vẫn hủy thành công. Bước bị lỗi được ghi thành `CompensationTask`, và `CompensationRetryScheduler` thử lại 5 phút một lần. Đây là bước bù trừ của mẫu **Saga**.

---

## D. Tính nhất quán dữ liệu giữa các service (câu hỏi kiến trúc)

### D1. Vì sao không dùng transaction phân tán (2PC) mà dùng Saga?
**Gợi ý trả lời:** "Mỗi service có database riêng. 2PC khóa tài nguyên ở nhiều service cùng lúc; một service chậm thì cả hệ thống chờ, làm giảm khả năng chịu lỗi. Em dùng **Saga**: mỗi bước là một transaction cục bộ, bước sau lỗi thì chạy bước bù trừ. Dữ liệu đạt **nhất quán sau cùng** (eventual consistency) trong vài giây."

### D2. Làm sao đảm bảo "lưu đơn thành công thì chắc chắn có sự kiện gửi đi"?
✅ Mẫu **Transactional Outbox**: đơn và sự kiện được ghi trong **cùng một transaction** vào bảng `outbox_events`. Debezium đọc binlog của MariaDB rồi đẩy sự kiện lên Kafka. Không có chuyện lưu đơn rồi mà mất sự kiện, hay gửi sự kiện cho một đơn chưa lưu.

### D3. Một sự kiện bị xử lý hai lần thì sao?
| Service | Hệ thống xử lý |
|---|---|
| inventory-service | ✅ Kiểm tra theo `orderId` + loại giao dịch trước khi trừ hoặc trả kho. ⚠️ Đơn có từ 2 sản phẩm trở lên khi bị gửi lặp có thể ném lỗi (`TC_PH4_*`) |
| promotion-service | ✅ Bảng `executed_actions` với khóa idempotency, mỗi sự kiện chỉ kích hoạt một lần. ⚠️ Khóa chống trùng được nhả trước khi commit nên vẫn còn khe hở nhỏ |
| payment-service (callback) | ✅ Khóa dòng giao dịch, callback lặp trả mã `02` |

---

## E. Khuyến mãi, voucher, điểm thưởng

### E1. Một đơn dùng được mấy voucher? Một voucher dùng được mấy lần?
✅ Mỗi đơn **tối đa 1 voucher**. Voucher là **cá nhân, dùng một lần**: khi đặt hàng thì chuyển RESERVED (gắn với đơn), đơn xác nhận thì thành USED.

### E2. Một voucher dùng cho hai đơn đặt cùng lúc?
✅ Đơn thứ nhất giữ voucher (RESERVED). Đơn thứ hai không áp được vì voucher không còn ở trạng thái UNUSED.

### E3. Voucher và điểm thưởng từ đâu ra?
⚠️ **Chỉ phát qua chiến dịch** do admin thiết kế (trigger → điều kiện → hành động, chạy trên Camunda). Không có mã giảm giá công khai để nhập tay, và mua hàng không tự tích điểm.
**Gợi ý trả lời:** "Em chọn hướng tự động hóa marketing: admin vẽ kịch bản và hệ thống tự phát thưởng khi có sự kiện. Mã công khai và tích điểm theo đơn là phần bổ sung tiếp theo."

### E4. Chiến dịch hết ngân sách thì sao? Tắt chiến dịch giữa chừng?
| Trường hợp | Hệ thống xử lý |
|---|---|
| Hết ngân sách | ✅ Ngân sách được khóa khi trừ; hết tiền thì ngừng phát |
| Admin tắt chiến dịch | ✅ Không nhận sự kiện mới. ⚠️ Các tiến trình Camunda đang chạy không bị dừng (`TC_PH6_CAMP_06`) |
| Xóa chiến dịch hẹn giờ | ⚠️ Deployment trên Camunda vẫn còn nên có thể vẫn chạy |
| Lỗi tạm thời khi phát voucher | ⚠️ Bị bỏ qua, không thử lại (`TC_PH6_DELEGATE_02`) |

### E5. 1 điểm bằng bao nhiêu tiền? Dùng điểm thế nào?
✅ 1 điểm = 1.000đ, dùng ở trang checkout trong giới hạn hệ thống cho phép (xem trước bằng `redeem-preview`). Hủy đơn thì điểm được hoàn.
⚠️ Khi dùng điểm, tổng tiền ở trang checkout lệch vài nghìn đồng so với đơn thực tế (`UI_PH6_FR03_006`): giao diện tính VAT trước khi trừ điểm, còn server tính sau.

---

## F. Tài khoản và phân quyền

### F1. ADMIN và STAFF khác nhau thế nào?
| Thao tác | STAFF | ADMIN |
|---|---|---|
| Tạo, sửa sản phẩm, danh mục, thương hiệu; xử lý đơn; nhập kho; tạo, sửa chiến dịch; chat hỗ trợ | ✅ | ✅ |
| Xóa sản phẩm, danh mục, thương hiệu, chiến dịch | ❌ | ✅ |
| Đổi vai trò, hạng, khóa tài khoản, đặt lại mật khẩu khách | ❌ | ✅ |
| Hoàn tiền thủ công, import catalog | ❌ | ✅ |

✅ Phân quyền có 2 lớp: gateway chặn đường dẫn `/admin/**` (chỉ ADMIN hoặc STAFF), và từng service kiểm tra quyền chi tiết.
⚠️ Khi STAFF gọi thao tác chỉ dành cho ADMIN, hệ thống chặn đúng nhưng nhiều service trả lỗi **500** thay vì 403.

### F2. Khách A có xem hoặc hủy được đơn của khách B không?
✅ Không: server kiểm tra người gọi là chủ đơn hoặc ADMIN/STAFF, và dữ liệu không bị lộ. ⚠️ Mã lỗi trả về là 500 thay vì 403.

### F3. Kẻ gian tự thêm header "tôi là ADMIN" vào request?
✅ Gateway **xóa mọi header `X-User-*` do client gửi**, rồi tự gắn lại từ token đã xác thực (đã kiểm thử: `API_PH1_031`).

### F4. Mật khẩu lưu ở đâu? Token sống bao lâu?
✅ Hệ thống **không tự lưu mật khẩu**; Keycloak quản lý theo chuẩn OAuth2/OIDC. Token sống 15 phút, có refresh token. Hỗ trợ đăng nhập Google.

### F5. Khóa tài khoản thì khách có bị đăng xuất ngay không?
⚠️ Token đang có vẫn dùng được đến khi hết hạn (tối đa 15 phút). Nếu đồng bộ khóa sang Keycloak bị lỗi, hệ thống vẫn báo đã khóa nhưng khách vẫn đăng nhập được (`TC_PH1_ADMIN_07`).

---

## G. Sản phẩm, tìm kiếm, đánh giá

### G1. Ai được đánh giá sản phẩm?
✅ Chỉ khách **đã mua và đơn đã giao**; mỗi sản phẩm được đánh giá **một lần cho mỗi đơn**.
⚠️ Hạn chế đã phát hiện:
- Nếu order-service sập, đánh giá vẫn được lưu mà không kiểm tra đã mua hay chưa (`TC_PH2_REVIEW_07`).
- Điểm sao không bị giới hạn 1–5 (`TC_PH2_REVIEW_06`).
- Trang sản phẩm luôn hiển thị 0 sao.

### G2. Tìm kiếm hoạt động thế nào? Elasticsearch sập thì sao?
✅ Ô tìm kiếm dùng **Elasticsearch**; Elasticsearch sập thì tự chuyển sang tìm trong MariaDB.
⚠️ Tìm kiếm ngữ nghĩa lai (BM25 + vector multilingual-e5-large + RRF) đã xây dựng ở AI search-service nhưng **ô tìm kiếm trên web chưa dùng**, thử được qua Swagger (:8001).

---

## H. AI: gợi ý, dự đoán rời bỏ, chatbot

### H1. Khách mới chưa có lịch sử thì gợi ý gì?
✅ Thang 3 tầng: **SASRec** (model tuần tự) → **Recency** (xem gần đây) → **Popularity** (phổ biến). Khách mới nhận danh sách phổ biến. Header `X-Recs-Strategy` cho biết đang dùng tầng nào.
⚠️ Hạn chế đã phát hiện:
- Phần lớn sự kiện xem và thêm giỏ bị bỏ do lệch định dạng thời gian giữa Java và Python, nên tab "Xem gần đây" không cập nhật.
- Gợi ý mua kèm chưa dựa vào nội dung giỏ hàng.

### H2. Model dự đoán khách rời bỏ được huấn luyện và đánh giá thế nào? Dữ liệu ở đâu ra?
- Nhãn: khách **không đặt đơn nào trong 120 ngày tiếp theo** (chỉ xét khách đã có từ 2 đơn đã giao trở lên). Có 11 đặc trưng: recency, frequency, chi tiêu, hành vi xem và giỏ…
- Model: **KMeans** chia 4 nhóm khách; **Logistic Regression** cho xác suất rời bỏ, có hiệu chỉnh xác suất.
- Đánh giá: cross-validation 5 fold, chia theo người dùng và theo thời gian (huấn luyện trên mốc cắt sớm hơn).
- ⚠️ **Dữ liệu là dữ liệu tổng hợp** (300 khách, 890 đơn, khoảng 190.000 sự kiện) do `tools/data-seed` sinh ra.

**Gợi ý trả lời:** "Kết quả chỉ chứng minh pipeline và phương pháp hoạt động đúng, chưa phải độ chính xác trên khách thật. Khi có dữ liệu thật thì huấn luyện lại bằng cùng pipeline."

### H3. Chatbot có bịa câu trả lời không? Có lộ đơn của người khác không?
| Trường hợp | Hệ thống xử lý |
|---|---|
| Hỏi chính sách | ✅ **RAG**: tra đoạn liên quan trong 11 tài liệu chính sách rồi mới trả lời; không đủ liên quan thì từ chối |
| Hỏi sản phẩm | ✅ Gọi tìm kiếm sản phẩm thật, trả thẻ sản phẩm |
| Hỏi đơn, điểm, voucher | ✅ Gọi backend bằng **chính token của khách**, nên chỉ thấy dữ liệu của mình; chưa đăng nhập thì yêu cầu đăng nhập |
| Câu hỏi ngoài lề | ✅ Từ chối lịch sự |
| Khiếu nại | ✅ Chuyển sang nhân viên |

⚠️ Hạn chế đã phát hiện:
- Câu hỏi có khoảng giá thường ra kết quả sai.
- Lịch sử chat mất khi tải lại trang.
- Không có nhân viên online thì widget báo "đã chuyển email" nhưng không gửi gì.

### H4. Không có nhân viên online thì khách chat với ai?
✅ Phòng chat chuyển sang **WAITING**; nhân viên online sau đó sẽ thấy trong danh sách chờ. ⚠️ Không có thông báo hay email thật báo cho nhân viên.

---

## I. Vận hành, hiệu năng, bảo mật

### I1. Hệ thống chịu tải được bao nhiêu?
✅ Đo bằng k6 trên laptop, gọi thẳng từng service:
- Với 20 người dùng đồng thời: đa số API đọc có **p95 dưới 50 ms**, tỉ lệ lỗi 0%.
- Với 50 người dùng: đa số dưới 150 ms. Riêng API bảo hành khoảng 470 ms, do truy vấn N+1.
- Danh sách sản phẩm đạt khoảng 700–1.100 request/giây.
⚠️ Tìm kiếm AI và chatbot (LLM) chậm hơn nhiều. Tạo phòng chat đồng thời cho cùng một khách sinh ra phòng trùng (phát hiện khi kiểm thử tải).

### I2. Chống spam hoặc DDoS thế nào?
✅ Gateway giới hạn **20 request/giây, cho phép dồn tối đa 50**, cho mỗi người dùng hoặc IP. Vượt ngưỡng thì trả 429 (đã kiểm thử: 62.378/62.728 request bị chặn khi bắn 60 người dùng ảo).

### I3. Hệ thống có những lỗ hổng bảo mật nào đã biết?
Nên chủ động nêu nếu được hỏi, vì đây là kết quả kiểm thử:
- Route tự động `/{service}/**` của gateway bỏ qua quy tắc chặn API nội bộ (đã chứng minh gửi được thông báo nội bộ bằng tài khoản khách).
- Khách thường gọi được API huấn luyện model và quét rủi ro.
- Định danh khách vãng lai trong chat có thể bị giả mạo.
- API công khai trả cả giá vốn sản phẩm.

**Gợi ý trả lời:** "Em đã phát hiện các lỗ hổng này qua kiểm thử bảo mật và ghi trong báo cáo SQA kèm cách sửa: tắt route tự động của gateway, kiểm tra vai trò ở các API AI, ràng buộc phòng chat với danh tính đã xác thực, và ẩn giá vốn ở API công khai."

---

## Các câu hỏi "bẫy" hay gặp và cách trả lời ngắn

| Câu hỏi | Trả lời ngắn |
|---|---|
| "Microservices có cần thiết cho đồ án này không?" | Để chia tải và triển khai độc lập từng phân hệ, và thể hiện các bài toán phân tán thật (Saga, Outbox, nhất quán sau cùng). Đổi lại, vận hành phức tạp hơn và tốn RAM (khoảng 20 GB khi chạy đủ). |
| "Nếu Redis mất dữ liệu?" | Redis chỉ là lớp nhanh; database là nguồn sự thật. Có job đồng bộ hằng đêm và nút đồng bộ thủ công. Giỏ hàng nằm trên Redis nên có thể mất giỏ (không mất đơn). |
| "Dữ liệu AI có thật không?" | Catalog là sản phẩm thật (khoảng 1.100 sản phẩm); hành vi và đơn để huấn luyện churn là dữ liệu tổng hợp, có nói rõ trong báo cáo. |
| "Đã kiểm thử những gì?" | 780 ca (giao diện, API, unit) và 30 kịch bản hiệu năng; tỉ lệ đạt khoảng 86%. Các ca không đạt là lỗi thật, có bằng chứng và hướng sửa trong `docs/test/SQA_TechStore.xlsx`. |
| "Phần nào làm chưa xong?" | Đổi trả và bảo hành, phí ship thật, mã khuyến mãi công khai, dashboard dự báo dùng dữ liệu thật, trung tâm thông báo (xem [THIEU_SOT_NGHIEP_VU.md](THIEU_SOT_NGHIEP_VU.md)). |
