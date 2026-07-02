<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true displayInfo=realm.password && realm.registrationAllowed && !registrationDisabled??; section>
    <#if section = "header">
        ${msg("loginAccountTitle")}
    <#elseif section = "form">
    <div class="techstore-login-grid">
        <!-- Left Column: TechStore Member Promo -->
        <div class="techstore-promo-col">
            <div class="techstore-logo-row">
                <span class="techstore-badge">TECHSTORE</span>
                <span class="techstore-sub-badge">MEMBER</span>
            </div>
            <h2 class="promo-title">Nhập hội khách hàng thành viên TECHSTORE</h2>
            <p class="promo-subtitle">Để không bỏ lỡ các ưu đãi hấp dẫn từ TechStore</p>
            
            <div class="promo-box">
                <ul class="promo-list">
                    <li>
                        <span class="promo-icon">🎁</span>
                        <span class="promo-text"><strong>Chiết khấu đến 5%</strong> khi mua các sản phẩm tại TechStore</span>
                    </li>
                    <li>
                        <span class="promo-icon">🚚</span>
                        <span class="promo-text"><strong>Miễn phí giao hàng</strong> cho thành viên, SVIP từ 300.000đ</span>
                    </li>
                    <li>
                        <span class="promo-icon">🎂</span>
                        <span class="promo-text"><strong>Tặng voucher sinh nhật</strong> đến 500.000đ cho khách hàng thành viên</span>
                    </li>
                    <li>
                        <span class="promo-icon">🔄</span>
                        <span class="promo-text"><strong>Trợ giá thu cũ lên đời</strong> đến 2 triệu đồng</span>
                    </li>
                    <li>
                        <span class="promo-icon">📈</span>
                        <span class="promo-text"><strong>Thăng hạng nhận voucher</strong> đến 300.000đ</span>
                    </li>
                    <li>
                        <span class="promo-icon">🎓</span>
                        <span class="promo-text"><strong>Đặc quyền S-Student/S-Teacher</strong> ưu đãi thêm đến 10%</span>
                    </li>
                    <li>
                        <span class="promo-icon">💼</span>
                        <span class="promo-text"><strong>S-Business: Chiết khấu đến 8%</strong> dành riêng cho khách hàng doanh nghiệp</span>
                    </li>
                </ul>
                <div class="promo-footer-link">
                    <a href="#">Xem chi tiết chính sách ưu đãi TechStore Member ➔</a>
                </div>
            </div>
        </div>

        <!-- Right Column: Login Form -->
        <div class="techstore-form-col">
            <#if message?? && message.type == 'success' && (message.summary?contains('email') || message.summary?contains('instruction') || message.summary?contains('hướng dẫn') || message.summary?contains('thư') || message.summary?contains('Email') || message.summary?contains('Instruction'))>
                <!-- Render Gmail Redirect Page instead of Login Form -->
                <h2 class="form-title">Đã gửi yêu cầu!</h2>
                <div id="kc-info-message" style="text-align: center; padding: 20px 0;">
                    <p class="instruction" style="font-size: 15px; margin-bottom: 25px; line-height: 1.6; color: #4a5568; font-weight: 500;">
                        ${message.summary}
                    </p>

                    <div style="margin: 30px 0;">
                        <a href="https://mail.google.com" target="_blank" class="gmail-redirect-btn" style="display: inline-block; padding: 14px 28px; background-color: #db4437; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(219, 68, 55, 0.2); transition: all 0.2s; border: none; cursor: pointer;">
                            📬 Đi tới Hộp thư Gmail của bạn
                        </a>
                        <p style="font-size: 13px; color: #718096; margin-top: 15px;">
                            Hệ thống sẽ tự động chuyển hướng bạn tới Gmail sau <span id="countdown">4</span> giây...
                        </p>
                    </div>

                    <a href="${url.loginUrl}" style="text-align: center; display: block; font-size: 14px; color: #4a5568; text-decoration: underline; font-weight: 500;">
                        Quay lại đăng nhập
                    </a>
                </div>

                <script>
                    var seconds = 4;
                    var countdownEl = document.getElementById("countdown");
                    var interval = setInterval(function() {
                        seconds--;
                        if (countdownEl) {
                            countdownEl.textContent = seconds;
                        }
                        if (seconds <= 0) {
                            clearInterval(interval);
                            window.location.href = "https://mail.google.com";
                        }
                    }, 1000);
                </script>
            <#else>
                <h2 class="form-title">Đăng nhập TECHSTORE</h2>
                
                <div id="kc-form">
                  <div id="kc-form-wrapper">
                    <#if realm.password>
                        <form id="kc-form-login" onsubmit="login.disabled = true; return true;" action="${url.loginAction}" method="post">
                            <#if !usernameHidden??>
                                <div class="${properties.kcFormGroupClass!}">
                                    <label htmlFor="username" class="${properties.kcLabelClass!}">Số điện thoại hoặc Email</label>
                                    <input tabindex="1" id="username" class="${properties.kcInputClass!}" name="username" value="${(login.username!'')}"  type="text" autofocus autocomplete="off" placeholder="Nhập số điện thoại/email của bạn" required />
                                    <#if messagesPerField.existsError('username')>
                                        <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                            ${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}
                                        </span>
                                    </#if>
                                </div>
                            </#if>

                            <div class="${properties.kcFormGroupClass!}">
                                <label htmlFor="password" class="${properties.kcLabelClass!}">Mật khẩu</label>
                                <div class="password-input-wrapper">
                                    <input tabindex="2" id="password" class="${properties.kcInputClass!}" name="password" type="password" autocomplete="off" placeholder="Nhập mật khẩu của bạn" required />
                                </div>
                                <#if messagesPerField.existsError('password')>
                                    <span id="input-error-password" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                                        ${kcSanitize(messagesPerField.getFirstError('password'))?no_esc}
                                    </span>
                                </#if>
                            </div>

                            <div class="show-password-checkbox-container" style="text-align: left; margin: 10px 0 15px 0;">
                                <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; font-weight: 600; color: #4a5568;">
                                    <input type="checkbox" id="togglePasswordVisibility" style="accent-color: #d70018;" /> Hiển thị mật khẩu
                                </label>
                            </div>

                            <div class="${properties.kcFormGroupRowClass!}">
                                <div id="kc-form-options">
                                    <#if realm.rememberMe && !usernameHidden??>
                                        <div class="checkbox">
                                            <label>
                                                <#if login.rememberMe??>
                                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox" checked> Nhớ đăng nhập
                                                <#else>
                                                    <input tabindex="3" id="rememberMe" name="rememberMe" type="checkbox"> Nhớ đăng nhập
                                                </#if>
                                            </label>
                                        </div>
                                    </#if>
                                    <#if realm.resetPasswordAllowed>
                                        <div class="${properties.kcFormOptionsWrapperClass!}">
                                            <span><a tabindex="5" href="${url.loginResetCredentialsUrl}">Quên mật khẩu?</a></span>
                                        </div>
                                    </#if>
                                </div>
                            </div>

                            <div id="kc-form-buttons" class="${properties.kcFormGroupClass!}">
                                <input type="hidden" id="id-hidden-input" name="credentialId" <#if auth.selectedCredential?has_content>value="${auth.selectedCredential}"</#if>/>
                                <input tabindex="4" class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!}" name="login" id="kc-login" type="submit" value="Đăng nhập"/>
                            </div>
                        </form>
                    </#if>
                  </div>
                </div>

                <#if realm.password && social.providers??>
                    <div id="kc-social-providers" class="${properties.kcFormSocialAccountSectionClass!}">
                        <div class="social-divider">
                            <span>Hoặc đăng nhập bằng</span>
                        </div>
                        <ul class="${properties.kcFormSocialAccountListClass!} <#if social.providers?size gt 3>${properties.kcFormSocialAccountListGridClass!}</#if>">
                            <#list social.providers as p>
                                <a id="social-${p.alias}" class="social-btn" href="${p.loginUrl}">
                                    <#if p.alias == "google">
                                        <svg class="social-icon" viewBox="0 0 24 24" width="18" height="18"><path fill="#EA4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114A5.99 5.99 0 0 1 8 12.5a5.99 5.99 0 0 1 5.99-6.012c1.49 0 2.845.55 3.9 1.455l3.07-3.07C19.145 3.12 16.735 2 13.99 2 8.163 2 3.5 6.663 3.5 12.5S8.163 23 13.99 23c5.39 0 9.8-3.9 9.8-9.8a8.2 8.2 0 0 0-.166-1.63L12.24 10.285Z"/></svg>
                                    <#else>
                                        <span class="social-alias-text">${p.displayName}</span>
                                    </#if>
                                    <span>${p.displayName}</span>
                                </a>
                            </#list>
                        </ul>
                    </div>
                </#if>

                <#if realm.password && realm.registrationAllowed && !registrationDisabled??>
                    <div class="register-footer-text">
                        Bạn chưa có tài khoản? <a href="${url.registrationUrl}">Đăng ký ngay</a>
                    </div>
                </#if>
            </#if>
        </div>
    </div>
    <script>
        document.getElementById('togglePasswordVisibility').addEventListener('change', function(e) {
            document.getElementById('password').type = this.checked ? 'text' : 'password';
        });
    </script>
    </#if>
</@layout.registrationLayout>
