# AI Chat Utilities v2.2 Architecture

The extension uses a platform-adapter architecture:

1. Adapters detect and extract site-specific DOM into a normalized conversation.
2. Shared transformers produce Markdown and Jupyter Notebook output.
3. The service worker manages optional permissions, dynamic content scripts,
   IndexedDB archives, and v1 archive migration.
4. A shared Shadow DOM launcher and overlay provide consistent controls on all
   supported sites.
5. Unknown sites resolve through local profiles, bundled declarative profiles,
   local semantic extraction, and guided calibration—in that order.

Official adapters are isolated under `src/adapters/`. Adding another platform
can use either a dedicated TypeScript adapter or a reviewed declarative
`SiteProfile`. Profiles contain only origins, path patterns, CSS selectors,
role rules, confidence metadata, and timestamps; executable profile code is
not accepted.

Dedicated adapters always take precedence. Locally calibrated profiles override
bundled profiles for the same origin. Profile failure marks a local profile for
repair and falls back to semantic extraction.
