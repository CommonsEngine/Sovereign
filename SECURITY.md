# Security Policy

## Reporting a vulnerability

**Do not file a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately using GitHub Security Advisories — only
repository maintainers can see your report:

### [Report a vulnerability →](https://github.com/CommonsEngine/Sovereign/security/advisories/new)

You will need a GitHub account. Your report remains private until we
coordinate disclosure together.

---

## What to include

A useful report includes:

- A clear description of the vulnerability and its potential impact
- Steps to reproduce
- Sovereign version and deployment method affected (Docker / bare Node,
  SQLite / Postgres)
- A suggested fix if you have one

---

## Scope

**In scope:**

- Authentication bypass or session hijacking
- Privilege escalation (accessing admin routes as a regular user)
- Remote code execution via the plugin system or SDK
- Cross-user data exposure on a shared instance
- SDK boundary violations that enable plugin-to-platform data leakage

**Out of scope:**

- Issues requiring physical access to the host machine
- Vulnerabilities in the self-hoster's own infrastructure (reverse proxy
  misconfiguration, weak secrets, etc.)
- Issues in third-party or community plugins — report those to the plugin
  author directly
- Social engineering attacks

---

## Response

We aim to:

- **Acknowledge** your report within **72 hours**
- **Provide an initial assessment** within **7 days**
- **Patch and disclose** critical vulnerabilities within **30 days**
  where possible, coordinating the disclosure timeline with you

We will credit you in the published advisory unless you prefer to remain
anonymous.
