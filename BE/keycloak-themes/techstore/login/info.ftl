<#import "template.ftl" as layout>
<@layout.registrationLayout displayMessage=false; section>
    <#if section = "header">
        <#if messageHeader??>
            ${messageHeader}
        <#else>
            ${message.summary}
        </#if>
    <#elseif section = "form">
        <div id="kc-info-message" style="text-align: center; padding: 20px 0;">
            <p class="instruction" style="font-size: 16px; margin-bottom: 25px; line-height: 1.6; color: #4a5568;">
                ${message.summary}
                <#if requiredActions??>
                    <#list requiredActions>: <#items as reqAction>${msg("requiredAction.${reqAction?lower_case}")}<#sep>, </#items></#list>
                </#if>
            </p>

            <div style="margin: 30px 0;">
                <a href="https://mail.google.com" target="_blank" class="gmail-redirect-btn" style="display: inline-block; padding: 14px 28px; background-color: #db4437; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; box-shadow: 0 4px 6px rgba(219, 68, 55, 0.2); transition: all 0.2s; border: none; cursor: pointer;">
                    📬 Đi tới Hộp thư Gmail của bạn
                </a>
                <p style="font-size: 13px; color: #718096; margin-top: 15px;">
                    Hệ thống sẽ tự động chuyển hướng bạn tới Gmail sau <span id="countdown">4</span> giây...
                </p>
            </div>

            <#if skipLink??>
            <#else>
                <#if pageRedirectUri??>
                    <p style="margin-top: 20px;"><a href="${pageRedirectUri}" style="color: #4a5568; text-decoration: underline;">${msg("backToApplication")}</a></p>
                <#elseif actionUri??>
                    <p style="margin-top: 20px;"><a href="${actionUri}" style="color: #4a5568; text-decoration: underline;">${msg("proceedWithAction")}</a></p>
                <#elseif client.baseUrl??>
                    <p style="margin-top: 20px;"><a href="${client.baseUrl}" style="color: #4a5568; text-decoration: underline;">${msg("backToApplication")}</a></p>
                </#if>
            </#if>
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
    </#if>
</@layout.registrationLayout>
