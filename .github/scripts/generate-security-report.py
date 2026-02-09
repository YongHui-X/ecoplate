#!/usr/bin/env python3
"""
Security Report Generator for EcoPlate DevSecOps Pipeline

Generates a consolidated security report from CI/CD scan artifacts.
Written to feel like a report from a security analyst, not a robot.

Features:
- Aggregates findings from all security scans
- Compares against previous baseline to show changes
- Generates both HTML and Markdown reports
"""

import argparse
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from html import escape
from pathlib import Path


# =============================================================================
# Data Structures
# =============================================================================

class Finding:
    def __init__(self, title, severity, description="", location="", cve_id="", recommendation="", tool=""):
        self.title = title
        self.severity = severity
        self.description = description
        self.location = location
        self.cve_id = cve_id
        self.recommendation = recommendation
        self.tool = tool

    def fingerprint(self):
        """Generate a unique identifier for this finding."""
        # Use CVE if available, otherwise hash key attributes
        if self.cve_id:
            return f"{self.tool}:{self.cve_id}"
        key = f"{self.tool}:{self.title}:{self.location}:{self.severity}"
        return hashlib.md5(key.encode()).hexdigest()[:12]

    def to_dict(self):
        return {
            "title": self.title,
            "severity": self.severity,
            "description": self.description,
            "location": self.location,
            "cve_id": self.cve_id,
            "recommendation": self.recommendation,
            "tool": self.tool,
            "fingerprint": self.fingerprint()
        }

    @classmethod
    def from_dict(cls, d):
        return cls(
            title=d.get("title", ""),
            severity=d.get("severity", "medium"),
            description=d.get("description", ""),
            location=d.get("location", ""),
            cve_id=d.get("cve_id", ""),
            recommendation=d.get("recommendation", ""),
            tool=d.get("tool", "")
        )


class ScanResult:
    def __init__(self, tool_name, category, status, findings=None, summary_text="", error_message=""):
        self.tool_name = tool_name
        self.category = category
        self.status = status
        self.findings = findings or []
        self.summary_text = summary_text
        self.error_message = error_message

    @property
    def critical_count(self):
        return sum(1 for f in self.findings if f.severity == "critical")

    @property
    def high_count(self):
        return sum(1 for f in self.findings if f.severity == "high")

    @property
    def medium_count(self):
        return sum(1 for f in self.findings if f.severity == "medium")

    @property
    def low_count(self):
        return sum(1 for f in self.findings if f.severity == "low")


# =============================================================================
# Helpers
# =============================================================================

