<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=true displayInfo=true; section>
    <#if section = "header">
        ${msg("registerTitle")}
    <#elseif section = "form">
    <div class="techstore-register-container">
        <h2 class="form-title">Đăng ký thành viên TECHSTORE</h2>
        
        <#if social.providers??>
            <div id="kc-social-providers">
                <div class="social-title">Đăng ký bằng tài khoản mạng xã hội</div>
                <ul class="social-list">
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
                <div class="social-divider">
                    <span>Hoặc điền thông tin sau</span>
                </div>
            </div>
        </#if>

        <form id="kc-register-form" action="${url.registrationAction}" method="post">
            <div class="register-section-title">Thông tin cá nhân</div>
            
            <div class="form-grid form-grid--two">
                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="firstName" class="${properties.kcLabelClass!}">Họ</label>
                    <input type="text" id="firstName" class="${properties.kcInputClass!}" name="firstName" value="${(register.formData.firstName!'')}" placeholder="Nhập họ của bạn" required minlength="1" />
                    <#if messagesPerField.existsError('firstName')>
                        <span id="input-error-firstname" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('firstName'))?no_esc}
                        </span>
                    </#if>
                </div>

                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="lastName" class="${properties.kcLabelClass!}">Tên</label>
                    <input type="text" id="lastName" class="${properties.kcInputClass!}" name="lastName" value="${(register.formData.lastName!'')}" placeholder="Nhập tên của bạn" required minlength="1" />
                    <#if messagesPerField.existsError('lastName')>
                        <span id="input-error-lastname" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('lastName'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="form-grid form-grid--two">
                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="username" class="${properties.kcLabelClass!}">Số điện thoại</label>
                    <input type="text" id="username" class="${properties.kcInputClass!}" name="username" value="${(register.formData.username!'')}" placeholder="Nhập số điện thoại" autocomplete="username" required pattern="0[0-9]{9,10}" title="Số điện thoại bắt đầu bằng số 0 và có từ 10 đến 11 chữ số" />
                    <#if messagesPerField.existsError('username')>
                        <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}
                        </span>
                    </#if>
                </div>

                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="email" class="${properties.kcLabelClass!}">Email</label>
                    <input type="email" id="email" class="${properties.kcInputClass!}" name="email" value="${(register.formData.email!'')}" placeholder="Nhập email" autocomplete="email" required />
                    <#if messagesPerField.existsError('email')>
                        <span id="input-error-email" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('email'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="register-section-title">Tạo mật khẩu</div>

            <div class="form-grid form-grid--two">
                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="password" class="${properties.kcLabelClass!}">Mật khẩu</label>
                    <input type="password" id="password" class="${properties.kcInputClass!}" name="password" autocomplete="new-password" placeholder="Mật khẩu từ 6 ký tự" required minlength="6" />
                    <#if messagesPerField.existsError('password')>
                        <span id="input-error-password" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('password'))?no_esc}
                        </span>
                    </#if>
                </div>

                <div class="${properties.kcFormGroupClass!}">
                    <label htmlFor="password-confirm" class="${properties.kcLabelClass!}">Nhập lại mật khẩu</label>
                    <input type="password" id="password-confirm" class="${properties.kcInputClass!}" name="password-confirm" placeholder="Nhập lại mật khẩu" required minlength="6" />
                    <#if messagesPerField.existsError('password-confirm')>
                        <span id="input-error-password-confirm" class="${properties.kcInputErrorMessageClass!}" aria-live="polite">
                            ${kcSanitize(messagesPerField.getFirstError('password-confirm'))?no_esc}
                        </span>
                    </#if>
                </div>
            </div>

            <div class="show-password-checkbox-container" style="text-align: left; margin: 10px 0 20px 0;">
                <label style="display: flex; align-items: center; gap: 8px; font-size: 13.5px; cursor: pointer; font-weight: 600; color: #4a5568;">
                    <input type="checkbox" id="togglePasswordVisibility" style="accent-color: #d70018;" /> Hiển thị mật khẩu
                </label>
            </div>

            <div class="register-terms">
                Bằng việc Đăng ký, bạn đã đọc và đồng ý với <a href="#">Điều khoản sử dụng</a> và <a href="#">Chính sách bảo mật của TechStore</a>.
            </div>

            <div class="register-actions">
                <a href="${url.loginUrl}" class="btn-back-login">
                    <span>Quay lại đăng nhập</span>
                </a>
                <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} btn-submit-register" type="submit" value="Hoàn tất đăng ký" />
            </div>
        </form>
    </div>
    <script>
        document.getElementById('togglePasswordVisibility').addEventListener('change', function(e) {
            var type = this.checked ? 'text' : 'password';
            document.getElementById('password').type = type;
            document.getElementById('password-confirm').type = type;
        });

        document.getElementById('kc-register-form').addEventListener('submit', function(e) {
            var password = document.getElementById('password').value;
            var confirm = document.getElementById('password-confirm').value;
            if (password !== confirm) {
                e.preventDefault();
                alert('Mật khẩu nhập lại không trùng khớp! Vui lòng kiểm tra lại.');
            }
        });
    </script>
    </#if>
</@layout.registrationLayout>
