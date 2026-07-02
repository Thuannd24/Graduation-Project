<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=true displayMessage=true; section>
    <#if section = "header">
        ${msg("emailForgotTitle")}
    <#elseif section = "form">
    <div class="techstore-register-container" style="max-width: 480px; margin: 0 auto; padding: 30px 20px;">
        <h2 class="form-title" style="margin-bottom: 10px;">Khôi phục mật khẩu</h2>
        <p style="font-size: 13.5px; color: #718096; text-align: center; margin-bottom: 25px; line-height: 1.5;">
            Nhập email hoặc số điện thoại đã đăng ký. Hệ thống sẽ gửi hướng dẫn khôi phục mật khẩu về email của bạn.
        </p>

        <form id="kc-reset-password-form" action="${url.loginAction}" method="post">
            <div class="${properties.kcFormGroupClass!}" style="margin-bottom: 25px;">
                <label for="username" class="${properties.kcLabelClass!}" style="display: block; text-align: left; margin-bottom: 8px; font-weight: bold; font-size: 14px; color: #4a5568;">
                    <#if !realm.loginWithEmailAllowed>
                        Số điện thoại hoặc Username
                    <#elseif !realm.registrationEmailAsUsername>
                        Số điện thoại hoặc Email
                    <#else>
                        Địa chỉ Email
                    </#if>
                </label>
                <input type="text" id="username" name="username" class="${properties.kcInputClass!}" autofocus value="${(auth.attemptedUsername!'')}" placeholder="Ví dụ: email@gmail.com hoặc 0389..." required style="width: 100%; padding: 12px 16px; border: 1px solid #cbd5e0; border-radius: 6px; font-size: 14.5px; transition: border-color 0.2s;" />
                <#if messagesPerField.existsError('username')>
                    <span id="input-error-username" class="${properties.kcInputErrorMessageClass!}" aria-live="polite" style="color: #e53e3e; font-size: 12px; display: block; margin-top: 5px; text-align: left;">
                        ${kcSanitize(messagesPerField.getFirstError('username'))?no_esc}
                    </span>
                </#if>
            </div>

            <div class="register-actions" style="display: flex; flex-direction: column; gap: 12px; margin-top: 20px;">
                <input class="${properties.kcButtonClass!} ${properties.kcButtonPrimaryClass!} ${properties.kcButtonBlockClass!} ${properties.kcButtonLargeClass!} btn-submit-register" type="submit" value="Gửi yêu cầu khôi phục" style="width: 100%; padding: 12px 0; background-color: #d70018; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 15px; cursor: pointer; transition: background-color 0.2s;" />
                
                <a href="${url.loginUrl}" class="btn-back-login" style="text-align: center; display: block; padding: 10px 0; font-size: 14px; color: #4a5568; text-decoration: underline; font-weight: 500;">
                    Quay lại đăng nhập
                </a>
            </div>
        </form>
    </div>
    </#if>
</@layout.registrationLayout>