def safe_load_json(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            content = f.read().strip()
            if not content:
                return None
            return json.loads(content)
    except (json.JSONDecodeError, OSError):
        return None


def safe_read_text(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def determine_status(findings):
    if not findings:
        return "pass"
    if any(f.severity in ("critical", "high") for f in findings):
        return "fail"
    if any(f.severity == "medium" for f in findings):
        return "warn"
    return "warn"


def get_human_time_ago(timestamp_str):
    """Convert timestamp to human-readable 'time ago' format."""
    try:
        dt = datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        diff = now - dt
        if diff.days > 0:
            return f"{diff.days} day{'s' if diff.days > 1 else ''} ago"
        hours = diff.seconds // 3600
        if hours > 0:
            return f"{hours} hour{'s' if hours > 1 else ''} ago"
        minutes = diff.seconds // 60
        return f"{minutes} minute{'s' if minutes > 1 else ''} ago"
    except:
        return "recently"


# =============================================================================
# Parsers (same logic, cleaner output)
# =============================================================================

def parse_semgrep(reports_dir):
    fp = os.path.join(reports_dir, "semgrep", "semgrep-report.json")
    if not os.path.exists(fp):
        return ScanResult("Semgrep", "SAST", "skipped", summary_text="Scan was skipped this run")
    data = safe_load_json(fp)
    if data is None:
        return ScanResult("Semgrep", "SAST", "error", error_message="Couldn't read the report file")
    results = data.get("results", [])
    findings = []
    for r in results:
        sev_map = {"ERROR": "high", "WARNING": "medium", "INFO": "low"}
        sev = sev_map.get(r.get("extra", {}).get("severity", "").upper(), "medium")
        findings.append(Finding(
            title=r.get("check_id", "Unknown rule"),
            severity=sev,
            description=r.get("extra", {}).get("message", ""),
            location=f"{r.get('path', '')}:{r.get('start', {}).get('line', '')}",
            tool="Semgrep"
        ))
    summary = f"Found {len(findings)} potential issue{'s' if len(findings) != 1 else ''}" if findings else "No issues found - code looks good"
    return ScanResult("Semgrep", "SAST", determine_status(findings), findings, summary)


def parse_bandit(reports_dir):
    fp = os.path.join(reports_dir, "bandit", "bandit-report.json")
    if not os.path.exists(fp):
        return ScanResult("Bandit", "SAST", "skipped", summary_text="Scan was skipped this run")
    data = safe_load_json(fp)
    if data is None:
        return ScanResult("Bandit", "SAST", "error", error_message="Couldn't read the report file")
    results = data.get("results", [])
    findings = []
    for r in results:
        sev = r.get("issue_severity", "MEDIUM").lower()
        if sev not in ("critical", "high", "medium", "low"):
            sev = "medium"
        findings.append(Finding(
            title=f"{r.get('test_id', '')} - {r.get('test_name', '')}",
            severity=sev,
            description=r.get("issue_text", ""),
            location=f"{r.get('filename', '')}:{r.get('line_number', '')}",
            tool="Bandit"
        ))
    summary = f"Found {len(findings)} Python security issue{'s' if len(findings) != 1 else ''}" if findings else "Python code passed security checks"
    return ScanResult("Bandit", "SAST", determine_status(findings), findings, summary)


def parse_trufflehog(reports_dir):
    fp = os.path.join(reports_dir, "trufflehog", "trufflehog-report.json")
    if not os.path.exists(fp):
        return ScanResult("Trufflehog", "Secrets", "skipped", summary_text="Scan was skipped this run")
    text = safe_read_text(fp)
    if not text or not text.strip():
        return ScanResult("Trufflehog", "Secrets", "pass", summary_text="No hardcoded secrets detected - nice work keeping credentials safe")
    findings = []
    for line in text.strip().split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
            if "level" in obj or "msg" in obj:
                continue
            if "SourceMetadata" not in obj and "DetectorName" not in obj:
                continue
            source_meta = obj.get("SourceMetadata", {}).get("Data", {})
            git_meta = source_meta.get("Git", {})
            fs_meta = source_meta.get("Filesystem", {})
            if git_meta:
                file_path = git_meta.get("file", "")
                commit = git_meta.get("commit", "")[:8]
                location = f"{file_path} (commit: {commit})" if commit else file_path
            elif fs_meta:
                location = fs_meta.get("file", "")
            else:
                location = "git history"
            detector = obj.get("DetectorName", obj.get("SourceName", "Secret"))
            findings.append(Finding(
                title=f"Exposed {detector}",
                severity="critical",
                description=f"A verified {detector} credential was found in the codebase. This needs immediate attention.",
                location=location,
                recommendation="Rotate this credential immediately and remove it from the code history.",
                tool="Trufflehog"
            ))
        except json.JSONDecodeError:
            continue
    summary = f"ALERT: Found {len(findings)} exposed secret{'s' if len(findings) != 1 else ''} - action required" if findings else "No secrets exposed"
    return ScanResult("Trufflehog", "Secrets", determine_status(findings), findings, summary)


def parse_pip_audit(reports_dir):
    fp = os.path.join(reports_dir, "pip-audit", "pip-audit-report.json")
    if not os.path.exists(fp):
        return ScanResult("pip-audit", "SCA", "skipped", summary_text="Scan was skipped this run")
    data = safe_load_json(fp)
    if data is None:
        return ScanResult("pip-audit", "SCA", "error", error_message="Couldn't read the report file")
    findings = []
    deps = data.get("dependencies", data) if isinstance(data, dict) else data
    if isinstance(deps, list):
        for dep in deps:
            for vuln in dep.get("vulns", []):
                fix_ver = vuln.get("fix_versions", [])
                fix_text = f"Upgrade to version {fix_ver[0]}" if fix_ver else "Check for updates"
                findings.append(Finding(
                    title=f"{dep.get('name', 'Unknown')} has {vuln.get('id', 'a vulnerability')}",
                    severity="high",
                    description=vuln.get("description", "")[:200],
                    location=f"Current version: {dep.get('version', 'unknown')}",
                    cve_id=vuln.get("id", ""),
                    recommendation=fix_text,
                    tool="pip-audit"
                ))
    summary = f"Found {len(findings)} vulnerable Python package{'s' if len(findings) != 1 else ''}" if findings else "All Python dependencies are up to date"
    return ScanResult("pip-audit", "SCA", determine_status(findings), findings, summary)


def parse_js_audit(reports_dir):
    findings = []
    for name, label in [("backend-audit.json", "Backend"), ("frontend-audit.json", "Frontend")]:
        fp = os.path.join(reports_dir, "js-audit", name)
        data = safe_load_json(fp)
        if not data:
            continue
        vulns = data.get("vulnerabilities", {})
        if isinstance(vulns, dict):
            for pkg, info in vulns.items():
                if info.get("isDirect") is False and not info.get("effects"):
                    continue
                sev = info.get("severity", "moderate").lower()
                sev_map = {"critical": "critical", "high": "high", "moderate": "medium", "low": "low"}
                via = info.get("via", [])
                desc = via[0] if isinstance(via, list) and via and isinstance(via[0], str) else f"{sev} severity vulnerability"
                findings.append(Finding(
                    title=f"{label}: {pkg} is vulnerable",
                    severity=sev_map.get(sev, "medium"),
                    description=desc if isinstance(desc, str) else f"{sev} severity issue",
                    location=label,
                    recommendation="Run 'npm audit fix' or manually update this package",
                    tool="npm-audit"
                ))
    if not os.path.exists(os.path.join(reports_dir, "js-audit")):
        return ScanResult("npm audit", "SCA", "skipped", summary_text="Scan was skipped this run")
    summary = f"Found {len(findings)} vulnerable npm package{'s' if len(findings) != 1 else ''}" if findings else "All JavaScript dependencies look secure"
    return ScanResult("npm audit", "SCA", determine_status(findings), findings, summary)


def parse_checkov(reports_dir):
    fp = os.path.join(reports_dir, "checkov", "checkov-results.json")
    if not os.path.exists(fp):
        return ScanResult("Checkov", "IaC", "skipped", summary_text="Scan was skipped this run")
    data = safe_load_json(fp)
    if data is None:
        return ScanResult("Checkov", "IaC", "error", error_message="Couldn't read the report file")
    findings = []
    checks = data if isinstance(data, list) else [data]
    for check_group in checks:
        results = check_group.get("results", {})
        for fc in results.get("failed_checks", []):
            findings.append(Finding(
                title=fc.get("check_name", "Configuration issue"),
                severity="medium",
                description=fc.get("guideline", "Review this configuration for security best practices"),
                location=fc.get("file_path", ""),
                recommendation=fc.get("guideline", ""),
                tool="Checkov"
            ))
    passed = sum(c.get("summary", {}).get("passed", 0) for c in checks)
    failed = len(findings)
    summary = f"{passed} checks passed, {failed} need attention" if failed else f"All {passed} infrastructure checks passed"
    return ScanResult("Checkov", "IaC", determine_status(findings), findings, summary)


def parse_license(reports_dir):
    fp = os.path.join(reports_dir, "license", "python-licenses.md")
    if not os.path.exists(fp):
        return ScanResult("License Check", "Compliance", "skipped", summary_text="Scan was skipped this run")
    text = safe_read_text(fp) or ""
    findings = []
    for line in text.split("\n"):
        if re.search(r"\bGPL\b|\bAGPL\b", line, re.IGNORECASE):
            parts = [p.strip() for p in line.split("|") if p.strip()]
            if parts:
                findings.append(Finding(
                    title=f"{parts[0]} uses GPL/AGPL license",
                    severity="medium",
                    description="This package uses a copyleft license which may have implications for commercial use",
                    recommendation="Review if this license is compatible with your project's licensing requirements",
                    tool="License-Check"
                ))
    pkg_count = len([l for l in text.split("\n") if l.strip() and not l.startswith("|--") and "|" in l]) - 1
    summary = f"Scanned {max(pkg_count, 0)} packages" + (f", {len(findings)} use restrictive licenses" if findings else ", all licenses look compatible")
    return ScanResult("License Check", "Compliance", determine_status(findings), findings, summary)


def parse_sbom(reports_dir):
    count = 0
    for name in ["sbom-repo.cdx.json", "sbom-repo.spdx.json"]:
        fp = os.path.join(reports_dir, "sbom", name)
        data = safe_load_json(fp)
        if data:
            count = len(data.get("components", data.get("packages", [])))
            if count > 0:
                break
    if not os.path.exists(os.path.join(reports_dir, "sbom")):
        return ScanResult("SBOM", "Inventory", "skipped", summary_text="Scan was skipped this run")
    return ScanResult("SBOM (Source)", "Inventory", "pass", summary_text=f"Catalogued {count} components in the codebase")


def parse_trivy(reports_dir, subdir, label):
    fp = os.path.join(reports_dir, subdir, f"trivy-{'app' if 'app' in subdir else 'rec'}-vuln.txt")
    if not os.path.exists(fp):
        return ScanResult(f"Trivy ({label})", "Container", "skipped", summary_text="Scan was skipped this run")
    text = safe_read_text(fp) or ""
    findings = []
    seen_cves = set()
    for line in text.split("\n"):
        cve_match = re.search(r"(CVE-\d{4}-\d+)", line)
        if cve_match:
            cve = cve_match.group(1)
            if cve in seen_cves:
                continue
            seen_cves.add(cve)
            sev = "medium"
            for s in ["CRITICAL", "HIGH", "MEDIUM", "LOW"]:
                if s in line.upper():
                    sev = s.lower()
                    break
            findings.append(Finding(
                title=cve,
                severity=sev,
                description=line.strip()[:150],
                cve_id=cve,
                recommendation="Update the base image or affected package",
                tool=f"Trivy-{label}"
            ))
    summary = f"Found {len(findings)} CVE{'s' if len(findings) != 1 else ''} in container" if findings else "Container image looks secure"
    return ScanResult(f"Trivy ({label})", "Container", determine_status(findings), findings, summary)


def parse_container_sbom(reports_dir):
    count = 0
    for name in ["sbom-app.cdx.json", "sbom-rec.cdx.json"]:
        fp = os.path.join(reports_dir, "container-sbom", name)
        data = safe_load_json(fp)
        if data:
            count += len(data.get("components", []))
    if not os.path.exists(os.path.join(reports_dir, "container-sbom")):
        return ScanResult("SBOM (Containers)", "Inventory", "skipped", summary_text="Scan was skipped this run")
    return ScanResult("SBOM (Containers)", "Inventory", "pass", summary_text=f"Catalogued {count} components across container images")


ZAP_SUPPRESSED_ALERTS = {
    "Sec-Fetch-Dest Header is Missing",
    "Sec-Fetch-Mode Header is Missing",
    "Sec-Fetch-Site Header is Missing",
    "Sec-Fetch-User Header is Missing",
    "Modern Web Application",
}


def parse_zap(reports_dir, subdir, label):
    fp = os.path.join(reports_dir, subdir, "report_json.json")
    if not os.path.exists(fp):
        return ScanResult(f"ZAP {label}", "DAST", "skipped", summary_text="Scan was skipped this run")
    data = safe_load_json(fp)
    if data is None:
        return ScanResult(f"ZAP {label}", "DAST", "error", error_message="Couldn't read the report file")
    findings = []
    sites = data.get("site", [])
    if isinstance(sites, dict):
        sites = [sites]
    for site in sites:
        for alert in site.get("alerts", []):
            alert_name = alert.get("alert", alert.get("name", "Unknown"))
            if alert_name in ZAP_SUPPRESSED_ALERTS:
                continue
            risk_code = str(alert.get("riskcode", "0"))
            sev = {"3": "high", "2": "medium", "1": "low"}.get(risk_code, "info")
            solution = alert.get("solution", "Review and fix this security issue")
            findings.append(Finding(
                title=alert_name,
                severity=sev,
                description=alert.get("desc", "")[:200],
                location=alert.get("url", ""),
                recommendation=solution[:200] if solution else "Review the ZAP report for remediation steps",
                tool=f"ZAP-{label}"
            ))
    summary = f"Found {len(findings)} security issue{'s' if len(findings) != 1 else ''} in live application" if findings else "No vulnerabilities found during dynamic testing"
    return ScanResult(f"ZAP {label}", "DAST", determine_status(findings), findings, summary)


def parse_e2e_results(reports_dir):
    fp = os.path.join(reports_dir, "e2e-test-report", "test-report.html")
    if not os.path.exists(fp):
        return ScanResult("E2E Tests", "Functional", "skipped", summary_text="Tests were skipped this run")
    text = safe_read_text(fp)
    if not text:
        return ScanResult("E2E Tests", "Functional", "error", error_message="Couldn't read the test report")
    findings = []
    passed_match = re.search(r'(\d+)\s*(?:tests?\s+)?passed', text, re.IGNORECASE)
    failed_match = re.search(r'(\d+)\s*(?:tests?\s+)?failed', text, re.IGNORECASE)
    passed = int(passed_match.group(1)) if passed_match else 0
    failed = int(failed_match.group(1)) if failed_match else 0
    failed_tests = re.findall(r'class="failed"[^>]*>([^<]+)<', text)
    if not failed_tests:
        failed_tests = re.findall(r'data-testname="([^"]+)"[^>]*class="[^"]*failed', text)
    for test_name in failed_tests[:20]:
        findings.append(Finding(
            title=f"Test failed: {test_name.strip()}",
            severity="high",
            description="This end-to-end test is failing",
            location="e2e/specs/",
            recommendation="Check the test screenshots and logs to debug this failure",
            tool="E2E-Tests"
        ))
    if failed > 0 and not findings:
        for i in range(min(failed, 10)):
            findings.append(Finding(
                title=f"E2E Test Failure",
                severity="high",
                description="A test failed - check the HTML report for details",
                location="e2e/specs/",
                tool="E2E-Tests"
            ))
    total = passed + failed
    if total == 0:
        summary = "No test results found"
        status = "skipped"
    elif failed == 0:
        summary = f"All {passed} tests passed - looking good!"
        status = "pass"
    else:
        summary = f"{passed} passed, {failed} failed - needs attention"
        status = "fail"
    return ScanResult("E2E Tests", "Functional", status, findings, summary)


def parse_unit_test_coverage(reports_dir):
    """Parse unit test coverage from coverage summary."""
    findings = []
    coverage_data = {}

    # Try to read frontend coverage
    fe_fp = os.path.join(reports_dir, "..", "frontend-cov", "coverage-summary.json")
    if os.path.exists(fe_fp):
        data = safe_load_json(fe_fp)
        if data and "total" in data:
            coverage_data["Frontend"] = data["total"]["lines"]["pct"]

    # Check if coverage is low
    for component, pct in coverage_data.items():
        if pct < 50:
            findings.append(Finding(
                title=f"{component} coverage is only {pct}%",
                severity="medium",
                description=f"Code coverage for {component} is below 50%",
                recommendation="Add more unit tests to improve coverage",
                tool="Unit-Tests"
            ))

    if not coverage_data:
        return None

    avg = sum(coverage_data.values()) / len(coverage_data)
    summary = f"Average coverage: {avg:.1f}%"
    status = "pass" if avg >= 60 else "warn"
    return ScanResult("Unit Tests", "Testing", status, findings, summary)


# =============================================================================
# Aggregator
# =============================================================================

def collect_all(reports_dir):
    results = [
        parse_semgrep(reports_dir),
        parse_bandit(reports_dir),
        parse_trufflehog(reports_dir),
        parse_pip_audit(reports_dir),
        parse_js_audit(reports_dir),
        parse_checkov(reports_dir),
        parse_license(reports_dir),
        parse_sbom(reports_dir),
        parse_trivy(reports_dir, "trivy-app", "App"),
        parse_trivy(reports_dir, "trivy-rec", "Recommendation"),
        parse_container_sbom(reports_dir),
        parse_zap(reports_dir, "zap-baseline", "Baseline"),
        parse_zap(reports_dir, "zap-api", "API"),
        parse_e2e_results(reports_dir),
    ]
    # Add unit test coverage if available
    coverage = parse_unit_test_coverage(reports_dir)
    if coverage:
        results.append(coverage)
    return results


# =============================================================================
# Baseline Comparison
# =============================================================================

def export_baseline(results):
    """Export all findings as a JSON baseline for future comparison."""
    baseline = {
        "generated": datetime.now(timezone.utc).isoformat(),
        "findings": []
    }
    for r in results:
        for f in r.findings:
            # Ensure tool is set
            finding_dict = f.to_dict()
            if not finding_dict["tool"]:
                finding_dict["tool"] = r.tool_name
            baseline["findings"].append(finding_dict)
    return baseline


def load_baseline(filepath):
    """Load a previous baseline file."""
    try:
        with open(filepath, "r", encoding="utf-8") as file:
            return json.load(file)
    except (OSError, json.JSONDecodeError):
        return None


def compare_baselines(current_results, previous_baseline):
    """
    Compare current findings against previous baseline.
    Returns: (new_findings, fixed_findings, unchanged_findings, previous_date)
    """
    if not previous_baseline:
        return [], [], [], None

    previous_date = previous_baseline.get("generated", "")
    previous_findings = {
        f.get("fingerprint", ""): f
        for f in previous_baseline.get("findings", [])
        if f.get("fingerprint")
    }

    # Collect current fingerprints
    current_findings = {}
    for r in current_results:
        for f in r.findings:
            f.tool = f.tool or r.tool_name  # Ensure tool is set
            fp = f.fingerprint()
            current_findings[fp] = f

    # Compare
    new_findings = []
    unchanged_findings = []
    fixed_findings = []

    for fp, finding in current_findings.items():
        if fp in previous_findings:
            unchanged_findings.append(finding)
        else:
            new_findings.append(finding)

    for fp, finding_dict in previous_findings.items():
        if fp not in current_findings:
            fixed_findings.append(Finding.from_dict(finding_dict))

    return new_findings, fixed_findings, unchanged_findings, previous_date


def overall_status(results):
    if any(r.status == "fail" for r in results):
        return "fail"
    if any(r.status == "warn" for r in results):
        return "warn"
    return "pass"


def get_risk_assessment(results):
    """Generate a human-readable risk assessment."""
    total_c = sum(r.critical_count for r in results)
    total_h = sum(r.high_count for r in results)
    total_m = sum(r.medium_count for r in results)

    if total_c > 0:
        return "High Risk", "There are critical vulnerabilities that need immediate attention. Don't deploy until these are fixed.", "#dc2626"
    elif total_h > 3:
        return "Elevated Risk", "Several high-severity issues were found. These should be addressed before the next release.", "#ea580c"
    elif total_h > 0:
        return "Moderate Risk", "A few high-severity issues need attention, but the overall security posture is reasonable.", "#ca8a04"
    elif total_m > 5:
        return "Low Risk", "Some medium-severity findings to review when time permits. Nothing urgent.", "#2563eb"
    else:
        return "Minimal Risk", "Security scans look good. Keep up the great work!", "#16a34a"


# =============================================================================
# HTML Renderer
# =============================================================================

STATUS_COLORS = {"pass": "#16a34a", "warn": "#ca8a04", "fail": "#dc2626", "skipped": "#9ca3af", "error": "#dc2626"}
STATUS_LABELS = {"pass": "Passed", "warn": "Needs Review", "fail": "Action Required", "skipped": "Skipped", "error": "Error"}
STATUS_ICONS = {"pass": "✓", "warn": "⚠", "fail": "✗", "skipped": "○", "error": "✗"}
SEV_COLORS = {"critical": "#dc2626", "high": "#ea580c", "medium": "#ca8a04", "low": "#2563eb", "info": "#6b7280"}
CHANGE_COLORS = {"new": "#dc2626", "fixed": "#16a34a", "unchanged": "#6b7280"}

CSS = """
:root { --bg: #f8fafc; --card: #fff; --text: #1e293b; --muted: #64748b; --border: #e2e8f0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 2rem; max-width: 1100px; margin: 0 auto; line-height: 1.6; }
header { background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: #fff; padding: 2rem; border-radius: 12px; margin-bottom: 1.5rem; }
header h1 { font-size: 1.5rem; margin-bottom: 0.25rem; font-weight: 600; }
header .subtitle { opacity: 0.9; font-size: 0.95rem; margin-bottom: 1rem; }
header .meta { display: flex; flex-wrap: wrap; gap: 1.5rem; font-size: 0.85rem; opacity: 0.85; }
header .meta-item { display: flex; align-items: center; gap: 0.4rem; }

.executive-summary { background: var(--card); border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; border-left: 4px solid; }
.executive-summary h2 { font-size: 1.1rem; margin-bottom: 0.75rem; }
.executive-summary .risk-level { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
.executive-summary p { color: var(--muted); font-size: 0.95rem; }

.stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
.stat-card { background: var(--card); border-radius: 10px; padding: 1rem; text-align: center; border-bottom: 3px solid var(--border); }
.stat-card .number { font-size: 1.75rem; font-weight: 700; }
.stat-card .label { font-size: 0.75rem; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 0.25rem; }

.section { background: var(--card); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
.section h2 { font-size: 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border); }
.section h3 { font-size: 0.9rem; color: var(--muted); margin: 1rem 0 0.5rem 0; text-transform: uppercase; letter-spacing: 0.05em; }

.scan-item { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0; border-bottom: 1px solid var(--border); }
.scan-item:last-child { border-bottom: none; }
.scan-item .info { display: flex; align-items: center; gap: 0.75rem; }
.scan-item .icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 600; color: #fff; font-size: 0.9rem; }
.scan-item .name { font-weight: 500; }
.scan-item .summary { font-size: 0.85rem; color: var(--muted); }
.scan-item .counts { display: flex; gap: 0.5rem; font-size: 0.8rem; }
.scan-item .count { padding: 0.15rem 0.5rem; border-radius: 4px; font-weight: 500; }

.findings-section { margin-top: 1rem; }
.finding { background: #f8fafc; border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; border-left: 3px solid; }
.finding .title { font-weight: 500; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.5rem; }
.finding .sev { font-size: 0.7rem; padding: 0.15rem 0.5rem; border-radius: 4px; color: #fff; text-transform: uppercase; font-weight: 600; }
.finding .location { font-size: 0.8rem; color: var(--muted); font-family: monospace; margin-bottom: 0.25rem; }
.finding .desc { font-size: 0.85rem; color: var(--text); }
.finding .recommendation { font-size: 0.85rem; color: #16a34a; margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border); }
.finding .recommendation::before { content: "→ "; }

details { margin-top: 0.5rem; }
details summary { cursor: pointer; font-size: 0.85rem; color: var(--muted); padding: 0.5rem; border-radius: 6px; }
details summary:hover { background: #f1f5f9; }

.progress-section { margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border); }
.progress-section h3 { margin-bottom: 0.75rem; }
.progress-bar { background: #e2e8f0; border-radius: 9999px; height: 8px; overflow: hidden; margin: 0.5rem 0; }
.progress-bar .fill { height: 100%; border-radius: 9999px; transition: width 0.3s; }

footer { text-align: center; color: var(--muted); font-size: 0.8rem; padding: 2rem 0; }
@media (max-width: 640px) { body { padding: 1rem; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
@media print { body { padding: 0; } .section { break-inside: avoid; } }
"""


def render_html(results, branch, commit, repo, comparison=None):
    """
    Render HTML report.
    comparison: tuple of (new_findings, fixed_findings, unchanged_findings, previous_date) or None
    """
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%B %d, %Y at %H:%M UTC")
    status = overall_status(results)

    total_c = sum(r.critical_count for r in results)
    total_h = sum(r.high_count for r in results)
    total_m = sum(r.medium_count for r in results)
    total_l = sum(r.low_count for r in results)
    total_all = total_c + total_h + total_m + total_l
    scans_run = sum(1 for r in results if r.status not in ("skipped",))
    scans_passed = sum(1 for r in results if r.status == "pass")

    risk_level, risk_desc, risk_color = get_risk_assessment(results)

    # Process comparison data
    new_findings, fixed_findings, unchanged_findings, previous_date = [], [], [], None
    if comparison:
        new_findings, fixed_findings, unchanged_findings, previous_date = comparison

    # Group results by category
    categories = {}
    for r in results:
        if r.category not in categories:
            categories[r.category] = []
        categories[r.category].append(r)

    # Build scan items HTML
    scan_sections = ""
    for category, scans in categories.items():
        items_html = ""
        for r in scans:
            icon_color = STATUS_COLORS.get(r.status, "#9ca3af")
            icon = STATUS_ICONS.get(r.status, "?")
            counts_html = ""
            if r.critical_count:
                counts_html += f'<span class="count" style="background:#fef2f2;color:#dc2626">{r.critical_count} critical</span>'
            if r.high_count:
                counts_html += f'<span class="count" style="background:#fff7ed;color:#ea580c">{r.high_count} high</span>'
            if r.medium_count:
                counts_html += f'<span class="count" style="background:#fefce8;color:#ca8a04">{r.medium_count} medium</span>'
            if r.low_count:
                counts_html += f'<span class="count" style="background:#eff6ff;color:#2563eb">{r.low_count} low</span>'

            items_html += f'''
            <div class="scan-item">
                <div class="info">
                    <div class="icon" style="background:{icon_color}">{icon}</div>
                    <div>
                        <div class="name">{escape(r.tool_name)}</div>
                        <div class="summary">{escape(r.summary_text)}</div>
                    </div>
                </div>
                <div class="counts">{counts_html if counts_html else '<span style="color:#16a34a">✓ Clean</span>'}</div>
            </div>'''

        scan_sections += f'''
        <div class="section">
            <h2>{escape(category)}</h2>
            {items_html}
        </div>'''

    # Build findings sections (only for scans with findings)
    findings_html = ""
    for r in results:
        if r.status == "skipped" or not r.findings:
            continue

        findings_list = ""
        for f in r.findings[:15]:  # Limit to 15 findings
            sev_color = SEV_COLORS.get(f.severity, "#6b7280")
            rec_html = f'<div class="recommendation">{escape(f.recommendation)}</div>' if f.recommendation else ""
            findings_list += f'''
            <div class="finding" style="border-left-color:{sev_color}">
                <div class="title">
                    <span class="sev" style="background:{sev_color}">{f.severity}</span>
                    {escape(f.title)}
                </div>
                {f'<div class="location">{escape(f.location)}</div>' if f.location else ''}
                <div class="desc">{escape(f.description[:200])}</div>
                {rec_html}
            </div>'''

        more_text = f" ({len(r.findings) - 15} more not shown)" if len(r.findings) > 15 else ""
        findings_html += f'''
        <div class="section">
            <h2 style="color:{STATUS_COLORS.get(r.status, '#6b7280')}">{escape(r.tool_name)} Findings</h2>
            <p style="color:var(--muted);margin-bottom:1rem;font-size:0.9rem">{escape(r.summary_text)}{more_text}</p>
            <div class="findings-section">{findings_list}</div>
        </div>'''

    # Build comparison section if we have baseline data
    comparison_html = ""
    if previous_date and (new_findings or fixed_findings):
        # Format previous date
        try:
            prev_dt = datetime.fromisoformat(previous_date.replace('Z', '+00:00'))
            prev_date_str = prev_dt.strftime("%B %d, %Y")
        except Exception:
            prev_date_str = "previous run"

        comparison_html = f'''
<div class="section" style="border-left: 4px solid #6366f1; margin-bottom: 1.5rem;">
    <h2 style="color: #6366f1;">Changes Since {prev_date_str}</h2>
    <p style="color: var(--muted); margin-bottom: 1rem; font-size: 0.9rem;">
        Comparing current scan against the previous baseline.
    </p>
    <div class="stats-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom: 1rem;">
        <div class="stat-card" style="border-bottom-color: #dc2626;">
            <div class="number" style="color: #dc2626;">{len(new_findings)}</div>
            <div class="label">New Issues</div>
        </div>
        <div class="stat-card" style="border-bottom-color: #16a34a;">
            <div class="number" style="color: #16a34a;">{len(fixed_findings)}</div>
            <div class="label">Fixed</div>
        </div>
        <div class="stat-card" style="border-bottom-color: #6b7280;">
            <div class="number">{len(unchanged_findings)}</div>
            <div class="label">Unchanged</div>
        </div>
    </div>'''

        # Show new findings (bad)
        if new_findings:
            comparison_html += '''
    <details open>
        <summary style="color: #dc2626; font-weight: 500;">New Issues (need attention)</summary>
        <div class="findings-section" style="margin-top: 0.5rem;">'''
            for f in new_findings[:10]:
                sev_color = SEV_COLORS.get(f.severity, "#6b7280")
                comparison_html += f'''
            <div class="finding" style="border-left-color: {sev_color}; background: #fef2f2;">
                <div class="title">
                    <span class="sev" style="background: {sev_color};">{f.severity}</span>
                    {escape(f.title)}
                    <span style="font-size: 0.75rem; color: var(--muted); margin-left: 0.5rem;">({escape(f.tool)})</span>
                </div>
                {f'<div class="location">{escape(f.location)}</div>' if f.location else ''}
            </div>'''
            if len(new_findings) > 10:
                comparison_html += f'<p style="color: var(--muted); font-size: 0.85rem; padding: 0.5rem;">...and {len(new_findings) - 10} more</p>'
            comparison_html += '''
        </div>
    </details>'''

        # Show fixed findings (good)
        if fixed_findings:
            comparison_html += '''
    <details>
        <summary style="color: #16a34a; font-weight: 500;">Fixed Issues (great work!)</summary>
        <div class="findings-section" style="margin-top: 0.5rem;">'''
            for f in fixed_findings[:10]:
                comparison_html += f'''
            <div class="finding" style="border-left-color: #16a34a; background: #f0fdf4;">
                <div class="title">
                    <span style="color: #16a34a; margin-right: 0.5rem;">✓</span>
                    <span style="text-decoration: line-through; color: var(--muted);">{escape(f.title)}</span>
                    <span style="font-size: 0.75rem; color: var(--muted); margin-left: 0.5rem;">({escape(f.tool)})</span>
                </div>
            </div>'''
            if len(fixed_findings) > 10:
                comparison_html += f'<p style="color: var(--muted); font-size: 0.85rem; padding: 0.5rem;">...and {len(fixed_findings) - 10} more</p>'
            comparison_html += '''
        </div>
    </details>'''

        comparison_html += '''
</div>'''

    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Security Report - EcoPlate</title>
<style>{CSS}</style>
</head>
<body>
<header>
    <h1>Security & Quality Report</h1>
    <div class="subtitle">EcoPlate DevSecOps Pipeline Results</div>
    <div class="meta">
        <div class="meta-item">📁 Branch: <strong>{escape(branch)}</strong></div>
        <div class="meta-item">🔗 Commit: <strong>{escape(commit[:8])}</strong></div>
        <div class="meta-item">📅 {now_str}</div>
    </div>
</header>

<div class="executive-summary" style="border-left-color:{risk_color}">
    <h2>What You Need to Know</h2>
    <div class="risk-level" style="color:{risk_color}">{risk_level}</div>
    <p>{risk_desc}</p>
</div>

<div class="stats-grid">
    <div class="stat-card" style="border-bottom-color:#6b7280">
        <div class="number">{total_all}</div>
        <div class="label">Total Findings</div>
    </div>
    <div class="stat-card" style="border-bottom-color:{SEV_COLORS['critical']}">
        <div class="number" style="color:{SEV_COLORS['critical']}">{total_c}</div>
        <div class="label">Critical</div>
    </div>
    <div class="stat-card" style="border-bottom-color:{SEV_COLORS['high']}">
        <div class="number" style="color:{SEV_COLORS['high']}">{total_h}</div>
        <div class="label">High</div>
    </div>
    <div class="stat-card" style="border-bottom-color:{SEV_COLORS['medium']}">
        <div class="number" style="color:{SEV_COLORS['medium']}">{total_m}</div>
        <div class="label">Medium</div>
    </div>
    <div class="stat-card" style="border-bottom-color:{SEV_COLORS['low']}">
        <div class="number" style="color:{SEV_COLORS['low']}">{total_l}</div>
        <div class="label">Low</div>
    </div>
    <div class="stat-card" style="border-bottom-color:#16a34a">
        <div class="number">{scans_passed}/{scans_run}</div>
        <div class="label">Scans Passed</div>
    </div>
</div>

{comparison_html}

{scan_sections}

{findings_html}

<footer>
    Report generated by EcoPlate DevSecOps Pipeline<br>
    {now_str}
</footer>
</body>
</html>'''
    return html


# =============================================================================
# Markdown Renderer
# =============================================================================

def render_markdown(results, branch, commit, comparison=None):
    """
    Render Markdown report.
    comparison: tuple of (new_findings, fixed_findings, unchanged_findings, previous_date) or None
    """
    now = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    status = overall_status(results)

    total_c = sum(r.critical_count for r in results)
    total_h = sum(r.high_count for r in results)
    total_m = sum(r.medium_count for r in results)
    total_l = sum(r.low_count for r in results)
    total_all = total_c + total_h + total_m + total_l

    risk_level, risk_desc, _ = get_risk_assessment(results)

    # Process comparison data
    new_findings, fixed_findings, unchanged_findings, previous_date = [], [], [], None
    if comparison:
        new_findings, fixed_findings, unchanged_findings, previous_date = comparison

    status_emoji = {"pass": "✅", "warn": "⚠️", "fail": "❌"}.get(status, "❓")
    scan_emoji = {"pass": "✅", "warn": "⚠️", "fail": "❌", "skipped": "⏭️", "error": "❌"}

    # Build summary table
    rows = ""
    for r in results:
        e = scan_emoji.get(r.status, "❓")
        findings_str = ""
        if r.critical_count:
            findings_str += f"{r.critical_count}C "
        if r.high_count:
            findings_str += f"{r.high_count}H "
        if r.medium_count:
            findings_str += f"{r.medium_count}M "
        if r.low_count:
            findings_str += f"{r.low_count}L"
        findings_str = findings_str.strip() or "Clean"
        rows += f"| {e} | {r.tool_name} | {r.summary_text} | {findings_str} |\n"

    # Build action items
    action_items = ""
    high_priority = [r for r in results if r.critical_count > 0 or r.high_count > 0]
    if high_priority:
        action_items = "\n## 🚨 Action Required\n\n"
        for r in high_priority:
            action_items += f"- **{r.tool_name}**: {r.summary_text}\n"
            for f in r.findings[:3]:
                if f.severity in ("critical", "high"):
                    action_items += f"  - {f.title}"
                    if f.recommendation:
                        action_items += f" → {f.recommendation}"
                    action_items += "\n"

    # Build comparison section if we have baseline data
    comparison_section = ""
    if previous_date and (new_findings or fixed_findings):
        try:
            prev_dt = datetime.fromisoformat(previous_date.replace('Z', '+00:00'))
            prev_date_str = prev_dt.strftime("%B %d, %Y")
        except Exception:
            prev_date_str = "previous run"

        comparison_section = f"""
## 📊 Changes Since {prev_date_str}

| Change Type | Count |
|-------------|-------|
| 🆕 New Issues | **{len(new_findings)}** |
| ✅ Fixed | **{len(fixed_findings)}** |
| ➖ Unchanged | {len(unchanged_findings)} |

"""
        if new_findings:
            comparison_section += "### 🆕 New Issues\n\n"
            for f in new_findings[:5]:
                comparison_section += f"- **[{f.severity.upper()}]** {f.title} ({f.tool})\n"
            if len(new_findings) > 5:
                comparison_section += f"- *...and {len(new_findings) - 5} more*\n"
            comparison_section += "\n"

        if fixed_findings:
            comparison_section += "### ✅ Fixed Issues\n\n"
            for f in fixed_findings[:5]:
                comparison_section += f"- ~~{f.title}~~ ({f.tool})\n"
            if len(fixed_findings) > 5:
                comparison_section += f"- *...and {len(fixed_findings) - 5} more*\n"
            comparison_section += "\n"

        comparison_section += "---\n"

    md = f'''# Security Report — EcoPlate

**Branch:** `{branch}` · **Commit:** `{commit[:8]}` · **Generated:** {now}

---

## {status_emoji} {risk_level}

{risk_desc}

| Metric | Count |
|--------|-------|
| Total Findings | **{total_all}** |
| Critical | {total_c} |
| High | {total_h} |
| Medium | {total_m} |
| Low | {total_l} |
{action_items}
---
{comparison_section}
## Scan Results

| Status | Tool | Summary | Findings |
|--------|------|---------|----------|
{rows}
---

*Download the HTML report from the `consolidated-security-report` artifact for full details.*
'''
    return md


# =============================================================================
# Main
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Generate consolidated security report")
    parser.add_argument("--reports-dir", required=True)
    parser.add_argument("--output-html", required=True)
    parser.add_argument("--output-md", required=True)
    parser.add_argument("--output-baseline", help="Output path for current findings baseline (JSON)")
    parser.add_argument("--baseline", help="Path to previous baseline file for comparison")
    parser.add_argument("--branch", default="unknown")
    parser.add_argument("--commit", default="unknown")
    parser.add_argument("--repo", default="unknown")
    args = parser.parse_args()

    results = collect_all(args.reports_dir)

    # Handle baseline comparison
    comparison = None
    if args.baseline and os.path.exists(args.baseline):
        print(f"Loading baseline from: {args.baseline}")
        previous_baseline = load_baseline(args.baseline)
        if previous_baseline:
            comparison = compare_baselines(results, previous_baseline)
            new_findings, fixed_findings, unchanged_findings, prev_date = comparison
            print(f"Comparison: {len(new_findings)} new, {len(fixed_findings)} fixed, {len(unchanged_findings)} unchanged")
        else:
            print("Warning: Could not load previous baseline")
    else:
        print("No baseline provided or file not found - generating report without comparison")

    # Export current baseline for future comparisons
    if args.output_baseline:
        current_baseline = export_baseline(results)
        Path(args.output_baseline).write_text(json.dumps(current_baseline, indent=2), encoding="utf-8")
        print(f"Baseline exported: {args.output_baseline}")

    html = render_html(results, args.branch, args.commit, args.repo, comparison)
    md = render_markdown(results, args.branch, args.commit, comparison)

    Path(args.output_html).write_text(html, encoding="utf-8")
    Path(args.output_md).write_text(md, encoding="utf-8")

    print(f"HTML report: {args.output_html}")
    print(f"Markdown summary: {args.output_md}")

    status = overall_status(results)
    risk_level, _, _ = get_risk_assessment(results)
    total = sum(r.critical_count + r.high_count + r.medium_count + r.low_count for r in results)
    print(f"\nResult: {risk_level} ({total} findings)")


if __name__ == "__main__":
    main()
