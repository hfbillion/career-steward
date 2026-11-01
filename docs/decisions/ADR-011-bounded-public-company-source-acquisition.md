# ADR-011: Bounded public company-source acquisition

- Status: Accepted
- Date: 2026-11-01

## Context

Company Research can validate, confirm, and persist source-backed claims, but it
previously depended entirely on text copied into Pi by a user or another tool.
That left no Career Steward-owned path for checking what a source URL actually
returned. A general-purpose web fetcher would introduce server-side request
forgery risks because an untrusted page or model could direct the local agent to
loopback services, private networks, or cloud metadata endpoints.

## Decision

Career Steward provides `fetch_company_source` for one public HTTP(S) URL at a
time. URL discovery remains separate: a URL may come from the user or an
installed Pi search/browser capability. The acquisition tool does not search,
classify the source, generate company claims, or persist research.

The tool returns a `CompanySourceSnapshot` containing:

- requested and final canonical URLs plus the validated redirect chain;
- retrieval time, media type, response byte length, and SHA-256;
- detected title, publisher, and publication time when available;
- bounded normalized text, a suggested excerpt, truncation state, and warnings.

When Pi constructs `propose_company_research`, it copies the final URL,
retrieval time, selected exact excerpt, response SHA-256, and
`career-steward-fetch` retrieval method. The confirmed source therefore keeps
acquisition provenance. The hash records retrieved bytes; it does not prove
that the publisher or content is truthful.

## Network boundary

Every initial URL and redirect is independently validated. Acquisition rejects:

- schemes other than HTTP and HTTPS;
- embedded URL credentials and non-standard ports;
- `localhost`, `.localhost`, and `.local` names;
- loopback, private, carrier-grade NAT, link-local, multicast, documentation,
  reserved, transition, and other non-public IP ranges;
- any hostname whose DNS results contain a non-public address.

The selected DNS result is pinned as the connection address while the original
hostname remains the HTTP `Host` header and HTTPS server name. This prevents a
second DNS lookup from changing a validated public target into a private one.

Requests use a 15-second deadline, at most five redirects, identity encoding,
a one-megabyte response limit, and a 20,000-character normalized-text limit.
Only HTML, XHTML, and plain text are accepted in 1.0.

## Content boundary

HTML extraction is deterministic and never executes JavaScript. It removes
scripts, styles, navigation, forms, and common chrome before normalizing text.
Client-rendered pages may therefore be incomplete and receive an explicit
warning. The tool does not decide whether a site is official, professional
reporting, community content, or an award registry; that classification remains
visible in the research proposal and subject to user confirmation.

## Consequences

- Career Steward has a supported, auditable source-acquisition path without
  shipping a crawler or search engine.
- SSRF protections live below the Pi tool and cannot be bypassed by prompt
  wording.
- Search-result snippets remain insufficient when the linked page is
  retrievable.
- Sites requiring authentication, JavaScript rendering, CAPTCHA, non-standard
  ports, PDF parsing, or responses larger than the limits need a future adapter
  or explicit manual evidence workflow.
- The persistence tool still performs structural validation rather than
  independently repeating the network request; user confirmation remains the
  final activation boundary.
