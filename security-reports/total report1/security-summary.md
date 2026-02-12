# Security Report — EcoPlate

**Branch:** `dev` · **Commit:** `a90aa35b` · **Generated:** 2026-02-10 02:37 UTC

---

## ❌ Moderate Risk

A few high-severity issues need attention, but the overall security posture is reasonable.

| Metric | Count |
|--------|-------|
| Total Findings | **32** |
| Critical | 0 |
| High | 3 |
| Medium | 26 |
| Low | 3 |

## 🚨 Action Required

- **Semgrep**: Found 27 potential issues
- **E2E Tests**: 0 passed, 1 failed - needs attention
  - Test failed: Test execution failed - see workflow logs for details → Check the test screenshots and logs to debug this failure

---

## 📊 Changes Since February 10, 2026

| Change Type | Count |
|-------------|-------|
| 🆕 New Issues | **10** |
| ✅ Fixed | **0** |
| ➖ Unchanged | 29 |

### 🆕 New Issues

- **[HIGH]** generic.secrets.security.detected-jwt-token.detected-jwt-token (Semgrep)
- **[HIGH]** generic.secrets.security.detected-jwt-token.detected-jwt-token (Semgrep)
- **[MEDIUM]** Proxy Disclosure (ZAP-Full Scan)
- **[LOW]** Insufficient Site Isolation Against Spectre Vulnerability (ZAP-Full Scan)
- **[LOW]** Private IP Disclosure (ZAP-Full Scan)
- *...and 5 more*

---

## Scan Results

| Status | Tool | Summary | Findings |
|--------|------|---------|----------|
| ❌ | Semgrep | Found 27 potential issues | 2H 25M |
| ✅ | Bandit | Python code passed security checks | Clean |
| ✅ | Trufflehog | No hardcoded secrets detected - nice work keeping credentials safe | Clean |
| ✅ | pip-audit | All Python dependencies are up to date | Clean |
| ✅ | npm audit | All JavaScript dependencies look secure | Clean |
| ✅ | Checkov | All 274 infrastructure checks passed | Clean |
| ✅ | License Check | Scanned 32 packages, all licenses look compatible | Clean |
| ✅ | SBOM (Source) | Catalogued 334 components in the codebase | Clean |
| ✅ | Trivy (App) | Container image looks secure | Clean |
| ✅ | Trivy (Recommendation) | Container image looks secure | Clean |
| ✅ | SBOM (Containers) | Catalogued 3633 components across container images | Clean |
| ⚠️ | ZAP Full Scan | Found 8 security issues in live application | 1M 2L |
| ⚠️ | ZAP API | Found 3 security issues in live application | 1L |
| ❌ | E2E Tests | 0 passed, 1 failed - needs attention | 1H |

---

*Download the HTML report from the `consolidated-security-report` artifact for full details.*
