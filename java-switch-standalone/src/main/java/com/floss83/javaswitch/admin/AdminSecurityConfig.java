package com.floss83.javaswitch.admin;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Gate for /api/admin/**: requires a valid bearer token. POS endpoints
 * (/api/iso8583, /api/capture) and /api/auth/login stay open.
 */
@Configuration
public class AdminSecurityConfig implements WebMvcConfigurer {

    private final TokenStore tokens;

    public AdminSecurityConfig(TokenStore tokens) {
        this.tokens = tokens;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new HandlerInterceptor() {
            @Override
            public boolean preHandle(HttpServletRequest req, HttpServletResponse res, Object handler)
                    throws Exception {
                String token = AuthController.stripBearer(req.getHeader("Authorization"));
                if (tokens.isValid(token)) return true;
                res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
                res.setContentType("application/json");
                res.getWriter().write("{\"error\":\"Non authentifié\"}");
                return false;
            }
        }).addPathPatterns("/api/admin/**");
    }
}
